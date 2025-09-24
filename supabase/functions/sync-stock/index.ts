import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Environment variables
const { BILLBEE_API_KEY, BILLBEE_LOGIN, BILLBEE_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
// Billbee API configuration
const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const headers = {
  "X-Billbee-Api-Key": BILLBEE_API_KEY,
  "Authorization": "Basic " + btoa(`${BILLBEE_LOGIN}:${BILLBEE_PASSWORD}`),
  "Content-Type": "application/json"
};
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,apiKey,x-client-info"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }
  try {
    console.log('Starting Sync Function');
    // 1) Fetch all products with pagination
    let page = 1;
    let totalPages = 1;
    const allProducts = [];
    do {
      console.log(`Fetching products page ${page}`);
      const res = await fetch(`${BILLBEE_BASE}/Products?page=${page}&pageSize=250`, {
        headers
      });
      const wrap = await res.json();
      console.log('Received page', page, 'rows:', wrap.Data?.length);
      allProducts.push(...wrap.Data || []);
      // Update totalPages from response
      totalPages = wrap.Paging?.TotalPages ?? 1;
      page++;
    }while (page <= totalPages)
    console.log(`Total products fetched: ${allProducts.length}`);
    // 2) Prepare batches
    const componentsBatch = [];
    const bomBatch = [];
    for (const p of allProducts){
      // Fetch committed stock via reservedamount endpoint by ID
      let stockCommitted = 0;
      /*try {
        const resReserved = await fetch(
          `${BILLBEE_BASE}/Products/reservedamount?lookupBy=id&id=${p.Id}`,
          { headers }
        );
        const reservedWrap: any = await resReserved.json();
      
        stockCommitted = typeof reservedWrap.Data?.ReservedAmount === 'number'
          ? reservedWrap.Data.ReservedAmount
          : 0;
      } catch (e) {
        console.warn('Error fetching reserved amount for', p.Id, e);
      }*/ // Aggregate availability
      let stockAvailable = 0;
      let stockUnavailable = 0;
      /*if (Array.isArray(p.Stocks)) {
        for (const s of p.Stocks) {
          const current = typeof s.StockCurrent === 'number' ? s.StockCurrent : 0;
          if (s.Name === 'Standard') {
            stockAvailable = current;
          }
          if (s.Name === 'Ausschuss-Lager' || s.Name === 'Ausstellung') {
            stockUnavailable += current;
          }
        }
      }*/ // Erlaubte Kategorien für Inventur
      const INVENTUR_KATEGORIEN = [
        "Armatur",
        "Elektrogeräte",
        "Küche",
        "Naturstein",
        "Schrank",
        "Spiegel",
        "TV",
        "TV-Zubehör",
        "WB",
        "Wohnmöbel",
        "WT",
        "Zubehör"
      ];
      // Nicht relevante Kategorien
      const IGNORIERTE_KATEGORIEN = [
        "Antike Ware",
        "Neuware",
        "On Demand - Externe Bestellung/Produktion erforderlich",
        "Produktion erforderlich",
        "Produktion nicht erforderlich",
        "Rohling",
        "SB",
        "Service"
      ];
      // Hilfsfunktion, um erste gültige Kategorie zu finden
      function getInventurKategorie(p) {
        const kategorien = [
          p.Category1?.Name,
          p.Category2?.Name,
          p.Category3?.Name
        ];
        for (const k of kategorien){
          if (!k) continue; // Leere Werte überspringen
          if (IGNORIERTE_KATEGORIEN.includes(k)) continue; // Ignorieren
          if (INVENTUR_KATEGORIEN.includes(k)) return k; // Erster Treffer
        }
        return null; // Nichts gefunden
      }
      // Beispiel
      const category = getInventurKategorie(p);
      // Type 1 = Component
      if (p.Type === 1 && p.Category1?.Name !== "Antike Ware" && p.Category2?.Name !== "Antike Ware" && p.Category3?.Name !== "Antike Ware") {
        componentsBatch.push({
          billbee_product_id: p.Id,
          sku: p.SKU ?? "",
          name: Array.isArray(p.Title) ? p.Title[0]?.Text : null,
          manufacturer: p.Manufacturer ?? null,
          category: category ?? null,
          stock_available: p.Stocks[0].StockCurrent ?? 0,
          stock_committed: p.Stocks[0].ReservedAmount ?? 0,
          stock_unavailable: stockUnavailable = p.Stocks[1].StockCurrent ?? 0 + p.Stocks[2].StockCurrent ?? 0,
          sold_amount: p.SoldAmount ?? 0,
          net_purchase_price: p.CostPriceNet ?? 0,
          updated_at: new Date().toISOString()
        });
      }
      // Type 2 = Assembly (BOM)
      if (p.Type === 2 && Array.isArray(p.BillOfMaterial)) {
        for (const item of p.BillOfMaterial){
          bomBatch.push({
            parent_product_id: p.Id,
            component_id: item.ArticleId,
            quantity: item.Amount,
            stock_committed: stockCommitted,
            sold_amount: p.SoldAmount ?? 0,
            updated_at: new Date().toISOString()
          });
        }
      }
    }
    console.log('Component batch size:', componentsBatch.length);
    console.log('BOM batch size:', bomBatch.length);
    // 3) Clear entire tables via delete
    /* Console.log('Deleting all bom_recipes');
    let resp = await supabase.from('bom_recipes').delete();
    console.log('Deletion of bom_recipes response', resp);
    if (resp.error) throw resp.error;

    console.log('Deleting all components');
    resp = await supabase.from('components').delete();
    console.log('Deletion of components response', resp);
    if (resp.error) throw resp.error;*/ // 4) Insert fresh data
    if (componentsBatch.length > 0) {
      console.log('Upserting components');
      let resp = await supabase.from('components').upsert(componentsBatch, {
        onConflict: [
          'billbee_product_id'
        ]
      });
      console.log('Upsert components response', resp);
      if (resp.error) throw resp.error;
    }
    if (bomBatch.length > 0) {
      console.log('Upserting bom_recipes');
      let resp = await supabase.from('bom_recipes').upsert(bomBatch, {
        onConflict: [
          'parent_product_id',
          'component_id'
        ]
      });
      console.log('Upsert bom_recipes response', resp);
      if (resp.error) throw resp.error;
    }
    console.log('Sync complete');
    return new Response(JSON.stringify({
      status: 'success',
      components: componentsBatch.length,
      bom: bomBatch.length
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  } catch (err) {
    console.error('Sync error', err);
    return new Response(JSON.stringify({
      status: 'error',
      message: err.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
      }
    });
  }
});
