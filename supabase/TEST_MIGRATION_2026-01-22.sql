-- ============================================================================
-- TEST SUITE: Migration 2026-01-22 (Cost Tracking & Shipping Refactoring)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: Verify new columns exist
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 1: New columns exist' AS test_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'app_products' 
        AND column_name IN ('cost_price', 'acquisition_cost', 'bb_CostNet')
      HAVING COUNT(*) = 3
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result;

-- ----------------------------------------------------------------------------
-- TEST 2: Check bb_CostNet values for normal products
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 2: bb_CostNet for normal products' AS test_name,
  bb_sku,
  cost_price,
  acquisition_cost,
  bb_CostNet,
  (COALESCE(cost_price, 0) + COALESCE(acquisition_cost, 0)) AS expected,
  CASE 
    WHEN bb_CostNet = (COALESCE(cost_price, 0) + COALESCE(acquisition_cost, 0))
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result
FROM app_products
WHERE bb_is_bom = false
  AND (cost_price IS NOT NULL OR acquisition_cost IS NOT NULL)
LIMIT 5;

-- ----------------------------------------------------------------------------
-- TEST 3: Check if triggers exist
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 3: New triggers exist' AS test_name,
  COUNT(*) AS trigger_count,
  CASE 
    WHEN COUNT(*) >= 5 THEN '✅ PASS (found ' || COUNT(*) || ' triggers)'
    ELSE '❌ FAIL (expected >= 5, found ' || COUNT(*) || ')'
  END AS result
FROM pg_trigger
WHERE tgname IN (
  'trg_app_products_update_bb_costnet',
  'trg_bom_recipes_update_parent_cost',
  'trg_po_position_normal_update_cost_price',
  'trg_distribute_shipping_costs',
  'trg_inbound_item_qty_readonly',
  'trg_inbound_item_update_acquisition_cost'
);

-- ----------------------------------------------------------------------------
-- TEST 4: Check if old triggers are removed
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 4: Old triggers removed' AS test_name,
  COUNT(*) AS old_trigger_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL (still found: ' || string_agg(tgname, ', ') || ')'
  END AS result
FROM pg_trigger
WHERE tgname IN (
  'trg_po_recalc_shipping_on_status',
  'trg_au__allocate_shipping_costs_from_is',
  'trg_ai__allocate_shipping_costs_from_is',
  'trg_separate_invoice_restriction',
  'trg_bu__lock_sep_flag_after_cost'
);

-- ----------------------------------------------------------------------------
-- TEST 5: Check separate_invoice constraint
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 5: separate_invoice CHECK constraint' AS test_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'chk_separate_invoice_shipping_cost'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result;

-- ----------------------------------------------------------------------------
-- TEST 6: Verify data cleanup (separate_invoice + shipping_cost_net)
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 6: Data cleanup for separate_invoice' AS test_name,
  COUNT(*) AS violation_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL (' || COUNT(*) || ' orders violate constraint)'
  END AS result
FROM app_purchase_orders
WHERE separate_invoice_for_shipping_cost = true
  AND COALESCE(shipping_cost_net, 0) != 0;

-- ----------------------------------------------------------------------------
-- TEST 7: Check PO positions with cost data
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 7: PO positions with cost data' AS test_name,
  COUNT(*) AS positions_with_cost,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS (' || COUNT(*) || ' positions found)'
    ELSE '⚠️  WARNING (no positions with unit_price_net)'
  END AS result
FROM app_purchase_orders_positions_normal
WHERE unit_price_net IS NOT NULL;

-- ----------------------------------------------------------------------------
-- TEST 8: Check inbound shipment items
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 8: Inbound shipment items exist' AS test_name,
  COUNT(*) AS item_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS (' || COUNT(*) || ' items found)'
    ELSE '⚠️  WARNING (no inbound shipment items)'
  END AS result
FROM app_inbound_shipment_items;

-- ----------------------------------------------------------------------------
-- TEST 9: Check BOM products
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 9: BOM products' AS test_name,
  COUNT(*) AS bom_count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ PASS (' || COUNT(*) || ' BOMs found)'
    ELSE '⚠️  INFO (no BOM products in database)'
  END AS result
FROM app_products
WHERE bb_is_bom = true;

-- ----------------------------------------------------------------------------
-- TEST 10: Detailed BOM cost calculation check
-- ----------------------------------------------------------------------------
SELECT 
  'TEST 10: BOM cost calculation' AS test_name,
  parent.bb_sku AS bom_sku,
  parent.bb_CostNet AS calculated_cost,
  COALESCE(SUM(
    (COALESCE(comp.cost_price, 0) + COALESCE(comp.acquisition_cost, 0)) * br.quantity
  ), 0) AS expected_cost,
  CASE 
    WHEN parent.bb_CostNet = COALESCE(SUM(
      (COALESCE(comp.cost_price, 0) + COALESCE(comp.acquisition_cost, 0)) * br.quantity
    ), 0)
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END AS result
FROM app_products parent
JOIN bom_recipes br ON br.billbee_bom_id = parent.id
JOIN app_products comp ON comp.id = br.billbee_component_id
WHERE parent.bb_is_bom = true
GROUP BY parent.id, parent.bb_sku, parent.bb_CostNet
LIMIT 5;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT 
  '========================================' AS summary,
  'MIGRATION TEST SUMMARY' AS title,
  '========================================' AS line;
