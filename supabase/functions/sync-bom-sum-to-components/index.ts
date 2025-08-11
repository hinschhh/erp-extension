// supabase/functions/sync-bom-sum/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Umgebungsvariablen einlesen
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();

// Supabase-Client initialisieren
const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",                   // oder deine Domain statt "*"
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,apiKey,x-client-info",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }
  try {
    // 1. Alle BOM-Rezepte mit component_id, quantity, stock_committed und sold_amount laden
    const { data: recipes, error: fetchError } = await supabase
      .from("bom_recipes")
      .select("component_id, quantity, stock_committed, sold_amount");

    if (fetchError) {
      console.error("Fehler beim Laden der bom_recipes:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500 },
      );
    }
    if (!recipes?.length) {
      return new Response(
        JSON.stringify({ message: "Keine BOM-Rezepte gefunden." }),
        { status: 200 },
      );
    }

    // 2. Summenprodukt (quantity * stock_committed) und (quantity * sold_amount) pro component_id berechnen
    const stockSums = new Map<number, number>();
    const soldSums  = new Map<number, number>();

    for (const rec of recipes) {
      const compId = Number(rec.component_id);
      const qty    = Number(rec.quantity)        || 0;
      const sc     = Number(rec.stock_committed) || 0;
      const so     = Number(rec.sold_amount)     || 0;

      stockSums.set(compId, (stockSums.get(compId) ?? 0) + qty * sc);
      soldSums.set(compId,  (soldSums.get(compId)  ?? 0) + qty * so);
    }

    // 3. Union aller component_ids aus beiden Berechnungen
    const componentIds = new Set<number>([
      ...stockSums.keys(),
      ...soldSums.keys(),
    ]);

    const updated: Array<{
      component_id: number;
      stock_committed_in_bom: number;
      sold_amount_in_bom: number;
    }> = [];

    // 4. Für jede component_id die Felder in components aktualisieren
    for (const componentId of componentIds) {
      const totalStock = stockSums.get(componentId) ?? 0;
      const totalSold  = soldSums.get(componentId)  ?? 0;

      const { error: updateError } = await supabase
        .from("components")
        .update({
          stock_committed_in_bom: totalStock,
          sold_amount_in_bom:      totalSold,
        })
        .eq("billbee_product_id", componentId);

      if (updateError) {
        console.error(
          `Fehler beim Aktualisieren von Component ID ${componentId}:`,
          updateError,
        );
        continue;
      }

      updated.push({
        billbee_product_id: componentId,
        stock_committed_in_bom: totalStock,
        sold_amount_in_bom:      totalSold,
      });
    }

    // 5. Ergebnis zurückgeben
    return new Response(
      JSON.stringify({ updated }),
      {
        status: 200,
        headers: { "Content-Type": "application/json",  ...CORS_HEADERS },
      },
    );
  } catch (err) {
    console.error("Unerwarteter Fehler:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS }, },
    );
  }
});
