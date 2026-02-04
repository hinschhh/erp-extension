-- ============================================================================
-- Migration: Fix shipping cost constraint violations
-- Date: 2026-02-02
-- 
-- PROBLEM:
-- Some purchase orders have separate_invoice_for_shipping_cost = true
-- but still have shipping_cost_net > 0, which violates the constraint
-- chk_separate_invoice_shipping_cost.
--
-- This causes errors when trying to update inbound shipments because
-- the constraint prevents any UPDATE on the purchase order row.
--
-- SOLUTION:
-- 1. Identify all purchase orders that violate the constraint
-- 2. Move their shipping costs to associated inbound shipments (if any)
-- 3. Set shipping_cost_net to 0 in purchase orders
-- ============================================================================

DO $$
DECLARE
  v_po_record RECORD;
  v_inbound_count INT;
  v_shipping_per_inbound NUMERIC;
BEGIN
  RAISE NOTICE 'Starting shipping cost constraint fix...';
  
  -- Find all purchase orders that violate the constraint
  FOR v_po_record IN
    SELECT 
      id,
      order_number,
      shipping_cost_net,
      separate_invoice_for_shipping_cost
    FROM app_purchase_orders
    WHERE separate_invoice_for_shipping_cost = true
      AND COALESCE(shipping_cost_net, 0) > 0
  LOOP
    RAISE NOTICE 'Found PO % (%) with shipping_cost_net = % and separate_invoice = true',
      v_po_record.order_number,
      v_po_record.id,
      v_po_record.shipping_cost_net;
    
    -- Check if there are any inbound shipments for this PO
    SELECT COUNT(DISTINCT isi.shipment_id)
    INTO v_inbound_count
    FROM app_inbound_shipment_items isi
    LEFT JOIN app_purchase_orders_positions_normal popn ON isi.po_item_normal_id = popn.id
    LEFT JOIN app_purchase_orders_positions_special pops ON isi.po_item_special_id = pops.id
    WHERE COALESCE(popn.order_id, pops.order_id) = v_po_record.id;
    
    IF v_inbound_count > 0 THEN
      -- Distribute shipping cost evenly across inbound shipments
      v_shipping_per_inbound := v_po_record.shipping_cost_net / v_inbound_count;
      
      RAISE NOTICE '  → Moving shipping costs to % inbound shipment(s) (%.2f each)',
        v_inbound_count,
        v_shipping_per_inbound;
      
      -- Update inbound shipments that don't have shipping costs yet
      UPDATE app_inbound_shipments
      SET shipping_cost = v_shipping_per_inbound
      WHERE id IN (
        SELECT DISTINCT isi.shipment_id
        FROM app_inbound_shipment_items isi
        LEFT JOIN app_purchase_orders_positions_normal popn ON isi.po_item_normal_id = popn.id
        LEFT JOIN app_purchase_orders_positions_special pops ON isi.po_item_special_id = pops.id
        WHERE COALESCE(popn.order_id, pops.order_id) = v_po_record.id
      )
      AND COALESCE(shipping_cost, 0) = 0; -- Only update if not already set
    ELSE
      RAISE NOTICE '  → No inbound shipments found, just clearing shipping_cost_net';
    END IF;
    
    -- Clear shipping_cost_net in purchase order
    UPDATE app_purchase_orders
    SET shipping_cost_net = 0
    WHERE id = v_po_record.id;
    
    RAISE NOTICE '  ✓ Fixed PO %', v_po_record.order_number;
  END LOOP;
  
  RAISE NOTICE 'Shipping cost constraint fix completed';
END $$;
