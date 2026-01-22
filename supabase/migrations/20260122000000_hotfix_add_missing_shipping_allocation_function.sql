-- Migration: Hotfix - Add missing fn_po_recalc_shipping_allocation function
-- Date: 2026-01-22
-- Issue: Function referenced in trigger but not defined, causing transactions to fail
-- Reference: ANALYSIS_PO_STATUS_SHIPPING.md

-- ====================================================================================
-- PROBLEM:
-- Trigger 'trg_po_recalc_shipping_on_status' calls fn_po_recalc_shipping_allocation
-- but the function does not exist in the database. This causes all transitions to
-- 'partially_in_production' status to fail.
--
-- AFFECTED SCENARIOS:
-- - Sketch confirmation button
-- - Manual status changes when some positions are confirmed, others in production
-- - Goods receipt with partial deliveries
-- ====================================================================================

-- SOLUTION:
-- Implement the function as a no-op (empty function) since shipping allocation
-- is now handled at shipment-item level (app_inbound_shipment_items.shipping_costs_proportional)
-- instead of PO level (app_purchase_orders.shipping_cost_net - legacy).
--
-- The PO-level allocation is maintained for backwards compatibility but is no longer
-- the source of truth for ANK (Anschaffungsnebenkosten) calculations.

CREATE OR REPLACE FUNCTION public.fn_po_recalc_shipping_allocation(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Intentionally empty (no-op) function
  -- 
  -- Legacy PO-level shipping allocation is deprecated.
  -- Shipping costs are now allocated at shipment-item level via:
  --   - trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc (Part 2)
  --   - Field: app_inbound_shipment_items.shipping_costs_proportional
  -- 
  -- PO-level field (app_purchase_orders.shipping_cost_net) is still populated
  -- for backwards compatibility but should no longer be used for calculations.
  --
  -- This function exists only to prevent errors when the trigger fires
  -- on status changes to 'partially_in_production'.
  --
  -- Future work: Remove this trigger and function entirely once legacy system
  -- is fully removed (see ANALYSIS_PO_STATUS_SHIPPING.md Phase 2).
  
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.fn_po_recalc_shipping_allocation IS 
'Legacy function - kept for backwards compatibility to prevent trigger errors.
Shipping allocation is now handled at shipment-item level.
See: app_inbound_shipment_items.shipping_costs_proportional';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.fn_po_recalc_shipping_allocation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_po_recalc_shipping_allocation(uuid) TO service_role;
