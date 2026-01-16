-- Migration: Fix ANK allocation to properly distribute to shipment items
-- Issue: shipping_costs_proportional on items doesn't match shipping_cost_separate on shipment header
-- Root cause: Multiple shipments from same PO cause cumulative allocation issues
-- Solution: Allocate directly to items in this specific shipment based on their value proportion

CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_delta numeric;
  v_shipment_total numeric; -- Total value of all items in THIS shipment
  v_shipping_amount numeric; -- The new shipping_cost_separate value (not delta)
begin
  -- Nur reagieren, wenn NEW vorhanden ist und ein (neuer) Wert gesetzt wurde
  if tg_op = 'INSERT' then
    v_delta := coalesce(new.shipping_cost_separate, 0);
    v_shipping_amount := coalesce(new.shipping_cost_separate, 0);
  elsif tg_op = 'UPDATE' then
    -- Delta = NEW - OLD (negative Werte möglich, falls reduziert wird)
    v_delta := coalesce(new.shipping_cost_separate, 0) - coalesce(old.shipping_cost_separate, 0);
    v_shipping_amount := coalesce(new.shipping_cost_separate, 0);
  else
    -- Für DELETE nicht relevant
    return coalesce(new, old);
  end if;

  -- Kein Delta -> nichts zu tun
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
  -- PART 2: NEW - Distribute shipping directly to items in THIS shipment
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

  -- Only allocate if we have a valid shipment total and shipping amount
  if coalesce(v_shipment_total, 0) > 0 and v_shipping_amount > 0 then
    
    -- Allocate to NORMAL position items
    update public.app_purchase_orders_positions_normal popn
    set shipping_costs_proportional = round(
      (isi.quantity_delivered * popn.unit_price_net / v_shipment_total) * v_shipping_amount,
      2
    )
    from public.app_inbound_shipment_items isi
    where isi.po_item_normal_id = popn.id
      and isi.shipment_id = new.id
      and popn.unit_price_net is not null;

    -- Allocate to SPECIAL position items  
    update public.app_purchase_orders_positions_special pops
    set shipping_costs_proportional = round(
      (isi.quantity_delivered * pops.unit_price_net / v_shipment_total) * v_shipping_amount,
      2
    )
    from public.app_inbound_shipment_items isi
    where isi.po_item_special_id = pops.id
      and isi.shipment_id = new.id
      and pops.unit_price_net is not null;
      
  elsif v_shipping_amount = 0 then
    -- If shipping is set to 0, zero out the allocations for items in this shipment
    update public.app_purchase_orders_positions_normal popn
    set shipping_costs_proportional = 0
    from public.app_inbound_shipment_items isi
    where isi.po_item_normal_id = popn.id
      and isi.shipment_id = new.id;

    update public.app_purchase_orders_positions_special pops
    set shipping_costs_proportional = 0
    from public.app_inbound_shipment_items isi
    where isi.po_item_special_id = pops.id
      and isi.shipment_id = new.id;
  end if;

  return new;
end;
$function$;

-- ====================================================================================
-- OPTIONAL: Backfill existing data (commented out by default for safety)
-- ====================================================================================
-- Uncomment and run this separately after testing if you want to fix historical data:
/*
DO $$
DECLARE
  shipment_rec RECORD;
BEGIN
  -- Process each shipment that has shipping_cost_separate
  FOR shipment_rec IN 
    SELECT id, shipping_cost_separate 
    FROM app_inbound_shipments 
    WHERE shipping_cost_separate IS NOT NULL 
      AND shipping_cost_separate > 0
    ORDER BY delivered_at
  LOOP
    -- Simulate an UPDATE to trigger the allocation
    UPDATE app_inbound_shipments 
    SET shipping_cost_separate = shipment_rec.shipping_cost_separate
    WHERE id = shipment_rec.id;
    
    RAISE NOTICE 'Processed shipment %', shipment_rec.id;
  END LOOP;
END $$;
*/
