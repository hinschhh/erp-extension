create materialized view public.export_current_purchase_prices as
select
  p.id,
  p.bb_sku,
  p.bb_is_bom,
  p.bb_is_active,
  p.bb_net_purchase_price,
  p.inventory_cagtegory,
  p.production_required
from
  app_products p;