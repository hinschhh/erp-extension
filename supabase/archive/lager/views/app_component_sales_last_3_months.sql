create view public.app_component_sales_last_3_months as
with
  order_items_3m as (
    select
      oi.id,
      oi.fk_app_orders_id,
      oi.fk_app_products_id,
      oi."bb_Quantity",
      o.created_at
    from
      app_order_items oi
      join app_orders o on o.id = oi.fk_app_orders_id
    where
      o.ordered_at >= (now() - '3 mons'::interval)
      and COALESCE(oi."bb_IsCoupon", false) = false
  ),
  direct_component_sales as (
    select
      oi.fk_app_products_id as component_id,
      sum(COALESCE(oi."bb_Quantity"::integer, 0)) as qty_component_sold
    from
      order_items_3m oi
      left join bom_recipes br on br.billbee_bom_id = oi.fk_app_products_id
    where
      br.billbee_bom_id is null
      and oi.fk_app_products_id is not null
    group by
      oi.fk_app_products_id
  ),
  bom_component_sales as (
    select
      br.billbee_component_id as component_id,
      sum(
        COALESCE(oi."bb_Quantity"::integer, 0)::numeric * br.quantity
      ) as qty_component_sold
    from
      order_items_3m oi
      join bom_recipes br on br.billbee_bom_id = oi.fk_app_products_id
    group by
      br.billbee_component_id
  ),
  all_component_sales as (
    select
      direct_component_sales.component_id,
      direct_component_sales.qty_component_sold
    from
      direct_component_sales
    union all
    select
      bom_component_sales.component_id,
      bom_component_sales.qty_component_sold
    from
      bom_component_sales
  )
select
  cs.component_id as fk_app_products_id,
  sum(cs.qty_component_sold) as qty_sold_last_3_months
from
  all_component_sales cs
group by
  cs.component_id;