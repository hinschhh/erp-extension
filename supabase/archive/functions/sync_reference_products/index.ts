// supabase/functions/sync_reference_products/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const { BILLBEE_API_KEY, BILLBEE_LOGIN, BILLBEE_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase credentials");
}
if (!BILLBEE_API_KEY || !BILLBEE_LOGIN || !BILLBEE_PASSWORD) {
  throw new Error("Missing Billbee credentials");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
// ---------- Tabellen ----------
const TABLE_MIRROR = "ref_billbee_products_mirror";
const TABLE_ENRICH = "ref_billbee_product_data_enrichment";
const TABLE_EXTENSION = "ref_billbee_product_extension";
const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const headers = {
  "X-Billbee-Api-Key": BILLBEE_API_KEY,
  Authorization: "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
  "Content-Type": "application/json"
};
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,apiKey,x-client-info"
};
// ---------- Helpers ----------
function firstTitle(p) {
  if (Array.isArray(p.Title) && p.Title.length > 0) {
    const t = p.Title[0]?.Text;
    return typeof t === "string" && t.trim() !== "" ? t : null;
  }
  return null;
}
function mapProduct(p) {
  return {
    billbee_product_id: typeof p.Id === "number" ? p.Id : null,
    sku: typeof p.SKU === "string" && p.SKU.trim() !== "" ? p.SKU : null,
    name: firstTitle(p),
    is_bom: p.Type === 2,
    is_active: typeof p.IsDeactivated === "boolean" ? !p.IsDeactivated : null
  };
}
function mapProductEnrichment(p) {
  return {
    billbee_product_id: typeof p.Id === "number" ? p.Id : null,
    category1: typeof p.Category1?.Name === "string" ? p.Category1?.Name : null,
    category2: typeof p.Category2?.Name === "string" ? p.Category2?.Name : null,
    category3: typeof p.Category3?.Name === "string" ? p.Category3?.Name : null,
    manufacturer: typeof p.Manufacturer === "string" ? p.Manufacturer : null,
    net_purchase_price: typeof p.CostPriceNet === "number" ? p.CostPriceNet : null
  };
}
/*function mapProductExtension(p: { Id?: number; CustomFields?: Array<{ Value?: unknown }> }) {
  const cfs = Array.isArray(p.CustomFields) ? p.CustomFields : [];

  const getStr = (i: number) => {
    const v = cfs[i]?.Value;
    return typeof v === "string" ? v.trim() : "";
  };

  const purchase_details = [
    `Farbe: ${getStr(1)}`,
    `Platte: ${getStr(2)}`,
    `Beckenausschnitt: ${getStr(3)}`,
    `Sonstiges z.B. Beschläge: ${getStr(4)}`,
    `Sonderschublade: ${getStr(5)}`,
    `Anmerkungen: ${getStr(6)}`,
  ].join("\n");

  return {
    billbee_product_id: typeof p.Id === "number" ? p.Id : null,
    external_sku: getStr(0) || null,
    purchase_details,
  };
}*/


async function fetchWithRetry(url, init, attempt = 1, maxAttempts = 5) {
  const res = await fetch(url, init);
  if (res.status !== 429) return res;
  const retryAfter = res.headers.get("Retry-After");
  const waitMs = Math.max(1, Number(retryAfter ?? "1")) * 1000;
  if (attempt >= maxAttempts) return res;
  await new Promise((r)=>setTimeout(r, waitMs));
  return fetchWithRetry(url, init, attempt + 1, maxAttempts);
}
async function fetchProductsPage(page, pageSize) {
  const url = `${BILLBEE_BASE}/products?page=${page}&pageSize=${pageSize}`;
  const res = await fetchWithRetry(url, {
    headers
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Billbee API error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const data = Array.isArray(json.Data) ? json.Data : [];
  return {
    data
  };
}
async function upsertProductsMirror(rows) {
  const valid = rows.filter((r)=>typeof r.billbee_product_id === "number");
  if (valid.length === 0) return {
    upserted: 0
  };
  const { error } = await supabase.from(TABLE_MIRROR).upsert(valid, {
    onConflict: "billbee_product_id"
  });
  if (error) throw new Error(`Supabase upsert failed (mirror): ${error.message}`);
  return {
    upserted: valid.length
  };
}
async function upsertProductEnrichment(rows) {
  const valid = rows.filter((r)=>typeof r.billbee_product_id === "number");
  if (valid.length === 0) return {
    upserted: 0
  };
  const { error } = await supabase.from(TABLE_ENRICH).upsert(valid, {
    onConflict: "billbee_product_id"
  });
  if (error) throw new Error(`Supabase upsert failed (enrichment): ${error.message}`);
  return {
    upserted: valid.length
  };
}
/*async function upsertProductExtension(rows) {
  const valid = rows.filter((r)=>typeof r.billbee_product_id === "number");
  if (valid.length === 0) return {
    upserted: 0
  };
  const { error } = await supabase.from(TABLE_EXTENSION).upsert(valid, {
    onConflict: "billbee_product_id"
  });
  if (error) throw new Error(`Supabase upsert failed (extension): ${error.message}`);
  return {
    upserted: valid.length
  };
}*/
// ---------- Handler ----------
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS_HEADERS
    });
  }
  try {
    const url = new URL(req.url);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 250), 1), 500);
    const maxPages = Math.max(Number(url.searchParams.get("maxPages") ?? 2000), 1);
    let page = 1;
    let processed = 0;
    let upsertedMirror = 0;
    let upsertedEnrich = 0;
    while(page <= maxPages){
      const { data } = await fetchProductsPage(page, pageSize);
      if (!data.length) break;
      const mappedMirror = data.map(mapProduct);
      const mappedEnrich = data.map(mapProductEnrichment);
      /*const mappedExtension = data.map(mapProductExtension);*/
      const resMirror = await upsertProductsMirror(mappedMirror);
      const resEnrich = await upsertProductEnrichment(mappedEnrich);
      /*const resExtension = await upsertProductExtension(mappedExtension);*/
      processed += data.length;
      upsertedMirror += resMirror.upserted;
      upsertedEnrich += resEnrich.upserted;
      if (data.length < pageSize) break;
      page += 1;
    }
    return new Response(JSON.stringify({
      ok: true,
      processed,
      upsertedMirror,
      upsertedEnrich,
      pages_fetched: page,
      pageSize,
      tables: [
        TABLE_MIRROR,
        TABLE_ENRICH,
        /*TABLE_EXTENSION*/
      ]
    }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({
      ok: false,
      error: msg
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
});
