-- Migration: Add shipping_costs_proportional to app_inbound_shipment_items
-- This allows proper tracking of ANK allocation per shipment-item, solving split delivery issues

-- Step 1: Add the new column
ALTER TABLE app_inbound_shipment_items 
ADD COLUMN IF NOT EXISTS shipping_costs_proportional numeric DEFAULT 0;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_inbound_shipment_items_shipping_costs 
ON app_inbound_shipment_items(shipping_costs_proportional) 
WHERE shipping_costs_proportional > 0;

-- Step 3: Update the trigger function to use the new column
CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_delta numeric;
  v_shipment_total numeric;
  v_shipping_amount numeric;
begin
  if tg_op = 'INSERT' then
    v_delta := coalesce(new.shipping_cost_separate, 0);
    v_shipping_amount := coalesce(new.shipping_cost_separate, 0);
  elsif tg_op = 'UPDATE' then
    v_delta := coalesce(new.shipping_cost_separate, 0) - coalesce(old.shipping_cost_separate, 0);
    v_shipping_amount := coalesce(new.shipping_cost_separate, 0);
  else
    return coalesce(new, old);
  end if;

  if v_delta = 0 then
    return new;
  end if;

  -- ====================================================================================
  -- PART 1: Keep existing PO-level allocation (for backwards compatibility)
  -- ====================================================================================
  with order_qty as (
    select
      i.order_id,
      sum(i.quantity_delivered)::numeric as qty_total
    from public.app_inbound_shipment_items i
    where i.shipment_id = new.id
    group by i.order_id
  ),
  totals as (
    select sum(qty_total)::numeric as grand_total
    from order_qty
  ),
  alloc as (
    select
      q.order_id,
      round((q.qty_total / nullif(t.grand_total, 0)) * v_delta, 2) as add_amount
    from order_qty q
    cross join totals t
    where coalesce(t.grand_total, 0) > 0
  )
  update public.app_purchase_orders p
     set shipping_cost_net = coalesce(p.shipping_cost_net, 0) + a.add_amount,
         separate_invoice_for_shipping_cost = true,
         updated_at = now()
    from alloc a
   where p.id = a.order_id;

  -- ====================================================================================
  -- PART 2: NEW - Allocate to shipment items (not positions)
  -- ====================================================================================
  
  -- Calculate total value of items in this shipment
  select sum(
    isi.quantity_delivered * 
    coalesce(
      popn.unit_price_net,
      pops.unit_price_net,
      0
    )
  ) into v_shipment_total
  from public.app_inbound_shipment_items isi
  left join public.app_purchase_orders_positions_normal popn on isi.po_item_normal_id = popn.id
  left join public.app_purchase_orders_positions_special pops on isi.po_item_special_id = pops.id
  where isi.shipment_id = new.id;

  -- Allocate proportionally to each shipment item
  if coalesce(v_shipment_total, 0) > 0 and v_shipping_amount > 0 then
    
    -- Update shipment items with their proportional share
    update public.app_inbound_shipment_items isi
    set shipping_costs_proportional = round(
      (isi.quantity_delivered * 
       coalesce(
         (select unit_price_net from app_purchase_orders_positions_normal where id = isi.po_item_normal_id),
         (select unit_price_net from app_purchase_orders_positions_special where id = isi.po_item_special_id),
         0
       ) / v_shipment_total
      ) * v_shipping_amount,
      2
    )
    where isi.shipment_id = new.id
      and coalesce(
        (select unit_price_net from app_purchase_orders_positions_normal where id = isi.po_item_normal_id),
        (select unit_price_net from app_purchase_orders_positions_special where id = isi.po_item_special_id),
        0
      ) > 0;
      
  elsif v_shipping_amount = 0 then
    -- If shipping is set to 0, zero out the allocations for items in this shipment
    update public.app_inbound_shipment_items
    set shipping_costs_proportional = 0
    where shipment_id = new.id;
  end if;

  return new;
end;
$function$;

COMMENT ON COLUMN app_inbound_shipment_items.shipping_costs_proportional IS 
'Proportional share of shipping costs (ANK/Anschaffungsnebenkosten) allocated to this specific shipment item. Calculated from app_inbound_shipments.shipping_cost_separate based on item value proportion.';
