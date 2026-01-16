create view public.view_products_antique as
with
  product_sales as (
    select
      p.id,
      p.bb_sku,
      p.room,
      p.product_type,
      p.production_required,
      p.bb_net_purchase_price,
      p."bb_Net",
      p."bb_Price",
      p.bb_is_bom,
      p.is_variant_set,
      p.is_antique,
      COALESCE(sum(oi_filtered."bb_TotalPrice"), 0::numeric) as revenue_last_12_months,
      COALESCE(
        sum(oi_filtered."bb_Quantity"::numeric),
        0::numeric
      ) as sales_last_12_months
    from
      app_products p
      left join lateral (
        select
          oi.id,
          oi.created_at,
          oi.fk_app_orders_id,
          oi.fk_app_products_id,
          oi."bb_TransactionId",
          oi."bb_Quantity",
          oi."bb_TotalPrice",
          oi."bb_TaxAmount",
          oi."bb_TaxIndex",
          oi."bb_Dicount",
          oi."bb_GetPriceFromArticleIfAny",
          oi."bb_IsCoupon",
          oi."bb_ShippingProfileId",
          oi."bb_DontAdjustStock",
          oi."bb_UnrebatedTotalPrice",
          oi."bb_SerialNumber",
          oi."bb_InvoiceSKU",
          oi."bb_StockId",
          o.id,
          o.created_at,
          o."bb_OrderNumber",
          o."bb_State",
          o."bb_VatMode",
          o."bb_CreatedAt",
          o.offered_at,
          o."bb_ConfirmedAt",
          o."bb_ShippedAt",
          o."bb_PayedAt",
          o."bb_SellerComment",
          o."bb_InvoiceNumberPrefix",
          o."bb_InvoiceNumber",
          o."bb_InvoiceDate",
          o."bb_Currency",
          o."bb_LastModifiedAt",
          o."bb_WebUrl",
          o.fk_app_customers_id,
          o."bb_import_ab-nummer",
          o."bb_Platform",
          o."bb_BillbeeShopName",
          o.ordered_at,
          o.confirmed_at
        from
          app_order_items oi
          join app_orders o on o.id = oi.fk_app_orders_id
        where
          oi.fk_app_products_id = p.id
          and o.ordered_at >= (now() - '1 year'::interval)
      ) oi_filtered (
        id,
        ordered_at,
        fk_app_orders_id,
        fk_app_products_id,
        "bb_TransactionId",
        "bb_Quantity",
        "bb_TotalPrice",
        "bb_TaxAmount",
        "bb_TaxIndex",
        "bb_Dicount",
        "bb_GetPriceFromArticleIfAny",
        "bb_IsCoupon",
        "bb_ShippingProfileId",
        "bb_DontAdjustStock",
        "bb_UnrebatedTotalPrice",
        "bb_SerialNumber",
        "bb_InvoiceSKU",
        "bb_StockId",
        id_1,
        created_at_1,
        "bb_OrderNumber",
        "bb_State",
        "bb_VatMode",
        "bb_CreatedAt",
        offered_at,
        "bb_ConfirmedAt",
        "bb_ShippedAt",
        "bb_PayedAt",
        "bb_SellerComment",
        "bb_InvoiceNumberPrefix",
        "bb_InvoiceNumber",
        "bb_InvoiceDate",
        "bb_Currency",
        "bb_LastModifiedAt",
        "bb_WebUrl",
        fk_app_customers_id,
        "bb_import_ab-nummer",
        "bb_Platform",
        "bb_BillbeeShopName",
        ordered_at_1,
        confirmed_at
      ) on true
    group by
      p.id,
      p.bb_sku,
      p.room,
      p.product_type,
      p.production_required,
      p.bb_net_purchase_price,
      p."bb_Net",
      p."bb_Price",
      p.bb_is_bom,
      p.is_variant_set,
      p.is_antique
  ),
  bom_material_costs as (
    select
      bom.billbee_bom_id,
      COALESCE(sum(comp.bb_net_purchase_price), 0::numeric) as bom_material_cost
    from
      bom_recipes bom
      left join app_products comp on bom.billbee_component_id = comp.id
    group by
      bom.billbee_bom_id
  )
select
  ps.id,
  ps.bb_sku,
  ps.room,
  ps.product_type,
  ps.production_required,
  ps.bb_net_purchase_price,
  ps."bb_Net",
  ps."bb_Price",
  ps.revenue_last_12_months,
  ps.sales_last_12_months,
  ps.bb_is_bom,
  bmc.bom_material_cost,
  case
    when ps.bb_is_bom = true
    and bmc.bom_material_cost is not null then bmc.bom_material_cost
    else ps.bb_net_purchase_price
  end as material_cost_per_unit,
  case
    when ps.bb_is_bom = true
    and bmc.bom_material_cost is not null then bmc.bom_material_cost
    else ps.bb_net_purchase_price
  end * ps.sales_last_12_months as material_cost_last_12_months
from
  product_sales ps
  left join bom_material_costs bmc on bmc.billbee_bom_id = ps.id
where
  COALESCE(ps.is_variant_set, false) = false
  and COALESCE(ps.is_antique, false) = true
  and ps.room <> 'Service'::text;