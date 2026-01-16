-- ========================================
-- QUICK FIX SCRIPT
-- ========================================
-- Zweck: Behebung der erkannten Inkonsistenzen
-- WARNUNG: Vor Ausführung Backup erstellen!
-- ========================================

-- ============================================
-- 1. VERSANDKOSTEN NACHTRÄGLICH VERTEILEN
-- ============================================

-- 1.1 POs mit Versandkosten ohne Shipment-Zuordnung
-- → Wenn Items existieren, Versandkosten auf Shipment übertragen
DO $$
DECLARE
    v_po RECORD;
    v_first_shipment_id uuid;
BEGIN
    FOR v_po IN 
        SELECT DISTINCT
            po.id as po_id,
            po.order_number,
            po.shipping_cost_net
        FROM app_purchase_orders po
        WHERE po.shipping_cost_net > 0
            AND NOT EXISTS (
                SELECT 1 
                FROM app_inbound_shipment_items si 
                JOIN app_inbound_shipments s ON s.id = si.shipment_id
                WHERE si.order_id = po.id 
                    AND s.shipping_cost_separate IS NOT NULL
                    AND s.shipping_cost_separate > 0
            )
            AND EXISTS (
                SELECT 1 
                FROM app_inbound_shipment_items si 
                WHERE si.order_id = po.id
            )
    LOOP
        -- Hole erste Shipment-ID für diese PO
        SELECT DISTINCT i.shipment_id
        INTO v_first_shipment_id
        FROM app_inbound_shipment_items i
        WHERE i.order_id = v_po.po_id
        ORDER BY i.created_at
        LIMIT 1;
        
        IF v_first_shipment_id IS NOT NULL THEN
            -- Setze Versandkosten auf Shipment
            UPDATE app_inbound_shipments
            SET shipping_cost_separate = v_po.shipping_cost_net
            WHERE id = v_first_shipment_id
                AND (shipping_cost_separate IS NULL OR shipping_cost_separate = 0);
            
            RAISE NOTICE 'Fixed PO %: Set shipping % on shipment %', 
                v_po.order_number, v_po.shipping_cost_net, v_first_shipment_id;
        END IF;
    END LOOP;
END $$;


-- 1.2 Flag "separate_invoice_for_shipping_cost" korrigieren
UPDATE app_purchase_orders
SET separate_invoice_for_shipping_cost = true
WHERE shipping_cost_net > 0
    AND NOT separate_invoice_for_shipping_cost;

-- Umgekehrt: Flag entfernen wenn keine Kosten
UPDATE app_purchase_orders
SET separate_invoice_for_shipping_cost = false
WHERE (shipping_cost_net IS NULL OR shipping_cost_net = 0)
    AND separate_invoice_for_shipping_cost;


-- ============================================
-- 2. STATUS KORRIGIEREN
-- ============================================

-- 2.1 Shipment-Items mit falschem Status korrigieren
-- → Items sollten Status des Shipments haben
UPDATE app_inbound_shipment_items i
SET item_status = s.status
FROM app_inbound_shipments s
WHERE i.shipment_id = s.id
    AND i.item_status IS DISTINCT FROM s.status;


-- 2.2 PO-Positionen mit falschem Status basierend auf Lieferungen
DO $$
DECLARE
    v_pos RECORD;
    v_qty_posted numeric;
    v_new_status text;
BEGIN
    FOR v_pos IN 
        SELECT 
            n.id,
            n.qty_ordered,
            n.po_item_status,
            coalesce(sum(i.quantity_delivered) FILTER (WHERE i.item_status = 'posted'), 0) as qty_posted
        FROM app_purchase_orders_positions_normal n
        LEFT JOIN app_inbound_shipment_items i ON i.po_item_normal_id = n.id
        WHERE n.po_item_status NOT IN ('cancelled', 'paused')
        GROUP BY n.id, n.qty_ordered, n.po_item_status
    LOOP
        v_qty_posted := v_pos.qty_posted;
        
        -- Bestimme korrekten Status
        IF v_qty_posted >= v_pos.qty_ordered AND v_qty_posted > 0 THEN
            v_new_status := 'delivered';
        ELSIF v_qty_posted > 0 THEN
            v_new_status := 'partially_delivered';
        ELSE
            -- Keine Änderung wenn noch nichts gepostet
            v_new_status := NULL;
        END IF;
        
        -- Update nur wenn Status sich ändert
        IF v_new_status IS NOT NULL AND v_new_status != v_pos.po_item_status THEN
            UPDATE app_purchase_orders_positions_normal
            SET po_item_status = v_new_status::po_item_status,
                goods_received_at = CASE 
                    WHEN v_new_status = 'delivered' AND goods_received_at IS NULL 
                    THEN now() 
                    ELSE goods_received_at 
                END
            WHERE id = v_pos.id;
            
            RAISE NOTICE 'Fixed position %: % → %', 
                v_pos.id, v_pos.po_item_status, v_new_status;
        END IF;
    END LOOP;
END $$;


-- 2.3 PO-Status neu ableiten für alle POs mit Inkonsistenzen
DO $$
DECLARE
    v_po_id uuid;
BEGIN
    FOR v_po_id IN 
        SELECT DISTINCT order_id 
        FROM (
            SELECT order_id FROM app_purchase_orders_positions_normal
            UNION
            SELECT order_id FROM app_purchase_orders_positions_special
        ) t
    LOOP
        PERFORM fn_app_purchase_orders_status_derive_from_items(v_po_id);
    END LOOP;
END $$;


-- ============================================
-- 3. ÜBERLIEFERUNGEN MARKIEREN
-- ============================================

-- 3.1 Kommentar-Feld für Überlieferungen (falls nicht existiert)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'app_purchase_orders_positions_normal' 
        AND column_name = 'overdelivery_note'
    ) THEN
        ALTER TABLE app_purchase_orders_positions_normal 
        ADD COLUMN overdelivery_note text;
        
        COMMENT ON COLUMN app_purchase_orders_positions_normal.overdelivery_note IS
        'Notiz bei Überlieferung (mehr geliefert als bestellt)';
    END IF;
END $$;


-- 3.2 Überlieferungen mit Notiz markieren
UPDATE app_purchase_orders_positions_normal n
SET overdelivery_note = format(
    'ÜBERLIEFERUNG: Bestellt %s, Geliefert %s (+%s)',
    n.qty_ordered,
    d.qty_posted,
    d.qty_posted - n.qty_ordered
)
FROM (
    SELECT 
        po_item_normal_id,
        sum(quantity_delivered) as qty_posted
    FROM app_inbound_shipment_items
    WHERE item_status = 'posted'
    GROUP BY po_item_normal_id
) d
WHERE d.po_item_normal_id = n.id
    AND d.qty_posted > n.qty_ordered
    AND (n.overdelivery_note IS NULL OR n.overdelivery_note = '');


-- ============================================
-- 4. PRODUKT-PREISE NEU BERECHNEN
-- ============================================

-- 4.1 Preise für alle geposteten Items neu berechnen
DO $$
DECLARE
    v_item RECORD;
    v_landed_cost numeric;
BEGIN
    FOR v_item IN 
        SELECT 
            i.id as item_id,
            i.quantity_delivered,
            i.shipping_costs_proportional,
            n.unit_price_net,
            n.billbee_product_id as product_id
        FROM app_inbound_shipment_items i
        JOIN app_purchase_orders_positions_normal n ON n.id = i.po_item_normal_id
        WHERE i.item_status = 'posted'
            AND i.quantity_delivered > 0
            AND n.billbee_product_id IS NOT NULL
        ORDER BY i.created_at DESC
    LOOP
        -- Berechne Landed Cost
        v_landed_cost := v_item.unit_price_net + 
            (coalesce(v_item.shipping_costs_proportional, 0) / v_item.quantity_delivered);
        
        -- Update Produkt
        UPDATE app_products
        SET bb_net_purchase_price = round(v_landed_cost, 2)
        WHERE id = v_item.product_id;
        
        -- Nur Ausgabe bei größeren Preisen (Spam vermeiden)
        IF v_landed_cost > 10 THEN
            RAISE NOTICE 'Updated product %: Price = %', 
                v_item.product_id, round(v_landed_cost, 2);
        END IF;
    END LOOP;
END $$;


-- ============================================
-- 5. AUDIT LOG ERGÄNZEN
-- ============================================

-- 5.1 Log-Eintrag für manuelle Korrekturen
INSERT INTO audit_logs (
    table_name,
    operation,
    record_id,
    changes,
    user_id,
    created_at
)
SELECT 
    'app_purchase_orders',
    'FIX',
    id::text,
    jsonb_build_object(
        'reason', 'Quick Fix Script - Versandkosten & Status Korrektur',
        'script_date', current_timestamp
    ),
    (SELECT id FROM users WHERE email = 'system@internal' LIMIT 1),
    current_timestamp
FROM app_purchase_orders
WHERE shipping_cost_net > 0
LIMIT 1; -- Nur ein Eintrag als Marker


-- ============================================
-- VALIDIERUNG NACH FIX
-- ============================================

-- Zeige Zusammenfassung
SELECT 
    '✅ Versandkosten ohne Shipment' as check,
    count(*) as gefunden
FROM app_purchase_orders po
WHERE po.shipping_cost_net > 0
    AND NOT EXISTS (
        SELECT 1 FROM app_inbound_shipment_items si 
        WHERE si.order_id = po.id
    )

UNION ALL

SELECT 
    '✅ Status-Inkonsistenzen',
    count(DISTINCT s.id)
FROM app_inbound_shipments s
JOIN app_inbound_shipment_items i ON i.shipment_id = s.id
WHERE s.status IS DISTINCT FROM i.item_status

UNION ALL

SELECT 
    '✅ Überlieferungen markiert',
    count(*)
FROM app_purchase_orders_positions_normal
WHERE overdelivery_note IS NOT NULL
    AND overdelivery_note != ''

UNION ALL

SELECT 
    '✅ Produkte mit Preis',
    count(*)
FROM app_products
WHERE bb_net_purchase_price IS NOT NULL
    AND bb_net_purchase_price > 0;

-- Fertig!
RAISE NOTICE '========================================';
RAISE NOTICE 'QUICK FIX ABGESCHLOSSEN';
RAISE NOTICE '========================================';
RAISE NOTICE 'Bitte daily_validation.sql ausführen zur Kontrolle!';
