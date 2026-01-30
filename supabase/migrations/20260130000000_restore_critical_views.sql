-- Rollback Migration: Restore critical views that were accidentally deleted
-- This restores only the views that are actively used in the application
-- Date: 2026-01-30

-- ============================================================================
-- 1. Restore app_component_sales_last_3_months
--    Required by: rpt_products_inventory_purchasing
-- ============================================================================

CREATE OR REPLACE VIEW "public"."app_component_sales_last_3_months" AS
 WITH "order_items_3m" AS (
         SELECT "oi"."id",
            "oi"."fk_app_orders_id",
            "oi"."fk_app_products_id",
            "oi"."bb_Quantity",
            "o"."created_at"
           FROM ("public"."app_order_items" "oi"
             JOIN "public"."app_orders" "o" ON (("o"."id" = "oi"."fk_app_orders_id")))
          WHERE (("o"."ordered_at" >= ("now"() - '3 mons'::interval)) AND (COALESCE("oi"."bb_IsCoupon", false) = false))
        ), "direct_component_sales" AS (
         SELECT "oi"."fk_app_products_id" AS "component_id",
            "sum"(COALESCE(("oi"."bb_Quantity")::integer, 0)) AS "qty_component_sold"
           FROM ("order_items_3m" "oi"
             LEFT JOIN "public"."bom_recipes" "br" ON (("br"."billbee_bom_id" = "oi"."fk_app_products_id")))
          WHERE (("br"."billbee_bom_id" IS NULL) AND ("oi"."fk_app_products_id" IS NOT NULL))
          GROUP BY "oi"."fk_app_products_id"
        ), "bom_component_sales" AS (
         SELECT "br"."billbee_component_id" AS "component_id",
            "sum"(((COALESCE(("oi"."bb_Quantity")::integer, 0))::numeric * "br"."quantity")) AS "qty_component_sold"
           FROM ("order_items_3m" "oi"
             JOIN "public"."bom_recipes" "br" ON (("br"."billbee_bom_id" = "oi"."fk_app_products_id")))
          GROUP BY "br"."billbee_component_id"
        ), "all_component_sales" AS (
         SELECT "direct_component_sales"."component_id",
            "direct_component_sales"."qty_component_sold"
           FROM "direct_component_sales"
        UNION ALL
         SELECT "bom_component_sales"."component_id",
            "bom_component_sales"."qty_component_sold"
           FROM "bom_component_sales"
        )
 SELECT "cs"."component_id" AS "fk_app_products_id",
    "sum"("cs"."qty_component_sold") AS "qty_sold_last_3_months"
   FROM "all_component_sales" "cs"
  GROUP BY "cs"."component_id";

ALTER TABLE "public"."app_component_sales_last_3_months" OWNER TO "postgres";

GRANT ALL ON TABLE "public"."app_component_sales_last_3_months" TO "anon";
GRANT ALL ON TABLE "public"."app_component_sales_last_3_months" TO "authenticated";
GRANT ALL ON TABLE "public"."app_component_sales_last_3_months" TO "service_role";

COMMENT ON VIEW "public"."app_component_sales_last_3_months" IS 
'Aggregates sales quantities for the last 3 months per product/component.
Includes both direct product sales and component usage in BOMs.
Required by rpt_products_inventory_purchasing view.';

-- ============================================================================
-- 2. Restore rpt_products_inventory_purchasing
--    Used by: src/app/(authenticated)/einkauf/bestellvorschlaege/page.tsx
-- ============================================================================

CREATE OR REPLACE VIEW "public"."rpt_products_inventory_purchasing" AS
 WITH "reserved_bom_by_component" AS (
         SELECT "r"."billbee_component_id",
            "sum"((("c_1"."committed_qty")::numeric * "r"."quantity")) AS "reserved_bom"
           FROM ("public"."bom_recipes" "r"
             JOIN "public"."stg_billbee_stock_committed" "c_1" ON (("c_1"."billbee_product_id" = "r"."billbee_bom_id")))
          GROUP BY "r"."billbee_component_id"
        ), "po_received_normal" AS (
         SELECT "isi"."po_item_normal_id" AS "po_item_id",
            "sum"("isi"."quantity_delivered") AS "qty_received"
           FROM "public"."app_inbound_shipment_items" "isi"
          WHERE ("isi"."po_item_normal_id" IS NOT NULL)
          GROUP BY "isi"."po_item_normal_id"
        ), "po_open_normal" AS (
         SELECT "p"."billbee_product_id",
            GREATEST((("p"."qty_ordered")::numeric - COALESCE("r"."qty_received", (0)::numeric)), (0)::numeric) AS "qty_open",
            "p"."po_item_status"
           FROM ("public"."app_purchase_orders_positions_normal" "p"
             LEFT JOIN "po_received_normal" "r" ON (("r"."po_item_id" = "p"."id")))
          WHERE ("p"."po_item_status" <> ALL (ARRAY['delivered'::"public"."po_item_status", 'cancelled'::"public"."po_item_status", 'paused'::"public"."po_item_status"]))
        ), "po_agg" AS (
         SELECT "po_open_normal"."billbee_product_id",
            "sum"("po_open_normal"."qty_open") AS "qty_on_order"
           FROM "po_open_normal"
          GROUP BY "po_open_normal"."billbee_product_id"
        )
 SELECT "ap"."id" AS "product_id",
    "ap"."bb_sku" AS "sku",
    "ap"."bb_name" AS "name",
        CASE
            WHEN ("ap"."bb_category1" = ANY (ARRAY['Armatur'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Naturstein'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text"])) THEN "ap"."bb_category1"
            WHEN ("ap"."bb_category2" = ANY (ARRAY['Armatur'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Naturstein'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text"])) THEN "ap"."bb_category2"
            WHEN ("ap"."bb_category3" = ANY (ARRAY['Armatur'::"text", 'Elektrogeräte'::"text", 'Küche'::"text", 'Naturstein'::"text", 'Schrank'::"text", 'Spiegel'::"text", 'TV'::"text", 'TV-Zubehör'::"text", 'WB'::"text", 'Wohnmöbel'::"text", 'WT'::"text", 'Zubehör'::"text"])) THEN "ap"."bb_category3"
            ELSE NULL::"text"
        END AS "bb_category",
    "ap"."inventory_cagtegory",
    "ap"."fk_bb_supplier" AS "supplier",
    ((COALESCE("ap"."bb_category1", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text") OR (COALESCE("ap"."bb_category2", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text") OR (COALESCE("ap"."bb_category3", ''::"text") ~~* '%On Demand - Externe Bestellung/Produktion erforderlich%'::"text")) AS "on_demand",
    COALESCE("s"."stock_available", 0) AS "stock_free",
    COALESCE("c"."committed_qty", 0) AS "stock_reserved_direct",
    COALESCE("rb"."reserved_bom", (0)::numeric) AS "stock_reserved_bom",
    COALESCE("s"."stock_unavailable", 0) AS "stock_unavailable",
    ((((COALESCE("s"."stock_available", 0))::numeric + (COALESCE("c"."committed_qty", 0))::numeric) + COALESCE("rb"."reserved_bom", (0)::numeric)) + (COALESCE("s"."stock_unavailable", 0))::numeric) AS "stock_physical",
    COALESCE("po"."qty_on_order", (0)::numeric) AS "stock_on_order",
    COALESCE("ap"."bb_net_purchase_price", (0)::numeric) AS "unit_cost_net",
    ((((((COALESCE("s"."stock_available", 0))::numeric + (COALESCE("c"."committed_qty", 0))::numeric) + COALESCE("rb"."reserved_bom", (0)::numeric)) + (COALESCE("s"."stock_unavailable", 0))::numeric) * COALESCE("ap"."bb_net_purchase_price", (0)::numeric)))::numeric(18,2) AS "inventory_value",
    (0)::numeric AS "counted_qty",
    NULL::timestamp with time zone AS "counted_at",
    ("cs3"."qty_sold_last_3_months")::integer AS "consumption_3m_rolling",
    GREATEST(COALESCE("s"."pulled_at", ('1970-01-01 00:00:00'::timestamp without time zone AT TIME ZONE 'UTC'::"text")), COALESCE("c"."pulled_at", ('1970-01-01 00:00:00'::timestamp without time zone AT TIME ZONE 'UTC'::"text"))) AS "updated_at"
   FROM ((((("public"."app_products" "ap"
     LEFT JOIN "public"."stg_billbee_stock" "s" ON (("s"."billbee_product_id" = "ap"."id")))
     LEFT JOIN "public"."stg_billbee_stock_committed" "c" ON (("c"."billbee_product_id" = "ap"."id")))
     LEFT JOIN "reserved_bom_by_component" "rb" ON (("rb"."billbee_component_id" = "ap"."id")))
     LEFT JOIN "po_agg" "po" ON (("po"."billbee_product_id" = "ap"."id")))
     LEFT JOIN "public"."app_component_sales_last_3_months" "cs3" ON (("cs3"."fk_app_products_id" = "ap"."id")))
  WHERE ((COALESCE("ap"."bb_is_bom", false) = false) AND (COALESCE("ap"."bb_is_active", true) = true) AND (NOT ((COALESCE("ap"."bb_category1", ''::"text") ~~* '%Antike Ware%'::"text") OR (COALESCE("ap"."bb_category2", ''::"text") ~~* '%Antike Ware%'::"text") OR (COALESCE("ap"."bb_category3", ''::"text") ~~* '%Antike Ware%'::"text"))));

ALTER TABLE "public"."rpt_products_inventory_purchasing" OWNER TO "postgres";

GRANT ALL ON TABLE "public"."rpt_products_inventory_purchasing" TO "anon";
GRANT ALL ON TABLE "public"."rpt_products_inventory_purchasing" TO "authenticated";
GRANT ALL ON TABLE "public"."rpt_products_inventory_purchasing" TO "service_role";

COMMENT ON VIEW "public"."rpt_products_inventory_purchasing" IS 
'Purchase suggestions report view.
Aggregates inventory levels, reservations, open POs, and 3-month consumption.
Used by: src/app/(authenticated)/einkauf/bestellvorschlaege/page.tsx';

-- ============================================================================
-- End of restoration
-- ============================================================================
