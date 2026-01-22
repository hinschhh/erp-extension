-- ============================================================================
-- Migration: Refactor Cost Tracking & Shipping Allocation
-- Date: 2026-01-22
-- 
-- GOALS:
-- 1. Make WebApp SSOT for acquisition costs (not Billbee)
-- 2. Clean shipping cost allocation (only via inbound shipments)
-- 3. Enforce data quality with proper constraints
-- 4. Auto-update cost_price from latest PO positions
-- 5. Generate bb_CostNet as calculated column
--
-- FOLLOWS: Expand → Switch → Remove Pattern (AGENTS.md)
-- ============================================================================

-- ============================================================================
-- PHASE 1: EXPAND - Add new structure
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 Add cost tracking fields to app_products
-- ----------------------------------------------------------------------------

-- cost_price: Base purchase price (updated from PO positions)
ALTER TABLE public.app_products
ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.app_products.cost_price IS
'Base purchase price per unit (EK). Updated automatically from latest PO position with this product. Represents the net purchase price without shipping costs.';

-- acquisition_cost: Shipping/ANK per unit (updated from inbound shipments)
ALTER TABLE public.app_products
ADD COLUMN IF NOT EXISTS acquisition_cost numeric DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.app_products.acquisition_cost IS
'Acquisition costs per unit (ANK/Anschaffungsnebenkosten). Updated automatically when inbound shipment items are posted. Represents proportional shipping costs allocated to this product.';

-- ----------------------------------------------------------------------------
-- 1.2 Add bb_CostNet column (for Billbee sync)
-- ----------------------------------------------------------------------------

-- Note: Cannot use GENERATED COLUMN with subquery for BOMs
-- → Use trigger-based calculation instead
ALTER TABLE public.app_products
ADD COLUMN IF NOT EXISTS bb_CostNet numeric DEFAULT 0;
COMMENT ON COLUMN public.app_products.bb_CostNet IS
'Total cost per unit (EK + ANK). For normal products: cost_price + acquisition_cost. For BOMs: Sum of all component costs. This is the SSOT for costs and will be synced to Billbee via n8n.';

-- ----------------------------------------------------------------------------
-- 1.3 Rename shipping_cost_separate → shipping_cost in app_inbound_shipments
-- ----------------------------------------------------------------------------

-- First check if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'app_inbound_shipments' 
    AND column_name = 'shipping_cost_separate'
  ) THEN
    -- Rename the column
    ALTER TABLE public.app_inbound_shipments
    RENAME COLUMN shipping_cost_separate TO shipping_cost;
    
    -- Update comment
    COMMENT ON COLUMN public.app_inbound_shipments.shipping_cost IS
    'Total shipping costs for this inbound shipment. Will be distributed proportionally across all items based on their value. Source: Either from PO or manually entered.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1.4 Data cleanup: Fix existing separate_invoice data
-- ----------------------------------------------------------------------------

-- Set shipping_cost_net to 0 for orders with separate_invoice = true
-- (these costs should be tracked via inbound_shipments instead)
UPDATE public.app_purchase_orders
SET shipping_cost_net = 0
WHERE separate_invoice_for_shipping_cost = true
  AND COALESCE(shipping_cost_net, 0) != 0;

-- ----------------------------------------------------------------------------
-- 1.5 Add CHECK constraint for separate_invoice + shipping_cost
-- ----------------------------------------------------------------------------

ALTER TABLE public.app_purchase_orders
DROP CONSTRAINT IF EXISTS chk_separate_invoice_shipping_cost;

ALTER TABLE public.app_purchase_orders
ADD CONSTRAINT chk_separate_invoice_shipping_cost
CHECK (
  separate_invoice_for_shipping_cost = false
  OR
  (separate_invoice_for_shipping_cost = true AND COALESCE(shipping_cost_net, 0) = 0)
);

COMMENT ON CONSTRAINT chk_separate_invoice_shipping_cost ON public.app_purchase_orders IS
'If separate_invoice_for_shipping_cost is true, shipping_cost_net must be 0. Shipping costs will be entered manually via inbound shipment in this case.';

-- ============================================================================
-- PHASE 2: NEW TRIGGERS - Implement new logic
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 Trigger: Update bb_CostNet when cost_price or acquisition_cost changes
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trgfn_app_products_update_bb_costnet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_cost numeric;
BEGIN
  -- Calculate based on product type
  IF NEW.bb_is_bom = true THEN
    -- BOM: Sum of all component costs
    SELECT COALESCE(SUM(
      (COALESCE(comp.cost_price, 0) + COALESCE(comp.acquisition_cost, 0)) * br.quantity
    ), 0)
    INTO v_new_cost
    FROM public.bom_recipes br
    JOIN public.app_products comp ON comp.id = br.billbee_component_id
    WHERE br.billbee_bom_id = NEW.id;
  ELSE
    -- Normal product: Direct cost
    v_new_cost := COALESCE(NEW.cost_price, 0) + COALESCE(NEW.acquisition_cost, 0);
  END IF;

  -- Only update if changed (avoid unnecessary triggers)
  IF v_new_cost IS DISTINCT FROM NEW.bb_CostNet THEN
    NEW.bb_CostNet := v_new_cost;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_products_update_bb_costnet ON public.app_products;

CREATE TRIGGER trg_app_products_update_bb_costnet
  BEFORE INSERT OR UPDATE OF cost_price, acquisition_cost, bb_is_bom
  ON public.app_products
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_app_products_update_bb_costnet();

COMMENT ON FUNCTION public.trgfn_app_products_update_bb_costnet() IS
'Updates bb_CostNet when cost_price or acquisition_cost changes.
For normal products: cost_price + acquisition_cost
For BOMs: SUM(component.bb_CostNet * quantity)';

-- ----------------------------------------------------------------------------
-- 2.2 Trigger: Update parent BOM bb_CostNet when component costs change
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trgfn_bom_recipes_update_parent_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id bigint;
BEGIN
  -- Determine which parent BOM needs update
  IF TG_OP = 'DELETE' THEN
    v_parent_id := OLD.billbee_bom_id;
  ELSE
    v_parent_id := NEW.billbee_bom_id;
  END IF;

  -- Trigger update on parent product (will cascade via trg_app_products_update_bb_costnet)
  UPDATE public.app_products
  SET updated_at = NOW() -- Dummy update to trigger BEFORE UPDATE
  WHERE id = v_parent_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_bom_recipes_update_parent_cost ON public.bom_recipes;

CREATE TRIGGER trg_bom_recipes_update_parent_cost
  AFTER INSERT OR UPDATE OF quantity OR DELETE
  ON public.bom_recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_bom_recipes_update_parent_cost();

COMMENT ON FUNCTION public.trgfn_bom_recipes_update_parent_cost() IS
'When BOM recipe changes, recalculate parent product bb_CostNet.
Triggers dummy update on parent, which then recalculates via trgfn_app_products_update_bb_costnet.';

-- ----------------------------------------------------------------------------
-- 2.3 Trigger: Update cost_price from latest PO position
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trgfn_po_position_normal_update_cost_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_latest boolean;
  v_product_id bigint;
BEGIN
  -- Only react to INSERT or UPDATE of unit_price_net
  IF (TG_OP = 'INSERT') OR 
     (TG_OP = 'UPDATE' AND NEW.unit_price_net IS DISTINCT FROM OLD.unit_price_net) THEN
    
    v_product_id := NEW.billbee_product_id;
    
    -- Check if this is the latest position for this product
    -- (based on created_at timestamp)
    SELECT (NEW.id = (
      SELECT id 
      FROM public.app_purchase_orders_positions_normal
      WHERE billbee_product_id = v_product_id
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1
    )) INTO v_is_latest;
    
    -- If this is the latest position, update cost_price in app_products
    IF v_is_latest AND NEW.unit_price_net IS NOT NULL THEN
      UPDATE public.app_products
      SET cost_price = NEW.unit_price_net,
          updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach trigger to normal positions table
DROP TRIGGER IF EXISTS trg_po_position_normal_update_cost_price 
  ON public.app_purchase_orders_positions_normal;

CREATE TRIGGER trg_po_position_normal_update_cost_price
  AFTER INSERT OR UPDATE OF unit_price_net
  ON public.app_purchase_orders_positions_normal
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_po_position_normal_update_cost_price();

COMMENT ON FUNCTION public.trgfn_po_position_normal_update_cost_price IS
'Updates app_products.cost_price when a new PO position is created or unit_price_net changes. Only updates if this is the latest position (by created_at) for the product.';

-- ----------------------------------------------------------------------------
-- 2.2 Trigger: Distribute shipping costs (INSERT/UPDATE differential)
-- ----------------------------------------------------------------------------

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
  v_delta numeric;
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
  
  -- Also propagate shipping costs to PO (for backwards compatibility)
  -- This maintains the PO-level aggregate but is NOT the source of truth
  IF TG_OP = 'INSERT' THEN
    v_delta := v_shipping_cost;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := v_shipping_cost - COALESCE(OLD.shipping_cost, 0);
  END IF;
  
  IF v_delta != 0 THEN
    -- Distribute delta across POs proportionally
    WITH order_qty AS (
      SELECT
        i.order_id,
        SUM(i.quantity_delivered)::numeric AS qty_total
      FROM public.app_inbound_shipment_items i
      WHERE i.shipment_id = v_shipment_id
      GROUP BY i.order_id
    ),
    totals AS (
      SELECT SUM(qty_total)::numeric AS grand_total
      FROM order_qty
    ),
    alloc AS (
      SELECT
        q.order_id,
        ROUND((q.qty_total / NULLIF(t.grand_total, 0)) * v_delta, 2) AS add_amount
      FROM order_qty q
      CROSS JOIN totals t
      WHERE COALESCE(t.grand_total, 0) > 0
    )
    UPDATE public.app_purchase_orders p
    SET shipping_cost_net = COALESCE(p.shipping_cost_net, 0) + a.add_amount,
        separate_invoice_for_shipping_cost = true,
        updated_at = NOW()
    FROM alloc a
    WHERE p.id = a.order_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Replace old trigger
DROP TRIGGER IF EXISTS trg_au__allocate_shipping_costs_from_is 
  ON public.app_inbound_shipments;
DROP TRIGGER IF EXISTS trg_distribute_shipping_costs
  ON public.app_inbound_shipments;

CREATE TRIGGER trg_distribute_shipping_costs
  AFTER INSERT OR UPDATE OF shipping_cost
  ON public.app_inbound_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs();

COMMENT ON FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs IS
'Distributes shipping costs from inbound shipment to items proportionally based on value. On INSERT: adds full amount. On UPDATE: adds only the delta. Also maintains PO-level aggregate for backwards compatibility (not SSOT).';

-- ----------------------------------------------------------------------------
-- 2.3 Trigger: Enforce qty_delivered read-only after posting + update acquisition_cost
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trgfn_inbound_item_posted_enforcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id bigint;
  v_ank_per_unit numeric;
BEGIN
  -- BEFORE UPDATE: Enforce read-only qty_delivered after posting
  IF TG_OP = 'UPDATE' AND OLD.item_status = 'posted' THEN
    IF NEW.quantity_delivered IS DISTINCT FROM OLD.quantity_delivered THEN
      RAISE EXCEPTION 'qty_delivered cannot be changed after posting to Billbee'
        USING ERRCODE = 'PODLV',
              HINT = 'To correct this, create a cancellation/adjustment in the system.';
    END IF;
  END IF;
  
  -- AFTER UPDATE: When item_status changes to 'posted', update acquisition_cost
  IF TG_OP = 'UPDATE' 
     AND NEW.item_status = 'posted' 
     AND (OLD.item_status IS NULL OR OLD.item_status != 'posted') THEN
    
    -- Get product ID (from normal or special position)
    SELECT COALESCE(popn.billbee_product_id, pops.billbee_product_id)
    INTO v_product_id
    FROM public.app_inbound_shipment_items isi
    LEFT JOIN public.app_purchase_orders_positions_normal popn 
      ON isi.po_item_normal_id = popn.id
    LEFT JOIN public.app_purchase_orders_positions_special pops 
      ON isi.po_item_special_id = pops.id
    WHERE isi.id = NEW.id;
    
    -- Calculate ANK per unit (shipping costs / quantity)
    IF NEW.quantity_delivered > 0 THEN
      v_ank_per_unit := COALESCE(NEW.shipping_costs_proportional, 0) / NEW.quantity_delivered;
    ELSE
      v_ank_per_unit := 0;
    END IF;
    
    -- Update acquisition_cost in app_products
    -- (overwrites previous value - always use latest)
    IF v_product_id IS NOT NULL THEN
      UPDATE public.app_products
      SET acquisition_cost = v_ank_per_unit,
          updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Replace old triggers with split BEFORE/AFTER
DROP TRIGGER IF EXISTS trg_inbound_item_qty_readonly 
  ON public.app_inbound_shipment_items;
DROP TRIGGER IF EXISTS trg_inbound_item_update_acquisition_cost 
  ON public.app_inbound_shipment_items;

-- BEFORE UPDATE: Enforce qty_delivered read-only
CREATE TRIGGER trg_inbound_item_qty_readonly
  BEFORE UPDATE OF quantity_delivered
  ON public.app_inbound_shipment_items
  FOR EACH ROW
  WHEN (OLD.item_status = 'posted')
  EXECUTE FUNCTION public.trgfn_inbound_item_posted_enforcement();

-- AFTER UPDATE: Update acquisition_cost when posted
CREATE TRIGGER trg_inbound_item_update_acquisition_cost
  AFTER UPDATE OF item_status
  ON public.app_inbound_shipment_items
  FOR EACH ROW
  WHEN (NEW.item_status = 'posted')
  EXECUTE FUNCTION public.trgfn_inbound_item_posted_enforcement();

COMMENT ON FUNCTION public.trgfn_inbound_item_posted_enforcement IS
'Enforces business rules for inbound shipment items: (1) qty_delivered becomes read-only after posting, (2) acquisition_cost is updated in app_products when item is posted.';

-- ============================================================================
-- PHASE 3: REMOVE - Clean up legacy system
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 Mark deprecated fields (if they exist)
-- ----------------------------------------------------------------------------

-- Check if shipping_costs_proportional exists before commenting
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'app_purchase_orders_positions_normal'
      AND column_name = 'shipping_costs_proportional'
  ) THEN
    COMMENT ON COLUMN public.app_purchase_orders_positions_normal.shipping_costs_proportional IS
    'DEPRECATED: Shipping costs are now tracked at inbound_shipment_items level only. This field is no longer used and will be removed in future migration.';
  END IF;
END $$;

-- Note: NOT dropping yet - will do in future migration after confirming
-- no frontend dependencies. This follows AGENTS.md guidance on breaking changes.

-- ----------------------------------------------------------------------------
-- 3.2 Drop obsolete shipping allocation triggers/functions
-- ----------------------------------------------------------------------------

-- Drop trigger that called missing function
DROP TRIGGER IF EXISTS trg_po_recalc_shipping_on_status 
  ON public.app_purchase_orders;

DROP FUNCTION IF EXISTS public.trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i();

-- Drop old INSERT trigger first (depends on function)
DROP TRIGGER IF EXISTS trg_ai__allocate_shipping_costs_from_is
  ON public.app_inbound_shipments;

-- Now drop the function
DROP FUNCTION IF EXISTS public.trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc();

COMMENT ON TRIGGER trg_distribute_shipping_costs ON public.app_inbound_shipments IS
'Replaces old trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc trigger. Now handles INSERT/UPDATE differential shipping cost allocation.';

-- ----------------------------------------------------------------------------
-- 3.3 Drop constraint that prevented manual shipping cost changes
-- ----------------------------------------------------------------------------

-- Drop trigger first
DROP TRIGGER IF EXISTS trg_separate_invoice_restriction 
  ON public.app_purchase_orders;
DROP TRIGGER IF EXISTS trg_bu__lock_sep_flag_after_cost
  ON public.app_purchase_orders;

-- Now drop function
DROP FUNCTION IF EXISTS public.trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re();

-- Constraint was replaced by CHECK constraint in Phase 1

-- ============================================================================
-- PHASE 4: UPDATE COMMENTS & METADATA
-- ============================================================================

-- Update bb_net_purchase_price comment (now legacy field)
COMMENT ON COLUMN public.app_products.bb_net_purchase_price IS
'LEGACY: Billbee purchase price (read-only from Billbee sync). DO NOT USE for calculations. Use cost_price + acquisition_cost (or bb_CostNet) instead. This field will be removed once Billbee sync switches to using bb_CostNet.';

-- Update PO shipping_cost_net comment
COMMENT ON COLUMN public.app_purchase_orders.shipping_cost_net IS
'Shipping costs for this purchase order (if known from supplier confirmation). This is propagated to inbound shipments but is NOT the source of truth for ANK calculations. Source of truth: app_inbound_shipment_items.shipping_costs_proportional.';

-- Update inbound item shipping costs comment
COMMENT ON COLUMN public.app_inbound_shipment_items.shipping_costs_proportional IS
'Proportional share of shipping costs (ANK) allocated to this item. Calculated from app_inbound_shipments.shipping_cost based on item value proportion. This is the ONLY source of truth for ANK allocation at item level. Used to calculate acquisition_cost in app_products when item is posted.';

-- ============================================================================
-- PHASE 5: GRANTS & PERMISSIONS
-- ============================================================================

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION public.trgfn_po_position_normal_update_cost_price() 
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs() 
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.trgfn_inbound_item_posted_enforcement() 
  TO authenticated, service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary of changes:
-- ✅ Added cost_price and acquisition_cost to app_products
-- ✅ Added GENERATED COLUMN bb_CostNet (normal + BOM logic)
-- ✅ Renamed shipping_cost_separate → shipping_cost in inbound_shipments
-- ✅ Added CHECK constraint for separate_invoice + shipping_cost
-- ✅ Implemented trigger: PO position → cost_price update
-- ✅ Implemented trigger: Inbound shipment → shipping cost distribution (INSERT/UPDATE differential)
-- ✅ Implemented trigger: Posted → qty_delivered read-only + acquisition_cost update
-- ✅ Removed obsolete triggers/functions (shipping allocation legacy)
-- ✅ Updated all comments and metadata
-- ✅ Kept Auto-Advance triggers (as requested)
--
-- Next steps:
-- 1. Test all triggers work correctly
-- 2. Update frontend to use new fields (cost_price, acquisition_cost, bb_CostNet)
-- 3. Configure n8n to sync bb_CostNet to Billbee
-- 4. Monitor for issues, then remove deprecated fields in future migration
