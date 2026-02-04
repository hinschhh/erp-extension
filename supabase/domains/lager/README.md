# Lager Domain

## Überblick
Verwaltung von:
- Wareneingang (Inbound Shipments)
- Inventur-Sessions inkl. Snapshots und Zählungen
- Versandkosten-Zuordnung

## Betroffene Tabellen

### Wareneingang
- `app_inbound_shipments` - Wareneingänge (Header)
- `app_inbound_shipment_items` - Einzelne Positionen des Wareneingangs

### Inventur
- `app_inventory_sessions` - Inventur-Sessions
- `app_inventory_snapshots` - Bestandsaufnahmen zu Session-Start
- `app_inventory_counts` - Tatsächliche Zählungen während der Inventur

## Regeln & Invarianten

---

## WARENEINGANG & VERSANDKOSTEN

### Versandkosten-Zuordnung: Zwei Szenarien

#### Szenario 1: Versandkosten in Auftragsbestätigung enthalten
**Regel:** `app_purchase_orders.separate_invoice_for_shipping_cost = false`

- Versandkosten werden **direkt in der Bestellung** erfasst
- Feld: `app_purchase_orders.shipping_cost_net`
- Beim Anlegen von Wareneingangs-Positionen werden diese Versandkosten automatisch zum Wareneingang kopiert (Trigger: `trgfn_propagate_po_shipping_to_shipment`)

**Workflow:**
1. Bestellung anlegen mit `shipping_cost_net` > 0
2. `separate_invoice_for_shipping_cost = false`
3. Wareneingang anlegen → Versandkosten werden automatisch übernommen

#### Szenario 2: Versandkosten kommen später (separate Rechnung)
**Regel:** `app_purchase_orders.separate_invoice_for_shipping_cost = true`

- Versandkosten werden **NICHT** in der Bestellung erfasst
- `app_purchase_orders.shipping_cost_net` MUSS 0 sein (Constraint: `chk_separate_invoice_shipping_cost`)
- Versandkosten werden **manuell im Wareneingang** eingetragen
- Feld: `app_inbound_shipments.shipping_cost`

**Workflow:**
1. Bestellung anlegen mit `separate_invoice_for_shipping_cost = true`
2. `shipping_cost_net = 0` (automatisch oder durch Constraint erzwungen)
3. Wareneingang anlegen
4. Versandkosten manuell im Wareneingang eintragen (wenn Rechnung vorliegt)

### Constraint: chk_separate_invoice_shipping_cost
```sql
CHECK (
  separate_invoice_for_shipping_cost = false
  OR
  (separate_invoice_for_shipping_cost = true AND COALESCE(shipping_cost_net, 0) = 0)
)
```

**Bedeutung:**
- Wenn `separate_invoice_for_shipping_cost = true`, dann MUSS `shipping_cost_net = 0` sein
- Verhindert Daten-Inkonsistenzen
- Erzwingt klare Trennung zwischen den beiden Szenarien

### Versandkosten-Verteilung
Wenn ein Wareneingang `shipping_cost` > 0 hat, werden diese Kosten proportional auf alle Positionen verteilt (Trigger: `trgfn_inbound_shipment_distribute_shipping_costs`):

1. Berechne Gesamtwert aller Positionen
2. Verteile Versandkosten proportional nach Warenwert
3. Speichere in `app_inbound_shipment_items.shipping_costs_proportional`

---

## INVENTUR

### Snapshot-Erstellung
Beim Start einer Inventur (`rpc_app_inventory_session_start`) wird ein Snapshot erstellt.

**Wichtig**: Nur relevante Produkte werden erfasst:
- Produkte mit aktuellem Bestand <> 0 (`bb_StockCurrent <> 0`)
- ODER Produkte, die im letzten Jahr in Bestellungen vorkamen:
  - `app_purchase_orders_positions_normal`
  - `app_purchase_orders_positions_special`

Dies reduziert die Inventur auf tatsächlich relevante Artikel und vermeidet unnötige Zählarbeit.

### Fortschrittsberechnung
Die Frontend-Anzeige berechnet den Fortschritt als:
```
Fortschritt = gezählte_relevante_produkte / relevante_produkte_gesamt
```

Wobei "relevant" wie oben definiert ist.

### Constraints
- Nur eine aktive Inventur (`status = 'counting' oder 'review'`) gleichzeitig
- Status-Werte: `counting`, `review`, `completed`

## Actions

### Write-Flow: Inventur starten
Frontend ruft `rpc_app_inventory_session_start` auf:
1. Prüft, ob bereits aktive Inventur läuft
2. Erstellt neue Session mit Status `counting`
3. Erstellt Snapshots nur für relevante Produkte (siehe oben)

### Write-Flow: Fortschritt anzeigen
Frontend lädt:
1. Snapshots der Session (gefiltert nach relevanten Produkten)
2. Zugehörige Counts
3. Berechnet Verhältnis für Fortschrittsanzeige

## Änderungen

### 2026-02-02: Versandkosten-Trigger Fix (CRITICAL)
- **Migration `20260202100000_fix_shipping_trigger_constraint_violation.sql`**:
  - **PROBLEM:** Trigger `trgfn_inbound_shipment_distribute_shipping_costs` versuchte, Versandkosten zurück zur Purchase Order zu schreiben
  - Beim Update von `app_inbound_shipments.shipping_cost` wurde `app_purchase_orders.shipping_cost_net` erhöht UND `separate_invoice_for_shipping_cost = true` gesetzt
  - Dies verletzte den Constraint `chk_separate_invoice_shipping_cost`
  - **LÖSUNG:** "Backwards compatibility" Logik entfernt – Wareneingang ist Source of Truth für Versandkosten
  - Trigger verteilt jetzt nur noch auf Items, schreibt NICHT mehr zurück zur PO

### 2026-02-02: Versandkosten-Daten-Cleanup
- **Migration `20260202000000_fix_shipping_cost_constraint_violations.sql`**:
  - Behebt eventuelle Daten-Inkonsistenzen bei Purchase Orders
  - Findet alle POs mit `separate_invoice_for_shipping_cost = true` UND `shipping_cost_net > 0`
  - Verschiebt vorhandene Versandkosten zu verknüpften Wareneingängen
  - Setzt `shipping_cost_net` auf 0 (wie vom Constraint gefordert)

### 2026-01-20: Inventur-Snapshot-Optimierung
- **Migration `20260120000000_update_inventory_snapshot_logic.sql`**:
  - Snapshot-Logik angepasst: nur relevante Produkte werden erfasst
  - Verhindert unnötige Zählarbeit für irrelevante Artikel

- **Frontend-Umbau**:
  - Entfernung der View-Abhängigkeit (`view_inventory_sessions_with_product_count`)
  - Direkte Queries mit intelligenter Filterung
  - Live-Updates via Supabase Realtime
