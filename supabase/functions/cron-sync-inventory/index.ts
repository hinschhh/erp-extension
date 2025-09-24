// supabase/functions/cron-sync-inventory/index.ts
// Orchestriert die gleiche Abfolge wie der Button – jetzt zustandsbehaftet
// mit persistenter Phase/Cursor im Schema "internal" und Zeitbudget pro Aufruf.
//
// Schritte:
// 1) sync-stock
// 2) sync-reservedamount (components) batched
// 3) sync-reservedamount-bom (bom_recipes) batched
// 4) sync-bom-sum-to-components
//
// Anforderungen/Annahmen:
// - Tabellen im Schema "internal": sync_state (und optional sync_audit)
// - Cron-Worker ruft die Function alle X Minuten auf (mit JWT = Anon Key)
// - Es existiert genau 1 State-Zeile: id='inventory'

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type BatchPayload = {
  processed?: number;
  nextCursor?: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Einheitliche Nomenklatur
const FN_SYNC_STOCK = "sync-stock";
const FN_SYNC_RESERVED_COMPONENTS = "sync-reservedamount";
const FN_SYNC_RESERVED_BOM = "sync-reservedamount-bom";
const FN_SYNC_BOM_SUM_TO_COMPONENTS = "sync-bom-sum-to-components";

// Defaults
const DEFAULT_LIMIT_PER_BATCH = 100;
// Unter Free: ~150s Gateway-Timeout → wir lassen genügend Puffer
const DEFAULT_TIME_BUDGET_MS = 110_000;

// Phasen-Typ
type Phase = "stock" | "components" | "bom" | "aggregate" | "idle";

// Hauptclient (default Schema public) – für Edge-Function-Invokes
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ZWEITER Client mit Schema "internal" für unsere State-Tabellen!
// (WICHTIG: supabase-js v2 → Schema via Options setzen)
const dbInternal = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "internal" },
});

async function call(fn: string, body?: Record<string, unknown>) {
  const { error } = await db.functions.invoke(fn, { body: body ?? {} });
  if (error) throw new Error(`[${fn}] ${error.message}`);
}

async function readState() {
  const { data, error } = await dbInternal
    .from("sync_state")
    .select("*")
    .eq("id", "inventory")
    .single();
  if (error) throw new Error(`[state] read: ${error.message}`);
  return data as {
    id: string;
    phase: Phase;
    components_cursor: string | null;
    bom_cursor: string | null;
    batches_run: number;
  };
}

async function writeState(patch: Partial<{
  phase: Phase;
  components_cursor: string | null;
  bom_cursor: string | null;
  batches_run: number;
}>) {
  const { error } = await dbInternal
    .from("sync_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", "inventory");
  if (error) throw new Error(`[state] write: ${error.message}`);
}

serve(async (req) => {
  const startedAt = new Date();

  // Body-Parameter: { limit?: number, timeBudgetMs?: number }
  let limitPerBatch = DEFAULT_LIMIT_PER_BATCH;
  let timeBudgetMs = DEFAULT_TIME_BUDGET_MS;
  try {
    const incoming = await req.json().catch(() => ({}));
    if (typeof incoming?.limit === "number" && incoming.limit > 0) {
      limitPerBatch = Math.min(1_000, Math.floor(incoming.limit));
    }
    if (typeof incoming?.timeBudgetMs === "number" && incoming.timeBudgetMs > 5_000) {
      timeBudgetMs = Math.min(300_000, Math.floor(incoming.timeBudgetMs));
    }
  } catch {
    /* ignore body parse */
  }
  const deadline = Date.now() + timeBudgetMs;

  // Kleine Helper-Schleife: batched mit Cursor UND State-Persistenz
  const runBatches = async (
    fnName: string,
    initialCursor: string | null,
    cursorKey: "components_cursor" | "bom_cursor",
    state: { batches_run: number },
  ) => {
    let cursor = initialCursor;
    let lastCursor: string | null = null;
    let batchesRun = state.batches_run;

    for (let i = 0; i < 10_000; i++) {
      if (Date.now() > deadline) {
        console.log(`[time] Budget erreicht → früher Exit (${fnName})`);
        break;
      }

      const { data, error } = await db.functions.invoke<BatchPayload>(fnName, {
        body: { limit: limitPerBatch, cursor },
      });
      if (error) throw new Error(`[${fnName}] ${error.message}`);

      const payload = data ?? {};
      const delta = payload.processed ?? 0;
      console.log(`[${fnName}] +${delta} cursor=${payload.nextCursor ?? "—"}`);

      // State aktualisieren (Cursor + Batchzähler)
      batchesRun += 1;
      await writeState({
        [cursorKey]: (payload.nextCursor ?? null) as any,
        batches_run: batchesRun,
      });

      const next = (payload.nextCursor ?? null) as string | null;
      if (!next || next === lastCursor) break;
      lastCursor = next;
      cursor = next;
    }

    // finalen Cursor zurückgeben
    const s = await readState();
    return (s as any)[cursorKey] as string | null;
  };

  try {
    // Aktuellen State laden
    let state = await readState();
    let phase: Phase = state.phase;

    // PHASE 1: Bestand
    if (phase === "stock") {
      console.log(`[1/4] ${FN_SYNC_STOCK} …`);
      await call(FN_SYNC_STOCK);
      await writeState({ phase: "components" });
      state = await readState();
      phase = state.phase;
    }

    // PHASE 2: components
    if (phase === "components") {
      console.log(`[2/4] ${FN_SYNC_RESERVED_COMPONENTS} in Batches à ${limitPerBatch} …`);
      const next = await runBatches(
        FN_SYNC_RESERVED_COMPONENTS,
        state.components_cursor,
        "components_cursor",
        state,
      );

      if (next) {
        // Noch nicht fertig → beim nächsten Cron hier weiter
        return new Response(JSON.stringify({
          ok: true, partial: true, phase, limitPerBatch, timeBudgetMs,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // fertig → weiter zu BOM
      await writeState({ phase: "bom" });
      state = await readState();
      phase = state.phase;
    }

    // PHASE 3: bom_recipes
    if (phase === "bom") {
      console.log(`[3/4] ${FN_SYNC_RESERVED_BOM} in Batches à ${limitPerBatch} …`);
      const next = await runBatches(
        FN_SYNC_RESERVED_BOM,
        state.bom_cursor,
        "bom_cursor",
        state,
      );

      if (next) {
        // Noch nicht fertig → nächster Cron
        return new Response(JSON.stringify({
          ok: true, partial: true, phase, limitPerBatch, timeBudgetMs,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      // fertig → Aggregation
      await writeState({ phase: "aggregate" });
      state = await readState();
      phase = state.phase;
    }

    // PHASE 4: Aggregation
    if (phase === "aggregate") {
      console.log(`[4/4] ${FN_SYNC_BOM_SUM_TO_COMPONENTS} …`);
      await call(FN_SYNC_BOM_SUM_TO_COMPONENTS);
      await writeState({
        phase: "idle",
        components_cursor: null,
        bom_cursor: null,
      });
      phase = "idle";
    }

    // Done oder nichts zu tun
    const finishedAt = new Date().toISOString();
    return new Response(JSON.stringify({
      ok: true,
      partial: false,
      phase,
      startedAt: startedAt.toISOString(),
      finishedAt,
      limitPerBatch,
      timeBudgetMs,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error(`[cron-sync-inventory] Fehler:`, err);
    // Optional: Audit-Fehler protokollieren
    // await dbInternal.from("sync_audit").insert({ ok: false, error: String(err), finished_at: new Date().toISOString() });

    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
