// supabase/functions/reservedamount_start_run/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: runIns, error: runErr } = await supabase
    .from("ops.sync_runs")
    .insert({ kind: "reservedamount" })
    .select("id")
    .single();
  if (runErr) return new Response(runErr.message, { status: 500 });
  const runId = runIns.id;

  const { error: qErr } = await supabase.rpc("exec_sql", {
    sql: `
      with candidates as (
        select billbee_product_id, sku, 100 as priority
        from reference.billbee_products_mirror
        union
        select br.billbee_component_id as billbee_product_id, rp.sku, 100
        from public.bom_recipes br
        join reference.billbee_products_mirror rp
          on rp.billbee_product_id = br.billbee_component_id
        union
        select br.billbee_bom_id as billbee_product_id, rp.sku, 50
        from public.bom_recipes br
        join reference.billbee_products_mirror rp
          on rp.billbee_product_id = br.billbee_bom_id
      )
      insert into ops.sync_tasks_reservedamount (run_id, billbee_product_id, sku, priority)
      select ${runId}, billbee_product_id, sku, min(priority)
      from candidates
      group by billbee_product_id, sku
      on conflict (run_id, billbee_product_id) do nothing;

      update ops.sync_runs
      set total_candidates = (select count(*) from ops.sync_tasks_reservedamount where run_id = ${runId})
      where id = ${runId};
    `,
  });
  if (qErr) return new Response(qErr.message, { status: 500 });

  return new Response(JSON.stringify({ runId }), { headers: { "content-type": "application/json" }});
});
