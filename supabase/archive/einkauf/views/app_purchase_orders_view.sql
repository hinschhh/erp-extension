create view public.app_purchase_orders_view as
with
  received as (
    select
      COALESCE(isi.po_item_normal_id, isi.po_item_special_id) as po_item_id,
      sum(isi.quantity_delivered) as qty_received
    from
      app_inbound_shipment_items isi
    group by
      (
        COALESCE(isi.po_item_normal_id, isi.po_item_special_id)
      )
  ),
  normal as (
    select
      p.order_id,
      sum(p.qty_ordered) as qty_ordered_total,
      sum(COALESCE(r.qty_received, 0::numeric)) as qty_received_total,
      sum(
        GREATEST(
          p.qty_ordered - COALESCE(r.qty_received, 0::numeric),
          0::numeric
        )
      ) as qty_open_total,
      count(*) as count_positions_normal,
      COALESCE(sum(p.unit_price_net * p.qty_ordered), 0::numeric) as amount_net_normal
    from
      app_purchase_orders_positions_normal p
      left join received r on r.po_item_id = p.id
    group by
      p.order_id
  ),
  special as (
    select
      p.order_id,
      sum(p.qty_ordered) as qty_ordered_total,
      sum(COALESCE(r.qty_received, 0::numeric)) as qty_received_total,
      sum(
        GREATEST(
          p.qty_ordered - COALESCE(r.qty_received, 0::numeric),
          0::numeric
        )
      ) as qty_open_total,
      count(*) as count_positions_special,
      count(*) filter (
        where
          p.sketch_needed = true
          and p.sketch_confirmed_at is null
      ) as count_sketch_pending,
      COALESCE(sum(p.unit_price_net * p.qty_ordered), 0::numeric) as amount_net_special
    from
      app_purchase_orders_positions_special p
      left join received r on r.po_item_id = p.id
    group by
      p.order_id
  ),
  search as (
    select
      po.id as order_id,
      lower(
        TRIM(
          both
          from
            concat_ws(
              ' '::text,
              COALESCE(po.order_number, ''::text),
              COALESCE(po.invoice_number, ''::text),
              COALESCE(po.supplier, ''::text),
              COALESCE(po.notes, ''::text),
              COALESCE(
                string_agg(distinct pn.internal_notes, ' '::text) filter (
                  where
                    pn.internal_notes is not null
                    and pn.internal_notes <> ''::text
                ),
                ''::text
              ),
              COALESCE(
                string_agg(distinct ps.internal_notes, ' '::text) filter (
                  where
                    ps.internal_notes is not null
                    and ps.internal_notes <> ''::text
                ),
                ''::text
              ),
              COALESCE(
                string_agg(distinct ps.supplier_sku, ' '::text) filter (
                  where
                    ps.supplier_sku is not null
                    and ps.supplier_sku <> ''::text
                ),
                ''::text
              ),
              COALESCE(
                string_agg(distinct ps.order_confirmation_ref, ' '::text) filter (
                  where
                    ps.order_confirmation_ref is not null
                    and ps.order_confirmation_ref <> ''::text
                ),
                ''::text
              )
            )
        )
      ) as search_blob
    from
      app_purchase_orders po
      left join app_purchase_orders_positions_normal pn on pn.order_id = po.id
      left join app_purchase_orders_positions_special ps on ps.order_id = po.id
    group by
      po.id,
      po.order_number,
      po.invoice_number,
      po.notes,
      po.supplier
  ),
  aggregated as (
    select
      po.id as order_id,
      po.order_number,
      po.status,
      po.supplier,
      po.shipping_cost_net,
      po.ordered_at,
      po.proforma_confirmed_at,
      po.dol_planned_at,
      po.dol_actual_at,
      po.invoice_number,
      po.invoice_date,
      po.separate_invoice_for_shipping_cost,
      po.notes,
      po.created_at,
      po.updated_at,
      COALESCE(n.qty_ordered_total, 0::numeric) + COALESCE(s.qty_ordered_total, 0::numeric) as qty_ordered_total,
      COALESCE(n.qty_received_total, 0::numeric) + COALESCE(s.qty_received_total, 0::numeric) as qty_received_total,
      COALESCE(n.qty_open_total, 0::numeric) + COALESCE(s.qty_open_total, 0::numeric) as qty_open_total,
      COALESCE(n.count_positions_normal, 0::bigint) as count_positions_normal,
      COALESCE(s.count_positions_special, 0::bigint) as count_positions_special,
      COALESCE(s.count_sketch_pending, 0::bigint) as count_sketch_pending,
      COALESCE(n.amount_net_normal, 0::numeric) + COALESCE(s.amount_net_special, 0::numeric) as total_amount_net,
      se.search_blob
    from
      app_purchase_orders po
      left join normal n on n.order_id = po.id
      left join special s on s.order_id = po.id
      left join search se on se.order_id = po.id
  )
select
  aggregated.order_id,
  aggregated.order_number,
  aggregated.status,
  aggregated.supplier,
  aggregated.shipping_cost_net,
  aggregated.ordered_at,
  aggregated.proforma_confirmed_at,
  aggregated.dol_planned_at,
  aggregated.dol_actual_at,
  aggregated.invoice_number,
  aggregated.invoice_date,
  aggregated.separate_invoice_for_shipping_cost,
  aggregated.notes,
  aggregated.created_at,
  aggregated.updated_at,
  aggregated.qty_ordered_total,
  aggregated.qty_received_total,
  aggregated.qty_open_total,
  aggregated.count_positions_normal,
  aggregated.count_positions_special,
  aggregated.count_sketch_pending,
  aggregated.total_amount_net,
  aggregated.search_blob
from
  aggregated;