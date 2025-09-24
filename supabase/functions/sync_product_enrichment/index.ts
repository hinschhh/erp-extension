// supabase/functions/sync_product_enrichment/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type BillbeeProduct = Record<string, any>;

const BASE = Deno.env.get("BILLBEE_BASE_URL") ?? "https://app.billbee.io/api/v1";
const TOKEN = Deno.env.get("BILLBEE_TOKEN")!;
const APIKEY = Deno.env.get("BILLBEE_API_KEY") ?? "";
const PAGE_SIZE = Number(Deno.env.get("BILLBEE_PAGE_SIZE") ?? "200");

const HEADERS: HeadersInit = {
  "Authorization": `Bearer ${TOKEN}`,
  "Accept": "application/json",
  ...(APIKEY ? { "X-Billbee-Api-Key": APIKEY } : {}),
};

function idOf(p: BillbeeProduct): number | null {
  return Number(p?.id ?? p?.productId ?? p?.billbeeProductId ?? null) || null;
}
function manufacturerOf(p: BillbeeProduct): string | null {
  return p?.manufacturer ?? p?.brand ?? null;
}
function categoryPathOf(p: BillbeeProduct): string | null {
  // häufig gibt's einen eindeutigen String; sonst versuch aus Array zu joinen
  const cat = p?.categoryPath ?? p?.category ?? p?.mainCategory ?? null;
  if (!cat) return null;
  if (typeof cat === "string") return cat;
  if (Array.isArray(cat)) return cat.map((x) => (typeof x === "string" ? x : x?.name ?? "")).filter(Boolean).join(" > ");
  if (typeof cat === "object") return cat?.name ?? null;
  return null;
}
function imageUrlOf(p: BillbeeProduct): string | null {
  const imgs = p?.images ?? p?.productImages ?? null;
  if (Array.isArray(imgs) && imgs.length) {
    const first = imgs[0];
    return first?.url ?? first?.link ?? first?.imageUrl ?? null;
  }
  return p?.imageUrl ?? null;
}
function isActiveOf(p: BillbeeProduct): boolean | null {
  if (typeof p?.isActive === "boolean") return p.isActive;
  if (typeof p?.isArchived === "boolean") return !p.isArchived;
  return null;
}
function barcodeOf(p: BillbeeProduct): string | null {
  return p?.ean ?? p?.barcode ?? p?.gtin ?? null;
}

async function fetchPage(page: number): Promise<BillbeeProduct[]> {
  const url = `${BASE}/products?page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 429) {
    const ra = res.headers.get("Retry-After");
    const ms = ra ? parseInt(ra) * 1000 : 3000;
    await new Promise((r) => setTimeout(r, ms));
    return fetchPage(page);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Billbee /products ${res.status}: ${body}`);
  }
  const json = await res.json();
  const arr: any[] = Array.isArray(json) ? json : (json?.data ?? json?.Products ?? []);
  return arr as BillbeeProduct[];
}

serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let page = 1;
  let upserts = 0;

  while (true) {
    const items = await fetchPage(page);
    if (!items.length) break;

    const rows = items
      .map((p) => {
        const id = idOf(p);
        if (!id) return null;
        return {
          billbee_product_id: id,
          manufacturer_name: manufacturerOf(p),
          category_path: categoryPathOf(p),
          image_url: imageUrlOf(p),
          is_active: isActiveOf(p),
          barcode: barcodeOf(p),
          pulled_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as any[];

    if (rows.length) {
      const { error } = await supabase.from("staging_area.billbee_product_enrichment").upsert(rows, {
        onConflict: "billbee_product_id",
      });
      if (error) throw error;
      upserts += rows.length;
    }

    if (items.length < PAGE_SIZE) break;
    page += 1;
  }

  // Reports-MV für Produktliste aktualisieren
  await supabase.rpc("exec_sql", {
    sql: `REFRESH MATERIALIZED VIEW CONCURRENTLY reports.mv_products_enriched;`,
  });

  return new Response(JSON.stringify({ upserted: upserts }), {
    headers: { "content-type": "application/json" },
  });
});
