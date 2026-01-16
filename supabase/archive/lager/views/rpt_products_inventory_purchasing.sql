create view public.rpt_products_inventory_purchasing as
with
  reserved_bom_by_component as (
    select
      r.billbee_component_id,
      sum(c_1.committed_qty::numeric * r.quantity) as reserved_bom
    from
      bom_recipes r
      join stg_billbee_stock_committed c_1 on c_1.billbee_product_id = r.billbee_bom_id
    group by
      r.billbee_component_id
  ),
  po_agg as (
    select
      p.billbee_product_id,
      sum(p.qty_ordered) as qty_on_order
    from
      app_purchase_orders_positions_normal p
    group by
      p.billbee_product_id
  )
select
  ap.id as product_id,
  ap.bb_sku as sku,
  ap.bb_name as name,
  case
    when ap.bb_category1 = any (
      array[
        'Armatur'::text,
        'Elektrogeräte'::text,
        'Küche'::text,
        'Naturstein'::text,
        'Schrank'::text,
        'Spiegel'::text,
        'TV'::text,
        'TV-Zubehör'::text,
        'WB'::text,
        'Wohnmöbel'::text,
        'WT'::text,
        'Zubehör'::text
      ]
    ) then ap.bb_category1
    when ap.bb_category2 = any (
      array[
        'Armatur'::text,
        'Elektrogeräte'::text,
        'Küche'::text,
        'Naturstein'::text,
        'Schrank'::text,
        'Spiegel'::text,
        'TV'::text,
        'TV-Zubehör'::text,
        'WB'::text,
        'Wohnmöbel'::text,
        'WT'::text,
        'Zubehör'::text
      ]
    ) then ap.bb_category2
    when ap.bb_category3 = any (
      array[
        'Armatur'::text,
        'Elektrogeräte'::text,
        'Küche'::text,
        'Naturstein'::text,
        'Schrank'::text,
        'Spiegel'::text,
        'TV'::text,
        'TV-Zubehör'::text,
        'WB'::text,
        'Wohnmöbel'::text,
        'WT'::text,
        'Zubehör'::text
      ]
    ) then ap.bb_category3
    else null::text
  end as bb_category,
  ap.inventory_cagtegory,
  ap.fk_bb_supplier as supplier,
  COALESCE(ap.bb_category1, ''::text) ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::text
  or COALESCE(ap.bb_category2, ''::text) ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::text
  or COALESCE(ap.bb_category3, ''::text) ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::text as on_demand,
  COALESCE(s.stock_available, 0) as stock_free,
  COALESCE(c.committed_qty, 0) as stock_reserved_direct,
  COALESCE(rb.reserved_bom, 0::numeric) as stock_reserved_bom,
  COALESCE(s.stock_unavailable, 0) as stock_unavailable,
  COALESCE(s.stock_available, 0)::numeric + COALESCE(c.committed_qty, 0)::numeric + COALESCE(rb.reserved_bom, 0::numeric) + COALESCE(s.stock_unavailable, 0)::numeric as stock_physical,
  COALESCE(po.qty_on_order, 0::numeric) as stock_on_order,
  COALESCE(ap.bb_net_purchase_price, 0::numeric) as unit_cost_net,
  (
    (
      COALESCE(s.stock_available, 0)::numeric + COALESCE(c.committed_qty, 0)::numeric + COALESCE(rb.reserved_bom, 0::numeric) + COALESCE(s.stock_unavailable, 0)::numeric
    ) * COALESCE(ap.bb_net_purchase_price, 0::numeric)
  )::numeric(18, 2) as inventory_value,
  0::numeric as counted_qty,
  null::timestamp with time zone as counted_at,
  cs3.qty_sold_last_3_months::integer as consumption_3m_rolling,
  GREATEST(
    COALESCE(
      s.pulled_at,
      (
        '1970-01-01 00:00:00'::timestamp without time zone AT TIME ZONE 'UTC'::text
      )
    ),
    COALESCE(
      c.pulled_at,
      (
        '1970-01-01 00:00:00'::timestamp without time zone AT TIME ZONE 'UTC'::text
      )
    )
  ) as updated_at
from
  app_products ap
  left join stg_billbee_stock s on s.billbee_product_id = ap.id
  left join stg_billbee_stock_committed c on c.billbee_product_id = ap.id
  left join reserved_bom_by_component rb on rb.billbee_component_id = ap.id
  left join po_agg po on po.billbee_product_id = ap.id
  left join app_component_sales_last_3_months cs3 on cs3.fk_app_products_id = ap.id
where
  COALESCE(ap.bb_is_bom, false) = false
  and COALESCE(ap.bb_is_active, true) = true
  and not (
    COALESCE(ap.bb_category1, ''::text) ~~* '%Antike Ware%'::text
    or COALESCE(ap.bb_category2, ''::text) ~~* '%Antike Ware%'::text
    or COALESCE(ap.bb_category3, ''::text) ~~* '%Antike Ware%'::text
  );