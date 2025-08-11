// supabase/functions/sync-reservedamount-bom/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -------- ENV ----------------------------------------------------------------
const {
  BILLBEE_API_KEY,
  BILLBEE_LOGIN,
  BILLBEE_PASSWORD,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = Deno.env.toObject();

const missingEnv: string[] = [];
if (!BILLBEE_API_KEY) missingEnv.push("BILLBEE_API_KEY");
if (!BILLBEE_LOGIN) missingEnv.push("BILLBEE_LOGIN");
if (!BILLBEE_PASSWORD) missingEnv.push("BILLBEE_PASSWORD");
if (!SUPABASE_URL) missingEnv.push("SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) missingEnv.push("SUPABASE_SERVICE_ROLE_KEY");

// -------- SUPABASE -----------------------------------------------------------
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// -------- BILLBEE ------------------------------------------------------------
const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const headersBillbee = {
  "X-Billbee-Api-Key": BILLBEE_API_KEY!,
  Authorization: "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
  "Content-Type": "application/json",
};

// -------- UTILS --------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function badRequest(msg: string) {
  return jsonResponse({ error: msg }, 400);
}

function serverError(msg: string, err?: unknown) {
  console.error("[sync-reservedamount-bom] ERROR:", msg, err ?? "");
  return jsonResponse({ error: msg }, 500);
}

function getNumber(n: unknown, fallback: number) {
  const x = typeof n === "string" ? parseInt(n, 10) : typeof n === "number" ? n : NaN;
  return Number.isFinite(x) && x > 0 ? Math.min(1000, Math.max(1, Math.floor(x))) : fallback;
}

// -------- MAIN ---------------------------------------------------------------
serve(async (req) => {
  try {
    // CORS preflight: 204 ohne Body!
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (missingEnv.length) {
      return serverError(
        `Fehlende Umgebungsvariablen: ${missingEnv.join(", ")}`
      );
    }

    // --- Input lesen (GET Query ODER POST JSON)
    let limit = 150;
    let cursor: number | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      limit = getNumber(url.searchParams.get("limit"), 150);
      const c = url.searchParams.get("cursor");
      cursor = c ? Number(c) : null;
    } else if (req.method === "POST") {
      // Dashboard-"Test" sendet meist POST
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        limit = getNumber((body as any).limit, 150);
        cursor = (body as any).cursor != null ? Number((body as any).cursor) : null;
      }
    } else {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...CORS_HEADERS, "Allow": "GET,POST,OPTIONS" },
      });
    }

    console.log("[sync-reservedamount-bom] Input:", { limit, cursor });

    // --- Batch aus DB lesen
    const q = supabase
      .from("bom_recipes") // <— Tabellenname
      .select("id, parent_product_id")
      .order("id", { ascending: true })
      .limit(limit);

    if (cursor != null && Number.isFinite(cursor)) {
      q.gt("id", cursor);
    }

    const { data: rows, error: fetchError } = await q;

    if (fetchError) {
      console.error("[sync-reservedamount-bom] DB-Select-Fehler:", fetchError);
      return serverError("Fehler beim Laden aus 'bom_recipes'", fetchError);
    }

    if (!rows || rows.length === 0) {
      return jsonResponse({
        processed: 0,
        skipped: 0,
        updatedCount: 0,
        updated: [],
        hasMore: false,
        nextCursor: null,
        limit,
      });
    }

    let processed = 0;
    let skipped = 0;
    let updatedCount = 0;
    const updated: Array<{ id: number; reservedAmount: number }> = [];

    // --- Für jede Zeile Billbee-ReservedAmount ziehen & DB updaten
    for (const row of rows as Array<{ id: number; parent_product_id: string | null }>) {
      processed++;

      const { id, parent_product_id } = row;
      if (!parent_product_id) {
        skipped++;
        console.warn(`[sync-reservedamount-bom] id=${id} ohne parent_product_id, skip`);
        continue;
      }

      const url =
        `${BILLBEE_BASE}/products/reservedamount?id=${encodeURIComponent(parent_product_id)}&lookupBy=id`;

      let attempts = 0;
      let res: Response | null = null;

      while (true) {
        attempts++;
        res = await fetch(url, { headers: headersBillbee });

        if (res.status !== 429) break;

        const retryAfterSec = parseInt(res.headers.get("retry-after") ?? "1", 10);
        console.warn(`[sync-reservedamount-bom] 429 für ${parent_product_id}. Warte ${retryAfterSec}s (Versuch ${attempts})`);
        await delay(retryAfterSec * 1000);
        if (attempts >= 3) break;
      }

      if (!res || !res.ok) {
        console.error(
          `[sync-reservedamount-bom] Billbee-Error id=${id}, parent=${parent_product_id}:`,
          res ? `${res.status} ${res.statusText}` : "keine Response"
        );
        skipped++;
        continue;
      }

      let reservedAmount: number | null = null;
      try {
        const json: any = await res.json();
        // Fallbacks: Data.ReservedAmount (Docs) oder Data.reservedAmount (falls anders geschrieben)
        reservedAmount =
          typeof json === "number"
            ? json
            : json?.Data?.ReservedAmount ??
              json?.Data?.reservedAmount ??
              null;
      } catch (e) {
        console.error(`[sync-reservedamount-bom] JSON-Parse-Fehler für parent=${parent_product_id}`, e);
        skipped++;
        continue;
      }

      if (reservedAmount == null || !Number.isFinite(reservedAmount)) {
        console.warn(`[sync-reservedamount-bom] Kein ReservedAmount parent=${parent_product_id}, skip`);
        skipped++;
        continue;
      }

      // --- Update in 'bom_recipes' (gleiche Logik wie bei components → stock_committed)
      const { error: updateError } = await supabase
        .from("bom_recipes")
        .update({ stock_committed: reservedAmount })
        .eq("id", id);

      if (updateError) {
        console.error(`[sync-reservedamount-bom] DB-Update-Fehler id=${id}`, updateError);
        skipped++;
        continue;
      }

      updated.push({ id, reservedAmount });
      updatedCount++;
    }

    // --- Paginierung bestimmen
    const lastId = rows[rows.length - 1]?.id as number;
    const hasMore = rows.length === limit;
    const nextCursor = hasMore ? String(lastId) : null;

    const payload = {
      processed,
      skipped,
      updatedCount,
      updated,
      hasMore,
      nextCursor,
      limit,
    };

    console.log("[sync-reservedamount-bom] DONE:", payload);

    return jsonResponse(payload, 200);
  } catch (err) {
    return serverError("Unerwarteter Serverfehler", err);
  }
});