create view public.rpt_inbound_items_enriched as
with
  base as (
    select
      i.id as inbound_item_id,
      date_trunc('month'::text, s.arrived_at)::date as month,
      case
        when i.po_item_normal_id is not null then 'Normal'::text
        when i.po_item_special_id is not null then 'Special'::text
        else 'Unbekannt'::text
      end as kind,
      i.quantity_delivered as qty_delivered,
      COALESCE(n.unit_price_net, sps.unit_price_net) as unit_price_net,
      COALESCE(n.qty_ordered, sps.qty_ordered) as qty_ordered,
      COALESCE(
        n.shipping_costs_proportional,
        sps.shipping_costs_proportional
      ) as shipping_costs_total_for_position,
      COALESCE(
        sps.base_model_billbee_product_id,
        n.billbee_product_id,
        sps.billbee_product_id
      ) as category_product_id
    from
      app_inbound_shipment_items i
      join app_inbound_shipments s on s.id = i.shipment_id
      left join app_purchase_orders_positions_normal n on n.id = i.po_item_normal_id
      left join app_purchase_orders_positions_special sps on sps.id = i.po_item_special_id
    where
      i.item_status is distinct from 'planned'::is_status
  )
select
  b.inbound_item_id,
  b.month,
  p.bb_sku,
  p.fk_bb_supplier,
  COALESCE(p.inventory_cagtegory, 'Unbekannt'::text) as inventory_cagtegory,
  b.kind,
  b.qty_delivered,
  (
    b.qty_delivered * COALESCE(b.unit_price_net, 0::numeric)
  )::numeric(14, 2) as cost_goods_net,
  (
    b.qty_delivered * case
      when COALESCE(b.qty_ordered, 0::numeric) > 0::numeric then COALESCE(b.shipping_costs_total_for_position, 0::numeric) / b.qty_ordered
      else 0::numeric
    end
  )::numeric(14, 2) as cost_shipping_alloc,
  (
    b.qty_delivered * COALESCE(b.unit_price_net, 0::numeric) + b.qty_delivered * case
      when COALESCE(b.qty_ordered, 0::numeric) > 0::numeric then COALESCE(b.shipping_costs_total_for_position, 0::numeric) / b.qty_ordered
      else 0::numeric
    end
  )::numeric(14, 2) as cost_total
from
  base b
  left join app_products p on p.id = b.category_product_id;