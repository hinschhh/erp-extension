import { NextRequest, NextResponse } from "next/server";

/** ---- Konfiguration ---- */
function parseIds(src?: string | null): number[] | null {
  if (!src) return null;
  return src.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}
const CONFIG = {
  // feste Sets laut deiner Vorgabe
  OFFER_OPEN: [14],
  STOCK_STATES: [1, 2, 3, 13],
  CANCELLED: [6, 8, 9],
};

type BillbeeOrderItem = { TotalPrice?: number | null; SKU?: string | null; Product?: { SKU?: string | null } | null; };
type BillbeePayment = { PayValue?: number | null; PayDate?: string | null };
type BillbeeOrder = {
  Id?: string; OrderNumber?: string;
  CreatedAt?: string; ShippedAt?: string | null;
  InvoiceDate?: string | null; InvoiceNumber?: number | string | null;
  TotalCost?: number | null; ShippingCost?: number | null; OrderItems?: BillbeeOrderItem[];
  PaidAmount?: number | null; Payments?: BillbeePayment[];
  State?: number;
  Buyer?: { Name?: string | null } | null;
  Customer?: { Name?: string | null } | null;
  BillAddress?: { FullName?: string | null; FirstName?: string | null; LastName?: string | null } | null;
  DeliveryAddress?: { FullName?: string | null; FirstName?: string | null; LastName?: string | null } | null;
};
type ApiPagedResult<T> = { Paging: { Page: number; TotalPages: number; TotalRows: number; PageSize: number }, Data: T[] };

const BILLBEE_BASE = "https://app.billbee.io/api/v1";
function authHeaders() {
  const basic = Buffer.from(`${process.env.BILLBEE_LOGIN!}:${process.env.BILLBEE_PASSWORD!}`).toString("base64");
  return {
    "X-Billbee-Api-Key": process.env.BILLBEE_API_KEY!,
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** ---- Helpers ---- */
const eur = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);
const inList = (v: number | undefined, list: number[]) => Number.isFinite(v) && list.includes(v as number);
const isInMonth = (iso: string | null | undefined, y: number, m0: number) => !!iso && new Date(iso).getUTCFullYear() === y && new Date(iso).getUTCMonth() === m0;

function grossInclShipping(o: BillbeeOrder): number {
  const total = eur(o.TotalCost); if (total > 0) return total;
  const items = (o.OrderItems ?? []).reduce((s, it) => s + eur(it.TotalPrice), 0);
  return items + eur(o.ShippingCost);
}
function paidSum(o: BillbeeOrder): number {
  const paid = eur(o.PaidAmount); if (paid > 0) return paid;
  return (o.Payments ?? []).reduce((s, p) => s + eur(p.PayValue), 0);
}
function isSB(o: BillbeeOrder): boolean {
  for (const it of (o.OrderItems ?? [])) {
    const sku = (it.SKU ?? it.Product?.SKU ?? "").toLowerCase();
    if (sku.includes("sonder")) return true;
  }
  return false;
}
function getCustomerName(o: BillbeeOrder): string {
  const cands = [
    o?.Buyer?.Name, o?.Customer?.Name, o?.BillAddress?.FullName,
    [o?.BillAddress?.FirstName, o?.BillAddress?.LastName].filter(Boolean).join(" ").trim(),
    o?.DeliveryAddress?.FullName,
    [o?.DeliveryAddress?.FirstName, o?.DeliveryAddress?.LastName].filter(Boolean).join(" ").trim(),
  ].filter((v) => typeof v === "string" && v.trim());
  return (cands[0] as string) || "—";
}

type FetchOrdersArgs = Record<string, string | number | number[] | undefined>;
async function fetchOrdersPaged(query: FetchOrdersArgs) {
  const pageSize = Number(query.pageSize ?? 250);
  let page = 1; const all: BillbeeOrder[] = [];
  while (true) {
    const url = new URL(`${BILLBEE_BASE}/orders`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("expand", "orderitems");
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || k === "page" || k === "pageSize") continue;
      if (k === "orderStateId" && Array.isArray(v)) (v as number[]).forEach((id) => url.searchParams.append("orderStateId", String(id)));
      else url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), { headers: authHeaders(), cache: "no-store" });
    if (res.status === 429) { const ra = Number(res.headers.get("Retry-After") ?? "1"); await new Promise(r => setTimeout(r, Math.max(1000, ra * 1000))); continue; }
    if (!res.ok) throw new Error(`Billbee /orders failed: ${res.status} – ${await res.text()}`);
    const data = (await res.json()) as ApiPagedResult<BillbeeOrder>;
    all.push(...(data?.Data ?? []));
    const { Page, PageSize, TotalRows } = data.Paging ?? { Page: page, PageSize: pageSize, TotalRows: 0 };
    if (Page * PageSize >= TotalRows || (data?.Data?.length ?? 0) === 0) break;
    page += 1; await new Promise(r => setTimeout(r, 600));
  }
  return all;
}

export async function GET(req: NextRequest) {
  try {
    const now = new Date(); const year = now.getFullYear(); const m0 = now.getMonth();
    const firstDay = new Date(year, m0, 1, 0, 0, 0); const lastDay = new Date(year, m0 + 1, 0, 23, 59, 59);
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? firstDay.toISOString();
    const to = searchParams.get("to") ?? lastDay.toISOString();

    /* ---------- MTD: per Bestelldatum ---------- */
    const ordersByOrderDate = await fetchOrdersPaged({ minOrderDate: from, maxOrderDate: to, pageSize: 250 });

    let ae_total = 0, ae_std = 0, ae_sb = 0;
    let ae_count_total = 0, ae_count_std = 0, ae_count_sb = 0;

    let offers_total = 0, offers_std = 0, offers_sb = 0;
    let offers_count_total = 0, offers_count_std = 0, offers_count_sb = 0;

    for (const o of ordersByOrderDate) {
      if (!isInMonth(o.CreatedAt, year, m0)) continue;
      const gross = grossInclShipping(o), sb = isSB(o);

      if (inList(o.State, CONFIG.OFFER_OPEN)) {
        offers_total += gross; offers_count_total += 1;
        if (sb) { offers_sb += gross; offers_count_sb += 1; } else { offers_std += gross; offers_count_std += 1; }
        continue;
      }
      if (inList(o.State, CONFIG.CANCELLED)) continue;

      ae_total += gross; ae_count_total += 1;
      if (sb) { ae_sb += gross; ae_count_sb += 1; } else { ae_std += gross; ae_count_std += 1; }
    }

    /* ---------- Umsatz MTD (versendet) ---------- */
    const modifiedThisMonth = await fetchOrdersPaged({ modifiedAtMin: from, modifiedAtMax: to, pageSize: 250 });
    let rev_total = 0, rev_std = 0, rev_sb = 0;
    let rev_count_total = 0, rev_count_std = 0, rev_count_sb = 0;

    for (const o of modifiedThisMonth) {
      if (!isInMonth(o.ShippedAt, year, m0)) continue;
      if (inList(o.State, CONFIG.CANCELLED)) continue;
      const gross = grossInclShipping(o);
      rev_total += gross; rev_count_total += 1;
      if (isSB(o)) { rev_sb += gross; rev_count_sb += 1; } else { rev_std += gross; rev_count_std += 1; }
    }

    /* ---------- Offene Angebote (aktuell) ---------- */
    const openOffers = await fetchOrdersPaged({ orderStateId: CONFIG.OFFER_OPEN, pageSize: 250 });
    const offeneAngebote = openOffers.reduce((s, o) => s + grossInclShipping(o), 0);
    const offeneAngeboteCount = openOffers.length;

    /* ---------- Auftragsbestand (aktuell) ---------- */
    const stockOrders = await fetchOrdersPaged({ orderStateId: CONFIG.STOCK_STATES, pageSize: 250 });
    let ob_total = 0, ob_std = 0, ob_sb = 0;
    let ob_count_total = 0, ob_count_std = 0, ob_count_sb = 0;

    for (const o of stockOrders) {
      if (inList(o.State, CONFIG.CANCELLED)) continue;
      if (o.ShippedAt) continue; // „unversendet, Total“
      const gross = grossInclShipping(o);
      ob_total += gross; ob_count_total += 1;
      if (isSB(o)) { ob_sb += gross; ob_count_sb += 1; } else { ob_std += gross; ob_count_std += 1; }
    }

    /* ---------- Unversendet-Basis (exkl. Angebot/CANCELLED) ---------- */
    // Wir nehmen die gleichen STOCK_STATES wie oben (deine Vorgabe), aber nur unversendet und exkl. Angebot/Storno
    const baseUnshipped = stockOrders.filter(o => !o.ShippedAt && !inList(o.State, CONFIG.CANCELLED) && !inList(o.State, CONFIG.OFFER_OPEN));

    type UnshippedRow = { id: string; orderNumber?: string; createdAt?: string | null; customer: string; gross: number; paid: number; open: number; };
    const unpaid: UnshippedRow[] = [], partial: UnshippedRow[] = [];
    let fullCount = 0, fullSum = 0, unpaidSumGross = 0, partialSumGross = 0, partialSumPaid = 0;

    // „erhalteneAnzahlungen (unversendet)“
    let deposits_total = 0, deposits_std = 0, deposits_sb = 0;
    let deposits_count_total = 0, deposits_count_std = 0, deposits_count_sb = 0; // Anzahl Aufträge mit paid > 0

    for (const o of baseUnshipped) {
      const gross = grossInclShipping(o);
      const paid = paidSum(o);
      const open = Math.max(0, gross - paid);
      const sb = isSB(o);

      // erhaltene Anzahlungen (unversendet) = Summe paid; Count = Aufträge mit paid > 0
      deposits_total += paid;
      if (paid > 0) deposits_count_total += 1;
      if (sb) { deposits_sb += paid; if (paid > 0) deposits_count_sb += 1; } else { deposits_std += paid; if (paid > 0) deposits_count_std += 1; }

      const row: UnshippedRow = {
        id: String(o.Id ?? ""),
        orderNumber: o.OrderNumber,
        createdAt: o.CreatedAt,
        customer: getCustomerName(o),
        gross, paid, open,
      };

      if (paid <= 0) { unpaid.push(row); unpaidSumGross += gross; }
      else if (paid < gross) { partial.push(row); partialSumGross += gross; partialSumPaid += paid; }
      else { fullCount += 1; fullSum += gross; }
    }

    /* ---------- OPOS (versendet & nicht voll bezahlt) ---------- */
    const oposOrders: Array<{ id: string; number?: string; shippedAt?: string | null; open: number; customer: string }> = [];
    let oposTotal = 0;
    for (const o of modifiedThisMonth) {
      if (!o.ShippedAt) continue;
      if (inList(o.State, CONFIG.CANCELLED)) continue;
      const open = Math.max(0, grossInclShipping(o) - paidSum(o));
      if (open > 0) { oposOrders.push({ id: String(o.Id ?? ""), number: o.OrderNumber, shippedAt: o.ShippedAt, open, customer: getCustomerName(o) }); oposTotal += open; }
    }
    const oposCount = oposOrders.length;

    /* ---------- Zahlungseingang MTD ---------- */
    let cashinMTD = 0;
    let cashinMTDCount = 0; // Anzahl einzelner Payments im Monat
    for (const o of modifiedThisMonth) {
      for (const p of (o.Payments ?? [])) {
        if (!p.PayDate || !isInMonth(p.PayDate, year, m0)) continue;
        const v = eur(p.PayValue); if (v > 0) { cashinMTD += v; cashinMTDCount += 1; }
      }
    }

    /* ---------- Forecast ---------- */
    const day = now.getDate(), dim = lastDay.getDate(), factor = day > 0 ? dim / day : 1;
    const forecast = {
      auftragseingang: { total: Math.round(ae_total * factor), standard: Math.round(ae_std * factor), sb: Math.round(ae_sb * factor) },
      angebote: { total: Math.round(offers_total * factor), standard: Math.round(offers_std * factor), sb: Math.round(offers_sb * factor) },
      umsatz: { total: Math.round(rev_total * factor), standard: Math.round(rev_std * factor), sb: Math.round(rev_sb * factor) },
    };

    return NextResponse.json({
      period: { from, to, today: now.toISOString(), dayOfMonth: day, daysInMonth: dim },
      kpis: {
        // MTD
        auftragseingangMTD: {
          total: ae_total, standard: ae_std, sb: ae_sb,
          count: { total: ae_count_total, standard: ae_count_std, sb: ae_count_sb },
        },
        angeboteMTD: {
          total: offers_total, standard: offers_std, sb: offers_sb,
          count: { total: offers_count_total, standard: offers_count_std, sb: offers_count_sb },
        },
        umsatzMTD: {
          total: rev_total, standard: rev_std, sb: rev_sb,
          count: { total: rev_count_total, standard: rev_count_std, sb: rev_count_sb },
        },
        zahlungseingangMTD: cashinMTD,
        zahlungseingangMTDCount: cashinMTDCount,

        // Bestände/aktuell
        offeneAngebote,
        offeneAngeboteCount,

        auftragsbestand: {
          total: ob_total, standard: ob_std, sb: ob_sb,
          count: { total: ob_count_total, standard: ob_count_std, sb: ob_count_sb },
        },

        // Anzahlungen (unversendet)
        erhalteneAnzahlungen: {
          total: deposits_total, standard: deposits_std, sb: deposits_sb,
          count: { total: deposits_count_total, standard: deposits_count_std, sb: deposits_count_sb },
        },

        // OPOS
        opos: { totalOpen: oposTotal, count: oposCount, orders: oposOrders },

        // Unversendet nach Bezahlstatus
        unshippedPaymentStatus: {
          unpaid: { count: unpaid.length, sum: unpaidSumGross, orders: unpaid },
          partial: {
            count: partial.length,
            sum: partialSumGross,
            orders: partial,
            depositSum: partialSumPaid,
            depositAvgRatio: partialSumGross > 0 ? partialSumPaid / partialSumGross : 0, // 0..1
          },
          full: { count: fullCount, sum: fullSum },
        },

        forecast,
      },
      meta: {
        source: "Billbee /api/v1/orders?expand=orderitems",
        notes:
          "AE MTD: CreatedAt im Monat, exkl. Angebot/CANCELLED. Umsatz MTD: ShippedAt im Monat, exkl. CANCELLED. OPOS: ShippedAt != null & open>0. Anzahlungen (unversendet): Σ paid über unversendete Orders (exkl. Angebot/CANCELLED). Unversendet-Buckets: unpaid/partial/full. Alle Karten liefern zusätzlich Counts.",
      },
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
