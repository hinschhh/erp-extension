-- Backfill Script: Fix ANK allocation for historical inbound shipments
-- Run this AFTER the migration has been applied
-- This will re-trigger the allocation for all existing shipments with shipping_cost_separate

-- IMPORTANT: This script requires a valid user context (run from the application, not raw SQL)
-- If you need to run it via SQL, you can disable the audit trigger temporarily:
-- ALTER TABLE app_inbound_shipments DISABLE TRIGGER trgfn_generic_audit_logs_row_insert_update_delete_log;
-- Then run the DO block below, then:
-- ALTER TABLE app_inbound_shipments ENABLE TRIGGER trgfn_generic_audit_logs_row_insert_update_delete_log;

DO $$
DECLARE
  shipment_rec RECORD;
  v_count INT := 0;
  v_errors INT := 0;
BEGIN
  RAISE NOTICE 'Starting ANK backfill for historical shipments...';
  
  -- Process each shipment that has shipping_cost_separate
  FOR shipment_rec IN 
    SELECT id, inbound_number, shipping_cost_separate, delivered_at
    FROM app_inbound_shipments 
    WHERE shipping_cost_separate IS NOT NULL 
      AND shipping_cost_separate > 0
    ORDER BY delivered_at
  LOOP
    BEGIN
      -- Simulate an UPDATE to trigger the allocation
      -- This calls trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc
      UPDATE app_inbound_shipments 
      SET shipping_cost_separate = shipment_rec.shipping_cost_separate,
          updated_at = now()
      WHERE id = shipment_rec.id;
      
      v_count := v_count + 1;
      
      IF v_count % 10 = 0 THEN
        RAISE NOTICE 'Processed % shipments...', v_count;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        RAISE WARNING 'Failed to process shipment %: %', shipment_rec.inbound_number, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete! Processed: %, Errors: %', v_count, v_errors;
END $$;

-- Verification Query: Check for remaining mismatches
-- Run this after backfill to verify everything is correct
WITH shipment_ank AS (
  SELECT 
    ais.id,
    ais.inbound_number,
    ais.shipping_cost_separate as header_ank,
    SUM(
      COALESCE(popn.shipping_costs_proportional, 0) + 
      COALESCE(pops.shipping_costs_proportional, 0)
    ) as calculated_ank
  FROM app_inbound_shipments ais
  LEFT JOIN app_inbound_shipment_items isi ON isi.shipment_id = ais.id
  LEFT JOIN app_purchase_orders_positions_normal popn ON isi.po_item_normal_id = popn.id
  LEFT JOIN app_purchase_orders_positions_special pops ON isi.po_item_special_id = pops.id
  WHERE ais.shipping_cost_separate IS NOT NULL 
    AND ais.shipping_cost_separate > 0
  GROUP BY ais.id, ais.inbound_number, ais.shipping_cost_separate
)
SELECT 
  inbound_number,
  header_ank,
  calculated_ank,
  ABS(header_ank - calculated_ank) as difference
FROM shipment_ank
WHERE ABS(header_ank - calculated_ank) > 0.10
ORDER BY difference DESC;
