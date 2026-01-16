create view public.rpt_inbound_items_monthly as
select
  rpt_inbound_items_enriched.month,
  rpt_inbound_items_enriched.inventory_cagtegory,
  rpt_inbound_items_enriched.kind,
  sum(rpt_inbound_items_enriched.qty_delivered)::numeric(12, 3) as qty_delivered_total,
  sum(rpt_inbound_items_enriched.cost_goods_net)::numeric(14, 2) as cost_goods_net_total,
  sum(rpt_inbound_items_enriched.cost_shipping_alloc)::numeric(14, 2) as cost_shipping_total,
  sum(rpt_inbound_items_enriched.cost_total)::numeric(14, 2) as cost_total
from
  rpt_inbound_items_enriched
group by
  rpt_inbound_items_enriched.month,
  rpt_inbound_items_enriched.inventory_cagtegory,
  rpt_inbound_items_enriched.kind
order by
  rpt_inbound_items_enriched.month,
  rpt_inbound_items_enriched.inventory_cagtegory,
  rpt_inbound_items_enriched.kind;