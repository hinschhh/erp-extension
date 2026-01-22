-- Migration: Drop all legacy views
-- Reason: Views are no longer used in this project according to AGENTS.md policy
-- This migration removes all existing database views to simplify the architecture

-- Drop views in dependency order (dependent views first, then base views)
-- Note: Using CASCADE to handle any remaining dependencies

-- Drop duplicate view_orders (appears twice in schema)
DROP VIEW IF EXISTS "public"."view_orders" CASCADE;

-- Drop reporting/analysis views
DROP VIEW IF EXISTS "public"."rpt_products_inventory_grouped" CASCADE;
DROP VIEW IF EXISTS "public"."rpt_products_inventory_purchasing" CASCADE;
DROP VIEW IF EXISTS "public"."rpt_product_sales_with_bom" CASCADE;
DROP VIEW IF EXISTS "public"."rpt_po_deliveries_by_month_and_category" CASCADE;
DROP VIEW IF EXISTS "public"."rpt_inbound_items_monthly" CASCADE;
DROP VIEW IF EXISTS "public"."rpt_inbound_items_enriched" CASCADE;
DROP VIEW IF EXISTS "public"."rpt_app_products_profitability" CASCADE;

-- Drop export views
DROP VIEW IF EXISTS "public"."export_wareneingang_mtl" CASCADE;

-- Drop application views
DROP VIEW IF EXISTS "public"."view_products_antique" CASCADE;
DROP VIEW IF EXISTS "public"."view_products" CASCADE;
DROP VIEW IF EXISTS "public"."view_orders_open_delivery_backlog_monthly" CASCADE;
DROP VIEW IF EXISTS "public"."view_orders_open_backlog_monthly" CASCADE;
DROP VIEW IF EXISTS "public"."view_orders_monthly_revenue" CASCADE;
DROP VIEW IF EXISTS "public"."view_inventory_stock_level_comparison" CASCADE;
DROP VIEW IF EXISTS "public"."view_inventory_sessions_with_product_count" CASCADE;
DROP VIEW IF EXISTS "public"."view_bom_materialcosts" CASCADE;
DROP VIEW IF EXISTS "public"."app_purchase_orders_view" CASCADE;
DROP VIEW IF EXISTS "public"."app_purchase_orders_positions_special_view" CASCADE;
DROP VIEW IF EXISTS "public"."app_purchase_orders_positions_normal_view" CASCADE;
DROP VIEW IF EXISTS "public"."app_orders_with_customers_view" CASCADE;
DROP VIEW IF EXISTS "public"."view_order_items_active_with_attributes_and_products_view" CASCADE;
DROP VIEW IF EXISTS "public"."app_order_items_active_with_attributes_and_products_view" CASCADE;
DROP VIEW IF EXISTS "public"."app_component_sales_last_3_months" CASCADE;

-- Verification query (optional - can be run manually after migration)
-- SELECT schemaname, viewname 
-- FROM pg_views 
-- WHERE schemaname = 'public' 
-- AND viewname NOT LIKE 'pg_%';
