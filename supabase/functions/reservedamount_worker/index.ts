// supabase/functions/reservedamount_worker/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function authHeaders(extra?: HeadersInit): HeadersInit {
  const { BILLBEE_API_KEY, BILLBEE_LOGIN, BILLBEE_PASSWORD } = Deno.env.toObject();
  return {
    "X-Billbee-Api-Key": BILLBEE_API_KEY,
    "Authorization": "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...(extra || {}),
  };
}
async function billbeeFetch(path: string, init: RequestInit = {}) {
  const base = Deno.env.get("BILLBEE_BASE_URL") ?? "https://api.billbee.io/api/v1";
  const res = await fetch(`${base}${path}`, { ...init, headers: authHeaders(init.headers) });
  return res;
}

const CONCURRENCY = 2;
const BATCH_SIZE  = 40;
const BASE_DELAY_MS = 600;

async function fetchReservedAmount(id: number): Promise<number> {
  // Billbee: reservedamount by id/sku → wir nutzen id
  const res = await billbeeFetch(`/products/reservedamount?id=${id}`);
  if (res.status === 429) {
    const ra = res.headers.get("Retry-After");
    const ms = ra ? parseInt(ra) * 1000 : 3000;
    throw Object.assign(new Error("rate_limited"), { code: 429, retryAfter: ms });
  }
  if (!res.ok) throw new Error(`Billbee ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const reservedQty = Number(j?.reservedAmount ?? j?.ReservedAmount ?? 0);
  return Number.isFinite(reservedQty) ? reservedQty : 0;
}

serve(async (req) => {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId"); // optional
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // pending Batch laden
  const { data: queue, error: listErr } = await supabase
    .from("ops.sync_tasks_reservedamount")
    .select("id, billbee_product_id, attempts")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("id", { ascending: true })
    .limit(BATCH_SIZE);
  if (listErr) return new Response(listErr.message, { status: 500 });

  if (!queue || queue.length === 0) {
    // optional: Run finalisieren
    if (runId) {
      const run = Number(runId);
      const { count: pend } = await supabase
        .from("ops.sync_tasks_reservedamount").select("*", { count: "exact", head: true })
        .eq("run_id", run).eq("status", "pending");
      const { count: errs } = await supabase
        .from("ops.sync_tasks_reservedamount").select("*", { count: "exact", head: true })
        .eq("run_id", run).eq("status", "error");
      if ((pend ?? 0) === 0) {
        await supabase.from("ops.sync_runs").update({
          status: (errs ?? 0) > 0 ? "partial" : "success",
          finished_at: new Date().toISOString(),
        }).eq("id", run);
      }
    }
    return new Response(JSON.stringify({ processedOk: 0, processedErr: 0 }), { headers: { "content-type": "application/json" }});
  }

  let processedOk = 0, processedErr = 0;

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, (_, w) => (async () => {
    for (let i = w; i < queue.length; i += CONCURRENCY) {
      const t = queue[i];
      try {
        const qty = await fetchReservedAmount(t.billbee_product_id);
        const { error: upErr } = await supabase
          .from("staging_area.billbee_committed_direct")
          .upsert({
            billbee_product_id: t.billbee_product_id,
            committed_qty: qty,
            pulled_at: new Date().toISOString(),
          }, { onConflict: "billbee_product_id" });
        if (upErr) throw upErr;

        await supabase
          .from("ops.sync_tasks_reservedamount")
          .update({ status: "done", attempts: t.attempts + 1, last_error: null })
          .eq("id", t.id);

        processedOk += 1;
      } catch (e: any) {
        const attempts = (t.attempts ?? 0) + 1;
        if (e?.code === 429) {
          await delay(e.retryAfter ?? 3000);
          await supabase.from("ops.sync_tasks_reservedamount")
            .update({ attempts, last_error: "rate_limited" })
            .eq("id", t.id);
        } else {
          await supabase.from("ops.sync_tasks_reservedamount")
            .update({ attempts, status: attempts >= 5 ? "error" : "pending", last_error: String(e?.message ?? e) })
            .eq("id", t.id);
          processedErr += 1;
        }
      }
      await delay(BASE_DELAY_MS);
    }
  })());

  await Promise.all(workers);

  return new Response(JSON.stringify({ processedOk, processedErr }), {
    headers: { "content-type": "application/json" },
  });
});
