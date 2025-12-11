create view public.export_wareneingang_mtl as
select
  isi.id as inbound_item_id,
  isi.shipment_id,
  isi.order_id,
  isi.po_item_normal_id,
  isi.po_item_special_id,
  iship.arrived_at,
  date (iship.arrived_at) as arrival_date,
  to_char(iship.arrived_at, 'YYYY-MM'::text) as arrival_month,
  po.order_number,
  COALESCE(po.invoice_number, 'fehlt'::text) as invoice_number,
  po.invoice_date,
  po.supplier as supplier_id,
  COALESCE(pn.id, ps.id) as po_item_id,
  case
    when pn.id is not null then 'normal'::text
    else 'special'::text
  end as po_item_type,
  COALESCE(pn.billbee_product_id, ps.billbee_product_id) as billbee_product_id,
  prod.bb_sku,
  prod.inventory_cagtegory,
  isi.quantity_delivered,
  COALESCE(pn.qty_ordered, ps.qty_ordered) as qty_ordered,
  COALESCE(pn.unit_price_net, ps.unit_price_net) as unit_price_net,
  COALESCE(
    pn.shipping_costs_proportional,
    ps.shipping_costs_proportional
  ) as shipping_costs_proportional,
  COALESCE(pn.unit_price_net, ps.unit_price_net, 0::numeric) * isi.quantity_delivered as amount_net_item,
  case
    when COALESCE(pn.qty_ordered, ps.qty_ordered, 0::numeric) > 0::numeric then COALESCE(
      pn.shipping_costs_proportional,
      ps.shipping_costs_proportional,
      0::numeric
    ) * (
      isi.quantity_delivered / COALESCE(pn.qty_ordered, ps.qty_ordered)
    )
    else 0::numeric
  end as amount_shipping_allocated,
  COALESCE(pn.unit_price_net, ps.unit_price_net, 0::numeric) * isi.quantity_delivered + case
    when COALESCE(pn.qty_ordered, ps.qty_ordered, 0::numeric) > 0::numeric then COALESCE(
      pn.shipping_costs_proportional,
      ps.shipping_costs_proportional,
      0::numeric
    ) * (
      isi.quantity_delivered / COALESCE(pn.qty_ordered, ps.qty_ordered)
    )
    else 0::numeric
  end as amount_total
from
  app_inbound_shipment_items isi
  join app_inbound_shipments iship on iship.id = isi.shipment_id
  join app_purchase_orders po on po.id = isi.order_id
  left join app_purchase_orders_positions_normal pn on pn.id = isi.po_item_normal_id
  left join app_purchase_orders_positions_special ps on ps.id = isi.po_item_special_id
  left join app_products prod on prod.id = COALESCE(pn.billbee_product_id, ps.billbee_product_id);