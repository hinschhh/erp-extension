-- Migration: Migrate bb_costnet to cost_price and make bb_costnet computed
-- 
-- This migration:
-- 1. Migrates existing bb_costnet values to cost_price (pure purchase price)
-- 2. Drops bb_costnet column  
-- 3. Recreates bb_costnet as computed column: cost_price + acquisition_cost
--
-- Context: bb_costnet previously held total costs, now we separate:
-- - cost_price: pure purchase price (goods value)  
-- - acquisition_cost: shipping/handling cost per unit
-- - bb_costnet: computed total cost (cost_price + acquisition_cost)

BEGIN;

-- Step 1: Migrate existing bb_costnet values to cost_price 
-- Only update where cost_price is NULL/0 and bb_costnet has a value
UPDATE app_products 
SET cost_price = bb_costnet
WHERE bb_costnet IS NOT NULL 
  AND bb_costnet > 0
  AND (cost_price IS NULL OR cost_price = 0);

-- Step 2: Set acquisition_cost to 0 for products where it's NULL
-- This ensures bb_costnet computation doesn't result in NULL
UPDATE app_products 
SET acquisition_cost = 0
WHERE acquisition_cost IS NULL;

-- Step 3: Drop the existing bb_costnet column
ALTER TABLE app_products DROP COLUMN bb_costnet;

-- Step 4: Add bb_costnet as computed column
-- Formula: cost_price + acquisition_cost
-- COALESCE ensures we handle NULL values gracefully
ALTER TABLE app_products 
ADD COLUMN bb_costnet DECIMAL(10,2) GENERATED ALWAYS AS (
  COALESCE(cost_price, 0) + COALESCE(acquisition_cost, 0)
) STORED;

-- Step 5: Create index on computed column for performance
CREATE INDEX idx_app_products_bb_costnet ON app_products (bb_costnet);

-- Step 6: Update table comments
COMMENT ON COLUMN app_products.cost_price IS 'Pure purchase price (goods value without shipping/handling)';
COMMENT ON COLUMN app_products.acquisition_cost IS 'Shipping and handling cost per unit';
COMMENT ON COLUMN app_products.bb_costnet IS 'Computed total cost: cost_price + acquisition_cost';

-- Step 7: Refresh statistics for query planner
ANALYZE app_products;

COMMIT;

-- Verification query (run after migration):
-- SELECT 
--   id, bb_sku, 
--   cost_price, acquisition_cost, bb_costnet,
--   (cost_price + acquisition_cost) AS computed_check
-- FROM app_products 
-- WHERE cost_price IS NOT NULL 
-- LIMIT 10;