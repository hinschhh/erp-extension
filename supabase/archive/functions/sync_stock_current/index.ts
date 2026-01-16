// supabase/functions/sync_stock_current/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const {
  BILLBEE_API_KEY,
  BILLBEE_LOGIN,
  BILLBEE_PASSWORD,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = Deno.env.toObject();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase credentials");
if (!BILLBEE_API_KEY || !BILLBEE_LOGIN || !BILLBEE_PASSWORD) throw new Error("Missing Billbee credentials");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TABLE = "stg_billbee_stock";
const BILLBEE_BASE = "https://api.billbee.io/api/v1";

// --- HTTP Helper ---
function authHeaders(): HeadersInit {
  return {
    "X-Billbee-Api-Key": BILLBEE_API_KEY,
    "Authorization": "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
    "Accept": "application/json",
  };
}

async function billbeeFetch(path: string, attempt = 1): Promise<Response> {
  const res = await fetch(`${BILLBEE_BASE}${path}`, { headers: authHeaders() });
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") ?? "1") * 1000;
    if (attempt >= 5) return res;
    await new Promise(r => setTimeout(r, retry));
    return billbeeFetch(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Billbee ${res.status}: ${await res.text()}`);
  return res;
}

// --- Mapping ---
function mapStock(p: any) {
  const id = typeof p.Id === "number" ? p.Id : null;
  if (!id) return null;
  if (p.IsDeactivated === true) return null;
  if (p.Type === 2) return null; // BOM ignorieren

  const stocks = Array.isArray(p.Stocks) ? p.Stocks : [];
  const main = stocks[0] || {};
  const others = stocks.slice(1);

  const stock_available = typeof main.StockCurrent === "number" ? main.StockCurrent : 0;
  const stock_unavailable = others.reduce((sum, s) => {
    const v = typeof s.StockCurrent === "number" ? s.StockCurrent : 0;
    return sum + v;
  }, 0);

  return {
    billbee_product_id: id,
    sku: p.SKU ?? null,
    stock_available,
    stock_unavailable,
    pulled_at: new Date().toISOString(),
  };
}

// --- Handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,apiKey,x-client-info",
      },
    });
  }

  try {
    const url = new URL(req.url);
    // pageSize < 250
    const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 200), 249);

    let page = 1;
    let total = 0;

    while (true) {
      const res = await billbeeFetch(`/products?page=${page}&pageSize=${pageSize}`);
      const json = await res.json();
      const items: any[] = Array.isArray(json) ? json : (json.Data ?? []);
      if (!items.length) break;

      const rows = items.map(mapStock).filter(Boolean) as any[];
      if (rows.length) {
        const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "billbee_product_id" });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
        total += rows.length;
      }

      if (items.length < pageSize) break; // letzte Seite erreicht
      page++;
    }

    return new Response(JSON.stringify({ ok: true, upserted: total, pageSize }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
