-- Migration: Fix PO shipping cost propagation to shipments
-- Date: 2026-01-08
-- Reason: PO-level shipping (supplier-organized) needs to flow to shipments for ANK allocation
--         Old trigger tried to allocate to positions (now deleted), need new approach

-- Step 1: Drop the broken trigger and function that allocated to positions
DROP TRIGGER IF EXISTS trg_au__recalc_ship_alloc_on_po ON app_purchase_orders;
DROP TRIGGER IF EXISTS trg_au__po_recalc_shipping ON app_purchase_orders;
DROP FUNCTION IF EXISTS trgfn_app_purchase_orders_shipping_cost_net_recalc_on_po_change() CASCADE;
DROP FUNCTION IF EXISTS fn_po_recalc_shipping_allocation(uuid) CASCADE;

-- Step 2: Create new function to propagate PO shipping to shipment
-- This copies shipping_cost_net from PO to shipment's shipping_cost_separate
-- when creating shipment items (if shipment doesn't already have a separate cost)
CREATE OR REPLACE FUNCTION trgfn_propagate_po_shipping_to_shipment()
RETURNS TRIGGER
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
  
  -- Get current shipment shipping cost
  SELECT shipping_cost_separate
  INTO v_shipment_shipping
  FROM app_inbound_shipments
  WHERE id = NEW.shipment_id;
  
  -- If PO has shipping AND shipment doesn't have shipping yet, copy it
  IF COALESCE(v_po_shipping, 0) > 0 AND COALESCE(v_shipment_shipping, 0) = 0 THEN
    UPDATE app_inbound_shipments
    SET shipping_cost_separate = v_po_shipping
    WHERE id = NEW.shipment_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Step 3: Create trigger on shipment items to propagate shipping
-- Fires when first item is added to a shipment
CREATE TRIGGER trg_ai__propagate_po_shipping_to_shipment
AFTER INSERT ON app_inbound_shipment_items
FOR EACH ROW
EXECUTE FUNCTION trgfn_propagate_po_shipping_to_shipment();

-- Step 4: Add helpful comment
COMMENT ON COLUMN app_purchase_orders.shipping_cost_net IS 
'Shipping cost included in supplier order confirmation (when supplier organizes shipping). 
This will be automatically copied to app_inbound_shipments.shipping_cost_separate when goods arrive, 
then allocated to items for ANK calculation. Use app_inbound_shipments.shipping_cost_separate for 
shipping organized by logistics partner.';
