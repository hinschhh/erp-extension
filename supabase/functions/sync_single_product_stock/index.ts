// supabase/functions/sync_single_product/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
/**
 * On-demand Sync für EIN Produkt (Button-Klick):
 * - Holt aus Billbee: Stock + ReservedAmount (direkt)
 * - Holt ReservedAmount für alle Eltern-BOMs und schreibt diese unter deren billbee_product_id
 *   in stg_billbee_stock_committed
 * - Schreibt Stock in stg_billbee_stock (sku, stock_available, stock_unavailable, pulled_at)
 *
 * GET  /functions/v1/sync_single_product?id=400000011234567
 * POST /functions/v1/sync_single_product  { "billbee_product_id": 400000011234567 }
 */ const { BILLBEE_API_KEY, BILLBEE_LOGIN, BILLBEE_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase credentials");
if (!BILLBEE_API_KEY || !BILLBEE_LOGIN || !BILLBEE_PASSWORD) throw new Error("Missing Billbee credentials");
// ======= Tabellen/Konfiguration =======
const T_RECIPES = "bom_recipes"; // billbee_bom_id (parent), billbee_component_id (component), quantity
const T_STOCK = "stg_billbee_stock"; // billbee_product_id, sku, stock_available, stock_unavailable, pulled_at
const T_COMM = "stg_billbee_stock_committed"; // billbee_product_id, committed_qty, pulled_at
// Rate Limit/Retry
const MIN_INTERVALMS = 600; // ~≤1.6 RPS
const RETRIES_BILLBEE = 5;
// ======= HTTP/CORS/REST Helper =======
const CORS = new Headers({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,apiKey,x-client-info",
  "content-type": "application/json"
});
const REST_HEADERS_BASE = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json"
};
function billbeeHeaders() {
  return {
    "X-Billbee-Api-Key": BILLBEE_API_KEY,
    "Authorization": "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
    "Accept": "application/json"
  };
}
async function sleep(ms) {
  return new Promise((r)=>setTimeout(r, ms));
}
async function sleepToInterval(t0) {
  const rest = MIN_INTERVALMS - (Date.now() - t0);
  if (rest > 0) await sleep(rest);
}
function toIntOr(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function toNumOr(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
// PostgREST (robust, keine Exceptions)
async function restFetch(path, init = {}) {
  const retry = init.retry ?? 3;
  for(let i = 0; i <= retry; i++){
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
          ...init.headers || {},
          ...REST_HEADERS_BASE
        }
      });
      const status = res.status;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!res.ok) {
        const text = await res.text().catch(()=>"");
        if ((status >= 500 || status === 429 || status === 502 || status === 504) && i < retry) {
          await sleep(200 * (i + 1));
          continue;
        }
        return {
          ok: false,
          status,
          data: null,
          text
        };
      }
      if (status === 204) return {
        ok: true,
        status,
        data: null,
        text: ""
      };
      if (!ct.includes("application/json")) {
        const text = await res.text().catch(()=>"");
        const data = text ? (()=>{
          try {
            return JSON.parse(text);
          } catch  {
            return null;
          }
        })() : null;
        return {
          ok: true,
          status,
          data,
          text
        };
      }
      const data = await res.json().catch(()=>null);
      return {
        ok: true,
        status,
        data,
        text: ""
      };
    } catch (e) {
      if (i < retry) {
        await sleep(200 * (i + 1));
        continue;
      }
      return {
        ok: false,
        status: 0,
        data: null,
        text: e instanceof Error ? e.message : String(e)
      };
    }
  }
  return {
    ok: false,
    status: 0,
    data: null,
    text: "exhausted"
  };
}
// ======= Billbee Calls =======
/** Direkt reserviert (integer) */ async function billbeeFetchReservedAmount(id, attempt = 1) {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://api.billbee.io/api/v1/products/reservedamount?id=${id}`, {
      headers: billbeeHeaders()
    });
    if (res.status === 429 && attempt < RETRIES_BILLBEE) {
      const retryRaw = res.headers.get("Retry-After") ?? "1";
      const waitSec = Number(retryRaw);
      const wait = Number.isFinite(waitSec) ? Math.max(1000, waitSec * 1000) : 1000;
      await sleep(wait);
      return billbeeFetchReservedAmount(id, attempt + 1);
    }
    if (!res.ok) {
      await res.text().catch(()=>null);
      await sleepToInterval(t0);
      return 0;
    }
    const j = await res.json().catch(()=>({}));
    const qty = Number(j?.Data?.ReservedAmount ?? 0);
    await sleepToInterval(t0);
    return Number.isFinite(qty) ? Math.trunc(qty) : 0;
  } catch  {
    await sleepToInterval(t0);
    return 0;
  }
}
/** Produktdetails für SKU + Stock (available/onhand) */ async function billbeeFetchProduct(id) {
  const t0 = Date.now();
  try {
    const res = await fetch(`https://api.billbee.io/api/v1/products/${id}`, {
      headers: billbeeHeaders()
    });
    if (!res.ok) {
      await res.text().catch(()=>null);
      await sleepToInterval(t0);
      return {};
    }
    const j = await res.json().catch(()=>({}));
    const d = j?.Data ?? j;
    // SKU Kandidaten (robust)
    const sku = [
      d?.SKU,
      d?.Sku,
      d?.ArticleNumber,
      d?.ProductNumber
    ]?.find((v)=>typeof v === "string");
    // available (bevorzugt Available, sonst StockCurrent/Free*)
    const pickInt = (arr)=>{
      for (const v of arr){
        const n = Number(v);
        if (Number.isFinite(n)) return Math.trunc(n);
      }
      return undefined;
    };
    const available = pickInt([
      d?.AvailableStock,
      d?.AvailableAmount,
      d?.StockCurrent,
      d?.StockCurrentAsDecimal,
      d?.FreeStock,
      d?.FreeAmount
    ]);
    const onhand = pickInt([
      d?.Stock,
      d?.Quantity,
      d?.OnHand
    ]);
    await sleepToInterval(t0);
    return {
      sku,
      available,
      onhand,
      raw: d
    };
  } catch  {
    await sleepToInterval(t0);
    return {};
  }
}
// ======= DB Helpers =======
async function upsertStockRow(id, sku, available, onhand, errors) {
  const nowISO = new Date().toISOString();
  const stock_available = typeof available === "number" ? available : 0;
  const stock_unavailable = typeof onhand === "number" && typeof available === "number" ? Math.max(0, onhand - available) : 0;
  const row = {
    billbee_product_id: id,
    stock_available,
    stock_unavailable,
    pulled_at: nowISO
  };
  if (typeof sku === "string") row.sku = sku;
  const qs = new URLSearchParams({
    on_conflict: "billbee_product_id"
  }).toString();
  const r = await restFetch(`${T_STOCK}?${qs}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify([
      row
    ])
  });
  if (!r.ok) errors.push({
    where: "upsertStockRow",
    status: r.status,
    msg: r.text,
    row
  });
}
async function upsertCommittedRows(rows, errors) {
  if (!rows.length) return;
  const qs = new URLSearchParams({
    on_conflict: "billbee_product_id"
  }).toString();
  const r = await restFetch(`${T_COMM}?${qs}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!r.ok) errors.push({
    where: "upsertCommittedRows",
    status: r.status,
    msg: r.text,
    rowsCount: rows.length
  });
}
async function loadParentsForComponent(componentId, errors) {
  const qs = new URLSearchParams({
    select: "billbee_bom_id,quantity",
    billbee_component_id: `eq.${componentId}`
  }).toString();
  const r = await restFetch(`${T_RECIPES}?${qs}`);
  if (!r.ok) {
    errors.push({
      where: "loadParentsForComponent",
      status: r.status,
      msg: r.text
    });
    return [];
  }
  return (r.data ?? []).map((row)=>({
      billbee_bom_id: toIntOr(row?.billbee_bom_id, 0),
      quantity: toNumOr(row?.quantity, 0)
    })).filter((x)=>x.billbee_bom_id && x.quantity > 0);
}
// ======= Handler =======
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  const errors = [];
  const reqId = crypto.randomUUID();
  try {
    // 1) Eingabe
    let id = null;
    if (req.method === "POST") {
      const body = await req.json().catch(()=>({}));
      id = toIntOr((body && body.billbee_product_id) ?? null, NaN);
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      id = toIntOr(url.searchParams.get("id"), NaN);
    }
    if (!Number.isFinite(id) || id === null || isNaN(id)) {
      return new Response(JSON.stringify({
        ok: false,
        error: "billbee_product_id missing/invalid",
        reqId
      }), {
        status: 400,
        headers: CORS
      });
    }
    // 2) Billbee: Produkt (SKU/Stock) + Direkt-Reserved
    const product = await billbeeFetchProduct(id);
    const reservedDirect = await billbeeFetchReservedAmount(id);
    // 3) BOM-Eltern laden, für jeden Eltern Reserved holen
    const parents = await loadParentsForComponent(id, errors);
    const nowISO = new Date().toISOString();
    const committedRows = [];
    committedRows.push({
      billbee_product_id: id,
      committed_qty: toIntOr(reservedDirect, 0),
      pulled_at: nowISO
    });
    for (const p of parents){
      const t0 = Date.now();
      const parentReserved = await billbeeFetchReservedAmount(p.billbee_bom_id);
      committedRows.push({
        billbee_product_id: p.billbee_bom_id,
        committed_qty: toIntOr(parentReserved, 0),
        pulled_at: nowISO
      });
      await sleepToInterval(t0);
    }
    // 4) Upserts
    await upsertStockRow(id, product.sku, product.available, product.onhand, errors);
    await upsertCommittedRows(committedRows, errors);
    // 5) Response
    const payload = {
      ok: errors.length === 0,
      reqId,
      productId: id,
      wrote: {
        stock: {
          sku: product.sku ?? null,
          stock_available: typeof product.available === "number" ? product.available : 0,
          stock_unavailable: typeof product.onhand === "number" && typeof product.available === "number" ? Math.max(0, product.onhand - product.available) : 0
        },
        committed_rows: committedRows.length,
        committed_direct: toIntOr(reservedDirect, 0),
        committed_parents_distinct: parents.length
      },
      errors
    };
    return new Response(JSON.stringify(payload), {
      headers: CORS
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
    // geordnete Fehlermeldung (200) für UI
    return new Response(JSON.stringify({
      ok: false,
      reqId,
      fatal: true,
      error: msg
    }), {
      headers: CORS
    });
  }
});
