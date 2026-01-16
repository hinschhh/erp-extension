create view public.app_order_items_active_with_attributes_and_products_view as
select
  oi.id,
  oi.fk_app_orders_id,
  oi.fk_app_products_id,
  oi."bb_Quantity" as qty_ordered,
  oi.created_at,
  p.bb_sku,
  p.bb_name,
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
  ) as attributes
from
  app_order_items oi
  join app_orders o on oi.fk_app_orders_id = o.id
  left join app_products p on oi.fk_app_products_id = p.id
  left join app_order_item_attributes oia on oi.id = oia.fk_app_order_items_id
where
  o."bb_State" = any (array[1, 2, 3, 16])
group by
  oi.id,
  oi.fk_app_orders_id,
  oi.fk_app_products_id,
  oi."bb_Quantity",
  oi.created_at,
  p.bb_sku,
  p.bb_name;