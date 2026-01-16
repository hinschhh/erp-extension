create view public.app_orders_with_customers_view as
select
  o.id,
  o.created_at,
  o."bb_OrderNumber",
  o."bb_CreatedAt",
  o."bb_State",
  o."bb_VatMode",
  o."bb_InvoiceNumber",
  o."bb_InvoiceDate",
  o.fk_app_customers_id,
  c."bb_Name" as customer_name,
  (
    COALESCE(o."bb_import_ab-nummer", ''::text) || ' '::text
  ) || COALESCE(c."bb_Name", ''::text) as search_blob,
  o."bb_import_ab-nummer",
  COALESCE(
    (
      select
        count(*) as count
      from
        view_order_items_active_with_attributes_and_products_view voi
      where
        voi.fk_app_orders_id = o.id
        and voi.is_sonder_item = true
    ),
    0::bigint
  ) as sonder_item_count
from
  app_orders o
  left join app_customers c on c.id = o.fk_app_customers_id;