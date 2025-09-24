// supabase/functions/refresh_reports/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { error: e1 } = await supabase.rpc("exec_sql", {
    sql: `REFRESH MATERIALIZED VIEW CONCURRENTLY reports.mv_reserved_from_bom;`,
  });
  if (e1) return new Response(e1.message, { status: 500 });

  const { error: e2 } = await supabase.rpc("exec_sql", {
    sql: `REFRESH MATERIALIZED VIEW CONCURRENTLY reports.mv_product_stock_current;`,
  });
  if (e2) return new Response(e2.message, { status: 500 });

  return new Response(JSON.stringify({ refreshed: ["mv_reserved_from_bom","mv_product_stock_current"] }), {
    headers: { "content-type": "application/json" },
  });
});
