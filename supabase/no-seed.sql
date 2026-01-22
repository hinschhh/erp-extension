-- =====================================================
-- Seed File für ERP-Extension Datenbank
-- =====================================================
-- Dieses Seed-Script erstellt Testdaten für die wichtigsten Tabellen
-- gemäß dem Domain-Driven Design und den Regeln aus AGENTS.md
--
-- WICHTIG: Diese Daten sind NUR für Development/Testing!
-- =====================================================

BEGIN;

-- =====================================================
-- 1) LIEFERANTEN (app_suppliers)
-- =====================================================

INSERT INTO public.app_suppliers (
  id,
  short_code,
  email,
  phone,
  website,
  default_currency,
  payment_terms_days,
  default_incoterm,
  default_leadtime_days,
  vat_number,
  tax_country,
  address_line1,
  postal_code,
  city,
  country,
  notes,
  active,
  default_order_channel,
  default_payment_method,
  separate_invoice_for_shipping_cost,
  account_number
) VALUES 
  (
    'MusterLieferant GmbH',
    'ML',
    'info@musterlieferant.de',
    '+49 123 456789',
    'https://www.musterlieferant.de',
    'EUR',
    30,
    'EXW',
    14,
    'DE123456789',
    'DE',
    'Musterstraße 123',
    '12345',
    'Berlin',
    'Deutschland',
    'Hauptlieferant für Badmöbel',
    true,
    'E-Mail',
    'Überweisung',
    false,
    70001
  ),
  (
    'China Furniture Ltd',
    'CFL',
    'sales@chinafurniture.cn',
    '+86 21 12345678',
    'https://www.chinafurniture.cn',
    'EUR',
    60,
    'FOB',
    45,
    NULL,
    'CN',
    'Shanghai Industrial Park',
    '200000',
    'Shanghai',
    'China',
    'Großlieferant für Möbel und Naturstein',
    true,
    'E-Mail',
    'Vorkasse',
    true,
    70002
  ),
  (
    'Naturstein Meyer',
    'NSM',
    'kontakt@naturstein-meyer.de',
    '+49 89 9876543',
    'https://www.naturstein-meyer.de',
    'EUR',
    14,
    'EXW',
    7,
    'DE987654321',
    'DE',
    'Steinbruchweg 5',
    '80331',
    'München',
    'Deutschland',
    'Spezialist für Naturstein und Platten',
    true,
    'Telefon',
    'Überweisung',
    false,
    70003
  ),
  (
    'Elektro-Schmidt AG',
    'ES',
    'bestellung@elektro-schmidt.de',
    '+49 40 5554433',
    'https://www.elektro-schmidt.de',
    'EUR',
    30,
    'DDP',
    3,
    'DE112233445',
    'DE',
    'Industriestraße 42',
    '20095',
    'Hamburg',
    'Deutschland',
    'Lieferant für Elektrogeräte und Armaturen',
    true,
    'Webseite',
    'Lastschrift',
    false,
    70004
  );

-- =====================================================
-- 2) PRODUKTE (app_products)
-- =====================================================

INSERT INTO public.app_products (
  id,
  bb_sku,
  bb_name,
  bb_is_bom,
  bb_is_active,
  bb_category1,
  bb_category2,
  bb_category3,
  bb_net_purchase_price,
  supplier_sku,
  purchase_details,
  fk_bb_supplier,
  inventory_cagtegory,
  "bb_Price",
  "bb_Net"
) VALUES 
  -- Badmöbel
  (100001, 'BAD-WT-001', 'Waschtisch Modern 80cm', false, true, 'WT', 'Badezimmer-Set', NULL, 180.00, 'WT-MOD-80', 'Lieferzeit: 2 Wochen', 'MusterLieferant GmbH', 'Möbel', 450.00, 378.15),
  (100002, 'BAD-SP-001', 'LED-Spiegel Deluxe 100x70cm', false, true, 'Spiegel', NULL, NULL, 120.00, 'SP-LED-100', 'Mit Beleuchtung', 'MusterLieferant GmbH', 'Möbel', 320.00, 268.91),
  (100003, 'BAD-ARM-001', 'Waschtischarmatur Chrom', false, true, 'Armatur', NULL, NULL, 45.00, 'ARM-CHR-001', NULL, 'Elektro-Schmidt AG', 'Handelswaren', 125.00, 105.04),
  
  -- Küchenmöbel
  (100004, 'KUE-001', 'Küchenzeile Premium 270cm', false, true, 'Küche', NULL, NULL, 850.00, 'KUE-PREM-270', 'Ohne Elektrogeräte', 'China Furniture Ltd', 'Möbel', 2450.00, 2058.82),
  (100005, 'KUE-EG-001', 'Einbau-Backofen Edelstahl', false, true, 'Elektrogeräte', 'Küche', NULL, 320.00, 'BO-ES-60', 'A++ Energieeffizienz', 'Elektro-Schmidt AG', 'Handelswaren', 799.00, 671.43),
  
  -- Wohnmöbel
  (100006, 'WM-TV-001', 'TV-Lowboard Eiche 180cm', false, true, 'Wohnmöbel', 'TV', NULL, 210.00, 'TV-LOW-EI-180', NULL, 'China Furniture Ltd', 'Möbel', 599.00, 503.36),
  (100007, 'WM-SCH-001', 'Wohnzimmerschrank modern', false, true, 'Wohnmöbel', 'Schrank', NULL, 380.00, 'SCH-WZ-MOD', 'In 3 Farben verfügbar', 'MusterLieferant GmbH', 'Möbel', 1099.00, 923.53),
  
  -- Naturstein / Komponenten
  (100008, 'NS-PL-001', 'Granitplatte poliert 120x60cm', false, true, 'Naturstein', 'Platte', NULL, 95.00, 'GRAN-POL-120', 'Stärke 2cm', 'Naturstein Meyer', 'Naturstein', 289.00, 242.86),
  (100009, 'NS-ROH-001', 'Marmor-Rohling weiß', false, true, 'Naturstein', 'Rohling', NULL, 65.00, 'MARMO-WEISS', 'Für Sonderanfertigungen', 'Naturstein Meyer', 'Naturstein', 195.00, 163.87),
  
  -- Bauteile
  (100010, 'WB-001', 'Waschtischbecken Keramik weiß', false, true, 'WB', NULL, NULL, 35.00, 'WB-KER-WEISS', 'Standard Einbaubecken', 'MusterLieferant GmbH', 'Bauteile', 89.00, 74.79),
  
  -- Service-Artikel
  (100011, 'SRV-001', 'Montageservice vor Ort', false, true, 'Service', NULL, NULL, 0.00, NULL, 'Keine Materialkosten', NULL, NULL, 150.00, 126.05),
  
  -- Sonderartikel (On Demand)
  (100012, 'SOND-WT-001', 'Waschtisch Sonderanfertigung', false, true, 'WT', 'On Demand - Externe Bestellung/Produktion erforderlich', NULL, 0.00, NULL, 'Preis nach Angebot', 'MusterLieferant GmbH', 'Möbel', 0.00, 0.00);

-- =====================================================
-- 3) KUNDEN (app_customers)
-- =====================================================

INSERT INTO public.app_customers (
  id,
  "bb_Name",
  "bb_Email",
  "bb_Tel1"
) VALUES 
  (200001, 'Müller Immobilien GmbH', 'info@mueller-immo.de', '+49 30 12345678'),
  (200002, 'Schmidt Bauträger AG', 'kontakt@schmidt-bau.de', '+49 89 87654321'),
  (200003, 'Weber Privatauftrag', 'h.weber@gmail.com', '+49 40 55566677'),
  (200004, 'Meier GmbH & Co. KG', 'bestellung@meier-gmbh.de', '+49 221 9988776');

-- =====================================================
-- 4) LAGERORTE (app_stock_locations)
-- =====================================================

-- Zuerst die Stocks anlegen
INSERT INTO public.app_stocks (
  id,
  "bb_Name",
  "bb_Description",
  "bb_isDefault"
) VALUES 
  (1, 'Hauptlager', 'Hauptlager Berlin', true),
  (2, 'Auslieferung', 'Auslieferungslager München', false);

-- Dann die Locations
INSERT INTO public.app_stock_locations (
  id,
  name,
  fk_app_stocks
) VALUES 
  (1, 'Hauptlager Berlin', 1),
  (2, 'Auslieferungslager München', 2),
  (3, 'Kommissionierzone', 1),
  (4, 'Sperrbestand / Qualitätsprüfung', 1);

-- =====================================================
-- 5) LAGERBESTÄNDE (app_stock_levels)
-- =====================================================

INSERT INTO public.app_stock_levels (
  fk_stocks,
  "bb_StockCode",
  fk_products,
  "bb_StockCurrent",
  "bb_UnfullfilledAmount",
  qty_unsellable,
  upsert_match_id
) VALUES 
  -- Hauptlager
  (1, 'MAIN-01', 100001, 12, 2, 0, 'MAIN-01-100001'),
  (1, 'MAIN-01', 100002, 8, 1, 0, 'MAIN-01-100002'),
  (1, 'MAIN-01', 100003, 25, 3, 0, 'MAIN-01-100003'),
  (1, 'MAIN-01', 100004, 4, 1, 0, 'MAIN-01-100004'),
  (1, 'MAIN-01', 100005, 6, 2, 0, 'MAIN-01-100005'),
  (1, 'MAIN-01', 100006, 15, 4, 1, 'MAIN-01-100006'),
  (1, 'MAIN-01', 100007, 7, 1, 0, 'MAIN-01-100007'),
  (1, 'MAIN-01', 100008, 20, 5, 0, 'MAIN-01-100008'),
  (1, 'MAIN-01', 100009, 18, 3, 2, 'MAIN-01-100009'),
  (1, 'MAIN-01', 100010, 30, 8, 0, 'MAIN-01-100010'),
  
  -- Auslieferungslager
  (2, 'SHIP-02', 100001, 3, 1, 0, 'SHIP-02-100001'),
  (2, 'SHIP-02', 100006, 5, 2, 0, 'SHIP-02-100006');

-- =====================================================
-- 6) KUNDENAUFTRÄGE (app_orders)
-- =====================================================

INSERT INTO public.app_orders (
  id,
  "bb_OrderNumber",
  "bb_CreatedAt",
  "bb_State",
  "bb_VatMode",
  "bb_InvoiceNumber",
  "bb_InvoiceDate",
  fk_app_customers_id,
  ordered_at,
  confirmed_at
) VALUES 
  (300001, 'AB-2026-0001', '2026-01-10 10:30:00+00', 2, 1, 'RE-2026-0001', '2026-01-10', 200001, '2026-01-10', '2026-01-11'),
  (300002, 'AB-2026-0002', '2026-01-12 14:15:00+00', 1, 1, NULL, NULL, 200002, '2026-01-12', NULL),
  (300003, 'AB-2026-0003', '2026-01-15 09:00:00+00', 14, 1, NULL, NULL, 200003, NULL, NULL),
  (300004, 'AB-2026-0004', '2026-01-16 11:20:00+00', 2, 1, 'RE-2026-0004', '2026-01-16', 200004, '2026-01-16', '2026-01-16');

-- =====================================================
-- 7) KUNDENAUFTRAGSPOSITIONEN (app_order_items)
-- =====================================================

INSERT INTO public.app_order_items (
  fk_app_orders_id,
  fk_app_products_id,
  "bb_Quantity",
  "bb_TotalPrice",
  "bb_TaxAmount",
  "bb_IsCoupon"
) VALUES 
  -- Auftrag 1 (bestätigt)
  (300001, 100001, 2, 900.00, 171.00, false),
  (300001, 100002, 1, 320.00, 60.80, false),
  (300001, 100003, 2, 250.00, 47.50, false),
  
  -- Auftrag 2 (bestellt)
  (300002, 100004, 1, 2450.00, 465.50, false),
  (300002, 100005, 1, 799.00, 151.81, false),
  
  -- Auftrag 3 (Angebot)
  (300003, 100006, 1, 599.00, 113.81, false),
  (300003, 100007, 1, 1099.00, 208.81, false),
  (300003, 100012, 1, 0.00, 0.00, false), -- Sonderartikel, Preis folgt
  
  -- Auftrag 4 (bestätigt)
  (300004, 100008, 5, 1445.00, 274.55, false),
  (300004, 100009, 3, 585.00, 111.15, false);

-- =====================================================
-- 8) BESTELLUNGEN / PURCHASE ORDERS (app_purchase_orders)
-- =====================================================

INSERT INTO public.app_purchase_orders (
  id,
  order_number,
  status,
  supplier,
  ordered_at,
  confirmed_at,
  dol_planned_at,
  shipping_cost_net,
  notes,
  separate_invoice_for_shipping_cost
) VALUES 
  -- Bestellung 1: Bereits bestellt und bestätigt
  (
    '00000000-0000-0000-0000-000000000001',
    'PO-2026-0001',
    'confirmed',
    'MusterLieferant GmbH',
    '2025-12-20',
    '2025-12-22',
    '2026-01-20',
    35.00,
    'Erste Testbestellung',
    false
  ),
  
  -- Bestellung 2: In Produktion, teilweise geliefert
  (
    '00000000-0000-0000-0000-000000000002',
    'PO-2026-0002',
    'in_production',
    'China Furniture Ltd',
    '2025-12-15',
    '2025-12-18',
    '2026-02-10',
    150.00,
    'Container-Lieferung aus China',
    true
  ),
  
  -- Bestellung 3: Entwurf (Draft)
  (
    '00000000-0000-0000-0000-000000000003',
    'PO-2026-0003',
    'draft',
    'Naturstein Meyer',
    NULL,
    NULL,
    NULL,
    0.00,
    'Für Projekt Weber',
    false
  ),
  
  -- Bestellung 4: Bestellt, noch nicht bestätigt
  (
    '00000000-0000-0000-0000-000000000004',
    'PO-2026-0004',
    'ordered',
    'Elektro-Schmidt AG',
    '2026-01-10',
    NULL,
    '2026-01-25',
    12.50,
    NULL,
    false
  );

-- =====================================================
-- 9) BESTELLPOSITIONEN NORMAL (app_purchase_orders_positions_normal)
-- =====================================================

INSERT INTO public.app_purchase_orders_positions_normal (
  id,
  order_id,
  billbee_product_id,
  qty_ordered,
  unit_price_net,
  po_item_status,
  confirmed_at,
  dol_planned_at,
  internal_notes,
  fk_app_orders_id,
  fk_app_order_items_id
) VALUES 
  -- PO-2026-0001 Positionen
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    100001,
    5,
    180.00,
    'in_production',
    '2025-12-22',
    '2026-01-20',
    'Waschtische für Lagerbestand',
    NULL,
    NULL
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    100002,
    3,
    120.00,
    'in_production',
    '2025-12-22',
    '2026-01-20',
    NULL,
    NULL,
    NULL
  ),
  
  -- PO-2026-0002 Positionen
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    100004,
    10,
    850.00,
    'partially_delivered',
    '2025-12-18',
    '2026-02-10',
    'Container-Ware',
    NULL,
    NULL
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000002',
    100006,
    20,
    210.00,
    'in_production',
    '2025-12-18',
    '2026-02-10',
    NULL,
    NULL,
    NULL
  ),
  
  -- PO-2026-0003 Positionen (Draft)
  (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000003',
    100008,
    10,
    95.00,
    'draft',
    NULL,
    NULL,
    'Für Projekt Weber',
    300003,
    NULL
  ),
  (
    '10000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000003',
    100009,
    5,
    65.00,
    'draft',
    NULL,
    NULL,
    'Marmor-Rohlinge',
    300003,
    NULL
  ),
  
  -- PO-2026-0004 Positionen
  (
    '10000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000004',
    100003,
    50,
    45.00,
    'ordered',
    NULL,
    '2026-01-25',
    'Großbestellung Armaturen',
    NULL,
    NULL
  ),
  (
    '10000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000004',
    100005,
    8,
    320.00,
    'ordered',
    NULL,
    '2026-01-25',
    NULL,
    300002,
    NULL
  );

-- =====================================================
-- 10) BESTELLPOSITIONEN SONDER (app_purchase_orders_positions_special)
-- =====================================================

INSERT INTO public.app_purchase_orders_positions_special (
  id,
  order_id,
  billbee_product_id,
  base_model_billbee_product_id,
  supplier_sku,
  details_override,
  qty_ordered,
  unit_price_net,
  po_item_status,
  sketch_needed,
  sketch_confirmed_at,
  confirmed_at,
  dol_planned_at,
  internal_notes,
  fk_app_orders_id,
  fk_app_order_items_id
) VALUES 
  -- Sonderanfertigung für Auftrag 3
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    100012,
    100001,
    'WT-SONDER-001',
    'Waschtisch mit Sondermaß 95cm, Farbe Anthrazit, Griffmulde rechts',
    1,
    250.00,
    'draft',
    true,
    NULL,
    NULL,
    NULL,
    'Sonderanfertigung nach Kundenwunsch',
    300003,
    NULL
  );

-- =====================================================
-- 11) WARENEINGÄNGE / INBOUND SHIPMENTS (app_inbound_shipments)
-- =====================================================

INSERT INTO public.app_inbound_shipments (
  id,
  inbound_number,
  status,
  delivered_at,
  shipping_cost_separate,
  note
) VALUES 
  -- Wareneingang 1: Teillieferung zu PO-2026-0002
  (
    '30000000-0000-0000-0000-000000000001',
    'WE-2026-0001',
    'posted',
    '2026-01-15 08:30:00+00',
    75.00,
    'Erste Teillieferung Container'
  );

-- =====================================================
-- 12) WARENEINGANGS-POSITIONEN (app_inbound_shipment_items)
-- =====================================================

INSERT INTO public.app_inbound_shipment_items (
  id,
  shipment_id,
  order_id,
  po_item_normal_id,
  po_item_special_id,
  quantity_delivered,
  item_status,
  shipping_costs_proportional
) VALUES 
  -- Teillieferung: 5 von 10 Küchenzeilen
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003',
    NULL,
    5,
    'posted',
    75.00
  );

-- =====================================================
-- 13) INVENTUR-SESSIONS (app_inventory_sessions)
-- =====================================================

INSERT INTO public.app_inventory_sessions (
  id,
  name,
  status,
  fk_stocks,
  note,
  counting_started_at
) VALUES 
  (1, 'Jahresinventur 2026', 'counting', 1, 'Laufende Inventur zum Jahresbeginn', '2026-01-17 08:00:00+00');

-- =====================================================
-- 14) BOM / STÜCKLISTEN (bom_recipes)
-- =====================================================
-- Beispiel: Ein Badezimmer-Set besteht aus mehreren Komponenten

INSERT INTO public.bom_recipes (
  billbee_bom_id,
  billbee_component_id,
  quantity,
  notes
) VALUES 
  -- Beispiel-Set (noch nicht als Produkt angelegt)
  -- Waschtisch-Set = Waschtisch + Becken + Armatur
  (100001, 100010, 1, 'Becken gehört zum Waschtisch-Set'),
  (100001, 100003, 1, 'Standard-Armatur im Set');

-- =====================================================
-- 15) AUDIT SETUP & SEQUENCES
-- =====================================================
-- Initialisierung für Audit-System (optional)

INSERT INTO public.audit_logs (
  user_id,
  action,
  entity_name,
  entity_id,
  old_values,
  new_values,
  batch_id
) VALUES 
  ('00000000-0000-0000-0000-000000000000', 'INSERT', 'seed_data', 'initial', NULL, '{"comment": "Initial seed data loaded"}', gen_random_uuid());

-- Sequences für auto-increment IDs aktualisieren
SELECT setval('app_stocks_id_seq', 2, true);
SELECT setval('app_stock_locations_id_seq', 4, true);
SELECT setval('app_stock_levels_id_seq', (SELECT COALESCE(MAX(id), 0) FROM app_stock_levels), true);
SELECT setval('app_customers_id_seq', 200004, true);
SELECT setval('app_orders_id_seq', 300004, true);
SELECT setval('app_order_items_id_seq', (SELECT COALESCE(MAX(id), 0) FROM app_order_items), true);
SELECT setval('inventory_sessions_id_seq', 1, true);

COMMIT;

-- =====================================================
-- VERIFIKATION
-- =====================================================
-- Nach dem Seed-Import sollten folgende Counts sichtbar sein:

DO $$
BEGIN
  RAISE NOTICE '=== SEED DATA VERIFICATION ===';
  RAISE NOTICE 'Lieferanten: %', (SELECT COUNT(*) FROM app_suppliers);
  RAISE NOTICE 'Produkte: %', (SELECT COUNT(*) FROM app_products);
  RAISE NOTICE 'Kunden: %', (SELECT COUNT(*) FROM app_customers);
  RAISE NOTICE 'Bestellungen (PO): %', (SELECT COUNT(*) FROM app_purchase_orders);
  RAISE NOTICE 'PO-Positionen Normal: %', (SELECT COUNT(*) FROM app_purchase_orders_positions_normal);
  RAISE NOTICE 'PO-Positionen Special: %', (SELECT COUNT(*) FROM app_purchase_orders_positions_special);
  RAISE NOTICE 'Kundenaufträge: %', (SELECT COUNT(*) FROM app_orders);
  RAISE NOTICE 'Wareneingänge: %', (SELECT COUNT(*) FROM app_inbound_shipments);
  RAISE NOTICE '=============================';
END $$;
