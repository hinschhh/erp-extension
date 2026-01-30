# Dashboard KPI & Diagramm Dokumentation

## Übersicht

Diese Dokumentation beschreibt detailliert die Berechnung aller KPIs (Key Performance Indicators) und die Datenermittlung für die Diagramme im Geschäftsführer-Cockpit.

**Datenbasis:** Alle Berechnungen basieren auf einer einzelnen `useList`-Abfrage auf `app_orders` mit vollständig verschachtelten Relationen (nested queries).

---

## 1. Datenstruktur & Nested Queries

### 1.1 Hauptabfrage

```typescript
useList<Order>({
  resource: "app_orders",
  pagination: { mode: "off" }, // Alle Bestellungen laden
  meta: {
    select: `
      *,
      app_customers(bb_InvoiceAddress_CountryISO2, bb_Name),
      app_order_items(
        id,
        fk_app_products_id,
        bb_Quantity,
        bb_TotalPrice,
        app_products(id, bb_sku, bb_name, room),
        app_purchase_orders_positions_special(
          base_model_billbee_product_id,
          base_model:app_products!base_model_billbee_product_id(id, bb_sku, bb_name, room)
        )
      )
    `,
  },
});
```

### 1.2 TypeScript Typen

```typescript
type Order = Pick<
  Tables<"app_orders">,
  "id" | "bb_State" | "ordered_at" | "offered_at" | "bb_ShippedAt" | "bb_TotalCost" | "bb_PaidAmount"
> & {
  app_customers?: Pick<Tables<"app_customers">, "bb_InvoiceAddress_CountryISO2" | "bb_Name"> | null;
  app_order_items?: OrderItem[] | null;
};

type OrderItem = Pick<
  Tables<"app_order_items">,
  "id" | "fk_app_products_id" | "bb_Quantity" | "bb_TotalPrice"
> & {
  app_products?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room"> | null;
  app_purchase_orders_positions_special?: SpecialPosition[] | null;
};
```

---

## 2. Status-Logik (bb_State)

Die Bestellung durchläuft verschiedene Status, die in `bb_State` gespeichert werden:

| bb_State | Bedeutung | Verwendung in KPIs |
|----------|-----------|-------------------|
| 14 | Angebot (Offer) | Angebote geschrieben, Offene Angebote |
| 1, 2, 3, 13 | Aktive Bestellung (verschiedene Stadien) | Auftragseingang, Auftragsbestand, Umsatz |
| 6, 8, 9 | Storniert/Abgebrochen | **Ausgeschlossen** von allen Berechnungen |

### 2.1 Angebots-Datum (offered_at)

- **Quelle:** Datenbank-Trigger
- **Logik:** Wenn `bb_State` auf `14` wechselt, wird `offered_at` automatisch auf den aktuellen Zeitstempel gesetzt
- **Verwendung:** Zeitliche Filterung von Angeboten im Dashboard

---

## 3. Helper-Funktionen

### 3.1 isSonderbestellung()

**Zweck:** Erkennt, ob eine Bestellung eine Sonderbestellung ist.

**Logik:**
```typescript
const isSonderbestellung = (order: Order): boolean => {
  if (!order.app_order_items) return false;
  return order.app_order_items.some(
    (item) =>
      item.app_purchase_orders_positions_special &&
      item.app_purchase_orders_positions_special.length > 0 &&
      item.app_purchase_orders_positions_special.some((pos) => pos.base_model)
  );
};
```

**Kriterium:** Eine Bestellung ist eine Sonderbestellung, wenn mindestens ein Item eine Verknüpfung zu `app_purchase_orders_positions_special` hat UND ein `base_model` referenziert ist.

### 3.2 getComponentForItem()

**Zweck:** Ermittelt das relevante Produkt für ein Order-Item (entweder Basemodel bei Sonderbestellungen oder reguläres Produkt).

**Logik:**
```typescript
const getComponentForItem = (item: OrderItem) => {
  // 1. Priorität: Sonderbestellung mit Basemodel
  if (item.app_purchase_orders_positions_special?.length > 0) {
    const specialPos = item.app_purchase_orders_positions_special[0];
    if (specialPos.base_model) {
      return {
        id: specialPos.base_model.id,
        sku: specialPos.base_model.bb_sku || "—",
        name: specialPos.base_model.bb_name || "—",
        room: specialPos.base_model.room,
      };
    }
  }
  
  // 2. Fallback: Normales Produkt
  if (item.app_products) {
    return {
      id: item.app_products.id,
      sku: item.app_products.bb_sku || "—",
      name: item.app_products.bb_name || "—",
      room: item.app_products.room,
    };
  }
  
  return null;
};
```

---

## 4. KPI-Berechnungen

Alle KPIs werden in einem zentralen `useMemo` berechnet, das von `[orders, dateRange, countryFilter, roomFilter]` abhängig ist.

### 4.1 Angebote geschrieben (Zeitraum)

**Definition:** Summe aller Angebote, die im gewählten Zeitraum erstellt wurden (inkl. später konvertierte Angebote).

**Filter:**
- `offered_at IS NOT NULL` (Angebot wurde erstellt)
- `offered_at` liegt innerhalb `[dateRange[0], dateRange[1]]`
- Land-Filter (falls gesetzt): `app_customers.bb_InvoiceAddress_CountryISO2 === countryFilter`

**Wichtig:** Der Filter basiert **nicht** auf `bb_State`, da konvertierte Angebote (die zu Bestellungen wurden) weiterhin als "geschriebene Angebote" zählen sollen. Das Feld `offered_at` bleibt konstant und ändert sich nicht bei Status-Wechsel.

**Berechnung:**
```typescript
const angeboteGeschrieben = filteredOrders.filter((o) => {
  const offeredAt = o.offered_at ? dayjs(o.offered_at) : null;
  return (
    offeredAt &&
    offeredAt.isBetween(dateRange[0], dateRange[1], null, "[]")
  );
});

const angeboteGeschriebenSum = angeboteGeschrieben.reduce(
  (sum, o) => sum + (o.bb_TotalCost || 0),
  0
);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl Angebote (inkl. konvertierte)

---

### 4.2 Offene Angebote (aktuell)

**Definition:** Alle Angebote, die aktuell im Status "Angebot" (14) sind, unabhängig vom gewählten Zeitraum. Dies sind die **nicht konvertierten** Angebote.

**Filter:**
- `bb_State === 14` (Angebot, noch nicht zu Bestellung konvertiert)
- Land-Filter (falls gesetzt)

**Besonderheit:** **KEINE** zeitliche Filterung! Zeigt den aktuellen Stand. Im Gegensatz zu "Angebote geschrieben" werden hier nur Angebote gezählt, die noch im Angebots-Status sind.

**Berechnung:**
```typescript
const offeneAngebote = filteredOrders.filter((o) => o.bb_State === 14);

const offeneAngeboteSum = offeneAngebote.reduce(
  (sum, o) => sum + (o.bb_TotalCost || 0),
  0
);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl offener Angebote

---

### 4.3 Auftragseingang (Zeitraum)

**Definition:** Summe aller Bestellungen, die im gewählten Zeitraum eingegangen sind (Status 1, 2, 3, 13).

**Filter:**
- `bb_State` in `[1, 2, 3, 13]` (aktive Bestellungen)
- `ordered_at` liegt innerhalb `[dateRange[0], dateRange[1]]`
- Land-Filter (falls gesetzt)

**Berechnung:**
```typescript
const auftragseingang = filteredOrders.filter((o) => {
  const orderedAt = o.ordered_at ? dayjs(o.ordered_at) : null;
  return (
    [1, 2, 3, 13].includes(o.bb_State || 0) &&
    orderedAt &&
    orderedAt.isBetween(dateRange[0], dateRange[1], null, "[]")
  );
});

const auftragseingangSum = auftragseingang.reduce(
  (sum, o) => sum + (o.bb_TotalCost || 0),
  0
);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl Bestellungen

---

### 4.4 Umsatz - Versendete Bestellungen (Zeitraum)

**Definition:** Summe aller Bestellungen, die im gewählten Zeitraum versendet wurden.

**Filter:**
- `bb_State` in `[1, 2, 3, 13]` (aktive Bestellungen)
- `bb_ShippedAt` ist gesetzt UND liegt innerhalb `[dateRange[0], dateRange[1]]`
- Land-Filter (falls gesetzt)

**Berechnung:**
```typescript
const umsatz = filteredOrders.filter((o) => {
  const shippedAt = o.bb_ShippedAt ? dayjs(o.bb_ShippedAt) : null;
  return (
    [1, 2, 3, 13].includes(o.bb_State || 0) &&
    shippedAt &&
    shippedAt.isBetween(dateRange[0], dateRange[1], null, "[]")
  );
});

const umsatzSum = umsatz.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl versendeter Bestellungen

---

### 4.5 Auftragsbestand (unversendet, aktuell)

**Definition:** Alle Bestellungen, die aktuell aktiv sind, aber noch nicht versendet wurden.

**Filter:**
- `bb_State` in `[1, 2, 3, 13]` (aktive Bestellungen)
- `bb_ShippedAt` ist **NULL** (noch nicht versendet)
- Land-Filter (falls gesetzt)

**Besonderheit:** **KEINE** zeitliche Filterung! Zeigt den aktuellen Bestand.

**Berechnung:**
```typescript
const auftragsbestand = filteredOrders.filter(
  (o) => [1, 2, 3, 13].includes(o.bb_State || 0) && !o.bb_ShippedAt
);

const auftragsbestandSum = auftragsbestand.reduce(
  (sum, o) => sum + (o.bb_TotalCost || 0),
  0
);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl unversendeter Bestellungen

---

### 4.6 Erhaltene Anzahlungen (aktuell)

**Definition:** Summe der erhaltenen Anzahlungen für alle aktiven, noch nicht versendeten Bestellungen.

**Filter:**
- `bb_State` in `[1, 2, 3, 13]` (aktive Bestellungen)
- `bb_ShippedAt` ist **NULL** (noch nicht versendet)
- `bb_PaidAmount > 0` (Anzahlung vorhanden)
- Land-Filter (falls gesetzt)

**Besonderheit:** **KEINE** zeitliche Filterung! Zeigt den aktuellen Stand.

**Berechnung:**
```typescript
const anzahlungen = filteredOrders.filter(
  (o) =>
    [1, 2, 3, 13].includes(o.bb_State || 0) &&
    !o.bb_ShippedAt &&
    (o.bb_PaidAmount || 0) > 0
);

const anzahlungenSum = anzahlungen.reduce(
  (sum, o) => sum + (o.bb_PaidAmount || 0),
  0
);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl Bestellungen mit Anzahlung

---

### 4.7 OPOS - Offene Posten (aktuell)

**Definition:** Differenz zwischen Bestellwert und erhaltener Anzahlung für alle aktiven, noch nicht versendeten Bestellungen.

**Filter:**
- `bb_State` in `[1, 2, 3, 13]` (aktive Bestellungen)
- `bb_ShippedAt` ist **NULL** (noch nicht versendet)
- Land-Filter (falls gesetzt)

**Besonderheit:** **KEINE** zeitliche Filterung! Zeigt den aktuellen Stand.

**Berechnung:**
```typescript
const opos = filteredOrders.filter(
  (o) => [1, 2, 3, 13].includes(o.bb_State || 0) && !o.bb_ShippedAt
);

const oposSum = opos.reduce(
  (sum, o) => sum + ((o.bb_TotalCost || 0) - (o.bb_PaidAmount || 0)),
  0
);
```

**Output:**
- `total`: Gesamtsumme in Euro
- `count`: Anzahl Bestellungen mit offenen Posten

---

## 5. Aggregationslogik für Zeitreihen

### 5.1 Bestimmung der Aggregationsebene

Die Aggregationsebene (Tag, Woche, Monat) wird automatisch basierend auf der Länge des gewählten Zeitraums bestimmt:

```typescript
const daysDiff = dateRange[1].diff(dateRange[0], "day");
const aggregationLevel: "day" | "week" | "month" =
  daysDiff <= 31 ? "day" : daysDiff <= 90 ? "week" : "month";
```

**Regeln:**
- ≤ 31 Tage → **Tägliche** Aggregation
- 32-90 Tage → **Wöchentliche** Aggregation
- > 90 Tage → **Monatliche** Aggregation

### 5.2 Zeitreihen-Berechnung

Für jedes Intervall (Tag/Woche/Monat) werden drei Metriken berechnet:

1. **Angebote:** Summe aller `offered_at` im Intervall (unabhängig von `bb_State`, inkl. konvertierte Angebote)
2. **Auftragseingang:** Summe aller `ordered_at` im Intervall mit `bb_State` in `[1,2,3,13]`
3. **Umsatz:** Summe aller `bb_ShippedAt` im Intervall mit `bb_State` in `[1,2,3,13]`

**Algorithmus:**
```typescript
const timeSeriesMap = new Map<string, { angebote: number; auftragseingang: number; umsatz: number }>();

filteredOrders.forEach((order) => {
  // Angebote (inkl. konvertierte Angebote)
  if (order.offered_at) {
    const offeredAt = dayjs(order.offered_at);
    if (offeredAt.isBetween(dateRange[0], dateRange[1], null, "[]")) {
      const key = aggregationLevel === "day"
        ? offeredAt.format("YYYY-MM-DD")
        : aggregationLevel === "week"
        ? offeredAt.startOf("week").format("YYYY-MM-DD")
        : offeredAt.startOf("month").format("YYYY-MM-DD");
      
      const existing = timeSeriesMap.get(key) || { angebote: 0, auftragseingang: 0, umsatz: 0 };
      existing.angebote += order.bb_TotalCost || 0;
      timeSeriesMap.set(key, existing);
    }
  }
  
  // Auftragseingang (analog)
  // Umsatz (analog)
});
```

**Output-Format:**
```typescript
[
  { date: "2026-01-01", angebote: 15000, auftragseingang: 25000, umsatz: 20000 },
  { date: "2026-01-02", angebote: 12000, auftragseingang: 18000, umsatz: 22000 },
  // ...
]
```

---

## 6. Verteilungs-Diagramme

### 6.1 Länder-Verteilung (Pie Chart)

**Datenquelle:** `app_customers.bb_InvoiceAddress_CountryISO2`

**Filter:**
- Nur Auftragseingang (`ordered_at` im Zeitraum, `bb_State` in `[1,2,3,13]`)
- Room-Filter (falls gesetzt)

**Berechnung:**
```typescript
const countryMap = new Map<string, number>();

auftragseingang.forEach((order) => {
  const country = order.app_customers?.bb_InvoiceAddress_CountryISO2 || "Unbekannt";
  countryMap.set(country, (countryMap.get(country) || 0) + (order.bb_TotalCost || 0));
});

const countryDistribution = Array.from(countryMap.entries()).map(([country, value]) => ({
  country,
  value,
}));
```

**Output:**
```typescript
[
  { country: "DE", value: 125000 },
  { country: "AT", value: 45000 },
  { country: "CH", value: 32000 },
]
```

### 6.2 Room-Verteilung (Column Chart)

**Datenquelle:** `app_products.room` (oder `base_model.room` bei Sonderbestellungen)

**Filter:**
- Nur Auftragseingang (`ordered_at` im Zeitraum, `bb_State` in `[1,2,3,13]`)
- Land-Filter (falls gesetzt)

**Berechnung:**
```typescript
const roomMap = new Map<string, number>();

auftragseingang.forEach((order) => {
  if (!order.app_order_items) return;
  
  order.app_order_items.forEach((item) => {
    const component = getComponentForItem(item);
    if (!component) return;
    
    const room = component.room || "Unbekannt";
    const revenue = item.bb_TotalPrice || 0;
    
    roomMap.set(room, (roomMap.get(room) || 0) + revenue);
  });
});

const roomDistribution = Array.from(roomMap.entries())
  .map(([room, value]) => ({ room, value }))
  .sort((a, b) => b.value - a.value)
  .slice(0, 10); // Top 10
```

**Output:**
```typescript
[
  { room: "Wohnzimmer", value: 85000 },
  { room: "Schlafzimmer", value: 62000 },
  { room: "Küche", value: 48000 },
]
```

---

## 7. Top 50 Komponenten

### 7.1 Zweck

Zeigt die 50 umsatzstärksten Produkte/Komponenten im gewählten Zeitraum, segmentiert nach:
- Normal- vs. Sonderbestellung
- Land (Rechnungsadresse)
- Room (Produktkategorie)

### 7.2 Logik

**Aggregation auf Produkt-Ebene:**
```typescript
const componentMap = new Map<number, {
  productId: number;
  sku: string;
  name: string;
  room: string | null;
  totalRevenue: number;
  totalQty: number;
  orderCount: number;
  isSonderbestellung: boolean;
}>();

orders.forEach((order) => {
  // Zeitfilter
  const orderedAt = order.ordered_at ? dayjs(order.ordered_at) : null;
  if (!orderedAt || !orderedAt.isBetween(dateRange[0], dateRange[1], null, "[]")) return;
  
  // Status-Filter
  if (order.bb_State === 14 || [6, 8, 9].includes(order.bb_State || 0)) return;
  
  // Benutzer-Filter
  if (countryFilter && order.app_customers?.bb_InvoiceAddress_CountryISO2 !== countryFilter) return;
  
  const isSonder = isSonderbestellung(order);
  if (orderTypeFilter === "normal" && isSonder) return;
  if (orderTypeFilter === "sonder" && !isSonder) return;
  
  // Items aggregieren
  order.app_order_items?.forEach((item) => {
    const component = getComponentForItem(item);
    if (!component) return;
    if (roomFilter && component.room !== roomFilter) return;
    
    const existing = componentMap.get(component.id);
    const revenue = item.bb_TotalPrice || 0;
    const qty = item.bb_Quantity || 0;
    
    if (existing) {
      existing.totalRevenue += revenue;
      existing.totalQty += qty;
      existing.orderCount += 1;
    } else {
      componentMap.set(component.id, {
        productId: component.id,
        sku: component.sku,
        name: component.name,
        room: component.room,
        totalRevenue: revenue,
        totalQty: qty,
        orderCount: 1,
        isSonderbestellung: isSonder,
      });
    }
  });
});

// Top 50 nach Umsatz sortieren
return Array.from(componentMap.values())
  .sort((a, b) => b.totalRevenue - a.totalRevenue)
  .slice(0, 50);
```

### 7.3 Besonderheiten

- **Basemodel-Logik:** Bei Sonderbestellungen wird das `base_model` als Komponente gezählt, nicht die kundenspezifische Variante
- **Mehrfachzählung:** Ein Produkt kann in mehreren Bestellungen vorkommen → `orderCount` zeigt, in wie vielen Bestellungen es erscheint
- **Segmentierung:** Die Tabelle zeigt **nur** Komponenten, die den aktiven Filtern entsprechen

---

## 8. Chart-Design & Konfiguration

### 8.1 Line Chart (Zeitreihe)

**Verwendung:** Entwicklung von Angebote, Auftragseingang, Umsatz

**Design-Merkmale:**
- **Höhe:** 300px
- **Smooth:** Geglättete Linie mit `shapeField: "smooth"`
- **Point:** Kreise mit Größe 3
- **Farben:** 3 verschiedene Farben für die Serien (Blau, Grün, Orange)
- **Achsen:**
  - X-Achse: 6 Ticks, formatiert nach Aggregationsebene (DD.MM / KW XX / MMM YYYY)
  - Y-Achse: 5 Ticks, formatiert als "XXk €" (Tausender-Notation)
- **Tooltip:** Datum formatiert als DD.MM.YYYY, Wert formatiert als "X.XXX,XX €"

**Konfiguration:**
```typescript
<Line
  data={timeSeriesData.flatMap((d) => [
    { date: d.date, type: "Angebote", value: d.angebote },
    { date: d.date, type: "Auftragseingang", value: d.auftragseingang },
    { date: d.date, type: "Umsatz", value: d.umsatz },
  ])}
  xField="date"
  yField="value"
  seriesField="type"
  height={300}
  smooth
  shapeField="smooth"
  point={{ size: 3, shape: "circle" }}
  axis={{
    x: {
      tickCount: 6,
      labelFormatter: (v: string) => {
        if (aggregationLevel === "day") return dayjs(v).format("DD.MM");
        else if (aggregationLevel === "week") return `KW ${dayjs(v).week()}`;
        else return dayjs(v).format("MMM YYYY");
      },
      labelAutoRotate: false,
    },
    y: {
      tickCount: 5,
      labelFormatter: (v: number) => `${(v / 1000).toFixed(0)}k €`,
    },
  }}
  tooltip={{
    title: { channel: "x", valueFormatter: (v: string) => `Datum: ${dayjs(v).format("DD.MM.YYYY")}` },
    items: [{ channel: "y", valueFormatter: (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` }],
  }}
  colorField="type"
  scale={{ color: { range: ["#1890ff", "#52c41a", "#faad14"] } }}
/>
```

### 8.2 Pie Chart (Länder-Verteilung)

**Verwendung:** Verteilung des Auftragseingangs nach Ländern

**Design-Merkmale:**
- **Höhe:** 300px
- **Typ:** Donut Chart (innerRadius: 0.4)
- **Radius:** 0.75
- **Label:** Außerhalb, zeigt Land + Prozentsatz
- **Legende:** Unten, horizontal, zeigt Land + Prozentsatz
- **Farben:** 8 verschiedene Farben (Blau-Spektrum + Variationen)
- **Style:** Weiße Trennung zwischen Segmenten (stroke: "#fff", lineWidth: 2)
- **Interaktionen:** Element-Active + Element-Highlight

**Konfiguration:**
```typescript
<Pie
  data={countryDistribution}
  angleField="value"
  colorField="country"
  height={300}
  radius={0.75}
  innerRadius={0.4}
  label={{
    type: "outer",
    content: "{name}\n{percentage}",
    style: { fontSize: 12, textAlign: "center" },
  }}
  legend={{
    position: "bottom",
    layout: "horizontal",
    itemName: {
      formatter: (text: string, item: any) => {
        const total = countryDistribution.reduce((sum, d) => sum + d.value, 0);
        const percentage = ((item.value / total) * 100).toFixed(1);
        return `${text} (${percentage}%)`;
      },
    },
  }}
  interactions={[
    { type: "element-active" },
    { type: "element-highlight" },
  ]}
  tooltip={{
    title: { channel: "color", valueFormatter: (v: string) => `Land: ${v}` },
    items: [{
      name: "Umsatz:",
      channel: "y",
      valueFormatter: (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`,
    }],
  }}
  scale={{ color: { range: ["#1890ff", "#52c41a", "#faad14", "#f5222d", "#722ed1", "#13c2c2", "#eb2f96", "#fa8c16"] } }}
  style={{ stroke: "#fff", lineWidth: 2 }}
/>
```

### 8.3 Column Chart (Room-Verteilung)

**Verwendung:** Verteilung des Auftragseingangs nach Produktkategorien (Rooms)

**Design-Merkmale:**
- **Höhe:** 300px
- **Style:** Blauer Gradient (vertikal von hell nach dunkel)
- **Radius:** Abgerundete Ecken (4px)
- **Label:** Oben, formatiert als "XXk €" oder "XX €"
- **Achsen:**
  - X-Achse: Automatisches Rotieren, gekürzte Labels bei langen Namen
  - Y-Achse: 5 Ticks, formatiert als "XXk €"
- **Tooltip:** Room-Name + formatierter Umsatz
- **Interaktion:** Element-Highlight mit Hintergrund

**Konfiguration:**
```typescript
<Column
  data={roomDistribution.sort((a, b) => b.value - a.value).slice(0, 10)}
  xField="room"
  yField="value"
  height={300}
  axis={{
    x: {
      labelFormatter: (v: string) => v.length > 15 ? v.substring(0, 12) + "..." : v,
      labelAutoRotate: true,
    },
    y: {
      tickCount: 5,
      labelFormatter: (v: number) => `${(v / 1000).toFixed(0)}k €`,
    },
  }}
  label={{
    position: "top",
    formatter: (datum: any) => {
      const val = datum.value;
      return val >= 10000 ? `${(val / 1000).toFixed(0)}k €` : `${val.toFixed(0)} €`;
    },
    style: { fontSize: 11 },
  }}
  tooltip={{
    title: { channel: "x", valueFormatter: (v: string) => `Room: ${v}` },
    items: [{
      name: "Umsatz:",
      channel: "y",
      valueFormatter: (v: number) => `${v.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`,
    }],
  }}
  style={{
    fill: "linear-gradient(180deg, #1890ff 0%, #096dd9 100%)",
    radius: 4,
  }}
  interaction={{ elementHighlight: { background: true } }}
/>
```

---

## 9. Performance-Überlegungen

### 9.1 Nested Queries

**Vorteil:** Nur **eine** Datenbank-Abfrage für alle Berechnungen
- Keine separaten Queries für Items, Customers, Products
- Vollständige Datenstruktur im Frontend verfügbar

### 9.2 useMemo-Optimierung

Alle Berechnungen sind in `useMemo` eingewickelt mit Dependencies:
- `orders`: Rohdaten von useList
- `dateRange`: Zeitraum-Filter
- `countryFilter`: Land-Filter
- `roomFilter`: Room-Filter
- `isSonderbestellung`, `getComponentForItem`: Helper-Funktionen (useCallback)

**Effekt:** Berechnungen erfolgen nur bei Änderung dieser Dependencies, nicht bei jedem Render.

### 9.3 Pagination

**Status:** Aktuell deaktiviert (`mode: "off"`)

**Grund:** Dashboard benötigt vollständigen Datensatz für:
- Aggregationen über alle Bestellungen
- Korrekte Summenbildung
- Verteilungs-Berechnungen

**Alternative bei Performance-Problemen:**
- Server-seitige Aggregationen via RPC-Funktionen
- Materialized Views für häufig verwendete Aggregationen
- Caching-Strategie mit `staleTime` in Refine

---

## 10. Erweiterungsmöglichkeiten

### 10.1 Zusätzliche KPIs

Mögliche Ergänzungen:
- **Stornoquote:** Verhältnis stornierter Bestellungen zu Gesamtbestellungen
- **Durchschnittlicher Bestellwert:** `Auftragseingang / Anzahl Bestellungen`
- **Conversion Rate:** `Auftragseingang / Angebote geschrieben`
- **Durchschnittliche Lieferzeit:** `AVG(bb_ShippedAt - ordered_at)`

### 10.2 Weitere Segmentierungen

- **Kundengruppen:** B2B vs. B2C
- **Zahlungsarten:** Vorkasse, Rechnung, Ratenzahlung
- **Bestellwert-Kategorien:** < 1.000 €, 1.000-5.000 €, > 5.000 €

### 10.3 Vergleichszeiträume

- **Vorjahr-Vergleich:** Vergleich mit gleicher Periode im Vorjahr
- **Trend-Indikatoren:** Pfeile für Steigerung/Rückgang gegenüber Vorperiode

---

## 11. Troubleshooting

### 11.1 Leere Daten

**Symptom:** KPIs zeigen 0 oder keine Daten

**Prüfungen:**
1. `orders.length > 0`? → Daten wurden geladen
2. `dateRange` korrekt gesetzt? → Standard: aktueller Monat
3. Filter zu restriktiv? → Alle Filter zurücksetzen
4. `bb_State` korrekt? → Angebote = 14, Bestellungen = 1/2/3/13

### 11.2 Falsche Summen

**Symptom:** KPI-Werte stimmen nicht mit Erwartungen überein

**Prüfungen:**
1. Stornierte Bestellungen (`bb_State` 6/8/9) werden überall ausgeschlossen?
2. Zeitfilter (`offered_at`, `ordered_at`, `bb_ShippedAt`) korrekt angewendet?
3. `bb_TotalCost` vs. `bb_PaidAmount` verwechselt?

### 11.3 Performance-Probleme

**Symptom:** Dashboard lädt langsam oder hängt

**Maßnahmen:**
1. Prüfe `ordersLoading` → Datenbank-Query dauert zu lange?
2. Reduziere Zeitraum → Weniger Daten = schnellere Berechnung
3. Verwende Browser DevTools → Identifiziere langsame useMemo-Berechnungen
4. Erwäge Server-seitige Aggregation

---

## 12. Zusammenfassung

**Architektur-Prinzip:** Single Source of Truth
- Alle Berechnungen basieren auf **einer** Datenquelle (`orders` mit nested queries)
- Helper-Funktionen abstrahieren Geschäftslogik (Sonderbestellung, Basemodel)
- useMemo sorgt für Performance-Optimierung

**Geschäftslogik:**
- Angebote (`bb_State === 14`) werden über `offered_at` zeitlich gefiltert
- Bestellungen (`bb_State in [1,2,3,13]`) werden über `ordered_at` gefiltert
- Umsatz basiert auf `bb_ShippedAt` (tatsächlich versendete Bestellungen)
- Stornierte Bestellungen (`bb_State in [6,8,9]`) werden konsequent ausgeschlossen

**Visualisierung:**
- Einheitliches Design-System über alle Charts
- Deutsche Formatierung (Währung, Datum)
- Responsive und interaktiv
- Automatische Aggregationsebene basierend auf Zeitspanne

