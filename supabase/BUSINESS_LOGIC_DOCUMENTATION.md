# Business Logic & Automatismen - Dokumentation

**Stand:** 2026-01-16  
**Zweck:** Übersicht über alle automatischen Berechnungen und Status-Ableitungen im ERP-System

---

## 🎯 Übersicht Automatismen

| Bereich | Trigger | Zweck |
|---------|---------|-------|
| Versandkosten | `trgfn_propagate_po_shipping_to_shipment` | PO-Versandkosten → Shipment kopieren |
| Versandkosten | `trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc` | Shipment-Versandkosten auf POs verteilen |
| Status Sync | `trgfn_app_inbound_shipments_status_sync_to_items` | Shipment-Status → Items synchronisieren |
| Status Ableitung | `trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste` | Posted Items → PO-Position Status |
| Status Aggregation | `trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st` | PO-Positionen → PO-Header Status |
| Preis-Update | `trgfn_update_product_price_on_posting` | ANK-Berechnung beim Posting |

---

## 📦 1. Versandkosten-Management

### 1.1 PO → Shipment Propagierung

**Datei:** `supabase/migrations/20260108_fix_po_shipping_propagation.sql`  
**Trigger:** `trgfn_propagate_po_shipping_to_shipment`  
**Wann:** AFTER INSERT auf `app_inbound_shipment_items`

#### Ablauf:
```sql
IF PO.shipping_cost_net > 0 
   AND Shipment.shipping_cost_separate = 0 (oder NULL)
THEN
   UPDATE app_inbound_shipments
   SET shipping_cost_separate = PO.shipping_cost_net
```

#### Zweck:
- Lieferant gibt Versandkosten vor (im PO enthalten)
- Beim ersten Wareneingang automatisch übernehmen
- Vermeidet manuelle Eingabe

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Nur beim ERSTEN Item**: Wenn mehrere Items zu unterschiedlichen Zeiten eingehen, wird nur beim ersten kopiert
2. **Keine Rückwärts-Sync**: Änderungen am PO nach dem ersten Item werden NICHT übernommen
3. **Kein Logging**: Keine Spur, ob Kosten automatisch oder manuell gesetzt wurden

---

### 1.2 Shipment → PO Neu-Allokierung

**Datei:** `supabase/lager/functions/trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc.sql`  
**Trigger:** AFTER INSERT/UPDATE auf `app_inbound_shipments.shipping_cost_separate`

#### Ablauf:
```sql
1. Berechne Delta = NEW - OLD
2. Gruppiere Items nach order_id
3. Berechne Mengen-Anteil pro Order:
   Anteil[order] = (qty[order] / total_qty) * Delta
4. UPDATE app_purchase_orders
   SET shipping_cost_net += Anteil,
       separate_invoice_for_shipping_cost = true
```

#### Beispiel-Rechnung:
```
Shipment: 100€ Versandkosten (neue separate Rechnung)
├─ Order A: 70 Stück → 70€
└─ Order B: 30 Stück → 30€
```

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Mehrfach-Allokierung möglich**: Bei wiederholten Updates werden Deltas ADDIERT (kein Überschreiben)
2. **Rounding-Fehler**: Rundung auf 2 Dezimalstellen kann zu Cent-Differenzen führen
3. **Keine Validierung**: Keine Prüfung ob Summe(PO.shipping_cost_net) == Shipment.shipping_cost_separate
4. **Flag-Lock schwach**: Prüft nur ob `shipping_cost_net > 0`, nicht ob Flag korrekt gesetzt ist

#### 🔍 GEFUNDENE DATEN-INKONSISTENZEN:
```
10 POs mit Versandkosten, aber KEINE Shipment-Zuordnung
- PO-2025-0096: 87.93€ nicht verteilt
- PO-2025-0030: 77.46€ nicht verteilt
- PO-2025-0050: 73.32€ nicht verteilt
...
→ Versandkosten gehen in Kalkulation verloren!

1 PO mit negativer Differenz:
- PO-2025-0022: PO=1531.91€, Shipment=2400€ (Differenz: -868€)
→ Versandkosten wurden MEHR als ursprünglich?
```

---

## 📊 2. Status-Management

### 2.1 Shipment → Items Synchronisierung

**Datei:** `supabase/lager/functions/trgfn_app_inbound_shipments_status_sync_to_items.sql`  
**Trigger:** AFTER UPDATE auf `app_inbound_shipments.status`

#### Ablauf:
```sql
IF NEW.status != OLD.status THEN
   UPDATE app_inbound_shipment_items
   SET item_status = NEW.status
   WHERE shipment_id = NEW.id
     AND item_status IS DISTINCT FROM NEW.status
```

#### Zweck:
- Einheitlicher Status für alle Items eines Shipments
- User posted Shipment → alle Items werden posted

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Keine Rückwärts-Prüfung**: Items können manuell anderen Status haben, werden aber überschrieben
2. **Kein Schutz**: Kein Mechanismus um einzelne Items vom Sync auszuschließen
3. **Performance**: Bei großen Shipments (>100 Items) langsam

---

### 2.2 Posted Items → PO-Position Status

**Datei:** `supabase/lager/functions/trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste.sql`  
**Trigger:** AFTER INSERT/UPDATE/DELETE auf `app_inbound_shipment_items`

#### Ablauf:
```sql
1. Hole qty_ordered von PO-Position
2. Summiere NUR posted Items:
   sum_posted = SUM(quantity_delivered WHERE item_status = 'posted')
3. Vergleich:
   IF sum_posted >= qty_ordered 
      → po_item_status = 'delivered'
      → goods_received_at = now() (falls NULL)
   ELSIF sum_posted > 0
      → po_item_status = 'partially_delivered'
   ELSE
      → KEIN UPDATE
```

#### Wichtig:
- **NUR gepostete Items zählen!**
- Wenn noch keine Items gepostet sind, bleibt Status unverändert (z.B. "confirmed")

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Überlieferung nicht erkannt**: Wenn sum_posted > qty_ordered, wird trotzdem nur "delivered" gesetzt
2. **Gleichzeitige Lieferungen**: Race Condition bei parallelen Postings möglich
3. **goods_received_at bei Teillieferung**: Wird nur bei vollständiger Lieferung gesetzt
4. **Keine Benachrichtigung**: Bei Überlieferung kein Alarm an User

---

### 2.3 PO-Positionen → PO-Header Aggregation

**Datei:** `supabase/einkauf/functions/fn_app_purchase_orders_status_derive_from_items.sql`  
**Trigger:** `trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st`

#### Ablauf:
```sql
1. Zähle alle Status (normal + special Positionen)
2. Berechne: active = total - cancelled - paused
3. Ableitung (Priorität):
   ✓ total = 0               → "draft"
   ✓ delivered >= active     → "delivered"
   ✓ delivered > 0           → "partially_delivered"
   ✓ in_production < active  → "partially_in_production"
   ✓ in_production = active  → "in_production"
   ✓ confirmed = active      → "confirmed"
   ✓ ordered = active        → "ordered"
   ✓ draft = active          → "draft"
   ✓ ELSE                    → "delivered" (Fallback)
4. Setze proforma_confirmed_at beim ersten "confirmed"
```

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Fallback zu "delivered"**: Wenn nur cancelled/paused übrig sind, wird "delivered" gesetzt (besser: "cancelled")
2. **Keine Mixed-States**: Bei z.B. 50% delivered, 50% in_production → nur "partially_delivered", Info geht verloren
3. **Performance**: Bei jedem Item-Update neu berechnet (auch wenn Status gleich bleibt)
4. **Race Conditions**: Parallele Position-Updates können zu inkonsistentem PO-Status führen

#### 🔍 GEFUNDENE DATEN-INKONSISTENZEN:
```
PO-2025-0108: Status="in_production", aber Item ist "delivered"
→ Status-Ableitung nicht korrekt ausgelöst?

PO-2026-0006: Status="draft", aber Item ist aktiv (nicht draft)
→ Trigger wurde übersprungen?

PO-2026-0002: Status="confirmed", aber Items haben Status 0/0/0
→ Items existieren nicht oder wurden gelöscht?
```

---

### 2.4 Auto-Transition: Confirmed → In Production

**Datei:** `supabase/einkauf/functions/trgfn_app_purchase_orders_positions_normal_po_item_status_auto_.sql`  
**Trigger:** AFTER UPDATE auf `app_purchase_orders_positions_normal.po_item_status`

#### Ablauf:
```sql
IF NEW.po_item_status = 'confirmed' THEN
   UPDATE SET po_item_status = 'in_production'
```

#### Zweck:
- Automatischer Übergang nach Proforma-Bestätigung
- Spart manuellen Schritt

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Ungewollte Transition**: Kein "Stopp"-Mechanismus, immer sofort
2. **Zirkuläre Updates**: Kann andere Trigger erneut auslösen
3. **Nur für Normal**: Special-Positionen haben diesen Automatismus NICHT (Inkonsistenz)

---

## 💰 3. Preis-Management

### 3.1 Produkt-Preis Update mit ANK

**Datei:** `supabase/migrations/20260108_update_product_price_on_posting.sql`  
**Trigger:** AFTER UPDATE OF item_status auf `app_inbound_shipment_items`

#### Ablauf:
```sql
IF NEW.item_status = 'posted' 
   AND po_item_normal_id IS NOT NULL THEN
   
   ANK_per_unit = shipping_costs_proportional / quantity_delivered
   landed_cost = unit_price_net + ANK_per_unit
   
   UPDATE app_products
   SET bb_net_purchase_price = landed_cost
```

#### Beispiel:
```
Produkt: 10€/Stück, 100 Stück
Versandkosten anteilig: 50€
→ ANK/Stück = 0.50€
→ Neuer EK-Preis = 10.50€
```

#### ⚠️ BEKANNTE SCHWACHSTELLEN:
1. **Überschreiben bei jeder Lieferung**: Letzter Preis gewinnt, keine Historie
2. **Keine Validierung**: shipping_costs_proportional kann NULL sein → Division durch NULL
3. **Nur Normal-Positionen**: Special wird ignoriert (OK, aber nicht dokumentiert)
4. **Keine Prüfung**: Ob shipping_costs_proportional bereits korrekt verteilt wurde
5. **Fehlende Rundung**: Kann zu sehr langen Dezimalzahlen führen

---

## 🚨 Zusammenfassung: Schwachstellen & Risiken

### KRITISCH ❌

| Problem | Bereich | Impact | Status |
|---------|---------|--------|--------|
| Versandkosten-Verteilung fehlt bei 10 POs | Kostenrechnung | Falsche Kalkulation | **UNGELÖST** |
| Negative Versandkosten-Differenz bei PO-2025-0022 | Kostenrechnung | -868€ "verschwunden" | **UNGELÖST** |
| PO-Status ≠ Item-Status bei mehreren POs | Status-Logik | Verwirrung, falsche Lieferplanung | **UNGELÖST** |
| Überlieferungen nicht erkannt | Wareneingangskontrolle | Mehrkosten | **UNGELÖST** |

### HOCH ⚠️

| Problem | Bereich | Lösung |
|---------|---------|--------|
| Mehrfach-Allokierung bei Versandkosten | Kostenrechnung | Validierung + Logging hinzufügen |
| Race Conditions bei Status-Updates | Status-Logik | Transaktions-Locks einbauen |
| goods_received_at fehlt bei Teillieferung | Reporting | Auch bei partially_delivered setzen |
| Preis-History fehlt | Kalkulation | Tabelle app_product_price_history anlegen |

### MITTEL 🟡

| Problem | Bereich | Lösung |
|---------|---------|--------|
| Performance bei großen Shipments | Status-Sync | Bulk-Updates statt Row-by-Row |
| Auto-Transition ohne Stopp-Option | Workflow | Flag `auto_transition_enabled` hinzufügen |
| Rounding-Fehler bei Versandkosten | Kostenrechnung | Letzter Order bekommt Rest |
| Keine Audit-Logs für automatische Änderungen | Compliance | audit_logs mit trigger_name erweitern |

---

## 🔧 Empfohlene Sofortmaßnahmen

### 1. Validierungs-Queries (täglich laufen lassen)
```sql
-- In: supabase/monitoring/daily_validation.sql
-- TODO: Als Cronjob einrichten
```

### 2. Fehlende Dokumentation ergänzen
- [ ] COMMENT ON FUNCTION für alle Trigger
- [ ] COMMENT ON COLUMN für berechnete Felder
- [ ] README in jedem Unterordner

### 3. Tests schreiben
- [ ] Unit-Tests für Status-Ableitungen
- [ ] Edge-Case Tests (Überlieferung, parallele Updates)
- [ ] Performance-Tests (100+ Items)

### 4. Monitoring
- [ ] Alert bei negativen Differenzen
- [ ] Alert bei Status-Inkonsistenzen
- [ ] Wöchentlicher Report: "Nicht verteilte Versandkosten"

---

## 📚 Weitere Dokumentation

- [Status-Workflows](./status_workflows.md) - Detaillierte State-Machine Diagramme
- [Versandkosten-Rechnung](./shipping_cost_allocation.md) - Beispiel-Rechnungen
- [Troubleshooting Guide](./troubleshooting.md) - Häufige Probleme & Lösungen

---

**Letzte Aktualisierung:** 2026-01-16  
**Verantwortlich:** System-Dokumentation  
**Review:** Notwendig bei jeder Schema-Änderung
