create view public.view_orders as
select
  o.id as order_id,
  o."bb_OrderNumber" as order_number,
  o."bb_State" as order_state,
  o.ordered_at,
  o."bb_PayedAt",
  o."bb_InvoiceDate",
  o."bb_BillbeeShopName" as shop_name,
  o."bb_Platform" as platform,
  c."bb_InvoiceAddress_CountryISO2" as customer_country,
  sum(COALESCE(oi."bb_TotalPrice", 0::numeric)) as total_amount,
  sum(COALESCE(oi."bb_Quantity"::integer, 0)) as total_quantity,
  bool_or(p.bb_name ~~* '%Sonder%'::text) as has_special_item,
  bool_or(
    p.production_required = 'Produktion erforderlich'::text
  ) as has_production_required_item,
  array_agg(distinct oi."bb_ShippingProfileId") as shipping_profiles,
  case
    when o."bb_InvoiceDate" is not null
    and o.ordered_at is not null then o."bb_InvoiceDate"::timestamp with time zone - o.ordered_at
    else null::interval
  end as lead_time
from
  app_orders o
  left join app_order_items oi on oi.fk_app_orders_id = o.id
  left join app_products p on oi.fk_app_products_id = p.id
  left join app_customers c on c.id = o.fk_app_customers_id
group by
  o.id,
  o."bb_OrderNumber",
  o."bb_State",
  o."bb_BillbeeShopName",
  o."bb_Platform",
  c."bb_InvoiceAddress_CountryISO2";