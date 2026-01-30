# Domäne: Einkauf (Purchase Orders)

## Zweck

Die Einkaufs-Domäne verwaltet den gesamten Beschaffungsprozess von der Bestellungserstellung über die Bestellbestätigung bis hin zum Wareneingang. Sie bildet die Schnittstelle zwischen Lieferanten und dem Lager und ermöglicht die Verfolgung von Bestellstatus, Lieferterminen und Kosten.

**Wichtig:** Die WebApp ist die **Single Source of Truth (SSOT)** für Anschaffungskosten. Kosten werden über `app_products.cost_price` und `app_products.acquisition_cost` verwaltet und als `bb_CostNet` zu Billbee synchronisiert.

---

## Betroffene Tabellen

### Haupttabellen

#### `app_purchase_orders`
Kopftabelle für Bestellungen (Purchase Orders).

**Wichtige Felder:**
- `id` (uuid, PK): Eindeutige ID
- `order_number` (text, UNIQUE, NOT NULL): Automatisch generierte Bestellnummer (Format: `PO-YYYY-NNNN`)
- `status` (po_status, NOT NULL): Aktueller Bestellstatus (abgeleitet aus Positionsstatus)
- `ordered_at` (date): Bestelldatum
- `confirmed_at` (date): Datum der Bestellbestätigung
- `dol_planned_at` (date): Geplantes Lieferdatum (Date of Delivery)
- `dol_actual_at` (date): Tatsächliches Lieferdatum
- `supplier` (text): Lieferant (Freitext)
- `shipping_cost_net` (numeric): Versandkosten (netto)
- `separate_invoice_for_shipping_cost` (boolean): Flag für separate Versandkostenrechnung
- `invoice_number` / `invoice_date`: Rechnungsinformationen
- `invoice_file_url`: URL zur Rechnungsdatei (SharePoint)
- `confirmation_number` / `confirmation_file_url`: Bestellbestätigungsinformationen
- `notes` (text): Interne Notizen

**Constraints:**
- UNIQUE auf `order_number`
- `shipping_cost_net` DEFAULT 0 NOT NULL

---

#### `app_purchase_orders_positions_normal`
Positionen für normale Artikel (Standard-Bestellpositionen).

**Wichtige Felder:**
- `id` (uuid, PK)
- `order_id` (uuid, FK → app_purchase_orders, CASCADE DELETE)
- `billbee_product_id` (bigint, FK → app_products)
- `qty_ordered` (numeric, NOT NULL): Bestellte Menge
- `unit_price_net` (numeric): Einkaufspreis (netto)
- `po_item_status` (po_item_status): Positionsstatus
- `confirmed_at` / `dol_planned_at` / `dol_actual_at` / `goods_received_at`: Datum-Felder
- `fk_app_orders_id` / `fk_app_order_items_id`: Optionale Zuordnung zu Kundenaufträgen (für Streckengeschäfte)
- `internal_notes` (text): Interne Notizen

**Berechnete Felder:**
- `qty_received`: Summe der eingegangenen Mengen (aus `app_inbound_shipment_items`), berechnet via JOIN
- `qty_open`: Offene Menge (qty_ordered - qty_received), berechnet im Frontend oder via Query

---

#### `app_purchase_orders_positions_special`
Positionen für Sonderanfertigungen und PoD (Print-on-Demand).

**Wichtige Felder:**
- Alle Felder von `normal` plus:
- `base_model_billbee_product_id` (bigint, FK): Basis-Artikel
- `supplier_sku` (text): Lieferanten-Artikelnummer
- `details_override` (text): Sonderspezifikationen
- `sketch_needed` (boolean, DEFAULT true): Sketch-Freigabe erforderlich
- `sketch_confirmed_at` (date): Datum der Sketch-Freigabe
- `order_confirmation_ref` (text): Referenz zur Bestellbestätigung
- `external_file_url` (text): URL zu externen Dateien (z.B. Sketch auf SharePoint)

---

#### `app_suppliers`
Stammdaten der Lieferanten.

**Wichtige Felder:**
- `id` (text, PK): Lieferantenname (dient als ID)
- `short_code` (text, UNIQUE): Kurzkürzel
- `email` / `phone` / `website`: Kontaktdaten
- `default_currency` (text, DEFAULT 'EUR'): Standardwährung
- `payment_terms_days` (int, DEFAULT 0): Zahlungsziel in Tagen
- `default_incoterm` (text): Standard-Lieferbedingung (z.B. EXW, FOB)
- `default_leadtime_days` (int, DEFAULT 0): Standard-Lieferzeit
- `vat_number` / `tax_country`: Steuerinformationen
- Adressfelder: `address_line1`, `postal_code`, `city`, `country`, etc.
- `active` (boolean, DEFAULT true): Lieferant aktiv
- `separate_invoice_for_shipping_cost` (boolean): Standardwert für separate Versandkostenrechnung
- `default_order_channel` / `default_payment_method`: Standard-Bestellkanal und Zahlungsart
- `account_number` (numeric): Kreditorennummer

**Constraints:**
- UNIQUE auf `short_code`

---

#### `app_products` (Kostenfelder)
Verwaltung der Anschaffungskosten (SSOT für Kosten, nicht Billbee).

**Kostenfelder:**
- `cost_price` (numeric, NOT NULL, DEFAULT 0): Basis-Einkaufspreis (netto, ohne Versandkosten)
  - Wird automatisch aktualisiert aus neuester PO-Position (`unit_price_net`)
  - Trigger: `trgfn_po_position_normal_update_cost_price`
- `acquisition_cost` (numeric, NOT NULL, DEFAULT 0): Anschaffungsnebenkosten (ANK) pro Stück
  - Wird automatisch aktualisiert beim Wareneingang-Posting
  - Entspricht anteiligen Versandkosten: `shipping_costs_proportional / qty_delivered`
  - Trigger: `trgfn_inbound_item_posted_enforcement`
- `bb_CostNet` (numeric, GENERATED ALWAYS): Gesamtkosten (EK + ANK)
  - Für normale Produkte: `cost_price + acquisition_cost`
  - Für Stücklisten (BOMs): Summe aller Komponenten-Kosten
  - Wird zu Billbee synchronisiert (via n8n)

**Legacy-Felder (nicht mehr verwenden):**
- `bb_net_purchase_price`: Alte Billbee-Sync-Daten (read-only, wird entfernt)

---

#### `bom_recipes` (Stücklisten)
Verknüpfung von Stücklistenprodukten mit ihren Komponenten.

**Felder:**
- `id` (bigint, PK)
- `billbee_bom_id` (bigint, FK → app_products): Stücklistenprodukt (Parent)
- `billbee_component_id` (bigint, FK → app_products): Komponente (Child)
- `quantity` (numeric, NOT NULL): Menge der Komponente pro Parent-Einheit

**Constraints:**
- UNIQUE auf (`billbee_bom_id`, `billbee_component_id`)
- CHECK: `quantity > 0`

**Verwendung:**
- `bb_CostNet` für BOMs wird automatisch aus Komponenten berechnet
- Formel: `SUM(component.bb_CostNet * quantity)` für alle Komponenten

---

#### `app_inbound_shipments` (Wareneingang)
Wareneingänge mit Versandkosten.

**Wichtige Felder (Versandkosten-relevant):**
- `shipping_cost` (numeric): Gesamte Versandkosten für diesen Wareneingang
  - Wird entweder aus PO übernommen oder manuell erfasst
  - Bei `separate_invoice_for_shipping_cost = true`: Manuelle Erfassung
- `status` (is_status): Status des Wareneingangs (derived von Items)

**Versandkosten-Quelle:**
- Wenn PO Versandkosten hat → automatisch beim ersten Item übertragen
- Wenn `separate_invoice_for_shipping_cost = true` → manuell erfassen

---

#### `app_inbound_shipment_items` (Wareneingangs-Positionen)
SSOT für Versandkosten-Allokation.

**Wichtige Felder:**
- `shipping_costs_proportional` (numeric): Anteilige Versandkosten für dieses Item
  - Berechnet aus `app_inbound_shipments.shipping_cost` basierend auf Warenwert
  - Formel: `(qty_delivered * unit_price_net / total_value) * shipping_cost`
  - **Dies ist die einzige Source of Truth für ANK-Allokation**
- `quantity_delivered` (numeric): Gelieferte Menge
  - **Read-only nach `item_status = 'posted'`** (Billbee-Sync)
- `item_status` (is_status): Status (`planned`, `delivered`, `posted`)

**Trigger:**
- Bei `item_status → 'posted'`:
  - `qty_delivered` wird read-only
  - `acquisition_cost` in `app_products` wird aktualisiert

---

## Enums

### `po_status`
```sql
'draft'                      -- Entwurf
'ordered'                    -- Bestellt
'confirmed'                  -- Bestätigt
'in_production'              -- In Produktion
'partially_in_production'    -- Teilweise in Produktion
'delivered'                  -- Geliefert
'partially_delivered'        -- Teilweise geliefert
'cancelled'                  -- Storniert
```

### `po_item_status`
```sql
'draft'                -- Entwurf
'ordered'              -- Bestellt
'confirmed'            -- Bestätigt
'in_production'        -- In Produktion
'delivered'            -- Geliefert
'paused'               -- Pausiert
'cancelled'            -- Storniert
'partially_delivered'  -- Teilweise geliefert
```

### `po_item_kind`
```sql
'normal'         -- Normaler Artikel
'special_order'  -- Sonderanfertigung
'pod'            -- Print-on-Demand
```

---

## Regeln & Invarianten

### Kosten-Management (SSOT: WebApp, nicht Billbee)

**1. cost_price Update:**
- Wird automatisch aktualisiert bei INSERT/UPDATE von `unit_price_net` in PO-Position
- Nur wenn diese Position die neueste für das Produkt ist (nach `created_at`)
- Trigger: `trgfn_po_position_normal_update_cost_price`

**2. acquisition_cost Update:**
- Wird automatisch aktualisiert beim Wareneingang-Posting
- Berechnung: `shipping_costs_proportional / qty_delivered`
- Überschreibt vorherigen Wert (immer neuester Wert)
- Trigger: `trgfn_inbound_item_posted_enforcement`

**3. bb_CostNet Berechnung:**
- Automatisch via GENERATED COLUMN
- Normale Produkte: `cost_price + acquisition_cost`
- Stücklisten: Rekursive Summe aller Komponenten

**4. Billbee-Sync:**
- `bb_CostNet` wird via n8n zu Billbee synchronisiert
- `bb_net_purchase_price` ist READ-ONLY (Legacy, wird nicht mehr verwendet)

---

### Versandkosten-Management

**Quelle:**
- `app_purchase_orders.shipping_cost_net`: Aus Lieferanten-Bestätigung
- `app_inbound_shipments.shipping_cost`: Aus PO oder manuell

**Verteilung:**
- Bei INSERT von Inbound-Shipment: Volle Versandkosten addiert
- Bei UPDATE: Nur Differenz addiert
- Proportional nach Warenwert auf alle Items verteilt
- Formel: `(qty_delivered * unit_price_net / total_value) * shipping_cost`

**SSOT:**
- `app_inbound_shipment_items.shipping_costs_proportional`
- **NICHT** in PO-Positions (deprecated)

**Trigger:**
- `trgfn_inbound_shipment_distribute_shipping_costs`

---

### Separate Versandkostenrechnung

**Constraint:**
```sql
CHECK (
  separate_invoice_for_shipping_cost = false
  OR
  (separate_invoice_for_shipping_cost = true AND shipping_cost_net = 0)
)
```

**Bedeutung:**
- Wenn `separate_invoice_for_shipping_cost = true` → PO hat keine Versandkosten
- Versandkosten werden manuell über Inbound-Shipment erfasst
- Warning wird angezeigt, aber kein Hard-Block

---

### Wareneingang-Posting Enforcement

**Read-only nach Posting:**
- `quantity_delivered` kann nach `item_status = 'posted'` nicht mehr geändert werden
- Grund: Bereits zu Billbee synchronisiert
- Fehler: `PODLV` mit Hinweis auf Storno-Prozess

**Trigger:**
- `trg_inbound_item_qty_readonly` (BEFORE UPDATE)

---

### Statusübergänge (Positionsebene)

**Erlaubte Vorwärts-Übergänge:**
- `draft` → `ordered`
- `ordered` → `confirmed`
- `confirmed` → `in_production`
- `in_production` → `partially_delivered` | `delivered`
- `partially_delivered` → `delivered`

**Jederzeit erlaubt:**
- Beliebiger Status → `paused` | `cancelled`
- `paused` → zurück in Vorwärtskette

**Terminal:**
- `delivered` und `cancelled` sind Endstatus (außer paused/cancelled)

**Durchgesetzt durch:**
- Trigger: `trgfn_app_purchase_orders_positions_po_item_status_restrict_tra`

---

### Status-Ableitung (Header-Ebene)

Der Header-Status (`app_purchase_orders.status`) wird **automatisch** aus den Positionsstatus berechnet.

**Logik:**
1. Aktive Positionen = alle - cancelled - paused
2. Wenn alle aktiven delivered → `delivered`
3. Wenn mind. 1 delivered, aber nicht alle → `partially_delivered`
4. Wenn einige in_production → `partially_in_production`
5. Wenn alle aktiven in_production → `in_production`
6. Wenn alle confirmed → `confirmed`
7. Wenn alle ordered → `ordered`
8. Wenn alle draft → `draft`

**Durchgesetzt durch:**
- Funktion: `fn_app_purchase_orders_status_derive_from_items(p_order_id)`
- Trigger: `trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st` (AFTER UPDATE/INSERT/DELETE auf Positionen)

---

### Automatische Bestellnummerierung

- Format: `PO-YYYY-NNNN` (z.B. `PO-2026-0001`)
- Jahr wird aus `ordered_at` oder aktuellem Jahr abgeleitet
- Advisory Lock verhindert Doppelvergabe bei parallelen Inserts
- Seriennummer ist 4-stellig gepaddet

**Durchgesetzt durch:**
- Trigger: `trgfn_app_purchase_orders_order_number_assign` (BEFORE INSERT)

---

### Automatischer Status-Übergang bei confirmed (Normal-Positionen)

Wenn eine normale Position auf `confirmed` gesetzt wird, springt sie **automatisch** sofort auf `in_production`.

**Grund:** Normale Artikel benötigen keine Sketch-Freigabe.

**Durchgesetzt durch:**
- Trigger: `trgfn_app_purchase_orders_positions_normal_po_item_status_auto_` (AFTER UPDATE)

---

### Automatischer Status-Übergang bei confirmed (Special-Positionen)

Wenn eine Sonderposition auf `confirmed` gesetzt wird:
- **Falls `sketch_needed = false`**: automatisch → `in_production`
- **Falls `sketch_needed = true`**: bleibt auf `confirmed` bis Sketch freigegeben

**Durchgesetzt durch:**
- Trigger: `trgfn_app_purchase_orders_positions_special_po_item_status_auto` (AFTER UPDATE)

---

### Mengen-/FK-Änderungen nach Posting

Sobald ein `app_inbound_shipment_item.item_status = 'posted'` ist, sind folgende Änderungen **verboten**:
- `quantity_delivered` (read-only)
- `po_item_normal_id`
- `po_item_special_id`

**Grund:** Integritätssicherung nach Bestandsbuchung zu Billbee.

**Durchgesetzt durch:**
- Trigger: `trg_inbound_item_qty_readonly` (BEFORE UPDATE)
- Trigger: `trgfn_app_inbound_shipment_items_fks_quantity_delivered_restric` (BEFORE UPDATE)

---

### ~~Versandkostenzuordnung (DEPRECATED)~~

**⚠️ VERALTET:** Diese Logik wurde durch neue Versandkosten-Verteilung ersetzt (siehe oben).

~~`app_purchase_orders.shipping_cost_net` → `app_inbound_shipments.shipping_cost` → Verteilung~~

**NEU:** Versandkosten werden ausschließlich über `app_inbound_shipments.shipping_cost` verwaltet und auf Items verteilt.

---

## Aktionen (Write-Flows & RPCs)

### RPC: `rpc_app_purchase_orders_positions_po_item_status_set_for_order`

**Zweck:** Setzt den Status ALLER Positionen einer Bestellung auf einmal.

**Parameter:**
- `p_order_id` (uuid): Bestell-ID
- `p_status` (text): Neuer Status (`ordered` oder `confirmed`)
- `p_dol_planned_at` (date, optional): Geplantes Lieferdatum

**Validierung:**
- Statusübergänge sind beschränkt:
  - Von `draft` nur → `ordered`
  - Von `ordered` nur → `confirmed`

**Aktionen:**
1. Setzt `po_item_status` für alle Normal- und Special-Positionen
2. Bei `ordered`: setzt `ordered_at` auf Header
3. Bei `confirmed`: setzt `proforma_confirmed_at` und optional `dol_planned_at` auf Header
4. Ruft `fn_app_purchase_orders_status_derive_from_items` auf

**Rückgabe:** JSON mit Anzahl aktualisierter Positionen

**Verwendung:**
- Frontend: Bestellbestätigungs-Buttons (z.B. "Bestellung aufgeben", "Bestellung bestätigen")

---

### RPC: `rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad`

**Zweck:** Bestätigt Sketch für eine Sonderposition und setzt sie auf `in_production`.

**Parameter:**
- `p_item_id` (uuid): Special-Positions-ID

**Aktionen:**
1. Setzt `sketch_confirmed_at = now()`
2. Setzt `po_item_status = 'in_production'`
3. Nur wenn `sketch_confirmed_at` noch NULL war (Idempotenz)

**Verwendung:**
- Frontend: Sketch-Freigabe-Button

---

### Write-Flow: Replace-Children Pattern (Positionen)

**Pattern:**
1. DELETE alte Positionen (CASCADE über FK)
2. INSERT neue Positionen

**Verwendung:**
- Frontend: Bestellung bearbeiten (komplette Positionsliste ersetzen)

**Schutz:**
- Trigger verhindern ungültige Statusübergänge
- FK Constraints sichern Datenintegrität

---

### Write-Flow: Wareneingang → Status-Update

**Ablauf:**
1. `app_inbound_shipment_items` INSERT/UPDATE
2. Trigger aktualisiert `po_item_status` basierend auf empfangenen Mengen:
   - Wenn `qty_received >= qty_ordered` → `delivered`
   - Wenn `qty_received > 0` und `< qty_ordered` → `partially_delivered`
3. Trigger auf Positions-Ebene triggert Header-Status-Neuberechnung

**Durchgesetzt durch:**
- Trigger: `trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste`
- Trigger: `trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st`

---

## RLS Policies

**Alle Tabellen:**
- `authenticated`: Voller Zugriff für authentifizierte Benutzer

**Tabellen:**
- `app_purchase_orders`
- `app_purchase_orders_positions_normal`
- `app_purchase_orders_positions_special`
- `app_suppliers`



---

## Trigger-Übersicht

| Trigger | Tabelle | Event | Zweck |
|---------|---------|-------|-------|
| `trg_app_po_assign_order_number` | app_purchase_orders | BEFORE INSERT | Bestellnummer generieren |
| `trg_po_position_normal_update_cost_price` | app_purchase_orders_positions_normal | AFTER INSERT/UPDATE | **NEU:** cost_price aktualisieren |
| `trg_distribute_shipping_costs` | app_inbound_shipments | AFTER INSERT/UPDATE | **NEU:** Versandkosten verteilen |
| `trg_inbound_item_qty_readonly` | app_inbound_shipment_items | BEFORE UPDATE | **NEU:** qty_delivered read-only nach Posting |
| `trg_inbound_item_update_acquisition_cost` | app_inbound_shipment_items | AFTER UPDATE | **NEU:** acquisition_cost aktualisieren |
| `trgfn_app_purchase_orders_positions_po_item_status_restrict_tra` | beide Positions-Tabellen | BEFORE UPDATE | Statusübergangs-Validierung |
| `trgfn_app_purchase_orders_positions_normal_po_item_status_auto_` | app_purchase_orders_positions_normal | AFTER UPDATE | Auto-Übergang confirmed → in_production |
| `trgfn_app_purchase_orders_positions_special_po_item_status_auto` | app_purchase_orders_positions_special | AFTER UPDATE | Auto-Übergang confirmed → in_production (nur wenn sketch_needed=false) |
| `trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st` | beide Positions-Tabellen | AFTER UPDATE/INSERT/DELETE | Header-Status neu berechnen |
| `trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste` | app_inbound_shipment_items | AFTER INSERT/UPDATE/DELETE | Po-Item-Status synchronisieren bei Wareneingang |

**Entfernte Trigger (Migration 2026-01-22):**
- ~~`trg_po_recalc_shipping_on_status`~~ (obsolet)
- ~~`trg_au__allocate_shipping_costs_from_is`~~ (ersetzt durch `trg_distribute_shipping_costs`)
- ~~`trg_separate_invoice_restriction`~~ (ersetzt durch CHECK Constraint)

---

## Neue Felder (Migration 2026-01-22)

### app_products
- ✅ `cost_price` (numeric): Basis-EK, aktualisiert aus PO
- ✅ `acquisition_cost` (numeric): ANK, aktualisiert aus Wareneingang
- ✅ `bb_CostNet` (GENERATED): Gesamtkosten (Normal: cost_price + acquisition_cost, BOM: Summe Komponenten)

### app_inbound_shipments
- ✅ `shipping_cost` (umbenannt von `shipping_cost_separate`)

### Deprecated Felder
- ⚠️ `app_purchase_orders_positions_normal.shipping_costs_proportional` (wird in Zukunft entfernt)
- ⚠️ `app_purchase_orders_positions_special.shipping_costs_proportional` (wird in Zukunft entfernt)
- ⚠️ `app_products.bb_net_purchase_price` (read-only Legacy)

---

## Breaking Changes Policy

**NIEMALS ohne Migration:**
- `order_number` umbenennen oder Format ändern
- `po_status` / `po_item_status` Enums ändern
- `app_purchase_orders_positions_*` Tabellen zusammenführen
- FK-Constraints auf Positionen löschen
- Trigger-Logik für Status-Ableitung ändern

**Expand → Switch → Remove Pattern erforderlich für:**
- Neue Positionstypen hinzufügen
- Status-Logik erweitern
- Neue Constraints hinzufügen

---

## Integration mit anderen Domänen

### Lager (Wareneingang)
- `app_inbound_shipments` / `app_inbound_shipment_items` referenzieren POs
- FK: `order_id` → `app_purchase_orders.id`
- FK: `po_item_normal_id` / `po_item_special_id` → Positionen
- Trigger synchronisieren Status bidirektional

### Artikel
- FK: `billbee_product_id` → `app_products.id`
- Supplier-Zuordnung über `app_products.fk_bb_supplier`

### Kundenberatung (Streckengeschäft)
- Optionale FK: `fk_app_orders_id` / `fk_app_order_items_id`
- Ermöglicht Zuordnung von PO-Positionen zu Kundenaufträgen

### Buchhaltung
- `invoice_number` / `invoice_date` / `invoice_file_url`
- Versandkosten werden für ANK-Kalkulation genutzt

### SharePoint (Dateien)
- `invoice_file_url` / `confirmation_file_url` / `external_file_url`
- Pfade: `/00 WebApp/einkauf/*`

### n8n (Integrationen)
- Outbox-Pattern für Billbee-Stock-Sync nach Wareneingang
- Funktion: `fn_is_post_and_dispatch` (schreibt in `integration_outbox`)

---

## Häufige Queries

### Offene Bestellungen
```sql
SELECT * FROM app_purchase_orders
WHERE status NOT IN ('delivered', 'cancelled');
```

### Positionen mit offenen Mengen (mit Wareneingangs-Aggregation)
```sql
SELECT 
  pn.*,
  COALESCE(SUM(isi.quantity_delivered), 0) AS qty_received,
  GREATEST(pn.qty_ordered - COALESCE(SUM(isi.quantity_delivered), 0), 0) AS qty_open
FROM app_purchase_orders_positions_normal pn
LEFT JOIN app_inbound_shipment_items isi ON isi.po_item_normal_id = pn.id
WHERE pn.po_item_status NOT IN ('delivered', 'cancelled')
GROUP BY pn.id
HAVING GREATEST(pn.qty_ordered - COALESCE(SUM(isi.quantity_delivered), 0), 0) > 0;
```

### Bestellungen mit überfälligen Lieferterminen
```sql
SELECT * FROM app_purchase_orders
WHERE dol_planned_at < CURRENT_DATE
  AND status NOT IN ('delivered', 'cancelled');
```

### Sonderpositionen mit ausstehender Sketch-Freigabe
```sql
SELECT * FROM app_purchase_orders_positions_special
WHERE sketch_needed = true
  AND sketch_confirmed_at IS NULL
  AND po_item_status = 'confirmed';
```

---

## Veraltete Strukturen (Deprecation Notice)

### Views (Legacy)
Die folgenden Views existieren noch in der Datenbank, sind aber **veraltet** und sollten nicht mehr verwendet werden:

- `app_purchase_orders_positions_normal_view`
- `app_purchase_orders_positions_special_view`
- `app_purchase_orders_view`

**Grund:** Views-on-Views haben zu Komplexität und Debugging-Problemen geführt (siehe AGENTS.md).

**Aktuelle Frontend-Verwendung:**
- Keine direkte Verwendung in Einkaufs-Komponenten gefunden

**Migration erforderlich:**
- Frontend sollte direkt gegen Basistabellen querien
- Aggregationen (qty_received, qty_open) sollten im Frontend oder via explizite JOINs berechnet werden

### Reports (Legacy)
**Ehemalige Views (jetzt gelöscht):**
- `rpt_products_inventory_purchasing` 
  - ⚠️ **Wurde am 2026-01-19 entfernt**
  - Ersetzt durch direkte Queries auf `app_products` mit Joins zu `stg_billbee_stock`, `stg_billbee_stock_committed`, und `app_component_sales_last_3_months`
  - Frontend berechnet Aggregationen selbst (siehe [bestellvorschlaege/page.tsx](src/app/(authenticated)/einkauf/bestellvorschlaege/page.tsx))

---

## Bekannte Einschränkungen

1. **Keine Teilstornos:** Positionsstatus `cancelled` ist terminal. Kein Rollback möglich.
2. **Keine Mengenänderungen nach Posting:** Wareneingänge können nach Buchung nicht mehr korrigiert werden (nur Storno/Neuanlage).
3. **Supplier-Feld ist Freitext:** `app_purchase_orders.supplier` ist nicht FK-gesichert (historische Gründe, sollte ggf. refactored werden zu FK).
4. **Keine automatische Mahnfunktion:** Überfällige Liefertermine müssen manuell überwacht werden.

---

## Change Log

- **2026-01-17**: Initiale Dokumentation basierend auf remote_schema.sql
