# Supabase Function Monitoring & Maintenance

Dieses Verzeichnis enthält Tools zur Überwachung und Wartung der Datenbank-Funktionen und Business-Logik.

## 📁 Dateien

| Datei | Zweck | Häufigkeit |
|-------|-------|------------|
| `daily_validation.sql` | Prüft Daten-Konsistenz | **Täglich** |
| `quick_fix.sql` | Behebt bekannte Inkonsistenzen | Bei Bedarf |
| `function_tests.sql` | Unit-Tests für Trigger-Funktionen | Bei Änderungen |

## 🚀 Schnellstart

### 1. Tägliche Validierung ausführen

```bash
# Via Supabase CLI
supabase db execute --file supabase/monitoring/daily_validation.sql

# Oder via Dashboard SQL Editor
# → Datei öffnen und ausführen
```

**Erwartung:** Alle Queries sollten leer sein (= keine Probleme gefunden)

### 2. Bei gefundenen Problemen

```bash
# Erst Backup erstellen!
supabase db dump -f backup_$(date +%Y%m%d).sql

# Dann Quick Fix ausführen
supabase db execute --file supabase/monitoring/quick_fix.sql

# Validierung wiederholen
supabase db execute --file supabase/monitoring/daily_validation.sql
```

## 📊 Dashboard-Integration (geplant)

Die Validierungs-Queries können in ein Monitoring-Dashboard integriert werden:

```sql
-- Als Materialized View für schnelleren Zugriff
CREATE MATERIALIZED VIEW monitoring.health_status AS
SELECT * FROM (
    -- Hier daily_validation.sql Zusammenfassung
);

-- Täglich neu berechnen
REFRESH MATERIALIZED VIEW monitoring.health_status;
```

## 🔔 Alerting (Empfehlung)

### Via Supabase Edge Function

```typescript
// supabase/functions/daily-health-check/index.ts
import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const { data, error } = await supabaseClient
    .from('health_status')
    .select('*')
    .gt('count', 0);
  
  if (data && data.length > 0) {
    // Send Slack/Email Alert
    await sendAlert(data);
  }
  
  return new Response(JSON.stringify({ ok: true }));
});
```

### Via Cron Job

```bash
# In supabase/config.toml
[functions.daily-health-check]
schedule = "0 8 * * *"  # Jeden Tag 8 Uhr
```

## 🛠️ Tests schreiben

Für neue Trigger-Funktionen immer Tests hinzufügen:

```sql
-- In function_tests.sql
-- Test: Versandkosten-Verteilung
BEGIN;
    -- Setup
    INSERT INTO app_purchase_orders (...) VALUES (...);
    INSERT INTO app_inbound_shipments (...) VALUES (...);
    INSERT INTO app_inbound_shipment_items (...) VALUES (...);
    
    -- Assert
    SELECT assert_equals(
        (SELECT shipping_cost_separate FROM app_inbound_shipments WHERE id = ...),
        100.00,
        'Versandkosten sollten kopiert sein'
    );
ROLLBACK;
```

## 📚 Weitere Dokumentation

- [Business Logic Dokumentation](../BUSINESS_LOGIC_DOCUMENTATION.md)
- [Supabase Functions Übersicht](../allgemein/functions/)
- [Troubleshooting Guide](../../docs/troubleshooting.md) (TODO)

## 🔍 Bekannte Probleme

Siehe [BUSINESS_LOGIC_DOCUMENTATION.md](../BUSINESS_LOGIC_DOCUMENTATION.md) → Abschnitt "Schwachstellen & Risiken"

---

**Letzte Aktualisierung:** 2026-01-16  
**Maintainer:** DevOps Team
