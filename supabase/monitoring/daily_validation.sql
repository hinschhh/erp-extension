-- ========================================
-- DAILY VALIDATION QUERIES
-- ========================================
-- Zweck: Tägliche Prüfung auf Daten-Inkonsistenzen
-- Verwendung: Als Cronjob einrichten oder manuell ausführen
-- ========================================

-- ============================================
-- 1. VERSANDKOSTEN-VALIDIERUNG
-- ============================================

-- 1.1 POs mit Versandkosten, aber keine Shipment-Zuordnung
-- → Versandkosten wurden nicht verteilt
SELECT 
    po.id,
    po.order_number,
    po.shipping_cost_net,
    po.separate_invoice_for_shipping_cost,
    po.status,
    count(DISTINCT si.shipment_id) as shipment_count,
    coalesce(sum(s.shipping_cost_separate), 0) as total_shipment_shipping
FROM app_purchase_orders po
LEFT JOIN app_inbound_shipment_items si ON si.order_id = po.id
LEFT JOIN app_inbound_shipments s ON s.id = si.shipment_id
WHERE po.shipping_cost_net IS NOT NULL 
    AND po.shipping_cost_net > 0
GROUP BY po.id, po.order_number, po.shipping_cost_net, po.separate_invoice_for_shipping_cost, po.status
HAVING count(DISTINCT si.shipment_id) = 0
ORDER BY po.shipping_cost_net DESC;

-- ERWARTUNG: Sollte leer sein (alle PO-Versandkosten haben Shipments)
-- AKTION: Falls nicht leer → Manuelle Prüfung: Wurden Items erstellt? Trigger ausgelöst?


-- 1.2 Versandkosten-Differenzen (PO vs. Shipments)
-- → Summe der Shipment-Kosten sollte PO-Kosten entsprechen
WITH po_shipping AS (
    SELECT 
        po.id,
        po.order_number,
        po.shipping_cost_net as po_shipping,
        po.separate_invoice_for_shipping_cost
    FROM app_purchase_orders po
    WHERE po.shipping_cost_net > 0
),
shipment_totals AS (
    SELECT 
        si.order_id,
        sum(DISTINCT s.shipping_cost_separate) as shipment_shipping
    FROM app_inbound_shipment_items si
    JOIN app_inbound_shipments s ON s.id = si.shipment_id
    GROUP BY si.order_id
)
SELECT 
    ps.id,
    ps.order_number,
    ps.po_shipping,
    ps.separate_invoice_for_shipping_cost as flag_set,
    coalesce(st.shipment_shipping, 0) as shipment_shipping,
    round(ps.po_shipping - coalesce(st.shipment_shipping, 0), 2) as difference,
    CASE 
        WHEN ps.po_shipping - coalesce(st.shipment_shipping, 0) > 0.01 THEN '⚠️ PO > Shipments'
        WHEN ps.po_shipping - coalesce(st.shipment_shipping, 0) < -0.01 THEN '❌ Shipments > PO'
        ELSE '✅ OK'
    END as status
FROM po_shipping ps
LEFT JOIN shipment_totals st ON st.order_id = ps.id
WHERE abs(ps.po_shipping - coalesce(st.shipment_shipping, 0)) > 0.01
ORDER BY abs(ps.po_shipping - coalesce(st.shipment_shipping, 0)) DESC;

-- ERWARTUNG: Sollte leer sein (oder nur Cent-Differenzen durch Rundung)
-- AKTION: Falls große Differenzen → Versandkosten manuell korrigieren


-- 1.3 Flag "separate_invoice_for_shipping_cost" inkonsistent
-- → Flag sollte TRUE sein, wenn shipping_cost_net > 0
SELECT 
    id,
    order_number,
    shipping_cost_net,
    separate_invoice_for_shipping_cost,
    CASE 
        WHEN shipping_cost_net > 0 AND NOT separate_invoice_for_shipping_cost THEN '❌ Flag fehlt'
        WHEN (shipping_cost_net IS NULL OR shipping_cost_net = 0) AND separate_invoice_for_shipping_cost THEN '⚠️ Flag gesetzt ohne Kosten'
        ELSE '✅ OK'
    END as status
FROM app_purchase_orders
WHERE (shipping_cost_net > 0 AND NOT separate_invoice_for_shipping_cost)
   OR ((shipping_cost_net IS NULL OR shipping_cost_net = 0) AND separate_invoice_for_shipping_cost);

-- ERWARTUNG: Sollte leer sein
-- AKTION: Flag manuell korrigieren oder Trigger prüfen


-- ============================================
-- 2. STATUS-VALIDIERUNG
-- ============================================

-- 2.1 Shipment Status != Item Status
-- → Items sollten IMMER gleichen Status wie Shipment haben
SELECT 
    s.id as shipment_id,
    s.inbound_number,
    s.status as shipment_status,
    count(*) as item_count,
    count(DISTINCT i.item_status) as unique_statuses,
    string_agg(DISTINCT i.item_status::text, ', ' ORDER BY i.item_status::text) as item_statuses
FROM app_inbound_shipments s
JOIN app_inbound_shipment_items i ON i.shipment_id = s.id
GROUP BY s.id, s.inbound_number, s.status
HAVING s.status IS DISTINCT FROM ALL(array_agg(DISTINCT i.item_status))
    OR count(DISTINCT i.item_status) > 1;

-- ERWARTUNG: Sollte leer sein
-- AKTION: Trigger manuell ausführen oder Items korrigieren


-- 2.2 PO-Position Status vs. Gelieferte Menge
-- → Status sollte zur gelieferten Menge passen
WITH deliveries AS (
    SELECT 
        i.po_item_normal_id,
        sum(i.quantity_delivered) FILTER (WHERE i.item_status = 'posted') as qty_posted
    FROM app_inbound_shipment_items i
    WHERE i.po_item_normal_id IS NOT NULL
    GROUP BY i.po_item_normal_id
)
SELECT 
    n.id,
    n.sku,
    n.qty_ordered,
    n.po_item_status,
    coalesce(d.qty_posted, 0) as qty_posted,
    CASE 
        WHEN coalesce(d.qty_posted, 0) >= n.qty_ordered 
            AND n.po_item_status != 'delivered' 
            THEN '❌ Sollte "delivered" sein'
        WHEN coalesce(d.qty_posted, 0) > 0 
            AND coalesce(d.qty_posted, 0) < n.qty_ordered 
            AND n.po_item_status NOT IN ('partially_delivered', 'delivered') 
            THEN '⚠️ Sollte "partially_delivered" sein'
        WHEN coalesce(d.qty_posted, 0) > n.qty_ordered 
            THEN '🔴 ÜBERLIEFERUNG!'
        ELSE '✅ OK'
    END as status_check
FROM app_purchase_orders_positions_normal n
LEFT JOIN deliveries d ON d.po_item_normal_id = n.id
WHERE n.po_item_status NOT IN ('cancelled', 'paused')
HAVING CASE 
    WHEN coalesce(d.qty_posted, 0) >= n.qty_ordered 
        AND n.po_item_status != 'delivered' THEN 1
    WHEN coalesce(d.qty_posted, 0) > 0 
        AND coalesce(d.qty_posted, 0) < n.qty_ordered 
        AND n.po_item_status NOT IN ('partially_delivered', 'delivered') THEN 1
    WHEN coalesce(d.qty_posted, 0) > n.qty_ordered THEN 1
    ELSE 0
END = 1;

-- ERWARTUNG: Sollte leer sein
-- AKTION: Status manuell korrigieren oder Trigger erneut ausführen


-- 2.3 PO Status vs. Position-Status Aggregation
-- → PO-Status sollte aus Position-Status abgeleitet sein
WITH position_counts AS (
    SELECT
        order_id,
        count(*) as total,
        count(*) FILTER (WHERE po_item_status = 'delivered') as cnt_delivered,
        count(*) FILTER (WHERE po_item_status = 'partially_delivered') as cnt_partial,
        count(*) FILTER (WHERE po_item_status = 'in_production') as cnt_production,
        count(*) FILTER (WHERE po_item_status = 'confirmed') as cnt_confirmed,
        count(*) FILTER (WHERE po_item_status = 'ordered') as cnt_ordered,
        count(*) FILTER (WHERE po_item_status = 'draft') as cnt_draft,
        count(*) FILTER (WHERE po_item_status = 'cancelled') as cnt_cancelled,
        count(*) FILTER (WHERE po_item_status = 'paused') as cnt_paused
    FROM (
        SELECT order_id, po_item_status FROM app_purchase_orders_positions_normal
        UNION ALL
        SELECT order_id, po_item_status FROM app_purchase_orders_positions_special
    ) t
    GROUP BY order_id
),
expected_status AS (
    SELECT 
        order_id,
        total,
        (total - cnt_cancelled - cnt_paused) as active,
        CASE
            WHEN total = 0 THEN 'draft'
            WHEN cnt_delivered >= (total - cnt_cancelled - cnt_paused) 
                AND (total - cnt_cancelled - cnt_paused) > 0 THEN 'delivered'
            WHEN cnt_delivered > 0 THEN 'partially_delivered'
            WHEN cnt_production > 0 
                AND cnt_production < (total - cnt_cancelled - cnt_paused) THEN 'partially_in_production'
            WHEN (total - cnt_cancelled - cnt_paused) > 0 
                AND cnt_production = (total - cnt_cancelled - cnt_paused) THEN 'in_production'
            WHEN (total - cnt_cancelled - cnt_paused) > 0 
                AND cnt_confirmed = (total - cnt_cancelled - cnt_paused) THEN 'confirmed'
            WHEN (total - cnt_cancelled - cnt_paused) > 0 
                AND cnt_ordered = (total - cnt_cancelled - cnt_paused) THEN 'ordered'
            WHEN (total - cnt_cancelled - cnt_paused) > 0 
                AND cnt_draft = (total - cnt_cancelled - cnt_paused) THEN 'draft'
            ELSE 'delivered'
        END as expected_status
    FROM position_counts
)
SELECT 
    po.id,
    po.order_number,
    po.status as current_status,
    es.expected_status,
    es.total as position_count,
    es.active as active_positions
FROM app_purchase_orders po
JOIN expected_status es ON es.order_id = po.id
WHERE po.status::text != es.expected_status::text
ORDER BY po.created_at DESC
LIMIT 20;

-- ERWARTUNG: Sollte leer sein (oder nur bei manuellen Übersteuerungen)
-- AKTION: fn_app_purchase_orders_status_derive_from_items() manuell ausführen


-- ============================================
-- 3. PREIS-VALIDIERUNG
-- ============================================

-- 3.1 Produkte mit auffälligen Preisen
-- → Preise sollten plausibel sein (nicht 0, nicht negativ, nicht extrem)
SELECT 
    id,
    sku,
    bb_net_purchase_price,
    bb_gross_purchase_price,
    CASE 
        WHEN bb_net_purchase_price IS NULL THEN '⚠️ Kein Preis'
        WHEN bb_net_purchase_price <= 0 THEN '❌ Negativ/Null'
        WHEN bb_net_purchase_price > 10000 THEN '🔴 Sehr hoch (>10k)'
        WHEN bb_net_purchase_price < 0.01 THEN '⚠️ Sehr niedrig (<1ct)'
        ELSE '✅ OK'
    END as price_check
FROM app_products
WHERE bb_net_purchase_price IS NULL
   OR bb_net_purchase_price <= 0
   OR bb_net_purchase_price > 10000
   OR bb_net_purchase_price < 0.01
LIMIT 50;

-- ERWARTUNG: Wenige Treffer (nur Sonderfälle)
-- AKTION: Preise manuell prüfen und ggf. korrigieren


-- 3.2 Produkte ohne Preis-Update nach Posting
-- → Nach Posting sollte Preis aktualisiert sein
SELECT 
    p.id,
    p.sku,
    p.bb_net_purchase_price,
    max(i.created_at) as last_posting,
    count(*) as posting_count
FROM app_products p
JOIN app_purchase_orders_positions_normal n ON n.billbee_product_id = p.id
JOIN app_inbound_shipment_items i ON i.po_item_normal_id = n.id
WHERE i.item_status = 'posted'
    AND p.bb_net_purchase_price IS NULL
GROUP BY p.id, p.sku, p.bb_net_purchase_price
ORDER BY max(i.created_at) DESC
LIMIT 20;

-- ERWARTUNG: Sollte leer sein (alle geposteten Produkte haben Preis)
-- AKTION: Trigger manuell ausführen


-- ============================================
-- 4. DATEN-QUALITÄT
-- ============================================

-- 4.1 "Verwaiste" Shipment Items ohne PO-Zuordnung
SELECT 
    i.id,
    s.inbound_number,
    i.item_status,
    i.quantity_delivered,
    i.created_at
FROM app_inbound_shipment_items i
JOIN app_inbound_shipments s ON s.id = i.shipment_id
WHERE i.po_item_normal_id IS NULL 
    AND i.po_item_special_id IS NULL
ORDER BY i.created_at DESC
LIMIT 20;

-- ERWARTUNG: Sollte leer sein (alle Items haben PO-Zuordnung)
-- AKTION: Items manuell zuordnen oder löschen


-- 4.2 Doppelte Lieferungen für gleiche PO-Position
-- → Kann zu Status-Problemen führen
SELECT 
    i.po_item_normal_id,
    n.sku,
    n.qty_ordered,
    count(*) as delivery_count,
    sum(i.quantity_delivered) as total_delivered,
    array_agg(i.item_status ORDER BY i.created_at) as statuses,
    array_agg(s.inbound_number ORDER BY i.created_at) as shipments
FROM app_inbound_shipment_items i
JOIN app_purchase_orders_positions_normal n ON n.id = i.po_item_normal_id
JOIN app_inbound_shipments s ON s.id = i.shipment_id
GROUP BY i.po_item_normal_id, n.sku, n.qty_ordered
HAVING count(*) > 1
ORDER BY count(*) DESC, sum(i.quantity_delivered) DESC
LIMIT 20;

-- ERWARTUNG: Einige Treffer OK (Teillieferungen), aber prüfen ob sinnvoll
-- AKTION: Bei Überlieferungen korrigieren


-- ============================================
-- ZUSAMMENFASSUNG FÜR DASHBOARD
-- ============================================

SELECT 
    '🚨 Kritisch' as priority,
    'Versandkosten nicht verteilt' as issue,
    count(*) as count
FROM app_purchase_orders po
WHERE po.shipping_cost_net > 0
    AND NOT EXISTS (
        SELECT 1 FROM app_inbound_shipment_items si 
        WHERE si.order_id = po.id
    )

UNION ALL

SELECT 
    '🚨 Kritisch',
    'Status-Inkonsistenzen',
    count(DISTINCT s.id)
FROM app_inbound_shipments s
JOIN app_inbound_shipment_items i ON i.shipment_id = s.id
WHERE s.status IS DISTINCT FROM i.item_status

UNION ALL

SELECT 
    '⚠️ Hoch',
    'Überlieferungen',
    count(*)
FROM (
    SELECT n.id
    FROM app_purchase_orders_positions_normal n
    LEFT JOIN (
        SELECT po_item_normal_id, sum(quantity_delivered) as qty
        FROM app_inbound_shipment_items
        WHERE item_status = 'posted'
        GROUP BY po_item_normal_id
    ) d ON d.po_item_normal_id = n.id
    WHERE coalesce(d.qty, 0) > n.qty_ordered
) x

UNION ALL

SELECT 
    '⚠️ Hoch',
    'Produkte ohne Preis',
    count(*)
FROM app_products
WHERE bb_net_purchase_price IS NULL

ORDER BY 
    CASE priority 
        WHEN '🚨 Kritisch' THEN 1 
        WHEN '⚠️ Hoch' THEN 2 
        ELSE 3 
    END;
