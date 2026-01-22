# Migration 2026-01-22: Cost Tracking & Shipping Refactoring

## Zusammenfassung

Diese Migration behebt die Probleme aus [ANALYSIS_PO_STATUS_SHIPPING.md](../ANALYSIS_PO_STATUS_SHIPPING.md) und implementiert eine saubere Kostenstruktur gemäß Ihren Anforderungen.

---

## ✅ Implementierte Änderungen

### 1. Kosten-Management (WebApp = SSOT)

**Neue Felder in `app_products`:**
- `cost_price` (numeric): Basis-Einkaufspreis (netto, ohne Versandkosten)
- `acquisition_cost` (numeric): Anschaffungsnebenkosten (ANK) pro Stück
- `bb_CostNet` (GENERATED): Gesamtkosten für Billbee-Sync

**Automatische Updates:**
- `cost_price` ← aktualisiert aus neuester PO-Position (`unit_price_net`)
- `acquisition_cost` ← aktualisiert beim Wareneingang-Posting
- `bb_CostNet`:
  - Normale Produkte: `cost_price + acquisition_cost`
  - Stücklisten: `SUM(component.bb_CostNet * quantity)` für alle Komponenten

**Trigger:**
- `trgfn_po_position_normal_update_cost_price()` - AFTER INSERT/UPDATE auf PO-Position
- `trgfn_inbound_item_posted_enforcement()` - AFTER UPDATE auf Inbound-Item

---

### 2. Versandkosten-Verteilung

**Änderungen:**
- `app_inbound_shipments.shipping_cost_separate` → umbenannt zu `shipping_cost`
- Versandkosten werden **nur** auf `app_inbound_shipment_items.shipping_costs_proportional` verteilt
- **KEIN** Feld mehr in PO-Positions (markiert als deprecated)

**Logik:**
- Bei INSERT: Volle Versandkosten addiert
- Bei UPDATE: Nur Differenz addiert
- Verteilung proportional nach Warenwert: `(qty * price / total_value) * shipping_cost`

**Trigger:**
- `trgfn_inbound_shipment_distribute_shipping_costs()` - AFTER INSERT/UPDATE auf Inbound-Shipment
- Ersetzt alte `trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc()`

---

### 3. Wareneingang-Posting Enforcement

**Read-only nach Billbee-Sync:**
- `quantity_delivered` kann nach `item_status = 'posted'` nicht mehr geändert werden
- Fehlercode: `PODLV` mit Hinweis auf Storno-Prozess

**acquisition_cost Update:**
- Beim Posting wird `app_products.acquisition_cost` aktualisiert
- Berechnung: `shipping_costs_proportional / qty_delivered`

**Trigger:**
- `trg_inbound_item_qty_readonly` - BEFORE UPDATE (Enforcement)
- `trg_inbound_item_update_acquisition_cost` - AFTER UPDATE (Kosten-Update)

---

### 4. Separate Versandkostenrechnung

**Neuer CHECK Constraint:**
```sql
CHECK (
  separate_invoice_for_shipping_cost = false
  OR
  (separate_invoice_for_shipping_cost = true AND shipping_cost_net = 0)
)
```

**Bedeutung:**
- Wenn `separate_invoice_for_shipping_cost = true` → PO muss `shipping_cost_net = 0` haben
- Versandkosten werden dann manuell über Inbound-Shipment erfasst
- Warning (kein Hard-Block), Frontend-Feld nicht disablen

---

### 5. Aufgeräumt: Legacy-Systeme entfernt

**Entfernte Trigger:**
- `trg_po_recalc_shipping_on_status` (rief fehlende Function auf)
- `trg_au__allocate_shipping_costs_from_is` (obsolete Logik)
- `trg_separate_invoice_restriction` (durch Constraint ersetzt)

**Entfernte Functions:**
- `trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i()` (obsolet)
- `trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc()` (ersetzt)
- `trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re()` (durch Constraint ersetzt)

**Beibehalten (wie gewünscht):**
- Auto-Advance Trigger (`confirmed` → `in_production`)
- Status-Ableitungslogik (Header ← Items)

---

## 📊 Datenfluss (Neu)

### Kosten-Tracking:
```
PO-Position erstellen
  ↓ unit_price_net
Trigger: trgfn_po_position_normal_update_cost_price
  ↓
app_products.cost_price = unit_price_net (wenn neueste Position)
  ↓
app_products.bb_CostNet = cost_price + acquisition_cost (GENERATED)
  ↓
n8n sync → Billbee
```

### Versandkosten-Tracking:
```
Inbound-Shipment erstellen/ändern
  ↓ shipping_cost
Trigger: trgfn_inbound_shipment_distribute_shipping_costs
  ↓
Verteilung auf app_inbound_shipment_items.shipping_costs_proportional
  (proportional nach Warenwert)
  ↓
Bei Posting:
  ↓ item_status = 'posted'
Trigger: trgfn_inbound_item_update_acquisition_cost
  ↓
app_products.acquisition_cost = shipping_costs_proportional / qty_delivered
  ↓
app_products.bb_CostNet wird neu berechnet (GENERATED)
  ↓
n8n sync → Billbee
```

### Stücklisten (BOMs):
```
app_products.bb_CostNet (wenn bb_is_bom = true)
  ↓ GENERATED COLUMN mit Subquery
SELECT SUM(component.bb_CostNet * bom_recipes.quantity)
FROM bom_recipes
JOIN app_products component ON ...
WHERE bom_recipes.billbee_bom_id = parent.id
  ↓
Automatisch rekursiv berechnet
```

---

## 🧪 Tests

### Test 1: cost_price Update
```sql
-- Setup
INSERT INTO app_products (id, bb_sku, cost_price) 
VALUES (12345, 'TEST-001', 0);

-- Test: Neue PO-Position erstellen
INSERT INTO app_purchase_orders_positions_normal 
  (order_id, billbee_product_id, qty_ordered, unit_price_net)
VALUES 
  ('...', 12345, 10, 15.50);

-- Erwartung: app_products.cost_price = 15.50
SELECT cost_price FROM app_products WHERE id = 12345;
-- ✅ Sollte 15.50 sein
```

### Test 2: acquisition_cost Update
```sql
-- Test: Inbound-Item posting
UPDATE app_inbound_shipment_items
SET item_status = 'posted'
WHERE id = '...';

-- Erwartung: app_products.acquisition_cost aktualisiert
SELECT acquisition_cost FROM app_products WHERE id = 12345;
-- ✅ Sollte shipping_costs_proportional / qty_delivered sein
```

### Test 3: bb_CostNet Berechnung (Normal)
```sql
-- Test: Normale Produkte
SELECT 
  bb_sku,
  cost_price,
  acquisition_cost,
  bb_CostNet,
  cost_price + acquisition_cost AS expected
FROM app_products
WHERE bb_is_bom = false
LIMIT 10;

-- ✅ bb_CostNet sollte = expected sein
```

### Test 4: bb_CostNet Berechnung (BOM)
```sql
-- Test: Stücklisten
SELECT 
  parent.bb_sku AS bom_sku,
  parent.bb_CostNet AS bom_cost,
  SUM(comp.bb_CostNet * br.quantity) AS calculated_cost
FROM app_products parent
JOIN bom_recipes br ON br.billbee_bom_id = parent.id
JOIN app_products comp ON comp.id = br.billbee_component_id
WHERE parent.bb_is_bom = true
GROUP BY parent.id, parent.bb_sku, parent.bb_CostNet;

-- ✅ bom_cost sollte = calculated_cost sein
```

### Test 5: Versandkosten-Verteilung
```sql
-- Setup
UPDATE app_inbound_shipments
SET shipping_cost = 100.00
WHERE id = '...';

-- Test: Verteilung auf Items
SELECT 
  isi.id,
  isi.quantity_delivered * popn.unit_price_net AS item_value,
  isi.shipping_costs_proportional AS allocated_shipping,
  -- Erwartung: allocated_shipping = (item_value / total_value) * 100
FROM app_inbound_shipment_items isi
JOIN app_purchase_orders_positions_normal popn ON popn.id = isi.po_item_normal_id
WHERE isi.shipment_id = '...';

-- ✅ Summe aller shipping_costs_proportional sollte ~100.00 sein
```

### Test 6: qty_delivered read-only nach Posting
```sql
-- Test: Versuch qty_delivered zu ändern
UPDATE app_inbound_shipment_items
SET quantity_delivered = 999
WHERE item_status = 'posted' AND id = '...';

-- ✅ Sollte fehlschlagen mit Fehler: PODLV
```

### Test 7: separate_invoice Constraint
```sql
-- Test: Ungültige Kombination
UPDATE app_purchase_orders
SET separate_invoice_for_shipping_cost = true,
    shipping_cost_net = 50.00
WHERE id = '...';

-- ✅ Sollte fehlschlagen mit CHECK Constraint Violation
```

---

## 🚀 Deployment

### Pre-Deployment Checklist
- [ ] Backup der Datenbank erstellen
- [ ] Migration lokal testen (siehe Tests oben)
- [ ] Frontend-Anpassungen vorbereiten (siehe unten)

### Migration ausführen
```bash
# Via Supabase CLI
supabase db push

# Oder direkt in Supabase Dashboard
# migrations/20260122100000_refactor_cost_tracking_and_shipping.sql
```

### Post-Deployment Checklist
- [ ] Tests ausführen (siehe oben)
- [ ] Alle Trigger aktiv? `SELECT * FROM pg_trigger WHERE tgname LIKE '%cost%' OR tgname LIKE '%shipping%';`
- [ ] Legacy-Trigger entfernt? `SELECT * FROM pg_trigger WHERE tgname LIKE '%recalc_shipping%';`
- [ ] Constraints aktiv? `SELECT * FROM pg_constraint WHERE conname LIKE '%separate_invoice%';`

---

## 🎨 Frontend-Anpassungen (TODO)

### 1. Artikel-Ansicht (app_products)
```typescript
// Alte Felder (deprecated):
// bb_net_purchase_price ❌

// Neue Felder:
cost_price ✅
acquisition_cost ✅
bb_CostNet ✅ (calculated, read-only)

// Stücklisten:
bb_CostNet zeigt automatisch Summe aller Komponenten
```

### 2. Purchase Order Detail
```typescript
// Feld umbenennen:
shipping_cost_separate → shipping_cost ✅

// Validierung:
if (separate_invoice_for_shipping_cost) {
  // Feld NICHT disablen!
  // Nur Warning zeigen, wenn shipping_cost_net > 0
}
```

### 3. Wareneingang
```typescript
// qty_delivered read-only nach Posting:
<Input 
  disabled={item.item_status === 'posted'} 
  value={item.quantity_delivered}
/>

// Versandkosten-Feld umbenennen:
shipping_cost_separate → shipping_cost
```

### 4. n8n Integration (extern)
```typescript
// Neuer Workflow: Sync bb_CostNet zu Billbee
// Trigger: app_products.bb_CostNet ändert sich
// Action: PUT /api/billbee/products/{id} { costPrice: bb_CostNet }
```

---

## 📝 Bekannte Einschränkungen

1. **Deprecated Felder noch vorhanden:**
   - `app_purchase_orders_positions_*.shipping_costs_proportional`
   - Werden in zukünftiger Migration entfernt (nach Frontend-Umstellung)

2. **bb_net_purchase_price noch vorhanden:**
   - Legacy-Feld von Billbee-Sync
   - Wird entfernt, sobald n8n auf `bb_CostNet` umgestellt ist

3. **BOM-Berechnung Performance:**
   - `bb_CostNet` für BOMs nutzt Subquery (kann bei vielen Komponenten langsam sein)
   - Optional: Materialized View für große Stücklisten

---

## 🐛 Troubleshooting

### Problem: cost_price wird nicht aktualisiert
**Lösung:** Prüfen, ob Position die neueste ist:
```sql
SELECT 
  popn.id,
  popn.billbee_product_id,
  popn.created_at,
  popn.unit_price_net,
  p.cost_price
FROM app_purchase_orders_positions_normal popn
JOIN app_products p ON p.id = popn.billbee_product_id
ORDER BY popn.billbee_product_id, popn.created_at DESC;
```

### Problem: Versandkosten werden nicht verteilt
**Lösung:** Prüfen, ob Trigger feuert:
```sql
SELECT * FROM pg_trigger 
WHERE tgname = 'trg_distribute_shipping_costs';

-- Manuell triggern:
UPDATE app_inbound_shipments
SET shipping_cost = shipping_cost
WHERE id = '...';
```

### Problem: bb_CostNet ist NULL
**Lösung:** GENERATED COLUMN neu berechnen:
```sql
-- Tabelle neu analysieren
ANALYZE app_products;

-- Oder Spalte neu erstellen (nur wenn nötig)
ALTER TABLE app_products
DROP COLUMN bb_CostNet;

-- Dann Migration erneut ausführen
```

---

## 📚 Referenzen

- [AGENTS.md](../AGENTS.md) - Architektur-Richtlinien
- [ANALYSIS_PO_STATUS_SHIPPING.md](../ANALYSIS_PO_STATUS_SHIPPING.md) - Problem-Analyse
- [supabase/domains/einkauf/README.md](../supabase/domains/einkauf/README.md) - Domänen-Dokumentation

---

## ✅ Abnahme-Kriterien

Migration ist erfolgreich, wenn:
- [ ] Alle Tests (1-7) erfolgreich
- [ ] cost_price wird automatisch aktualisiert
- [ ] acquisition_cost wird automatisch aktualisiert
- [ ] bb_CostNet ist korrekt für normale Produkte
- [ ] bb_CostNet ist korrekt für Stücklisten
- [ ] Versandkosten werden proportional verteilt
- [ ] qty_delivered ist read-only nach Posting
- [ ] separate_invoice Constraint funktioniert
- [ ] Legacy-Trigger sind entfernt
- [ ] Keine Fehler in Supabase Logs

---

**Status:** ✅ Migration erstellt, bereit zum Deployment  
**Nächster Schritt:** Tests lokal ausführen, dann deployen
