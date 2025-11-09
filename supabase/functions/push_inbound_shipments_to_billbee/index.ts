// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const SYNC_FN_URL = "https://nqdhcsebxybveezqfnyl.supabase.co/functions/v1/sync_reference_products";
function requiredEnv(name) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}
function authHeaders() {
  const apiKey = requiredEnv("BILLBEE_API_KEY");
  const username = requiredEnv("BILLBEE_LOGIN");
  const apiPassword = requiredEnv("BILLBEE_PASSWORD");
  const basic = btoa(`${username}:${apiPassword}`);
  return {
    "Content-Type": "application/json",
    "X-Billbee-Api-Key": apiKey,
    "Authorization": `Basic ${basic}`,
    "User-Agent": "supabase-edge-fn/stock-sync"
  };
}
const sleep = (ms)=>new Promise((r)=>setTimeout(r, ms));
/**
 * Billbee-Fetch mit 429-Handling, kleinem Jitter und Timeout.
 */ async function fetchBillbeeJsonWithRateLimit(url, init, { maxRetries = 5, baseBackoffMs = 600, timeoutMs = 15000 } = {}) {
  let attempt = 0;
  while(true){
    attempt++;
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch  {
        body = text;
      }
      if (res.status !== 429) {
        return {
          res,
          body
        };
      }
      const retryAfterHdr = res.headers.get("Retry-After");
      const retryAfterSec = retryAfterHdr ? Number(retryAfterHdr) : NaN;
      const jitter = Math.floor(Math.random() * 200); // 0-200ms
      const delayMs = Number.isFinite(retryAfterSec) ? Math.max(0, Math.floor(retryAfterSec * 1000)) + jitter : baseBackoffMs + jitter;
      if (attempt > maxRetries) return {
        res,
        body
      }; // aufgeben
      await sleep(delayMs);
    } finally{
      clearTimeout(t);
    }
  }
}
/**
 * Kleiner POST-Helper (für Sync-Call)
 */ async function postJsonWithTimeout(url, body, headers, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch  {
      json = text;
    }
    return {
      ok: res.ok,
      status: res.status,
      body: json
    };
  } finally{
    clearTimeout(t);
  }
}
serve(async (req)=>{
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({
        error: "Use POST"
      }), {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // Payload einlesen
    const raw = await req.json();
    // Legacy-Pfad (einzelnes Item): zu items[] transformieren
    let items = raw?.items;
    const commonForce = typeof raw?.forceSendStockToShops === "boolean" ? raw.forceSendStockToShops : true;
    const commonAuto = typeof raw?.autosubtractReservedAmount === "boolean" ? raw.autosubtractReservedAmount : true;
    if (!Array.isArray(items)) {
      const legacyId = raw?.id;
      const legacyAmount = Number(raw?.amount);
      if (legacyId == null || !Number.isFinite(legacyAmount)) {
        return new Response(JSON.stringify({
          error: "Missing items[]. Or legacy payload requires 'id' and numeric 'amount'."
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      items = [
        {
          id: String(legacyId),
          amount: legacyAmount,
          lookupBy: raw?.lookupBy ?? "id",
          reason: raw?.reason ?? "Stock increased via Supabase Edge Function (batch)",
          forceSendStockToShops: commonForce,
          autosubtractReservedAmount: commonAuto
        }
      ];
    }
    // Validierung items[]
    const cleanItems = [];
    for (const it of items){
      const id = it?.id?.toString().trim();
      const amount = Number(it?.amount);
      const lookupBy = it?.lookupBy ?? "id";
      if (!id) {
        return new Response(JSON.stringify({
          error: "Item missing 'id'"
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      if (!Number.isFinite(amount)) {
        return new Response(JSON.stringify({
          error: `Item ${id}: invalid 'amount'`
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      if (![
        "id",
        "sku",
        "ean"
      ].includes(lookupBy)) {
        return new Response(JSON.stringify({
          error: `Item ${id}: invalid 'lookupBy'`
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      cleanItems.push({
        id,
        amount,
        lookupBy,
        reason: it?.reason ?? "Stock increased via Supabase Edge Function (batch)",
        forceSendStockToShops: typeof it?.forceSendStockToShops === "boolean" ? it.forceSendStockToShops : commonForce,
        autosubtractReservedAmount: typeof it?.autosubtractReservedAmount === "boolean" ? it.autosubtractReservedAmount : commonAuto
      });
    }
    // Für jedes Item: Produkt holen, OldQuantity bestimmen, Model bauen
    const models = [];
    const perItemMeta = [];
    for (const it of cleanItems){
      const getUrl = `${BILLBEE_BASE}/products/${encodeURIComponent(it.id)}?lookupBy=${it.lookupBy}`;
      const { res: getRes, body: product } = await fetchBillbeeJsonWithRateLimit(getUrl, {
        headers: authHeaders()
      });
      if (!getRes.ok) {
        perItemMeta.push({
          id: String(it.id),
          lookupBy: it.lookupBy,
          error: {
            status: getRes.status,
            body: product
          }
        });
        continue; // dieses Item skippen, rest trotzdem verarbeiten
      }
      const data = product?.Data;
      const stock0 = Array.isArray(data?.Stocks) && data.Stocks.length > 0 ? data.Stocks[0] : null;
      if (!data || !stock0) {
        perItemMeta.push({
          id: String(it.id),
          lookupBy: it.lookupBy,
          error: "Missing Data or Stocks[0] in Billbee GET"
        });
        continue;
      }
      const billbeeId = Number(data.Id);
      const sku = data.SKU;
      const stockId = Number(stock0.StockId);
      const oldQty = Number(stock0.StockCurrent ?? data.StockCurrent ?? 0);
      const newQty = oldQty + Number(it.amount);
      // Ein einzelnes Model nach Billbee-Spezifikation
      const model = {
        Reason: it.reason,
        OldQuantity: oldQty,
        NewQuantity: newQty,
        DeltaQuantity: Number(it.amount),
        ForceSendStockToShops: !!it.forceSendStockToShops,
        AutosubtractReservedAmount: !!it.autosubtractReservedAmount
      };
      if (Number.isFinite(billbeeId)) model.BillbeeId = billbeeId;
      if (sku) model.Sku = sku;
      if (Number.isFinite(stockId)) model.StockId = stockId;
      models.push(model);
      perItemMeta.push({
        id: String(it.id),
        lookupBy: it.lookupBy,
        billbeeId,
        sku,
        stockId,
        oldQuantity: oldQty,
        newQuantity: newQty,
        delta: Number(it.amount)
      });
    }
    // Wenn kein einziges Model gebaut werden konnte → 422
    if (models.length === 0) {
      return new Response(JSON.stringify({
        error: "No valid items to update (Billbee GET failed or missing data for all items).",
        details: perItemMeta
      }), {
        status: 422,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // 1x POST auf updatestockmultiple mit allen Models
    const updateUrl = `${BILLBEE_BASE}/products/updatestockmultiple`;
    const updRes = await fetch(updateUrl, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(models)
    });
    const updText = await updRes.text();
    let updJson;
    try {
      updJson = JSON.parse(updText);
    } catch  {
      updJson = updText;
    }
    if (!updRes.ok) {
      return new Response(JSON.stringify({
        error: "Billbee POST failed",
        status: updRes.status,
        response: updJson,
        items: perItemMeta
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // Nach erfolgreichem POST: kompakter Sync-Call (alle betroffenen Produkte)
    const syncPayload = {
      source: "update_stock_multiple",
      items: perItemMeta.filter((i)=>!i.error).map((i)=>({
          lookupBy: i.lookupBy,
          product: {
            billbeeId: i.billbeeId,
            sku: i.sku,
            stockId: i.stockId
          },
          newQuantity: i.newQuantity,
          delta: i.delta
        }))
    };
    const syncHeaders = {
      "Content-Type": "application/json"
    };
    const syncResult = await postJsonWithTimeout(SYNC_FN_URL, syncPayload, syncHeaders, 10000);
    return new Response(JSON.stringify({
      ok: true,
      count: models.length,
      items: perItemMeta,
      billbeeResponse: updJson,
      syncReferenceProducts: {
        ok: syncResult.ok,
        status: syncResult.status,
        body: syncResult.body
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err?.message ?? "Unknown error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
