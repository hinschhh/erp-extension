# Lager Domain - Inventur

## Überblick
Verwaltung von Inventur-Sessions inkl. Snapshots und Zählungen.

## Betroffene Tabellen
- `app_inventory_sessions` - Inventur-Sessions
- `app_inventory_snapshots` - Bestandsaufnahmen zu Session-Start
- `app_inventory_counts` - Tatsächliche Zählungen während der Inventur

## Regeln & Invarianten

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

## Änderungen (2025-01-20)
- **Migration `20260120000000_update_inventory_snapshot_logic.sql`**:
  - Snapshot-Logik angepasst: nur relevante Produkte werden erfasst
  - Verhindert unnötige Zählarbeit für irrelevante Artikel

- **Frontend-Umbau**:
  - Entfernung der View-Abhängigkeit (`view_inventory_sessions_with_product_count`)
  - Direkte Queries mit intelligenter Filterung
  - Live-Updates via Supabase Realtime
