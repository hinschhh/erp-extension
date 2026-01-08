"use client";

import { Show } from "@refinedev/antd";
import type { CrudFilters } from "@refinedev/core";
import { useList } from "@refinedev/core";
import type { Tables } from "@/types/supabase";
import { Button, Collapse, DatePicker, List, Space, Tabs, Typography } from "antd";
import { LoadingFallback } from "@components/common/loading-fallback";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import type { RangePickerProps } from "antd/es/date-picker";
import Link from "next/link";

type InboundShipment = Tables<"app_inbound_shipments"> & {
  app_inbound_shipment_items?:
    | (Tables<"app_inbound_shipment_items"> & {
        app_purchase_orders_positions_normal?: {
          shipping_costs_proportional?: number | null;
          unit_price_net?: number | null;
          app_products?: {
            inventory_cagtegory?: string | null;
            bb_sku?: string | null;
          } | null;
        } | null;
        app_purchase_orders_positions_special?: {
          shipping_costs_proportional?: number | null;
          unit_price_net?: number | null;
          billbee_product?: {
            inventory_cagtegory?: string | null;
            bb_sku?: string | null;
          } | null;
        } | null;
        app_purchase_orders?: { 
          app_suppliers?: {
            id: string | null;
            tax_country?: string | null;
          } | null;
        } | null;
      })[]
    | null;
};

type ISI = Tables<"app_inbound_shipment_items"> & {
  app_purchase_orders_positions_normal?: {
    shipping_costs_proportional?: number | null;
    unit_price_net?: number | null;
    app_products?: {
      inventory_cagtegory?: string | null;
      bb_sku?: string | null;
    } | null;
  } | null;
  app_purchase_orders_positions_special?: {
    shipping_costs_proportional?: number | null;
    unit_price_net?: number | null;
    billbee_product?: {
      inventory_cagtegory?: string | null;
      bb_sku?: string | null;
    } | null;
  } | null;
  app_purchase_orders?: { 
    app_suppliers?: {
      id: string | null;
      tax_country?: string | null;
    } | null;
  } | null;
};

type RangeValue = [Dayjs | null, Dayjs | null] | null;

const { RangePicker } = DatePicker;

const CATEGORY_KEYS = [
  { key: "Möbel", label: "Möbel" },
  { key: "Bauteile", label: "Bauteile" },
  { key: "Handelswaren", label: "Handelswaren" },
  { key: "Naturstein", label: "Naturstein" },
] as const;

type OriginBucket = "DE" | "EU" | "Drittland";

const ORIGIN_BUCKETS: { key: OriginBucket; label: string }[] = [
  { key: "DE", label: "DE" },
  { key: "EU", label: "EU" },
  { key: "Drittland", label: "Drittland" },
];

const ACCOUNTS: {
  category_key: string;
  origin_key: string;
  account_number: string;
  account_name: string;
  counter_part: string;
}[] = [
  { category_key: "Möbel", origin_key: "DE", account_number: "3400", account_name: "Wareneingang Möbel 19%", counter_part: "3980" },
  { category_key: "Möbel", origin_key: "EU", account_number: "3425", account_name: "EU - Wareneingang Möbel - I.g.E. 19% VSt./USt.", counter_part: "3980" },
  { category_key: "Möbel", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3980" },

  { category_key: "Handelswaren", origin_key: "DE", account_number: "3401", account_name: "Wareneingang Handelswaren 19%", counter_part: "3981" },
  { category_key: "Handelswaren", origin_key: "EU", account_number: "3426", account_name: "EU - Wareneingang Handelswaren - I.g.E. 19% VSt./U", counter_part: "3981" },
  { category_key: "Handelswaren", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3981" },

  { category_key: "Bauteile", origin_key: "DE", account_number: "3402", account_name: "Wareneingang Bauteile 19%", counter_part: "3982" },
  { category_key: "Bauteile", origin_key: "EU", account_number: "3427", account_name: "EU - Wareneingang Bauteile - I.g.E. 19% VSt./USt.", counter_part: "3982" },
  { category_key: "Bauteile", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3982" },

  { category_key: "Naturstein", origin_key: "DE", account_number: "3403", account_name: "Wareneingang Naturstein 19%", counter_part: "3983" },
  { category_key: "Naturstein", origin_key: "EU", account_number: "3428", account_name: "EU - Wareneingang Naturstein -I.g.E. 19% VSt./USt.", counter_part: "3983" },
  { category_key: "Naturstein", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3983" },
];

// EU country codes (ISO 3166-1 alpha-2)
const EU_CODES = new Set<string>([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "EU",
]);

// ---------------------- Helpers ----------------------
const normalize = (v: string | null | undefined) => (v ?? "").trim();

const getInventoryCategory = (item: ISI): string | null => {
  const normalCat = item.app_purchase_orders_positions_normal?.app_products?.inventory_cagtegory ?? null;
  const specialCat = item.app_purchase_orders_positions_special?.billbee_product?.inventory_cagtegory ?? null;
  return normalCat ?? specialCat;
};

const getSku = (item: ISI): string => {
  return (
    item.app_purchase_orders_positions_normal?.app_products?.bb_sku ??
    item.app_purchase_orders_positions_special?.billbee_product?.bb_sku ??
    "--"
  );
};

const getUnitPriceNet = (item: ISI): number | null => {
  const v =
    item.app_purchase_orders_positions_normal?.unit_price_net ??
    item.app_purchase_orders_positions_special?.unit_price_net ??
    null;

  return v == null ? null : Number(v);
};

const getShippingSeparate = (item: ISI): number => {
  const v =
    item.app_purchase_orders_positions_normal?.shipping_costs_proportional ??
    item.app_purchase_orders_positions_special?.shipping_costs_proportional ??
    0;

  return Number(v ?? 0);
};

const calcLineTotal = (item: ISI): number => {
  const qty = Number(item.quantity_delivered ?? 0);
  const price = getUnitPriceNet(item) ?? 0;
  return qty * price;
};

const sumItems = (items: ISI[]): number => items.reduce((acc, it) => acc + calcLineTotal(it), 0);

const sumShipping = (items: ISI[]): number => items.reduce((acc, it) => acc + getShippingSeparate(it), 0);

const formatEUR = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

const getOriginBucketForShipment = (shipment: InboundShipment): OriginBucket => {
  const first = shipment.app_inbound_shipment_items?.[0] ?? null;
  const code = normalize(first?.app_purchase_orders?.app_suppliers?.tax_country).toUpperCase();

  if (!code) return "Drittland";
  if (code === "DE") return "DE";
  if (EU_CODES.has(code)) return "EU";
  return "Drittland";
};

type BucketKey = `${string}__${OriginBucket}`;

const bucketKeyOf = (categoryKey: string, origin: OriginBucket): BucketKey => `${categoryKey}__${origin}`;

const parseBucketKey = (k: BucketKey) => {
  const [category_key, origin_key] = k.split("__") as [string, OriginBucket];
  return { category_key, origin_key };
};

// ---------------------- Export helpers ----------------------
type ExportRow = {
  bezeichnung: string;
  betrag: number; // negative Zahl im Export (Aufwand)
  gegenkonto: string;
  rechnungsnummer: string;
  versanddatum: string;
  konto: string;
  buchungstext: string;
};

const formatAmountDE = (v: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const toCSV = (rows: ExportRow[]) => {
  const header = [
    "Bezeichnung",
    "Betrag",
    "Gegenkonto",
    "Rechnungsnummer (RNr-KNr)",
    "Versanddatum",
    "Konto",
    "Buchungstext formatiert",
  ].join("\t");

  const lines = rows.map((r) =>
    [
      r.bezeichnung,
      formatAmountDE(r.betrag),
      r.gegenkonto,
      r.rechnungsnummer,
      r.versanddatum,
      r.konto,
      r.buchungstext,
    ].join("\t"),
  );

  return [header, ...lines].join("\n");
};

const downloadTextFile = (filename: string, content: string) => {
  const blob = new Blob([content], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ---------------------- Page ----------------------
export default function MonatsabschlussPage() {
const [range, setRange] = useState<RangeValue>(() => {
    // Try to restore from localStorage
    if (typeof window !== "undefined") {
        const stored = localStorage.getItem("monatsabschluss-range");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed && Array.isArray(parsed) && parsed.length === 2) {
                    return [
                        parsed[0] ? dayjs(parsed[0]) : null,
                        parsed[1] ? dayjs(parsed[1]) : null,
                    ];
                }
            } catch {
                // Ignore parse errors
            }
        }
    }
    // Default: last 30 days
    const end = dayjs().endOf("day");
    const start = dayjs().subtract(30, "day").startOf("day");
    return [start, end];
});

// Persist range to localStorage whenever it changes
useEffect(() => {
    if (range && range[0] && range[1]) {
        localStorage.setItem(
            "monatsabschluss-range",
            JSON.stringify([range[0].toISOString(), range[1].toISOString()])
        );
    }
}, [range]);

  const filters: CrudFilters = useMemo(() => {
    const start = range?.[0];
    const end = range?.[1];

    if (!start || !end) return [];

    return [
      { field: "delivered_at", operator: "gte", value: start.toISOString() },
      { field: "delivered_at", operator: "lte", value: end.toISOString() },
    ];
  }, [range]);

  const {
    data: inboundShipments,
    isLoading: loadingInboundShipments,
    isError: isErrorInboundShipments,
    error,
  } = useList<InboundShipment>({
    resource: "app_inbound_shipments",
    meta: {
      // WICHTIG: shipping_costs_proportional muss im select stehen, sonst ist es im Ergebnis immer null/undefined
      select:
        "*, app_inbound_shipment_items(id, quantity_delivered, app_purchase_orders(app_suppliers(id, tax_country)), app_purchase_orders_positions_normal(unit_price_net, shipping_costs_proportional, app_products(inventory_cagtegory, bb_sku)), app_purchase_orders_positions_special(unit_price_net, shipping_costs_proportional, billbee_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(inventory_cagtegory, bb_sku)))",
    },
    pagination: { mode: "off" },
    filters,
    sorters: [{ field: "delivered_at", order: "desc" }],
    queryOptions: { keepPreviousData: true },
  });

  const onRangeChange: RangePickerProps["onChange"] = (values) => {
    if (!values) {
      setRange(null);
      return;
    }
    const [start, end] = values;
    setRange([start?.startOf("day") ?? null, end?.endOf("day") ?? null]);
  };

  const shipments: InboundShipment[] = inboundShipments?.data ?? [];

  const buildExportRows = (): ExportRow[] => {
    const endDate = range?.[1] ? range[1].format("DD.MM.YYYY") : dayjs().format("DD.MM.YYYY");
    const titlePrefix = `Wareneingang (BuBu) - ${endDate} Monatsabschluss - `;

    // 1) Goods + Shipping je Bucket (Kategorie+Origin)
    const goodsByBucket = new Map<BucketKey, number>();
    const shippingByBucket = new Map<BucketKey, number>();

    for (const shipment of shipments) {
      const origin = getOriginBucketForShipment(shipment);
      const allItems: ISI[] = shipment.app_inbound_shipment_items ?? [];

      for (const cat of CATEGORY_KEYS) {
        const categoryItems = allItems.filter((it) => getInventoryCategory(it) === cat.key);
        if (categoryItems.length === 0) continue;

        const k = bucketKeyOf(cat.key, origin);
        goodsByBucket.set(k, (goodsByBucket.get(k) ?? 0) + sumItems(categoryItems));
        shippingByBucket.set(k, (shippingByBucket.get(k) ?? 0) + sumShipping(categoryItems));
      }
    }

    const rows: ExportRow[] = [];

    // 2) Goods-Exportzeilen: pro Bucket -> passendes Konto
    for (const [k, goodsTotal] of Array.from(goodsByBucket.entries())) {
      if (!goodsTotal || Math.abs(goodsTotal) < 0.000001) continue;

      const { category_key, origin_key } = parseBucketKey(k);
      const account = ACCOUNTS.find((a) => a.category_key === category_key && a.origin_key === origin_key);
      if (!account) continue;

      const amount = -Number(goodsTotal);
      if (Math.abs(amount) < 0.000001) continue;

      const bezeichnung = account.account_name;

      rows.push({
        bezeichnung,
        betrag: amount,
        gegenkonto: account.counter_part,
        rechnungsnummer: "",
        versanddatum: endDate,
        konto: account.account_number,
        buchungstext: `${titlePrefix}${bezeichnung}`,
      });
    }

    // 3) ANK (Anschaffungsnebenkosten) aus shipping_costs_proportional:
    //    -> anteilig je Gegenkonto (counter_part)
    const ankByCounterpart = new Map<string, number>();

    for (const [k, shipTotal] of Array.from(shippingByBucket.entries())) {
      if (!shipTotal || Math.abs(shipTotal) < 0.000001) continue;

      const { category_key, origin_key } = parseBucketKey(k);
      const account = ACCOUNTS.find((a) => a.category_key === category_key && a.origin_key === origin_key);
      if (!account) continue;

      ankByCounterpart.set(account.counter_part, (ankByCounterpart.get(account.counter_part) ?? 0) + shipTotal);
    }

    for (const [counterPart, ankTotal] of Array.from(ankByCounterpart.entries())) {
      const amount = -Number(ankTotal);
      if (Math.abs(amount) < 0.000001) continue;

      const bezeichnung = "Anschaffungsnebenkosten";

      rows.push({
        bezeichnung,
        betrag: amount,
        gegenkonto: counterPart,
        rechnungsnummer: "",
        versanddatum: endDate,
        konto: "3800",
        buchungstext: `${titlePrefix}${bezeichnung}`,
      });
    }

    // 4) Reihenfolge: erst Waren, dann ANK (und Waren nach Konto sortiert)
    const goodsRows = rows.filter((r) => r.konto !== "3800");
    const ankRows = rows.filter((r) => r.konto === "3800");

    goodsRows.sort((a, b) => a.konto.localeCompare(b.konto));

    return [...goodsRows, ...ankRows].filter((r) => Math.abs(r.betrag) >= 0.000001);
  };

  const handleExport = () => {
    const rows = buildExportRows();
    const csv = toCSV(rows);
    const endDate = range?.[1] ? range[1].format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    downloadTextFile(`monatsabschluss-wareneingang-${endDate}.csv`, csv);
  };

  // --- Panels: Shipment -> Items (für eine gegebene Menge categoryItems je Shipment) ---
  const buildShipmentPanels = (shipmentsWithCategory: { shipment: InboundShipment; categoryItems: ISI[] }[]) => {
    return shipmentsWithCategory.map(({ shipment, categoryItems }) => {
      const shipmentTotal = sumItems(categoryItems);
      const supplier = categoryItems?.[0]?.app_purchase_orders?.app_suppliers?.id ?? "";

      return {
        key: shipment.id,
        label: (
          <Space size={8}>
            <strong>{supplier}</strong>
            <span>
              am {shipment.delivered_at ? dayjs(shipment.delivered_at).format("DD.MM.YYYY") : "--"} –{" "}
              <Link href={`/lager/wareneingang/${shipment.id}`}>{shipment.inbound_number ?? "--"}</Link>
            </span>
            <Typography.Text type="secondary"><strong>{formatEUR(shipmentTotal)}</strong></Typography.Text>
            <Typography.Text type="secondary">RE: {shipment.invoice_number ?? "--"}</Typography.Text>
            <Typography.Text type="secondary">Lieferschein: {shipment.delivery_note_number ?? "--"}</Typography.Text>
          </Space>
        ),
        children: (
          <List
            dataSource={categoryItems}
            split
            locale={{ emptyText: "Keine Positionen in dieser Kategorie" }}
            renderItem={(item: ISI) => {
              const unit = getUnitPriceNet(item);
              const qty = Number(item.quantity_delivered ?? 0);
              const lineTotal = calcLineTotal(item);

              return (
                <List.Item>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Space>
                      <Typography.Text strong>{getSku(item)}</Typography.Text>
                      <Typography.Text>{qty} Stück geliefert</Typography.Text>
                      <Typography.Text>{unit != null ? `${unit.toFixed(2)} EUR` : "k.A."}</Typography.Text>
                    </Space>

                    <Typography.Text strong>{formatEUR(lineTotal)}</Typography.Text>
                  </Space>
                </List.Item>
              );
            }}
          />
        ),
      };
    });
  };

  // --- Panels: Origin (DE/EU/Drittland) -> Shipment -> Items ---
  const buildOriginPanelsForCategory = (
    categoryKey: string,
    shipmentsWithCategory: { shipment: InboundShipment; categoryItems: ISI[] }[],
  ) => {
    return ORIGIN_BUCKETS.map((bucket) => {
      const inBucket = shipmentsWithCategory.filter(({ shipment }) => getOriginBucketForShipment(shipment) === bucket.key);

      const bucketGoodsTotal = inBucket.reduce((acc, x) => acc + sumItems(x.categoryItems), 0);
      const bucketShipping = inBucket.reduce((acc, x) => acc + sumShipping(x.categoryItems), 0);

      const account = ACCOUNTS.find((acc) => acc.category_key === categoryKey && acc.origin_key === bucket.key);
      const accountInfo = account ? `${account.account_number} - ${account.account_name}` : "Konto nicht gefunden";

      return {
        key: bucket.key,
        label: (
          <Space size={8}>
            <span>{accountInfo}</span>
            <Typography.Text type="secondary">{formatEUR(bucketGoodsTotal)}</Typography.Text>
            <Typography.Text type="secondary">(ANK {formatEUR(bucketShipping)})</Typography.Text>
          </Space>
        ),
        children: <Collapse items={buildShipmentPanels(inBucket)} />,
      };
    });
  };

  // --- Panels: Category -> Origin -> Shipment -> Items ---
  const buildCategoryPanel = (categoryKey: string) => {
    const shipmentsWithCategory = shipments
      .map((shipment) => {
        const allItems: ISI[] = shipment.app_inbound_shipment_items ?? [];
        const categoryItems = allItems.filter((it) => getInventoryCategory(it) === categoryKey);
        return { shipment, categoryItems };
      })
      .filter(({ categoryItems }) => categoryItems.length > 0);

    const categoryTotal = shipmentsWithCategory.reduce((acc, x) => acc + sumItems(x.categoryItems), 0);
    const categoryLabel = CATEGORY_KEYS.find((c) => c.key === categoryKey)?.label ?? categoryKey;

    return {
      key: categoryKey,
      label: (
        <Space size={8}>
          <span>{categoryLabel}</span>
          <Typography.Text type="secondary">{formatEUR(categoryTotal)}</Typography.Text>
        </Space>
      ),
      children: <Collapse items={buildOriginPanelsForCategory(categoryKey, shipmentsWithCategory)} />,
    };
  };

  const itemsCategoryCollapse = CATEGORY_KEYS.map((c) => buildCategoryPanel(c.key));

  if (loadingInboundShipments) {
    return (
      <>
        <div>Lade Wareneingänge...</div>
        <LoadingFallback />
      </>
    );
  }

  if (isErrorInboundShipments) {
    return <div>Fehler beim Laden der Wareneingänge: {String((error as any)?.message ?? error)}</div>;
  }

  return (
    <Show
      title="Monatsabschluss - Buchhaltung"
      contentProps={{
        style: { background: "none" },
      }}
    >
      <Space style={{ marginBottom: 16 }}>
        <Space align="center">
          <Typography.Text strong>Zeitraum</Typography.Text>
          <RangePicker value={range as any} onChange={onRangeChange} allowClear format="DD.MM.YYYY" />
          <Typography.Text type="secondary">{loadingInboundShipments ? "Lädt…" : "Aktualisiert"}</Typography.Text>
        </Space>
      </Space>

      <Tabs
        tabBarExtraContent={
          <Button onClick={handleExport} type="primary">
            Export
          </Button>
        }
        items={[
          {
            key: "inbound_shipments",
            label: "Wareneingang",
            children: <Collapse items={itemsCategoryCollapse} />,
          },
          {
            key: "outbound_shipments",
            label: "Warenausgang",
            children: <div>Warenausgang</div>,
          },
        ]}
      />
    </Show>
  );
}
