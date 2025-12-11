create view public.view_bom_materialcosts as
with
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
  bmc.billbee_bom_id,
  parent.bb_sku,
  parent.production_required,
  parent.inventory_cagtegory,
  parent."bb_Net",
  parent."bb_Price",
  bmc.bom_material_cost,
  case
    when parent."bb_Net" is null
    or parent."bb_Net" = 0::numeric then null::numeric
    else bmc.bom_material_cost / parent."bb_Net"
  end as bom_material_cost_ratio
from
  bom_material_costs bmc
  left join app_products parent on bmc.billbee_bom_id = parent.id;