-- ============================================================================
-- Hotfix: Update trgfn_propagate_po_shipping_to_shipment to use shipping_cost
-- Date: 2026-01-30
-- 
-- PROBLEM:
-- After renaming shipping_cost_separate → shipping_cost in migration 
-- 20260122100000, the trigger function was not updated and still references
-- the old column name, causing errors when adding inbound shipment items.
--
-- SOLUTION:
-- Update the function to use the new column name shipping_cost
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trgfn_propagate_po_shipping_to_shipment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_po_shipping numeric;
  v_shipment_shipping numeric;
BEGIN
  -- Get PO shipping cost
  SELECT shipping_cost_net 
  INTO v_po_shipping
  FROM app_purchase_orders
  WHERE id = NEW.order_id;
  
  -- Get current shipment shipping cost (FIXED: use shipping_cost instead of shipping_cost_separate)
  SELECT shipping_cost
  INTO v_shipment_shipping
  FROM app_inbound_shipments
  WHERE id = NEW.shipment_id;
  
  -- If PO has shipping AND shipment doesn't have shipping yet, copy it
  IF COALESCE(v_po_shipping, 0) > 0 AND COALESCE(v_shipment_shipping, 0) = 0 THEN
    UPDATE app_inbound_shipments
    SET shipping_cost = v_po_shipping
    WHERE id = NEW.shipment_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trgfn_propagate_po_shipping_to_shipment() IS
'Copies shipping_cost_net from purchase order to inbound shipment.shipping_cost if not already set. Updated to use new column name shipping_cost (was shipping_cost_separate).';
