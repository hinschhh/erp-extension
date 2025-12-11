create view public.app_purchase_orders_positions_special_view as
with
  received as (
    select
      isi.po_item_special_id as po_item_id,
      sum(isi.quantity_delivered) as qty_received
    from
      app_inbound_shipment_items isi
    where
      isi.po_item_special_id is not null
    group by
      isi.po_item_special_id
  )
select
  p.id,
  p.order_id,
  p.billbee_product_id,
  p.base_model_billbee_product_id,
  p.supplier_sku,
  p.details_override,
  p.qty_ordered,
  p.unit_price_net,
  COALESCE(r.qty_received, 0::numeric)::numeric(12, 3) as qty_received,
  GREATEST(
    p.qty_ordered - COALESCE(r.qty_received, 0::numeric),
    0::numeric
  )::numeric(12, 3) as qty_open,
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
  o."bb_OrderNumber" as bb_order_number,
  c."bb_Name" as customer_name,
  p.fk_app_order_items_id
from
  app_purchase_orders_positions_special p
  left join received r on r.po_item_id = p.id
  left join app_orders o on o.id = p.fk_app_orders_id
  left join app_customers c on c.id = o.fk_app_customers_id;