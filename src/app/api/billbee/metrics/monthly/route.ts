import { NextRequest, NextResponse } from "next/server";

/** --------------------------------------------
 *  Konfiguration: Billbee State-IDs (anpassbar)
 *  --------------------------------------------
 *  OFFER_OPEN:   Status-IDs für „offene Angebote“ (default: 14)
 *  STOCK_STATES: Status-IDs für Auftragsbestand (default: 2,3,13)
 *  CANCELLED:    Optionale Storno-IDs (leer = keine Filterung)
 *
 *  Alternativ via ENV:
 *  BILLBEE_STATE_OFFER_OPEN_IDS="14"
 *  BILLBEE_STATE_STOCK_IDS="2,3,13"
 *  BILLBEE_STATE_CANCELLED_IDS="8"
 */
function parseIds(src?: string | null): number[] | null {
  if (!src) return null;
  return src
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

const CONFIG = {
  OFFER_OPEN: parseIds(process.env.BILLBEE_STATE_OFFER_OPEN_IDS) ?? [14],
  STOCK_STATES: parseIds(process.env.BILLBEE_STATE_STOCK_IDS) ?? [2, 3, 13],
  CANCELLED: parseIds(process.env.BILLBEE_STATE_CANCELLED_IDS) ?? [],
};

// States, die bei Auftragseingang MTD ausgeschlossen werden sollen
const EXCLUDED_STATES_FOR_ORDER_INTAKE = [1, 2, 3, 4] as const;

type BillbeeOrder = {
  Id?: string;
  OrderNumber?: string;

  // Datumsfelder
  CreatedAt?: string; // Bestelldatum
  ConfirmedAt?: string | null;
  ShippedAt?: string | null; // „Lieferdatum“ interpretieren wir als Versanddatum
  InvoiceDate?: string | null;

  // Rechnungsfelder
  InvoiceNumber?: number | string | null;

  // Summen
  TotalCost?: number | null; // Brutto inkl. Versand (laut Vorlage)
  ShippingCost?: number | null;
  OrderItems?: Array<{ TotalPrice?: number | null }>;

  // Zahlungen
  PaidAmount?: number | null;
  Payments?: Array<{ PayValue?: number | null }>;

  // Status
  State?: number;
};

type ApiPagedResult<T> = {
  Paging: { Page: number; TotalPages: number; TotalRows: number; PageSize: number };
  ErrorMessage?: string | null;
  Data: T[];
};

const BILLBEE_BASE = "https://app.billbee.io/api/v1";

function authHeaders() {
  const key = process.env.BILLBEE_API_KEY!;
  const user = process.env.BILLBEE_USERNAME!;
  const pass = process.env.BILLBEE_API_PASSWORD!;
  const basic = Buffer.from(`${user}:${pass}`).toString("base64");
  return {
    "X-Billbee-Api-Key": key,
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// ---------- Helpers ----------
function eur(n: unknown) {
  const v = typeof n === "number" ? n : 0;
  return Number.isFinite(v) ? v : 0;
}

// Brutto inkl. Versand (robust): 1) TotalCost, 2) Sum(OrderItems.TotalPrice)+ShippingCost
function grossInclShipping(o: BillbeeOrder): number {
  const total = eur(o.TotalCost);
  if (total > 0) return total;
  const items = (o.OrderItems ?? []).reduce((s, it) => s + eur(it.TotalPrice), 0);
  return items + eur(o.ShippingCost);
}

// Zahlungen am Auftrag: 1) PaidAmount (falls >0), sonst Sum(Payments.PayValue)
function paidSum(o: BillbeeOrder): number {
  const paid = eur(o.PaidAmount);
  if (paid > 0) return paid;
  return (o.Payments ?? []).reduce((s, p) => s + eur(p.PayValue), 0);
}

function isInMonth(dateIso: string | null | undefined, year: number, monthIdx0: number): boolean {
  if (!dateIso) return false;
  const d = new Date(dateIso);
  return d.getUTCFullYear() === year && d.getUTCMonth() === monthIdx0;
}

function inList(value: number | undefined, list: number[]): boolean {
  if (!Number.isFinite(value)) return false;
  return list.includes(value as number);
}

async function fetchOrdersPaged(query: Record<string, string | number | number[] | undefined>) {
  const pageSize = Number(query.pageSize ?? 250);
  let page = 1;
  const all: BillbeeOrder[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${BILLBEE_BASE}/orders`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));

    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      if (k === "page" || k === "pageSize") continue;

      if (k === "orderStateId" && Array.isArray(v)) {
        for (const id of v as number[]) url.searchParams.append("orderStateId", String(id));
      } else {
        url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), { headers: authHeaders(), cache: "no-store" });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, Math.max(1000, retryAfter * 1000)));
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Billbee /orders failed: ${res.status} – ${text}`);
    }

    const data = (await res.json()) as ApiPagedResult<BillbeeOrder>;
    all.push(...(data?.Data ?? []));

    const { Page, PageSize, TotalRows } = data?.Paging ?? { Page: page, PageSize: pageSize, TotalRows: 0 };
    const fetched = Page * PageSize;
    if (fetched >= TotalRows || (data?.Data?.length ?? 0) === 0) break;

    page += 1;
    // 2 req/s/Endpoint → kleine Pause
    await new Promise((r) => setTimeout(r, 600));
  }
  return all;
}

export async function GET(req: NextRequest) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const monthIdx = now.getMonth(); // 0-basiert
    const firstDay = new Date(year, monthIdx, 1, 0, 0, 0);
    const lastDay = new Date(year, monthIdx + 1, 0, 23, 59, 59);

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? firstDay.toISOString();
    const to = searchParams.get("to") ?? lastDay.toISOString();

    // ---------- Basis: Bestellungen nach Bestelldatum (CreatedAt) im Zeitraum ----------
    const ordersByOrderDate = await fetchOrdersPaged({
      minOrderDate: from,
      maxOrderDate: to,
      pageSize: 250,
    });

    // ---------- A) Angebote MTD: NUR State 14 (CONFIG.OFFER_OPEN) ----------
    // ---------- B) Auftragseingang Bestellungen MTD: State NICHT IN [1,2,3,4] ----------
    let angeboteMTD = 0;
    let auftragseingangBestellungenMTD = 0;

    for (const o of ordersByOrderDate) {
      const inThisMonth = isInMonth(o.CreatedAt, year, monthIdx);
      if (!inThisMonth) continue;

      const gross = grossInclShipping(o);

      // A) AngeboteMTD: nur State in OFFER_OPEN (default [14])
      if (inList(o.State, CONFIG.OFFER_OPEN)) {
        angeboteMTD += gross;
      }

      // B) Auftragseingang: State NICHT in [1,2,3,4]
      if (!inList(o.State, EXCLUDED_STATES_FOR_ORDER_INTAKE as unknown as number[])) {
        auftragseingangBestellungenMTD += gross;
      }
    }

    // ---------- C) Umsatz (ShippedAt im Monat) ----------
    const modifiedThisMonth = await fetchOrdersPaged({
      modifiedAtMin: from,
      modifiedAtMax: to,
      pageSize: 250,
    });

    let umsatzMTD = 0;
    for (const o of modifiedThisMonth) {
      if (isInMonth(o.ShippedAt, year, monthIdx)) {
        umsatzMTD += grossInclShipping(o);
      }
    }

    // ---------- D) Offene Angebote (aktuell) ----------
    const offeneAngeboteOrders = await fetchOrdersPaged({
      orderStateId: CONFIG.OFFER_OPEN,
      pageSize: 250,
    });

    let offeneAngebote = 0;
    for (const o of offeneAngeboteOrders) {
      offeneAngebote += grossInclShipping(o);
    }

    // ---------- E) Auftragsbestand (aktuell) ----------
    const stockOrders = await fetchOrdersPaged({
      orderStateId: CONFIG.STOCK_STATES,
      pageSize: 250,
    });

    let auftragsbestand = 0;
    for (const o of stockOrders) {
      // Keine Stornos mitrechnen, falls definiert
      if (inList(o.State, CONFIG.CANCELLED)) continue;
      auftragsbestand += grossInclShipping(o);
    }

    // ---------- F) Erhaltene Anzahlungen (aktuell) ----------
    // Definition: Zahlungen für Aufträge mit State ∈ STOCK_STATES
    // UND ohne InvoiceNumber, ohne InvoiceDate, ohne ShippedAt
    let erhalteneAnzahlungen = 0;
    for (const o of stockOrders) {
      if (inList(o.State, CONFIG.CANCELLED)) continue;

      const hasInvoiceNumber =
        o.InvoiceNumber !== null &&
        o.InvoiceNumber !== undefined &&
        String(o.InvoiceNumber).trim() !== "" &&
        String(o.InvoiceNumber) !== "0";

      const hasInvoiceDate = !!o.InvoiceDate;
      const hasShipped = !!o.ShippedAt;

      if (!hasInvoiceNumber && !hasInvoiceDate && !hasShipped) {
        erhalteneAnzahlungen += paidSum(o);
      }
    }

    // ---------- G) Hochrechnung (nur für die MTD-Kennzahlen) ----------
    const dayOfMonth = now.getDate();
    const daysInMonth = lastDay.getDate();
    const factor = dayOfMonth > 0 ? daysInMonth / dayOfMonth : 1;

    const forecast = {
      auftragseingangBestellungen: Math.round(auftragseingangBestellungenMTD * factor),
      angebote: Math.round(angeboteMTD * factor),
      umsatz: Math.round(umsatzMTD * factor),
    };

    return NextResponse.json(
      {
        period: { from, to, today: now.toISOString(), dayOfMonth, daysInMonth },
        kpis: {
          // MTD
          auftragseingangBestellungenMTD,
          angeboteMTD,
          umsatzMTD,
          forecast,
          // Aktuell
          offeneAngebote, // State = 14 (per Default)
          auftragsbestand, // States = 2,3,13
          erhalteneAnzahlungen, // Zahlungen auf (2,3,13) ohne Rechnung & ohne Versand
        },
        meta: {
          source: "Billbee /api/v1/orders",
          notes:
            "Angebote (MTD): nur State 14. Auftragseingang (MTD): Bestelldatum (CreatedAt) im Monat, State ≠ [1,2,3,4]. Umsatz (MTD): ShippedAt im Monat. Auftragsbestand: States 2,3,13. Anzahlungen: Payments/PaidAmount für States 2,3,13 ohne InvoiceNumber/InvoiceDate/ShippedAt. Brutto inkl. Versand via TotalCost.",
        },
      },
      { status: 200 },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
