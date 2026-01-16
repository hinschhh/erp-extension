-- Migration: Add order item details to purchase order position views
-- Date: 2026-01-09
-- Description: Extends both normal and special position views to include order item SKU and name
--              for better display of references in the UI

-- Drop and recreate special view with order item details
DROP VIEW IF EXISTS app_purchase_orders_positions_special_view;

CREATE VIEW public.app_purchase_orders_positions_special_view AS
WITH received AS (
  SELECT
    isi.po_item_special_id AS po_item_id,
    sum(isi.quantity_delivered) AS qty_received
  FROM
    app_inbound_shipment_items isi
  WHERE
    isi.po_item_special_id IS NOT NULL
  GROUP BY
    isi.po_item_special_id
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
  COALESCE(r.qty_received, 0::numeric)::numeric(12, 3) AS qty_received,
  GREATEST(
    p.qty_ordered - COALESCE(r.qty_received, 0::numeric),
    0::numeric
  )::numeric(12, 3) AS qty_open,
  p.po_item_status,
  p.shipping_costs_proportional,
  p.internal_notes,
  p.sketch_needed,
  p.sketch_confirmed_at,
  p.proforma_confirmed_at,
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
  oi_prod.bb_sku AS order_item_sku,
  oi_prod.bb_name AS order_item_name
FROM
  app_purchase_orders_positions_special p
  LEFT JOIN received r ON r.po_item_id = p.id
  LEFT JOIN app_orders o ON o.id = p.fk_app_orders_id
  LEFT JOIN app_customers c ON c.id = o.fk_app_customers_id
  LEFT JOIN app_order_items oi ON oi.id = p.fk_app_order_items_id
  LEFT JOIN app_products oi_prod ON oi_prod.id = oi.fk_app_products_id;

-- Recreate the INSTEAD OF UPDATE trigger on the special view
CREATE TRIGGER trg_app_purchase_orders_positions_special_view_update
INSTEAD OF UPDATE ON app_purchase_orders_positions_special_view
FOR EACH ROW
EXECUTE FUNCTION trgfn_app_purchase_orders_positions_special_view_update();

-- Drop and recreate normal view with order item details
DROP VIEW IF EXISTS app_purchase_orders_positions_normal_view;

CREATE VIEW public.app_purchase_orders_positions_normal_view AS
WITH received AS (
  SELECT
    isi.po_item_normal_id AS po_item_id,
    sum(isi.quantity_delivered) AS qty_received
  FROM
    app_inbound_shipment_items isi
  WHERE
    isi.po_item_normal_id IS NOT NULL
  GROUP BY
    isi.po_item_normal_id
)
SELECT
  p.id,
  p.order_id,
  p.billbee_product_id,
  p.qty_ordered,
  p.unit_price_net,
  COALESCE(r.qty_received, 0::numeric)::numeric(12, 3) AS qty_received,
  GREATEST(
    p.qty_ordered - COALESCE(r.qty_received, 0::numeric),
    0::numeric
  )::numeric(12, 3) AS qty_open,
  p.po_item_status,
  p.shipping_costs_proportional,
  p.internal_notes,
  p.proforma_confirmed_at,
  p.dol_planned_at,
  p.dol_actual_at,
  p.goods_received_at,
  p.created_at,
  p.updated_at,
  p.fk_app_orders_id,
  o."bb_OrderNumber" AS bb_order_number,
  c."bb_Name" AS customer_name,
  oi_prod.bb_sku AS order_item_sku,
  oi_prod.bb_name AS order_item_name
FROM
  app_purchase_orders_positions_normal p
  LEFT JOIN received r ON r.po_item_id = p.id
  LEFT JOIN app_orders o ON o.id = p.fk_app_orders_id
  LEFT JOIN app_customers c ON c.id = o.fk_app_customers_id
  LEFT JOIN app_order_items oi ON oi.id = p.fk_app_orders_id
  LEFT JOIN app_products oi_prod ON oi_prod.id = oi.fk_app_products_id;

-- Recreate the INSTEAD OF UPDATE trigger on the normal view
CREATE TRIGGER trg_app_purchase_orders_positions_normal_view_update
INSTEAD OF UPDATE ON app_purchase_orders_positions_normal_view
FOR EACH ROW
EXECUTE FUNCTION trgfn_app_purchase_orders_positions_normal_view_update();
