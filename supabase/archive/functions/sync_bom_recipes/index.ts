// supabase/functions/sync_bom_recipes/index.ts
// Liest Billbee-Produkte seitenweise, extrahiert BillOfMaterial und upsertet nach public.bom_recipes
// - bevorzugt ArticleId aus BillOfMaterial
// - Fallback: resolve über SKU via ref_billbee_products_mirror
// - pageSize default 200 (max 249), Stop sobald items.length < pageSize

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type BillbeeBOMItem = { Amount?: number; ArticleId?: number; SKU?: string };
type BillbeeProduct = {
  Id?: number;
  Type?: number; // 2 = BOM
  BillOfMaterial?: BillbeeBOMItem[];
  SKU?: string;
};

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

const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const TABLE_BOM = "bom_recipes";
const TABLE_REF = "ref_billbee_products_mirror";

// --- HTTP helpers ---
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
    const ra = Number(res.headers.get("Retry-After") ?? "1") * 1000;
    if (attempt >= 5) return res;
    await new Promise(r => setTimeout(r, ra));
    return billbeeFetch(path, attempt + 1);
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Billbee ${res.status}: ${txt}`);
  }
  return res;
}

// --- Resolve: SKU -> billbee_product_id (über ref-Table)
async function resolveIdsBySku(skus: string[]): Promise<Record<string, number>> {
  if (!skus.length) return {};
  // dedupe
  const uniq = Array.from(new Set(skus.filter(s => s && s.trim() !== "")));
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 1000) chunks.push(uniq.slice(i, i + 1000));

  const map: Record<string, number> = {};
  for (const c of chunks) {
    const { data, error } = await supabase
      .from(TABLE_REF)
      .select("billbee_product_id, sku")
      .in("sku", c);
    if (error) throw new Error(`Resolve SKU failed: ${error.message}`);
    for (const row of data ?? []) {
      if (row.sku) map[row.sku] = row.billbee_product_id;
    }
  }
  return map;
}

// --- Mapping einer Produktseite -> BOM rows
async function extractBomRows(products: BillbeeProduct[]) {
  // Sammle alle BOM-Einträge (mit Raw-Daten)
  const candidates: Array<{ bomId: number; compId?: number; compSku?: string; qty: number }> = [];

  for (const p of products) {
    const bomId = typeof p.Id === "number" ? p.Id : null;
    if (!bomId) continue;

    const items = Array.isArray(p.BillOfMaterial) ? p.BillOfMaterial : [];
    if (items.length === 0) continue; // kein BOM

    for (const it of items) {
      const qty = typeof it.Amount === "number" ? it.Amount : 0;
      if (qty === 0) continue;

      const compId = typeof it.ArticleId === "number" && it.ArticleId > 0 ? it.ArticleId : undefined;
      const compSku = typeof it.SKU === "string" && it.SKU.trim() !== "" ? it.SKU : undefined;

      candidates.push({ bomId, compId, compSku, qty });
    }
  }

  // Fallback-Auflösung über SKU für Einträge ohne compId
  const toResolve = candidates.filter(c => !c.compId && c.compSku).map(c => c.compSku!) as string[];
  const resolved = await resolveIdsBySku(toResolve);

  // Endgültige Rows (nur solche, die eine Komponenten-ID haben)
  const rows = candidates
    .map((c) => {
      const componentId = c.compId ?? (c.compSku ? resolved[c.compSku] : undefined);
      if (typeof componentId !== "number") return null;
      return {
        billbee_bom_id: c.bomId,
        billbee_component_id: componentId,
        quantity: c.qty,
      };
    })
    .filter(Boolean) as Array<{ billbee_bom_id: number; billbee_component_id: number; quantity: number }>;

  return rows;
}

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
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 200), 1), 249);

    let page = 1;
    let totalUpserts = 0;

    while (true) {
      // Wir ziehen ALLE Produkte; BOMs identifizieren wir über BillOfMaterial.length > 0
      const res = await billbeeFetch(`/products?page=${page}&pageSize=${pageSize}`);
      const json = await res.json();
      const items: BillbeeProduct[] = Array.isArray(json) ? json : (json?.Data ?? []);
      if (!items.length) break;

      const rows = await extractBomRows(items);
      if (rows.length) {
        // Upsert batch-weise
        const { error } = await supabase
          .from(TABLE_BOM)
          .upsert(rows, { onConflict: "billbee_bom_id,billbee_component_id" }); // PK-Kombination
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
        totalUpserts += rows.length;
      }

      if (items.length < pageSize) break; // letzte Seite erreicht
      page += 1;
    }

    return new Response(JSON.stringify({ ok: true, upserted: totalUpserts, pageSize }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
