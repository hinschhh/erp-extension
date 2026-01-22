# Analyse: Purchase Order Status & Versandkosten-Logik

**Datum:** 22. Januar 2026  
**Kontext:** Bugs bei Statusübergängen und fehlende `fn_po_recalc_shipping_allocation` Function

---

## 🔴 KRITISCHE BEFUNDE

### 1. Fehlende Funktion: `fn_po_recalc_shipping_allocation`

**Status:** ❌ **NICHT GEFUNDEN**

**Verwendung:**
- Wird in Trigger `trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i` aufgerufen
- Location: [migration line 1306](supabase/migrations/20260117160301_remote_schema.sql#L1306)

```sql
CREATE OR REPLACE FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"() 
RETURNS "trigger" AS $$
begin
    if new.status = 'partially_in_production'
       and (old.status is distinct from new.status) then
        perform public.fn_po_recalc_shipping_allocation(new.id);  -- ❌ FUNKTION EXISTIERT NICHT
    end if;
    return new;
end;
$$;
```

**Trigger ist aktiv:**
```sql
CREATE OR REPLACE TRIGGER "trg_po_recalc_shipping_on_status" 
AFTER UPDATE ON "public"."app_purchase_orders" 
FOR EACH ROW 
EXECUTE FUNCTION "public"."trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i"();
```

**Auswirkung:**
- ✅ Trigger feuert, wenn PO-Status → `partially_in_production` wechselt
- ❌ Function-Call schlägt fehl → **gesamte Transaktion wird abgebrochen**
- 🚨 **Dies verhindert jeden Statuswechsel zu `partially_in_production`**

**Betroffene User-Actions:**
- Sketch-Bestätigung über `sketch_confirm_button`
- Manuelle Statusänderungen von Positionen
- Wareneingang-Buchungen, die Status triggern

---

### 2. Versandkosten-Architektur: Dual-System Problem

#### Aktueller Zustand (2 parallele Systeme):

##### System 1: PO-Level (Legacy)
```sql
-- Tabelle: app_purchase_orders
shipping_cost_net numeric DEFAULT 0  -- Versandkosten auf Bestellebene
separate_invoice_for_shipping_cost boolean
```

**Verhalten:**
- Wird bei Wareneingang automatisch verteilt auf POs (basierend auf Menge)
- Trigger: `trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc` (Part 1)
- ⚠️ Problem: Grobgranular, nicht positionsgenau

##### System 2: Shipment-Item-Level (Neu)
```sql
-- Tabelle: app_inbound_shipment_items
shipping_costs_proportional numeric DEFAULT 0
```

**Verhalten:**
- Wird bei Wareneingang proportional verteilt (basierend auf Warenwert)
- Trigger: `trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc` (Part 2)
- ✅ Feingranular, positionsgenau
- Wird für ANK-Kalkulation verwendet

**Comment in DB:**
```sql
COMMENT ON COLUMN "public"."app_inbound_shipment_items"."shipping_costs_proportional" IS 
'Proportional share of shipping costs (ANK/Anschaffungsnebenkosten) allocated to this specific shipment item. 
Calculated from app_inbound_shipments.shipping_cost_separate based on item value proportion.
This is the ONLY source of truth for ANK allocation. Position tables no longer have this field.';
```

#### Problem:
- Beide Systeme existieren parallel
- Legacy PO-Level wird noch befüllt (backwards compatibility)
- **Keine klare Migration dokumentiert**
- Function `fn_po_recalc_shipping_allocation` sollte vermutlich Legacy-System zurückrechnen (?)

---

### 3. Statusmanagement: Komplexe Logik mit Race Conditions

#### 3.1 Status-Ableitungs-Kaskade

**Auslöser:**  
Jede Änderung an `app_purchase_orders_positions_*` (INSERT/UPDATE/DELETE)

**Trigger-Kette:**
```
Position UPDATE
  ↓
trg_update_po_status_normal/special
  ↓
trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st
  ↓
fn_app_purchase_orders_status_derive_from_items(order_id)
  ↓
UPDATE app_purchase_orders.status
  ↓
trg_po_recalc_shipping_on_status  (wenn Status = 'partially_in_production')
  ↓
❌ fn_po_recalc_shipping_allocation(order_id)  -- FEHLT!
```

**Race Condition Risiko:**
- Trigger feuert bei JEDEM Position-Update
- Wenn mehrere Positionen gleichzeitig geändert werden → mehrfache Statusneuberechnung
- Keine Advisory Locks in `fn_app_purchase_orders_status_derive_from_items`

---

#### 3.2 Auto-Advance Trigger (Automatische Status-Sprünge)

##### Normal-Positionen:
```sql
-- Trigger: trg_po_item_auto_advance_normal
-- Aktion: confirmed → in_production (sofort)
if new.po_item_status = 'confirmed' then
    update public.app_purchase_orders_positions_normal
       set po_item_status = 'in_production',
           updated_at = now()
     where id = new.id;
end if;
```

**Problematik:**
- UPDATE innerhalb eines AFTER-Triggers
- Löst **erneut** den Status-Trigger aus (rekursiv!)
- ⚠️ Könnte zu unerwarteten Status-Sprüngen führen

##### Special-Positionen:
```sql
-- Trigger: trg_po_item_auto_advance_special
-- Aktion: confirmed → in_production (nur wenn sketch_needed = false)
if new.po_item_status = 'confirmed' then
    needs_sketch := new.sketch_needed;
    if coalesce(needs_sketch, false) = false then
      update public.app_purchase_orders_positions_special
         set po_item_status = 'in_production',
             updated_at = now()
       where id = new.id;
    end if;
end if;
```

**Problematik:**
- Gleiche rekursive Trigger-Problematik
- `sketch_needed` DEFAULT ist `true` → fast nie automatischer Übergang

---

#### 3.3 Wareneingangs-Trigger (Automatische Status-Sprünge bei Lieferung)

```sql
-- Trigger: trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste
-- Aktion: Setzt Position auf 'delivered' oder 'partially_delivered'
-- Bedingung: NUR wenn item_status = 'posted'

-- Problem:
if v_count_posted > 0 then
    if v_sum_posted >= v_qty_ordered then
        -- Spring direkt auf 'delivered'
        update public.app_purchase_orders_positions_normal p
           set po_item_status = 'delivered',
               goods_received_at = case when p.goods_received_at is null then now() else p.goods_received_at end,
               updated_at = now()
         where p.id = v_normal_id;
    else
        -- Spring auf 'partially_delivered'
        update public.app_purchase_orders_positions_normal p
           set po_item_status = 'partially_delivered',
               updated_at = now()
         where p.id = v_normal_id;
    end if;
end if;
```

**Problematik:**
- Keine Validierung gegen `trgfn_app_purchase_orders_positions_po_item_status_restrict_tra`
- ⚠️ **Kann Status-Restriktionen umgehen!**
- Beispiel: Position in `confirmed` → Wareneingang → direkt `delivered` (überspringt `in_production`)

---

#### 3.4 Status-Restriktions-Trigger

```sql
-- Trigger: trgfn_app_purchase_orders_positions_po_item_status_restrict_tra
-- Typ: BEFORE UPDATE
-- Gilt für: BEIDE Positions-Tabellen

-- Erlaubte Übergänge:
draft → ordered
ordered → confirmed
confirmed → in_production
in_production → partially_delivered | delivered
partially_delivered → delivered

-- Anytime erlaubt:
* → paused | cancelled
paused → (zurück in Vorwärtskette)

-- Terminal:
cancelled: keine Änderung mehr
delivered: keine Änderung mehr (außer → paused/cancelled, die oben abgefangen werden)
```

**Problematik:**
- ✅ Gut definiert
- ❌ Wird von Auto-Advance Triggern **nicht** durchlaufen (da diese direkt UPDATEn)
- ❌ Wird von Wareneingangs-Trigger **nicht** durchlaufen

---

#### 3.5 Status-Ableitungs-Logik (Header)

```sql
-- Funktion: fn_app_purchase_orders_status_derive_from_items
-- Logik (vereinfacht):

active_open := total - cancelled - paused

if active_open = 0: 
    status = 'draft'

-- Priorität 1: Lieferung
elsif cnt_delivered >= active_open: 
    status = 'delivered'
elsif cnt_delivered > 0: 
    status = 'partially_delivered'

-- Priorität 2: Produktion
elsif cnt_in_production > 0 and cnt_in_production < active_open: 
    status = 'partially_in_production'  -- ❌ TRIGGERT FEHLER!
elsif cnt_in_production = active_open: 
    status = 'in_production'

-- Priorität 3: Bestätigung
elsif cnt_confirmed = active_open: 
    status = 'confirmed'

-- Priorität 4: Bestellt
elsif cnt_ordered = active_open: 
    status = 'ordered'

-- Fallback
else: 
    status = 'draft'
```

**Problematik:**
- Logik ist nachvollziehbar, aber komplex
- `partially_in_production` **kann nie erreicht werden** (wegen fehlendem Function Call)
- Keine Fehlerbehandlung für unmögliche Zustandskombinationen

---

## 🐛 BUG-ANALYSE: Berichtete Probleme

### Bug 1: "Status springt versehentlich auf geliefert"

**Mögliche Ursachen:**

1. **Wareneingangs-Trigger überspringt Zwischenstatus**
   - User bucht Wareneingang → `item_status = 'posted'`
   - Trigger setzt Position direkt auf `delivered` (wenn Menge vollständig)
   - Position war evtl. noch in `confirmed` → übersprungen wird `in_production`
   - **Keine Validierung gegen Restriktions-Trigger!**

2. **Auto-Advance Trigger + Wareneingang = Doppelsprung**
   - User setzt Position auf `confirmed`
   - Auto-Advance Trigger → sofort `in_production`
   - Wareneingang-Buchung kurz danach → sofort `delivered`
   - Für User wirkt es wie ein Sprung `confirmed` → `delivered`

3. **Race Condition bei Massenänderungen**
   - User ändert mehrere Positionen gleichzeitig
   - Jede Änderung triggert Status-Neuberechnung
   - Zwischenstatus werden nicht sichtbar

**Empfehlung:**
- Wareneingangs-Trigger sollte Status-Restriktionen respektieren
- Alternativ: Wareneingangs-Trigger darf nur aus `in_production` heraus Status ändern

---

### Bug 2: "Positionen werden nicht in gewünschten Status überführt"

**Mögliche Ursachen:**

1. **Sketch-Bestätigung schlägt fehl**
   - Button ruft RPC auf: `rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad`
   - RPC setzt Position auf `in_production`
   - Trigger `trg_update_po_status_special` feuert
   - Header-Status wird neu berechnet
   - Wenn `partially_in_production` erreicht wird → **Transaction schlägt fehl** (fn_po_recalc_shipping_allocation fehlt)
   - **Position bleibt in `confirmed` stecken**

2. **Status-Restriktions-Fehler ohne Details**
   - User versucht ungültigen Übergang
   - Fehler: `Ungueltiger Statuswechsel: X -> Y`
   - **Keine Erklärung, warum ungültig**
   - **Keine Info, welche Übergänge erlaubt wären**

3. **Auto-Advance überschreibt manuelle Änderung**
   - User setzt Position auf `confirmed`
   - Auto-Advance Trigger setzt sofort auf `in_production` zurück
   - Frontend zeigt `confirmed` (cached)
   - Bei Refresh: Position ist in `in_production`
   - Für User wirkt es, als hätte Änderung nicht funktioniert

**Empfehlung:**
- Fehlende Function beheben (siehe unten)
- Fehlermeldungen detaillierter gestalten
- Auto-Advance Trigger überdenken (evtl. nur beim ersten confirmed-Setzen, nicht bei jedem UPDATE)

---

### Bug 3: "Function fn_po_recalc_shipping_allocation nicht gefunden"

**Ursache:** ✅ **BESTÄTIGT**
- Function existiert nicht in der Datenbank
- Trigger ist aktiv und versucht sie aufzurufen
- Transaction schlägt bei jedem `partially_in_production` Status fehl

**Betroffene Szenarien:**
- Sketch-Bestätigung mit mehreren Positionen (einige confirmed, andere in_production)
- Manuelles Setzen von Positionen auf in_production (wenn andere noch auf confirmed)
- Wareneingang mit Teillieferungen

---

## 🏗️ ARCHITEKTUR-KRITIK

### 1. Zu viele automatische Trigger

**Problem:**
- 3 verschiedene Auto-Advance Mechanismen:
  1. Normal: `confirmed` → `in_production` (immer)
  2. Special: `confirmed` → `in_production` (nur wenn sketch_needed=false)
  3. Wareneingang: `in_production` → `delivered` (bei Vollmenge)

- Jeder Trigger löst weitere Trigger aus
- Keine klare Trennung zwischen "User-Action" und "System-Action"
- Schwer zu debuggen

**Empfehlung (gemäß AGENTS.md):**
- Trigger sollten **nur technische Side-Effects** sein (updated_at, Nummerierung)
- Geschäftslogik gehört in RPCs oder Write-Flows
- Auto-Advance sollte explizit vom Frontend getriggert werden (nicht versteckt im Trigger)

---

### 2. Constraints zu schwach, Trigger zu komplex

**Problem:**
- Statusübergänge werden mit Trigger validiert (BEFORE UPDATE)
- **Aber:** Trigger können Trigger umgehen (siehe Auto-Advance + Wareneingang)
- **Bessere Lösung:** CHECK Constraint auf Status + Transition-Table

**Beispiel (nicht implementiert):**
```sql
-- Transition-Table
CREATE TABLE po_item_status_transitions (
    from_status po_item_status NOT NULL,
    to_status po_item_status NOT NULL,
    PRIMARY KEY (from_status, to_status)
);

-- Constraint
ALTER TABLE app_purchase_orders_positions_normal
ADD CONSTRAINT chk_status_transition 
CHECK (
    -- Entweder Status bleibt gleich
    po_item_status = OLD.po_item_status
    OR
    -- Oder Übergang ist in Transition-Table erlaubt
    EXISTS (
        SELECT 1 FROM po_item_status_transitions
        WHERE from_status = OLD.po_item_status
        AND to_status = NEW.po_item_status
    )
);
```

**Vorteil:**
- Constraints können **nicht** umgangen werden (auch nicht von Triggern)
- Transitions sind sichtbar in Tabelle (nicht versteckt in Trigger-Code)
- Leichter zu ändern

---

### 3. Fehlermeldungen zu generisch

**Beispiele:**

```sql
raise exception 'Statuswechsel von cancelled ist nicht erlaubt';
raise exception 'Statuswechsel von delivered ist nicht erlaubt';
raise exception 'Ungueltiger Statuswechsel: % -> %', old_s, new_s;
```

**Problem:**
- Keine strukturierte Fehlerbehandlung
- Frontend kann nicht unterscheiden zwischen verschiedenen Fehlern
- User bekommt keine Hinweise, was zu tun ist

**Bessere Lösung:**
```sql
-- Mit ERRCODE und HINT
raise exception 'Statuswechsel nicht erlaubt: % → %', old_s, new_s
    using 
        errcode = 'BUSTS',  -- Business Rule: Status Transition
        detail = format('Position ist bereits %s (Terminal-Status)', old_s),
        hint = 'Um diese Position zu ändern, muss sie zunächst auf "paused" gesetzt werden.';
```

**Frontend kann dann reagieren:**
```typescript
if (error.code === 'BUSTS') {
    message.error(`${error.message}\n\nHinweis: ${error.hint}`);
}
```

---

### 4. Versandkosten-System ist inkonsistent

**Problem:**
- Zwei parallele Systeme (PO-Level + Shipment-Item-Level)
- Keine klare Migration dokumentiert
- Function `fn_po_recalc_shipping_allocation` fehlt (sollte vermutlich Legacy-System zurückrechnen?)
- Trigger `trg_po_recalc_shipping_on_status` ist **nicht deaktiviert**

**Empfehlung:**
- Entweder: Legacy-System entfernen (Breaking Change, Migration erforderlich)
- Oder: Function implementieren (Backwards-Kompatibilität)
- **Nicht beides halb!**

---

## 🔧 EMPFOHLENE LÖSUNGEN

### Kurzfristig (Hotfix für Production)

#### Option 1: Function als No-Op implementieren
```sql
CREATE OR REPLACE FUNCTION public.fn_po_recalc_shipping_allocation(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Intentionally empty (legacy PO-level shipping allocation deprecated)
  -- Shipment-item-level allocation is now handled in:
  -- trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc (Part 2)
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.fn_po_recalc_shipping_allocation IS
'Legacy function - kept for backwards compatibility. 
Shipping allocation is now handled at shipment-item level.';
```

**Vorteil:**
- ✅ Sofort deploybar
- ✅ Behebt Fehler bei Sketch-Bestätigung
- ✅ Keine Breaking Changes

**Nachteil:**
- Legacy-System wird nicht zurückgerechnet (ggf. inkonsistent)

---

#### Option 2: Trigger deaktivieren
```sql
DROP TRIGGER IF EXISTS trg_po_recalc_shipping_on_status 
ON public.app_purchase_orders;
```

**Vorteil:**
- ✅ Sofort deploybar
- ✅ Behebt Fehler
- ✅ Entfernt tote Logik

**Nachteil:**
- Wenn Legacy-System noch gebraucht wird → Datenverlust

---

### Mittelfristig (Refactoring in 1-2 Sprints)

#### 1. Status-Validierung zu Constraints migrieren

**Migration:**
```sql
-- 1. EXPAND: Transition-Table anlegen
CREATE TABLE public.po_item_status_transitions (
    from_status po_item_status NOT NULL,
    to_status po_item_status NOT NULL,
    description text,
    PRIMARY KEY (from_status, to_status)
);

-- 2. Befüllen mit aktuellen Regeln
INSERT INTO po_item_status_transitions VALUES
    ('draft', 'ordered', 'Bestellung aufgeben'),
    ('ordered', 'confirmed', 'Bestellung bestätigen'),
    ('confirmed', 'in_production', 'In Produktion nehmen'),
    ('in_production', 'partially_delivered', 'Teillieferung gebucht'),
    ('in_production', 'delivered', 'Vollständig geliefert'),
    ('partially_delivered', 'delivered', 'Restlieferung gebucht'),
    -- Jederzeit erlaubt
    ('draft', 'paused', 'Pausieren'), 
    -- ... etc
    ;

-- 3. SWITCH: Frontend anpassen (erlaubte Übergänge aus DB laden)
-- 4. SWITCH: Trigger ersetzen durch Constraint (nach Test)
-- 5. REMOVE: Alte Trigger löschen
```

---

#### 2. Auto-Advance Trigger entfernen

**Migration:**
```sql
-- 1. EXPAND: RPC für expliziten Übergang
CREATE OR REPLACE FUNCTION public.rpc_po_item_advance_to_production(
    p_item_id uuid,
    p_item_type text  -- 'normal' | 'special'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_item_type = 'normal' THEN
        UPDATE app_purchase_orders_positions_normal
        SET po_item_status = 'in_production'
        WHERE id = p_item_id
        AND po_item_status = 'confirmed';
    ELSE
        -- Special: nur wenn sketch bestätigt
        UPDATE app_purchase_orders_positions_special
        SET po_item_status = 'in_production'
        WHERE id = p_item_id
        AND po_item_status = 'confirmed'
        AND (sketch_needed = false OR sketch_confirmed_at IS NOT NULL);
    END IF;
    
    RETURN jsonb_build_object('success', FOUND);
END;
$$;

-- 2. SWITCH: Frontend anpassen (Button für "In Produktion nehmen")
-- 3. REMOVE: Auto-Advance Trigger löschen
DROP TRIGGER IF EXISTS trg_po_item_auto_advance_normal 
ON app_purchase_orders_positions_normal;

DROP TRIGGER IF EXISTS trg_po_item_auto_advance_special 
ON app_purchase_orders_positions_special;
```

**Vorteil:**
- Explizite User-Action statt Magie
- Keine versteckten Statussprünge
- Leichter zu debuggen

---

#### 3. Fehlermeldungen verbessern

**Migration:**
```sql
-- 1. EXPAND: Error-Details-Table
CREATE TABLE public.po_item_status_transition_errors (
    from_status po_item_status PRIMARY KEY,
    error_code text NOT NULL,
    error_message text NOT NULL,
    error_hint text
);

INSERT INTO po_item_status_transition_errors VALUES
    ('cancelled', 'POSTE', 'Stornierte Positionen können nicht geändert werden', 
     'Bitte erstellen Sie eine neue Position oder wenden Sie sich an den Admin.'),
    ('delivered', 'POSTE', 'Gelieferte Positionen können nicht mehr geändert werden',
     'Für Korrekturen bitte Storno-Prozess verwenden.');

-- 2. SWITCH: Trigger anpassen
CREATE OR REPLACE FUNCTION trgfn_app_purchase_orders_positions_po_item_status_restrict_tra()
RETURNS trigger AS $$
DECLARE
    v_err record;
BEGIN
    -- Gleich bleiben OK
    IF OLD.po_item_status = NEW.po_item_status THEN
        RETURN NEW;
    END IF;
    
    -- Anytime-Ziele
    IF NEW.po_item_status IN ('paused', 'cancelled') THEN
        RETURN NEW;
    END IF;
    
    -- Terminal-Status
    IF OLD.po_item_status IN ('cancelled', 'delivered') THEN
        SELECT * INTO v_err 
        FROM po_item_status_transition_errors
        WHERE from_status = OLD.po_item_status;
        
        IF FOUND THEN
            RAISE EXCEPTION '%', v_err.error_message
                USING 
                    errcode = v_err.error_code,
                    detail = format('Status: %s → %s', OLD.po_item_status, NEW.po_item_status),
                    hint = v_err.error_hint;
        END IF;
    END IF;
    
    -- Erlaubte Übergänge prüfen
    IF NOT EXISTS (
        SELECT 1 FROM po_item_status_transitions
        WHERE from_status = OLD.po_item_status
        AND to_status = NEW.po_item_status
    ) THEN
        RAISE EXCEPTION 'Ungültiger Statuswechsel: % → %', OLD.po_item_status, NEW.po_item_status
            USING 
                errcode = 'POSTE',
                detail = format('Erlaubte Übergänge von %s: %s', 
                    OLD.po_item_status,
                    (SELECT string_agg(to_status::text, ', ') 
                     FROM po_item_status_transitions 
                     WHERE from_status = OLD.po_item_status)
                ),
                hint = 'Bitte wählen Sie einen der erlaubten Status oder setzen Sie die Position auf "paused".';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

#### 4. Versandkosten-System vereinheitlichen

**Entscheidung erforderlich:**

**Option A: Legacy-System entfernen**
```sql
-- Migration 1: EXPAND (neue Struktur steht schon)
-- Nichts zu tun, shipment_item-Level existiert bereits

-- Migration 2: SWITCH (Queries anpassen)
-- Frontend: app_purchase_orders.shipping_cost_net entfernen
-- Stattdessen: Aggregieren über app_inbound_shipment_items.shipping_costs_proportional

-- Migration 3: REMOVE
ALTER TABLE app_purchase_orders 
DROP COLUMN shipping_cost_net,
DROP COLUMN separate_invoice_for_shipping_cost;

DROP TRIGGER IF EXISTS trg_po_recalc_shipping_on_status 
ON app_purchase_orders;

DROP FUNCTION IF EXISTS 
    trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i(),
    trgfn_app_purchase_orders_separate_invoice_for_shipping_cost_re();
```

**Option B: Function implementieren (Backwards-Kompatibilität)**
```sql
CREATE OR REPLACE FUNCTION public.fn_po_recalc_shipping_allocation(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_shipped numeric;
    v_total_value numeric;
BEGIN
    -- Gesamtversandkosten aus Shipment-Items
    SELECT COALESCE(SUM(isi.shipping_costs_proportional), 0)
    INTO v_total_shipped
    FROM app_inbound_shipment_items isi
    WHERE isi.order_id = p_order_id;
    
    -- Zurückschreiben auf PO (für Backwards-Kompatibilität)
    UPDATE app_purchase_orders
    SET shipping_cost_net = v_total_shipped,
        updated_at = now()
    WHERE id = p_order_id;
    
    RETURN;
END;
$$;
```

**Empfehlung:** Option A (Legacy entfernen)
- Einfacher
- Weniger Duplikation
- Gemäß AGENTS.md: "Prefer constraints over triggers"

---

### Langfristig (Next Quarter)

#### Gesamtes Statusmanagement auf RPC-Basis umstellen

**Ziel:**
- Alle Statusübergänge durch RPCs (nicht mehr durch direkte UPDATEs)
- Trigger nur für technische Side-Effects (updated_at, Audit-Logs)
- Keine Auto-Advance Trigger mehr

**Architektur:**
```
Frontend
  ↓
RPC: rpc_po_item_set_status(item_id, new_status, reason)
  ↓
Validierung: Status-Transitions-Table
  ↓
UPDATE Position
  ↓
Trigger: fn_app_purchase_orders_status_derive_from_items (Header-Status)
  ↓
Trigger: Audit-Log
```

**Vorteil:**
- Klare API
- Validierung an einer Stelle
- Keine versteckten Statussprünge
- Leicht zu testen
- Gemäß AGENTS.md: "Write-Flows are acceptable for MVP speed, RPCs for complex domain actions"

---

## 📊 ZUSAMMENFASSUNG

### Aktueller Zustand: 🔴 **KRITISCH**

| Komponente | Status | Auswirkung |
|------------|--------|------------|
| `fn_po_recalc_shipping_allocation` | ❌ Fehlt | Sketch-Bestätigung schlägt fehl |
| Auto-Advance Trigger | ⚠️ Problematisch | Versteckte Statussprünge |
| Wareneingangs-Trigger | ⚠️ Umgeht Validierung | Status-Sprünge ohne Prüfung |
| Fehlermeldungen | ⚠️ Zu generisch | User ratlos |
| Versandkosten-System | ⚠️ Dual-System | Inkonsistenz |

---

### Empfohlene Reihenfolge:

**Phase 1: Hotfix (heute)**
1. ✅ Function `fn_po_recalc_shipping_allocation` als No-Op implementieren
2. ✅ Migration deployen
3. ✅ Sketch-Bestätigung testen

**Phase 2: Cleanup (diese Woche)**
1. Entscheidung: Versandkosten-Legacy entfernen oder implementieren
2. Trigger `trg_po_recalc_shipping_on_status` deaktivieren/entfernen
3. Dokumentation aktualisieren

**Phase 3: Refactoring (nächste 2 Sprints)**
1. Status-Transitions-Table einführen
2. Fehlermeldungen verbessern
3. Auto-Advance Trigger durch explizite RPCs ersetzen
4. Wareneingangs-Trigger: Validierung gegen Transitions-Table

**Phase 4: Architektur (nächstes Quarter)**
1. Alle Statusübergänge auf RPCs umstellen
2. Trigger nur für Side-Effects
3. Frontend: Explizite Buttons für jeden Statusübergang

---

### Code-Beispiele für Refactoring:

Siehe oben unter "Mittelfristig" und "Langfristig"

---

### Testplan:

**Nach Hotfix:**
- [ ] Sketch-Bestätigung funktioniert
- [ ] Status `partially_in_production` erreichbar
- [ ] Keine Error-Logs in Production

**Nach Refactoring:**
- [ ] Alle Statusübergänge validiert
- [ ] Fehlermeldungen zeigen Hints
- [ ] Keine unerwarteten Status-Sprünge
- [ ] Versandkosten-Konsistenz

---

## 📝 OFFENE FRAGEN

1. **Versandkosten-Legacy:** Wird `app_purchase_orders.shipping_cost_net` noch im Frontend angezeigt?
2. **Status-History:** Gibt es einen Audit-Log für Status-Änderungen? (für Debugging)
3. **Business-Anforderung:** Soll `confirmed` → `in_production` automatisch erfolgen oder manuell?
4. **Wareneingang:** Soll Status-Sprung `confirmed` → `delivered` möglich sein (ohne `in_production`)?

---

**Nächste Schritte:**
1. Hotfix-Migration erstellen (siehe Phase 1)
2. Fragen klären mit Product Owner
3. Refactoring-Backlog anlegen

