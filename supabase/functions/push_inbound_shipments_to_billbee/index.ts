// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const SYNC_FN_URL = "https://nqdhcsebxybveezqfnyl.supabase.co/functions/v1/sync_reference_products";

// ---------- ENV HELPERS ----------
function requiredEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = requiredEnv("SUPABASE_URL");                      // z.B. https://<ref>.supabase.co
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY"); // Service-Role Key (RLS-bypass, sicher im Edge-Env)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function authHeaders() {
  const apiKey = requiredEnv("BILLBEE_API_KEY");
  const username = requiredEnv("BILLBEE_LOGIN");
  const apiPassword = requiredEnv("BILLBEE_PASSWORD");
  const basic = btoa(`${username}:${apiPassword}`);
  return {
    "Content-Type": "application/json",
    "X-Billbee-Api-Key": apiKey,
    "Authorization": `Basic ${basic}`,
    "User-Agent": "supabase-edge-fn/stock-sync",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- HELFER: BILLBEE mit Rate-Limit ----------
async function fetchBillbeeJsonWithRateLimit(
  url: string,
  init: RequestInit,
  { maxRetries = 5, baseBackoffMs = 600, timeoutMs = 15000 } = {},
) {
  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let body: any;
      try { body = JSON.parse(text); } catch { body = text; }

      if (res.status !== 429) {
        return { res, body };
      }

      const retryAfterHdr = res.headers.get("Retry-After");
      const retryAfterSec = retryAfterHdr ? Number(retryAfterHdr) : NaN;
      const jitter = Math.floor(Math.random() * 200);
      const delayMs = Number.isFinite(retryAfterSec)
        ? Math.max(0, Math.floor(retryAfterSec * 1000)) + jitter
        : baseBackoffMs + jitter;

      if (attempt > maxRetries) return { res, body }; // aufgeben
      await sleep(delayMs);
    } finally {
      clearTimeout(t);
    }
  }
}

async function postJsonWithTimeout(url: string, body: any, headers: Record<string, string>, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, body: json };
  } finally {
    clearTimeout(t);
  }
}

// ---------- DOMAIN: Verarbeitung eines Outbox-Eintrags ----------
type PayloadShape = {
  id?: string | number;
  amount?: number | string;
  lookupBy?: "id" | "sku" | "ean";
  reason?: string;
  forceSendStockToShops?: boolean;
  autosubtractReservedAmount?: boolean;
};

async function processOneOutboxRow(row: {
  id: number;
  payload: any;
}) {
  const p: PayloadShape = row.payload ?? {};

  const id = (p.id ?? "").toString().trim();
  const amount = Number(p.amount);
  const lookupBy = (p.lookupBy ?? "id") as "id" | "sku" | "ean";
  const reason = p.reason ?? "Stock increased via Supabase Outbox Worker";
  const forceSendStockToShops = p.forceSendStockToShops ?? true;
  const autosubtractReservedAmount = p.autosubtractReservedAmount ?? true;

  if (!id) {
    throw new Error(`Outbox#${row.id}: payload.id fehlt/leer`);
  }
  if (!Number.isFinite(amount)) {
    throw new Error(`Outbox#${row.id}: payload.amount ist ungültig`);
  }
  if (!["id", "sku", "ean"].includes(lookupBy)) {
    throw new Error(`Outbox#${row.id}: payload.lookupBy ist ungültig`);
  }

  // 1) Produkt + aktuellen Bestand holen
  const getUrl = `${BILLBEE_BASE}/products/${encodeURIComponent(id)}?lookupBy=${lookupBy}`;
  const { res: getRes, body: product } = await fetchBillbeeJsonWithRateLimit(getUrl, {
    headers: authHeaders(),
  });

  if (!getRes.ok) {
    throw new Error(`Billbee GET failed (${getRes.status}): ${JSON.stringify(product)}`);
  }

  const data = product?.Data;
  if (!data) {
    throw new Error("Billbee response missing Data");
  }
  const stock0 = Array.isArray(data.Stocks) && data.Stocks.length > 0 ? data.Stocks[0] : null;
  if (!stock0) {
    throw new Error("No Stocks[0] available on product");
  }

  const billbeeId = data.Id;
  const sku = data.SKU;
  const stockId = stock0.StockId;
  const oldQty = Number(stock0.StockCurrent ?? data.StockCurrent ?? 0);
  const newQty = oldQty + amount;

  // 2) Update in Billbee
  const updateUrl = `${BILLBEE_BASE}/products/updatestockmultiple`;
  const models = [
    {
      ...(Number.isFinite(billbeeId) ? { BillbeeId: billbeeId } : {}),
      ...(sku ? { Sku: sku } : {}),
      ...(Number.isFinite(stockId) ? { StockId: stockId } : {}),
      Reason: reason,
      OldQuantity: oldQty,
      NewQuantity: newQty,
      DeltaQuantity: amount,
      ForceSendStockToShops: forceSendStockToShops,
      AutosubtractReservedAmount: autosubtractReservedAmount,
    },
  ];

  const updRes = await fetch(updateUrl, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(models),
  });
  const updText = await updRes.text();
  let updBody: any;
  try { updBody = JSON.parse(updText); } catch { updBody = updText; }
  if (!updRes.ok) {
    throw new Error(`Billbee POST failed (${updRes.status}): ${JSON.stringify(updBody)}`);
  }

  // 3) Nach erfolgreichem POST → sync_reference_products
  const syncPayload = {
    source: "update_stock_multiple",
    lookupBy,
    product: { billbeeId, sku, stockId },
    newQuantity: newQty,
  };
  const syncHeaders = { "Content-Type": "application/json" };
  const syncResult = await postJsonWithTimeout(SYNC_FN_URL, syncPayload, syncHeaders, 10000);

  return {
    billbee: { billbeeId, sku, stockId },
    oldQuantity: oldQty,
    delta: amount,
    newQuantity: newQty,
    sync: { ok: syncResult.ok, status: syncResult.status },
  };
}

// ---------- Worker: pull & process ----------
async function pullPending(limit = 50) {
  // Nur pending + topic und bereits "verfügbar"
  const { data, error } = await supabase
    .from("integration_outbox")
    .select("id, payload, retry_count")
    .eq("status", "pending")
    .eq("topic", "billbee.stock.increase")
    .lte("available_at", new Date().toISOString())
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

async function markSucceeded(id: number) {
  await supabase
    .from("integration_outbox")
    .update({ status: "succeeded", error: null })
    .eq("id", id);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000);
}

async function markFailedWithBackoff(id: number, prevRetryCount: number, errMsg: string) {
  const nextRetry = prevRetryCount + 1;
  // simpler Backoff: 1, 2, 4, 8, 15 Minuten …
  const minutes = Math.min(15, Math.pow(2, Math.max(0, nextRetry - 1)));
  const nextAvailable = addMinutes(new Date(), minutes);

  await supabase
    .from("integration_outbox")
    .update({
      status: "pending", // wir lassen pending + available_at in die Zukunft laufen
      error: errMsg?.slice(0, 1000) ?? "Unknown",
      retry_count: nextRetry,
      available_at: nextAvailable.toISOString(),
    })
    .eq("id", id);
}

// ---------- HTTP Handler ----------
serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Batch aus der Outbox holen
    const rows = await pullPending(50);

    let processed = 0;
    const results: any[] = [];

    for (const row of rows) {
      try {
        const r = await processOneOutboxRow(row as any);
        await markSucceeded(row.id);
        results.push({ id: row.id, ok: true, ...r });
        processed++;
        // kleine Pause, um 2 req/s Caps pro Endpoint zu respektieren
        await sleep(600);
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        await markFailedWithBackoff(row.id, (row as any).retry_count ?? 0, msg);
        results.push({ id: row.id, ok: false, error: msg });
        // zusätzliche kleine Pause bei Fehler
        await sleep(800);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      count: processed,
      totalFetched: rows.length,
      results,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
