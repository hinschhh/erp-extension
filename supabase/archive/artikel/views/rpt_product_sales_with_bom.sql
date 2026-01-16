create view public.rpt_product_sales_with_bom as
with
  bom_unit_cost as (
    select
      bom.id as bom_product_id,
      sum(
        br.quantity * COALESCE(comp.bb_net_purchase_price, 0::numeric)
      ) as unit_cost_bom
    from
      app_products bom
      join bom_recipes br on br.billbee_bom_id = bom.id
      join app_products comp on comp.id = br.billbee_component_id
    group by
      bom.id
  ),
  direct_sales as (
    select
      p.id as product_id,
      p.bb_sku as sku,
      p.inventory_cagtegory,
      p.production_required,
      COALESCE(oi."bb_Quantity"::integer, 0)::numeric as qty_direct,
      COALESCE(oi."bb_TotalPrice", 0::numeric) as revenue_gross,
      COALESCE(oi."bb_TotalPrice", 0::numeric) - COALESCE(oi."bb_TaxAmount", 0::numeric) as revenue_net,
      0::numeric as qty_via_bom,
      COALESCE(oi."bb_Quantity"::integer, 0)::numeric * COALESCE(
        case
          when COALESCE(p.bb_is_bom, false) = true then buc.unit_cost_bom
          else p.bb_net_purchase_price
        end,
        0::numeric
      ) as materialkosten_direkt,
      0::numeric as materialkosten_ueber_bom
    from
      app_order_items oi
      join app_products p on p.id = oi.fk_app_products_id
      join app_orders o on o.id = oi.fk_app_orders_id
      left join bom_unit_cost buc on buc.bom_product_id = p.id
    where
      COALESCE(oi."bb_IsCoupon", false) = false
      and COALESCE(p.bb_is_active, false) = true
      and COALESCE(p.inventory_cagtegory, ''::text) <> 'variant_set'::text
      and date_trunc('year'::text, o.ordered_at) = date_trunc('year'::text, now())
      and COALESCE(p.bb_category1, ''::text) <> 'Antike Ware'::text
      and COALESCE(p.bb_category2, ''::text) <> 'Antike Ware'::text
      and COALESCE(p.bb_category3, ''::text) <> 'Antike Ware'::text
  ),
  bom_component_sales as (
    select
      comp.id as product_id,
      comp.bb_sku as sku,
      comp.inventory_cagtegory,
      comp.production_required,
      0::numeric as qty_direct,
      0::numeric as revenue_gross,
      0::numeric as revenue_net,
      COALESCE(oi."bb_Quantity"::integer, 0)::numeric * br.quantity as qty_via_bom,
      0::numeric as materialkosten_direkt,
      0::numeric as materialkosten_ueber_bom
    from
      app_order_items oi
      join app_products bom on bom.id = oi.fk_app_products_id
      join bom_recipes br on br.billbee_bom_id = bom.id
      join app_products comp on comp.id = br.billbee_component_id
      join app_orders o on o.id = oi.fk_app_orders_id
    where
      COALESCE(oi."bb_IsCoupon", false) = false
      and COALESCE(bom.bb_is_bom, false) = true
      and COALESCE(comp.bb_is_active, false) = true
      and COALESCE(comp.inventory_cagtegory, ''::text) <> 'variant_set'::text
      and date_trunc('year'::text, o.ordered_at) = date_trunc('year'::text, now())
      and COALESCE(comp.bb_category1, ''::text) <> 'Antike Ware'::text
      and COALESCE(comp.bb_category2, ''::text) <> 'Antike Ware'::text
      and COALESCE(comp.bb_category3, ''::text) <> 'Antike Ware'::text
  ),
  combined as (
    select
      direct_sales.product_id,
      direct_sales.sku,
      direct_sales.inventory_cagtegory,
      direct_sales.production_required,
      direct_sales.qty_direct,
      direct_sales.revenue_gross,
      direct_sales.revenue_net,
      direct_sales.qty_via_bom,
      direct_sales.materialkosten_direkt,
      direct_sales.materialkosten_ueber_bom
    from
      direct_sales
    union all
    select
      bom_component_sales.product_id,
      bom_component_sales.sku,
      bom_component_sales.inventory_cagtegory,
      bom_component_sales.production_required,
      bom_component_sales.qty_direct,
      bom_component_sales.revenue_gross,
      bom_component_sales.revenue_net,
      bom_component_sales.qty_via_bom,
      bom_component_sales.materialkosten_direkt,
      bom_component_sales.materialkosten_ueber_bom
    from
      bom_component_sales
  ),
  combined_agg as (
    select
      c.product_id as id,
      c.sku,
      c.inventory_cagtegory,
      c.production_required,
      sum(c.qty_direct) as verkauft_direkt,
      sum(c.revenue_gross) as umsatz_brutto,
      sum(c.revenue_net) as umsatz_netto,
      sum(c.qty_via_bom) as verkauft_ueber_bom,
      sum(c.materialkosten_direkt) as materialkosten_direkt,
      sum(c.materialkosten_ueber_bom) as materialkosten_ueber_bom
    from
      combined c
    group by
      c.product_id,
      c.sku,
      c.inventory_cagtegory,
      c.production_required
  ),
  special_costs as (
    select
      s.billbee_product_id as product_id,
      sum(
        s.qty_ordered::numeric * COALESCE(s.unit_price_net, 0::numeric) + COALESCE(s.shipping_costs_proportional, 0::numeric)
      ) as materialkosten_sonder
    from
      app_purchase_orders_positions_special s
      left join app_orders o on o.id = s.fk_app_orders_id
      left join app_products p on p.id = s.billbee_product_id
    where
      o.ordered_at is not null
      and date_trunc('year'::text, o.ordered_at) = date_trunc('year'::text, now())
      and COALESCE(p.bb_category1, ''::text) <> 'Antike Ware'::text
      and COALESCE(p.bb_category2, ''::text) <> 'Antike Ware'::text
      and COALESCE(p.bb_category3, ''::text) <> 'Antike Ware'::text
    group by
      s.billbee_product_id
  )
select
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
  COALESCE(sc.materialkosten_sonder, 0::numeric) as materialkosten_sonder,
  ca.materialkosten_direkt + ca.materialkosten_ueber_bom + COALESCE(sc.materialkosten_sonder, 0::numeric) as materialkosten_gesamt,
  case
    when ca.umsatz_netto <> 0::numeric then (
      ca.materialkosten_direkt + ca.materialkosten_ueber_bom + COALESCE(sc.materialkosten_sonder, 0::numeric)
    ) / ca.umsatz_netto
    else null::numeric
  end as materialkostenquote
from
  combined_agg ca
  left join special_costs sc on sc.product_id = ca.id;