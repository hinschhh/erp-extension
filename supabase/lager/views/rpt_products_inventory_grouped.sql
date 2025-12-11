create view public.rpt_products_inventory_grouped as
select
  d.bb_category,
  min(d.inventory_cagtegory) as inventory_cagtegory_sort,
  count(*) as product_count,
  sum(d.stock_free) as stock_free,
  sum(d.stock_reserved_direct) as stock_reserved_direct,
  sum(d.stock_reserved_bom) as stock_reserved_bom,
  sum(d.stock_unavailable) as stock_unavailable,
  sum(d.stock_physical) as stock_physical,
  sum(d.stock_on_order) as stock_on_order,
  sum(d.inventory_value) as inventory_value,
  min(d.updated_at) as updated_at_min,
  max(d.updated_at) as updated_at_max
from
  rpt_products_inventory_purchasing d
group by
  d.bb_category
order by
  (min(d.inventory_cagtegory)),
  d.bb_category;