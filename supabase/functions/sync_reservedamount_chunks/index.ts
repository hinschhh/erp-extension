// supabase/functions/sync_reservedamount_chunks/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Supabase Client/ENV ---
const {
  BILLBEE_API_KEY, BILLBEE_LOGIN, BILLBEE_PASSWORD,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
} = Deno.env.toObject();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Supabase credentials");
if (!BILLBEE_API_KEY || !BILLBEE_LOGIN || !BILLBEE_PASSWORD) throw new Error("Missing Billbee credentials");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// --- Konstanten ---
const BILLBEE_BASE   = "https://api.billbee.io/api/v1";
const REF_TABLE      = "ref_billbee_products_mirror";
const TARGET_TABLE   = "stg_billbee_committed_direct";   // schreibt in committed_qty
const CURSOR_TABLE   = "ops_sync_cursor";
const CURSOR_KIND    = "reservedamounts";

// konservativ, damit wir sicher im Funktionszeitlimit bleiben
const LIMIT_IDS      = 100;        // IDs pro Aufruf
const MIN_INTERVALMS = 500;        // ≥ 500 ms => ≤ 2 RPS
const TIME_BUDGET_MS = 105_000;    // ~1:45 pro Aufruf

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,apiKey,x-client-info",
} as const;

// --- Billbee HTTP ---
function billbeeHeaders(): HeadersInit {
  return {
    "X-Billbee-Api-Key": BILLBEE_API_KEY,
    "Authorization": "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
    "Accept": "application/json",
  };
}

async function sleepToInterval(startMs: number) {
  const rest = MIN_INTERVALMS - (Date.now() - startMs);
  if (rest > 0) await new Promise((r) => setTimeout(r, rest));
}

/** Holt Data.ReservedAmount für eine billbee_product_id. */
async function fetchReservedAmount(id: number, attempt = 1): Promise<number> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BILLBEE_BASE}/products/reservedamount?id=${id}`, { headers: billbeeHeaders() });

    if (res.status === 429 && attempt < 5) {
      const wait = Math.max(1000, Number(res.headers.get("Retry-After") ?? "1") * 1000);
      await new Promise((r) => setTimeout(r, wait));
      return fetchReservedAmount(id, attempt + 1);
    }

    if (!res.ok) {
      // robust bleiben (kein Throw), 0 zurück geben
      await res.text().catch(() => null);
      await sleepToInterval(t0);
      return 0;
    }

    let qty = 0;
    try {
      const j = await res.json();
      qty = Number((j as any)?.Data?.ReservedAmount ?? 0);
    } catch {
      qty = 0;
    }
    await sleepToInterval(t0);
    return Number.isFinite(qty) ? Math.trunc(qty) : 0;
  } catch {
    await sleepToInterval(t0);
    return 0;
  }
}

// --- DB‑Helpers ---
/** Lädt aktive Produkt-IDs (BOMs werden NICHT gefiltert), paginiert via range(offset, offset+LIMIT_IDS-1) */
async function loadActiveIds(offset: number): Promise<number[]> {
  const { data, error } = await supabase
    .from(REF_TABLE)
    .select("billbee_product_id")
    .eq("is_active", true)
    .order("billbee_product_id", { ascending: true })
    .range(offset, offset + LIMIT_IDS - 1);

  if (error) throw new Error(error.message ?? JSON.stringify(error));
  return (data ?? [])
    .map((r: any) => r.billbee_product_id)
    .filter((id: any) => typeof id === "number");
}

async function upsertCommitted(rows: { billbee_product_id: number; committed_qty: number; pulled_at: string }[]) {
  if (!rows.length) return;
  const { error } = await supabase
    .from(TARGET_TABLE)
    .upsert(rows, { onConflict: "billbee_product_id" });
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

async function getCursor(): Promise<number> {
  const { data, error } = await supabase
    .from(CURSOR_TABLE)
    .select("next_offset")
    .eq("kind", CURSOR_KIND)
    .maybeSingle();
  if (error) throw new Error(error.message ?? JSON.stringify(error));
  return data?.next_offset ?? 0;
}

async function setCursor(next: number) {
  const { error } = await supabase
    .from(CURSOR_TABLE)
    .upsert({ kind: CURSOR_KIND, next_offset: next, updated_at: new Date().toISOString() }, { onConflict: "kind" });
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

// --- Handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const runStart = Date.now();
  try {
    // 1) Cursor lesen
    const offset = await getCursor();

    // 2) IDs für diesen Chunk laden
    const ids = await loadActiveIds(offset);

    // 3) Ende erreicht? → Cursor auf 0 und done=true
    if (!ids.length) {
      await setCursor(0);
      return new Response(JSON.stringify({ ok: true, processed: 0, nextOffset: 0, done: true }), {
        headers: { "content-type": "application/json", ...CORS },
      });
    }

    // 4) Verarbeiten (seriell, ≤ 2 RPS)
    const nowISO = new Date().toISOString();
    const buffer: { billbee_product_id: number; committed_qty: number; pulled_at: string }[] = [];
    let processed = 0;

    for (const id of ids) {
      // Zeitbudget schützen – vor Timeout sauber beenden
      if (Date.now() - runStart > TIME_BUDGET_MS) break;

      const qty = await fetchReservedAmount(id);
      buffer.push({ billbee_product_id: id, committed_qty: qty, pulled_at: nowISO });
      processed++;

      if (buffer.length >= 25) {
        await upsertCommitted(buffer.splice(0, buffer.length));
      }
    }
    if (buffer.length) await upsertCommitted(buffer);

    // 5) Cursor fortschreiben
    const nextOffset = offset + processed;     // immer: offset + processed
    const lastPage  = processed < LIMIT_IDS;   // "letzte Seite" (weniger als LIMIT_IDS verarbeitet)
    if (lastPage) {
      await setCursor(0);                      // am Ende: zurück auf 0
    } else {
      await setCursor(nextOffset);             // sonst: weiterzählen
    }

    // 6) Response
    return new Response(JSON.stringify({
      ok: true,
      processed,
      nextOffset: lastPage ? 0 : nextOffset,
      done: lastPage,
    }), {
      headers: { "content-type": "application/json", ...CORS },
    });
  } catch (e) {
    const msg = (e && typeof e === "object" && "message" in (e as any) && (e as any).message)
      ? String((e as any).message)
      : JSON.stringify(e ?? "Unknown error");
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "content-type": "application/json", ...CORS },
    });
  }
});
