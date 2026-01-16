-- Migration: Remove deprecated shipping_costs_proportional from position tables
-- Date: 2026-01-08
-- Reason: shipping_costs_proportional has been moved to app_inbound_shipment_items
--         to properly handle split deliveries across multiple shipments.
--         The columns on position tables are deprecated and can cause data inconsistency.

-- Step 1: Drop dependent views that reference shipping_costs_proportional
DROP VIEW IF EXISTS rpt_product_sales_with_bom CASCADE;
DROP VIEW IF EXISTS rpt_inbound_items_monthly CASCADE;
DROP VIEW IF EXISTS rpt_inbound_items_enriched CASCADE;
DROP VIEW IF EXISTS rpt_po_deliveries_by_month_and_category CASCADE;
DROP VIEW IF EXISTS export_wareneingang_mtl CASCADE;
DROP VIEW IF EXISTS app_purchase_orders_positions_special_view CASCADE;
DROP VIEW IF EXISTS app_purchase_orders_positions_normal_view CASCADE;

-- Step 2: Drop columns from position tables
ALTER TABLE app_purchase_orders_positions_normal 
DROP COLUMN IF EXISTS shipping_costs_proportional;

ALTER TABLE app_purchase_orders_positions_special 
DROP COLUMN IF EXISTS shipping_costs_proportional;

-- Step 3: Recreate views WITHOUT shipping_costs_proportional

-- Recreate app_purchase_orders_positions_normal_view (shipping_costs_proportional removed)
CREATE OR REPLACE VIEW app_purchase_orders_positions_normal_view AS
WITH received AS (
  SELECT 
    isi.po_item_normal_id AS po_item_id,
    sum(isi.quantity_delivered) AS qty_received
  FROM app_inbound_shipment_items isi
  WHERE isi.po_item_normal_id IS NOT NULL
  GROUP BY isi.po_item_normal_id
)
SELECT 
  p.id,
  p.order_id,
  p.billbee_product_id,
  p.qty_ordered,
  p.unit_price_net,
  COALESCE(r.qty_received, 0)::numeric(12,3) AS qty_received,
  GREATEST(p.qty_ordered - COALESCE(r.qty_received, 0), 0)::numeric(12,3) AS qty_open,
  p.po_item_status,
  p.internal_notes,
  p.confirmed_at AS proforma_confirmed_at,
  p.dol_planned_at,
  p.dol_actual_at,
  p.goods_received_at,
  p.created_at,
  p.updated_at,
  p.fk_app_orders_id,
  o."bb_OrderNumber" AS bb_order_number,
  c."bb_Name" AS customer_name,
  p.fk_app_order_items_id
FROM app_purchase_orders_positions_normal p
LEFT JOIN received r ON r.po_item_id = p.id
LEFT JOIN app_orders o ON o.id = p.fk_app_orders_id
LEFT JOIN app_customers c ON c.id = o.fk_app_customers_id;

-- Recreate app_purchase_orders_positions_special_view (shipping_costs_proportional removed)
CREATE OR REPLACE VIEW app_purchase_orders_positions_special_view AS
WITH received AS (
  SELECT 
    isi.po_item_special_id AS po_item_id,
    sum(isi.quantity_delivered) AS qty_received
  FROM app_inbound_shipment_items isi
  WHERE isi.po_item_special_id IS NOT NULL
  GROUP BY isi.po_item_special_id
)
SELECT 
  p.id,
  p.order_id,
  p.billbee_product_id,
  p.base_model_billbee_product_id,
  p.supplier_sku,
  p.details_override,
  p.qty_ordered,
  p.unit_price_net,
  COALESCE(r.qty_received, 0)::numeric(12,3) AS qty_received,
  GREATEST(p.qty_ordered - COALESCE(r.qty_received, 0), 0)::numeric(12,3) AS qty_open,
  p.po_item_status,
  p.internal_notes,
  p.sketch_needed,
  p.sketch_confirmed_at,
  p.confirmed_at AS proforma_confirmed_at,
  p.dol_planned_at,
  p.dol_actual_at,
  p.goods_received_at,
  p.order_confirmation_ref,
  p.created_at,
  p.updated_at,
  p.fk_app_orders_id,
  o."bb_OrderNumber" AS bb_order_number,
  c."bb_Name" AS customer_name,
  p.fk_app_order_items_id,
  p.external_file_url
FROM app_purchase_orders_positions_special p
LEFT JOIN received r ON r.po_item_id = p.id
LEFT JOIN app_orders o ON o.id = p.fk_app_orders_id
LEFT JOIN app_customers c ON c.id = o.fk_app_customers_id;

-- Recreate export_wareneingang_mtl (using shipping_costs_proportional from shipment items)
CREATE OR REPLACE VIEW export_wareneingang_mtl AS
SELECT 
  isi.id AS inbound_item_id,
  isi.shipment_id,
  isi.order_id,
  isi.po_item_normal_id,
  isi.po_item_special_id,
  iship.delivered_at AS arrived_at,
  DATE(iship.delivered_at) AS arrival_date,
  to_char(iship.delivered_at, 'YYYY-MM') AS arrival_month,
  po.order_number,
  COALESCE(po.invoice_number, 'fehlt') AS invoice_number,
  po.invoice_date,
  po.supplier AS supplier_id,
  COALESCE(pn.id, ps.id) AS po_item_id,
  CASE 
    WHEN pn.id IS NOT NULL THEN 'normal'
    ELSE 'special'
  END AS po_item_type,
  COALESCE(pn.billbee_product_id, ps.billbee_product_id) AS billbee_product_id,
  prod.bb_sku,
  prod.inventory_cagtegory,
  isi.quantity_delivered,
  COALESCE(pn.qty_ordered, ps.qty_ordered) AS qty_ordered,
  COALESCE(pn.unit_price_net, ps.unit_price_net) AS unit_price_net,
  -- NEW: Use shipping_costs_proportional from shipment items
  isi.shipping_costs_proportional,
  (COALESCE(pn.unit_price_net, ps.unit_price_net, 0) * isi.quantity_delivered) AS amount_net_item,
  -- Shipping allocation is now directly on the shipment item
  COALESCE(isi.shipping_costs_proportional, 0) AS amount_shipping_allocated,
  ((COALESCE(pn.unit_price_net, ps.unit_price_net, 0) * isi.quantity_delivered) + 
   COALESCE(isi.shipping_costs_proportional, 0)) AS amount_total
FROM app_inbound_shipment_items isi
JOIN app_inbound_shipments iship ON iship.id = isi.shipment_id
JOIN app_purchase_orders po ON po.id = isi.order_id
LEFT JOIN app_purchase_orders_positions_normal pn ON pn.id = isi.po_item_normal_id
LEFT JOIN app_purchase_orders_positions_special ps ON ps.id = isi.po_item_special_id
LEFT JOIN app_products prod ON prod.id = COALESCE(pn.billbee_product_id, ps.billbee_product_id);

-- Recreate rpt_inbound_items_enriched (using shipping_costs_proportional from shipment items)
CREATE OR REPLACE VIEW rpt_inbound_items_enriched AS
WITH base AS (
  SELECT 
    i.id AS inbound_item_id,
    DATE_TRUNC('month', s.delivered_at)::date AS month,
    CASE 
      WHEN i.po_item_normal_id IS NOT NULL THEN 'Normal'
      WHEN i.po_item_special_id IS NOT NULL THEN 'Special'
      ELSE 'Unbekannt'
    END AS kind,
    i.quantity_delivered AS qty_delivered,
    COALESCE(n.unit_price_net, sps.unit_price_net) AS unit_price_net,
    -- NEW: Use shipping_costs_proportional directly from shipment items
    i.shipping_costs_proportional,
    COALESCE(sps.base_model_billbee_product_id, n.billbee_product_id, sps.billbee_product_id) AS category_product_id
  FROM app_inbound_shipment_items i
  JOIN app_inbound_shipments s ON s.id = i.shipment_id
  LEFT JOIN app_purchase_orders_positions_normal n ON n.id = i.po_item_normal_id
  LEFT JOIN app_purchase_orders_positions_special sps ON sps.id = i.po_item_special_id
  WHERE i.item_status IS DISTINCT FROM 'planned'
)
SELECT 
  b.inbound_item_id,
  b.month,
  p.bb_sku,
  p.fk_bb_supplier,
  COALESCE(p.inventory_cagtegory, 'Unbekannt') AS inventory_cagtegory,
  b.kind,
  b.qty_delivered,
  (b.qty_delivered * COALESCE(b.unit_price_net, 0))::numeric(14,2) AS cost_goods_net,
  -- Shipping cost is now directly allocated per shipment item
  COALESCE(b.shipping_costs_proportional, 0)::numeric(14,2) AS cost_shipping_alloc,
  ((b.qty_delivered * COALESCE(b.unit_price_net, 0)) + 
   COALESCE(b.shipping_costs_proportional, 0))::numeric(14,2) AS cost_total
FROM base b
LEFT JOIN app_products p ON p.id = b.category_product_id;

-- Recreate rpt_inbound_items_monthly (depends on rpt_inbound_items_enriched)
CREATE OR REPLACE VIEW rpt_inbound_items_monthly AS
SELECT 
  month,
  inventory_cagtegory,
  kind,
  SUM(qty_delivered)::numeric(12,3) AS qty_delivered_total,
  SUM(cost_goods_net)::numeric(14,2) AS cost_goods_net_total,
  SUM(cost_shipping_alloc)::numeric(14,2) AS cost_shipping_total,
  SUM(cost_total)::numeric(14,2) AS cost_total
FROM rpt_inbound_items_enriched
GROUP BY month, inventory_cagtegory, kind
ORDER BY month, inventory_cagtegory, kind;

-- Recreate rpt_po_deliveries_by_month_and_category (using shipping from shipment items)
CREATE OR REPLACE VIEW rpt_po_deliveries_by_month_and_category AS
WITH normalized AS (
  SELECT 
    DATE_TRUNC('month', s.delivered_at)::date AS delivery_month,
    s.delivered_at::date AS delivery_date,
    po.invoice_number,
    p.inventory_cagtegory,
    isi.quantity_delivered AS qty_delivered,
    COALESCE(n.unit_price_net, sp.unit_price_net, 0) AS unit_price_net,
    -- NEW: Use shipping_costs_proportional from shipment items
    COALESCE(isi.shipping_costs_proportional, 0) AS shipping_costs_proportional,
    po.supplier
  FROM app_inbound_shipment_items isi
  JOIN app_inbound_shipments s ON s.id = isi.shipment_id
  JOIN app_purchase_orders po ON po.id = isi.order_id
  LEFT JOIN app_purchase_orders_positions_normal n ON n.id = isi.po_item_normal_id
  LEFT JOIN app_purchase_orders_positions_special sp ON sp.id = isi.po_item_special_id
  JOIN app_products p ON p.id = COALESCE(n.billbee_product_id, sp.billbee_product_id)
)
SELECT 
  delivery_month,
  invoice_number,
  inventory_cagtegory,
  supplier,
  array_agg(DISTINCT delivery_date ORDER BY delivery_date) AS delivery_dates,
  SUM(qty_delivered * (unit_price_net + shipping_costs_proportional))::numeric(14,2) AS delivered_sum_net,
  SUM(qty_delivered)::numeric(14,3) AS delivered_qty
FROM normalized
GROUP BY delivery_month, invoice_number, inventory_cagtegory, supplier
ORDER BY delivery_month, invoice_number, inventory_cagtegory, supplier;

-- Step 4: Add documentation comment
COMMENT ON COLUMN app_inbound_shipment_items.shipping_costs_proportional IS 
'Proportional share of shipping costs (ANK/Anschaffungsnebenkosten) allocated to this specific shipment item. 
Calculated from app_inbound_shipments.shipping_cost_separate based on item value proportion.
This is the ONLY source of truth for ANK allocation. Position tables no longer have this field.';

-- Step 5: Recreate rpt_product_sales_with_bom (using shipping allocation from shipment items)
-- Note: This view aggregates costs via shipment items now instead of directly from positions
CREATE OR REPLACE VIEW rpt_product_sales_with_bom AS
WITH bom_unit_cost AS (
  SELECT 
    bom.id AS bom_product_id,
    SUM(br.quantity * COALESCE(comp.bb_net_purchase_price, 0)) AS unit_cost_bom
  FROM app_products bom
  JOIN bom_recipes br ON br.billbee_bom_id = bom.id
  JOIN app_products comp ON comp.id = br.billbee_component_id
  GROUP BY bom.id
),
direct_sales AS (
  SELECT 
    p.id AS product_id,
    p.bb_sku AS sku,
    p.inventory_cagtegory,
    p.production_required,
    COALESCE(oi."bb_Quantity"::integer, 0)::numeric AS qty_direct,
    COALESCE(oi."bb_TotalPrice", 0) AS revenue_gross,
    (COALESCE(oi."bb_TotalPrice", 0) - COALESCE(oi."bb_TaxAmount", 0)) AS revenue_net,
    0::numeric AS qty_via_bom,
    (COALESCE(oi."bb_Quantity"::integer, 0)::numeric * 
     COALESCE(
       CASE 
         WHEN COALESCE(p.bb_is_bom, false) = true THEN buc.unit_cost_bom
         ELSE p.bb_net_purchase_price
       END, 
       0
     )) AS materialkosten_direkt,
    0::numeric AS materialkosten_ueber_bom
  FROM app_order_items oi
  JOIN app_products p ON p.id = oi.fk_app_products_id
  JOIN app_orders o ON o.id = oi.fk_app_orders_id
  LEFT JOIN bom_unit_cost buc ON buc.bom_product_id = p.id
  WHERE COALESCE(oi."bb_IsCoupon", false) = false
    AND COALESCE(p.bb_is_active, false) = true
    AND COALESCE(p.inventory_cagtegory, '') <> 'variant_set'
    AND date_trunc('year', o.ordered_at) = date_trunc('year', now())
    AND COALESCE(p.bb_category1, '') <> 'Antike Ware'
    AND COALESCE(p.bb_category2, '') <> 'Antike Ware'
    AND COALESCE(p.bb_category3, '') <> 'Antike Ware'
),
bom_component_sales AS (
  SELECT 
    comp.id AS product_id,
    comp.bb_sku AS sku,
    comp.inventory_cagtegory,
    comp.production_required,
    0::numeric AS qty_direct,
    0::numeric AS revenue_gross,
    0::numeric AS revenue_net,
    (COALESCE(oi."bb_Quantity"::integer, 0)::numeric * br.quantity) AS qty_via_bom,
    0::numeric AS materialkosten_direkt,
    0::numeric AS materialkosten_ueber_bom
  FROM app_order_items oi
  JOIN app_products bom ON bom.id = oi.fk_app_products_id
  JOIN bom_recipes br ON br.billbee_bom_id = bom.id
  JOIN app_products comp ON comp.id = br.billbee_component_id
  JOIN app_orders o ON o.id = oi.fk_app_orders_id
  WHERE COALESCE(oi."bb_IsCoupon", false) = false
    AND COALESCE(bom.bb_is_bom, false) = true
    AND COALESCE(comp.bb_is_active, false) = true
    AND COALESCE(comp.inventory_cagtegory, '') <> 'variant_set'
    AND date_trunc('year', o.ordered_at) = date_trunc('year', now())
    AND COALESCE(comp.bb_category1, '') <> 'Antike Ware'
    AND COALESCE(comp.bb_category2, '') <> 'Antike Ware'
    AND COALESCE(comp.bb_category3, '') <> 'Antike Ware'
),
combined AS (
  SELECT * FROM direct_sales
  UNION ALL
  SELECT * FROM bom_component_sales
),
combined_agg AS (
  SELECT 
    c.product_id AS id,
    c.sku,
    c.inventory_cagtegory,
    c.production_required,
    SUM(c.qty_direct) AS verkauft_direkt,
    SUM(c.revenue_gross) AS umsatz_brutto,
    SUM(c.revenue_net) AS umsatz_netto,
    SUM(c.qty_via_bom) AS verkauft_ueber_bom,
    SUM(c.materialkosten_direkt) AS materialkosten_direkt,
    SUM(c.materialkosten_ueber_bom) AS materialkosten_ueber_bom
  FROM combined c
  GROUP BY c.product_id, c.sku, c.inventory_cagtegory, c.production_required
),
-- NEW: Aggregate special costs via shipment items instead of positions
-- This properly handles split deliveries and uses the correct ANK allocation
special_costs AS (
  SELECT 
    COALESCE(s.billbee_product_id, s_base.billbee_product_id) AS product_id,
    SUM(
      (isi.quantity_delivered * COALESCE(s.unit_price_net, 0)) + 
      COALESCE(isi.shipping_costs_proportional, 0)
    ) AS materialkosten_sonder
  FROM app_inbound_shipment_items isi
  JOIN app_purchase_orders_positions_special s ON s.id = isi.po_item_special_id
  LEFT JOIN app_purchase_orders_positions_special s_base ON s_base.id = isi.po_item_special_id
  LEFT JOIN app_orders o ON o.id = s.fk_app_orders_id
  LEFT JOIN app_products p ON p.id = COALESCE(s.billbee_product_id, s_base.billbee_product_id)
  WHERE o.ordered_at IS NOT NULL
    AND date_trunc('year', o.ordered_at) = date_trunc('year', now())
    AND COALESCE(p.bb_category1, '') <> 'Antike Ware'
    AND COALESCE(p.bb_category2, '') <> 'Antike Ware'
    AND COALESCE(p.bb_category3, '') <> 'Antike Ware'
  GROUP BY COALESCE(s.billbee_product_id, s_base.billbee_product_id)
)
SELECT 
  ca.id,
  ca.sku,
  ca.inventory_cagtegory,
  ca.production_required,
  ca.verkauft_direkt,
  ca.umsatz_brutto,
  ca.umsatz_netto,
  ca.verkauft_ueber_bom,
  ca.materialkosten_direkt,
  ca.materialkosten_ueber_bom,
  COALESCE(sc.materialkosten_sonder, 0) AS materialkosten_sonder,
  (ca.materialkosten_direkt + ca.materialkosten_ueber_bom + COALESCE(sc.materialkosten_sonder, 0)) AS materialkosten_gesamt,
  CASE 
    WHEN ca.umsatz_netto <> 0 THEN 
      (ca.materialkosten_direkt + ca.materialkosten_ueber_bom + COALESCE(sc.materialkosten_sonder, 0)) / ca.umsatz_netto
    ELSE NULL
  END AS materialkostenquote
FROM combined_agg ca
LEFT JOIN special_costs sc ON sc.product_id = ca.id;
