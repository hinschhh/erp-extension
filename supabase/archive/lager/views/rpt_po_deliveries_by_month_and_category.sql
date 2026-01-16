create view public.rpt_po_deliveries_by_month_and_category as
with
  normalized as (
    select
      date_trunc('month'::text, s.arrived_at)::date as delivery_month,
      s.arrived_at::date as delivery_date,
      po.invoice_number,
      p.inventory_cagtegory,
      isi.quantity_delivered as qty_delivered,
      COALESCE(n.unit_price_net, 0::numeric) as unit_price_net,
      COALESCE(n.shipping_costs_proportional, 0::numeric) as shipping_costs_proportional_n,
      COALESCE(sp.unit_price_net, 0::numeric) as unit_price_net_sp,
      COALESCE(sp.shipping_costs_proportional, 0::numeric) as shipping_costs_proportional_sp,
      po.supplier
    from
      app_inbound_shipment_items isi
      join app_inbound_shipments s on s.id = isi.shipment_id
      join app_purchase_orders po on po.id = isi.order_id
      left join app_purchase_orders_positions_normal n on n.id = isi.po_item_normal_id
      left join app_purchase_orders_positions_special sp on sp.id = isi.po_item_special_id
      join app_products p on p.id = COALESCE(n.billbee_product_id, sp.billbee_product_id)
  )
select
  normalized.delivery_month,
  normalized.invoice_number,
  normalized.inventory_cagtegory,
  normalized.supplier,
  array_agg(
    distinct normalized.delivery_date
    order by
      normalized.delivery_date
  ) as delivery_dates,
  sum(
    normalized.qty_delivered * (
      COALESCE(normalized.unit_price_net, 0::numeric) + COALESCE(
        normalized.shipping_costs_proportional_n,
        0::numeric
      ) + COALESCE(normalized.unit_price_net_sp, 0::numeric) + COALESCE(
        normalized.shipping_costs_proportional_sp,
        0::numeric
      )
    )
  )::numeric(14, 2) as delivered_sum_net,
  sum(normalized.qty_delivered)::numeric(14, 3) as delivered_qty
from
  normalized
group by
  normalized.delivery_month,
  normalized.invoice_number,
  normalized.inventory_cagtegory,
  normalized.supplier
order by
  normalized.delivery_month,
  normalized.invoice_number,
  normalized.inventory_cagtegory,
  normalized.supplier;