create view public.view_order_items_active_with_attributes_and_products_view as
with
  base as (
    select
      oi.id,
      oi.fk_app_orders_id,
      oi.fk_app_products_id,
      oi."bb_Quantity" as qty_ordered,
      oi.created_at,
      p.bb_sku,
      p.bb_name,
      o."bb_State",
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'bb_Name',
            oia."bb_Name",
            'bb_Value',
            oia."bb_Value"
          )
          order by
            oia."bb_Name"
        ) filter (
          where
            oia."bb_Name" is not null
        ),
        '[]'::jsonb
      ) as attributes_raw
    from
      app_order_items oi
      join app_orders o on oi.fk_app_orders_id = o.id
      left join app_products p on oi.fk_app_products_id = p.id
      left join app_order_item_attributes oia on oi.id = oia.fk_app_order_items_id
    group by
      oi.id,
      oi.fk_app_orders_id,
      oi.fk_app_products_id,
      oi."bb_Quantity",
      oi.created_at,
      p.bb_sku,
      p.bb_name,
      o."bb_State"
  )
select
  base.id,
  base.fk_app_orders_id,
  base.fk_app_products_id,
  base.qty_ordered,
  base.created_at,
  base.bb_sku,
  base.bb_name,
  base.attributes_raw as attributes,
  base.bb_name ~~* '%sonder%'::text
  or base.bb_sku ~~* '%sonder%'::text
  or base.attributes_raw::text ~~* '%sonder%'::text as is_sonder_item
from
  base
where
  base."bb_State" = any (array[1, 2, 3, 16]);