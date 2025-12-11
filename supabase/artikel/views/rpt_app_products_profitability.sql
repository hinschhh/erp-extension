create view public.rpt_app_products_profitability as
select
  p.id,
  p.bb_sku,
  p.inventory_cagtegory,
  p."bb_Price",
  p."bb_Net",
  br.billbee_component_id
from
  app_products p
  left join bom_recipes br on p.id = br.billbee_bom_id;