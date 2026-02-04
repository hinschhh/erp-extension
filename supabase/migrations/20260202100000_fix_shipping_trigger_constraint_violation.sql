-- ============================================================================
-- Migration: Remove backwards-incompatible PO update from shipping trigger
-- Date: 2026-02-02
-- 
-- PROBLEM:
-- The trigger trgfn_inbound_shipment_distribute_shipping_costs tries to
-- propagate shipping costs back to app_purchase_orders with:
--   - shipping_cost_net += delta
--   - separate_invoice_for_shipping_cost = true
--
-- This violates the constraint chk_separate_invoice_shipping_cost:
-- "If separate_invoice_for_shipping_cost = true, shipping_cost_net must be 0"
--
-- SOLUTION:
-- Remove the "backwards compatibility" logic that writes back to PO.
-- The inbound shipment IS the source of truth for shipping costs when
-- separate_invoice_for_shipping_cost = true.
-- 
-- FOLLOWS: AGENTS.md - Backend (Supabase) is source of truth
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shipment_id uuid;
  v_shipping_cost numeric;
  v_total_value numeric;
BEGIN
  v_shipment_id := NEW.id;
  v_shipping_cost := COALESCE(NEW.shipping_cost, 0);
  
  -- Calculate total value of all items in this shipment
  SELECT COALESCE(SUM(
    isi.quantity_delivered * COALESCE(
      popn.unit_price_net,  -- Normal position
      pops.unit_price_net,  -- Special position
      0
    )
  ), 0)
  INTO v_total_value
  FROM public.app_inbound_shipment_items isi
  LEFT JOIN public.app_purchase_orders_positions_normal popn 
    ON isi.po_item_normal_id = popn.id
  LEFT JOIN public.app_purchase_orders_positions_special pops 
    ON isi.po_item_special_id = pops.id
  WHERE isi.shipment_id = v_shipment_id;
  
  -- Distribute proportionally to each item
  IF v_total_value > 0 AND v_shipping_cost > 0 THEN
    UPDATE public.app_inbound_shipment_items isi
    SET shipping_costs_proportional = ROUND(
      (isi.quantity_delivered * COALESCE(
        popn.unit_price_net,
        pops.unit_price_net,
        0
      ) / v_total_value) * v_shipping_cost,
      2
    ),
    updated_at = NOW()
    FROM public.app_purchase_orders_positions_normal popn,
         public.app_purchase_orders_positions_special pops
    WHERE isi.shipment_id = v_shipment_id
      AND (isi.po_item_normal_id = popn.id OR isi.po_item_special_id = pops.id)
      AND COALESCE(popn.unit_price_net, pops.unit_price_net, 0) > 0;
      
  ELSIF v_shipping_cost = 0 THEN
    -- If shipping cost is 0, zero out allocations
    UPDATE public.app_inbound_shipment_items
    SET shipping_costs_proportional = 0,
        updated_at = NOW()
    WHERE shipment_id = v_shipment_id;
  END IF;
  
  -- REMOVED: Backwards-incompatible PO update logic
  -- The inbound shipment is the source of truth for shipping costs
  -- when separate_invoice_for_shipping_cost = true on the PO.
  -- No need to write back to PO.
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs IS
'Distributes shipping costs from inbound shipment to items proportionally based on value. ONLY distributes to items, does NOT update purchase orders (inbound shipment is SSOT for shipping costs in separate invoice scenario).';
