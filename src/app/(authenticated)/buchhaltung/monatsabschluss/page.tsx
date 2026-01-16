"use client";

import { Show } from "@refinedev/antd";
import type { CrudFilters } from "@refinedev/core";
import { useList } from "@refinedev/core";
import type { Tables } from "@/types/supabase";
import { Alert, Button, Card, Collapse, List, Space, Statistic, Tabs, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { LoadingFallback } from "@components/common/loading-fallback";
import { DateRangeFilter, type RangeValue } from "@/components/common/filters/DateRangeFilter";
import { formatCurrencyEUR, formatNumberDE, normalize } from "@utils/formats";
import { getOriginBucket, type OriginBucket } from "@/utils/constants/countries";
import { downloadTextFile } from "@/utils/exports";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import Link from "next/link";

type InboundShipment = Tables<"app_inbound_shipments"> & {
  app_inbound_shipment_items?:
    | (Tables<"app_inbound_shipment_items"> & {
        app_purchase_orders_positions_normal?: {
          portional?: number | null;
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
  shipping_costs_proportional?: number | null; // NEW: ANK allocation on shipment item level
  app_purchase_orders_positions_normal?: {
    unit_price_net?: number | null;
    app_products?: {
      inventory_cagtegory?: string | null;
      bb_sku?: string | null;
    } | null;
  } | null;
  app_purchase_orders_positions_special?: {
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

type OrderItem = Tables<"app_order_items"> & {
  app_products?: {
    bb_sku?: string | null;
    inventory_cagtegory?: string | null;
    is_antique?: boolean | null;
    bb_net_purchase_price?: number | null;
    bom_recipes?: {
      quantity?: number | null;
      billbee_component?: {
        bb_sku?: string | null;
        bb_net_purchase_price?: number | null;
        inventory_cagtegory?: string | null;
      } | null;
    }[] | null;
  } | null;
  app_purchase_orders_positions_special?: {
    unit_price_net?: number | null;
  }[] | null;
  app_orders?: {
    id?: number | null;
    bb_InvoiceDate?: string | null;
    bb_OrderNumber?: string | null;
    app_customers?: {
      bb_Name?: string | null;
    } | null;
  } | null;
};

// Expanded order item for component-based grouping
type ExpandedOrderItem = OrderItem & {
  component_category?: string | null;
  is_bom_component?: boolean;
  component_sku?: string | null;
  bom_sku?: string | null;
};

const CATEGORY_KEYS = [
  { key: "Möbel", label: "Möbel" },
  { key: "Bauteile", label: "Bauteile" },
  { key: "Handelswaren", label: "Handelswaren" },
  { key: "Naturstein", label: "Naturstein" },
] as const;

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
  asset_account: string;
}[] = [
  { category_key: "Möbel", origin_key: "DE", account_number: "3400", account_name: "Wareneingang Moebel 19%", counter_part: "3960",  asset_account: "3980"},
  { category_key: "Möbel", origin_key: "EU", account_number: "3425", account_name: "EU - Wareneingang Moebel - I.g.E. 19% VSt./USt.", counter_part: "3960", asset_account: "3980" },
  { category_key: "Möbel", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3960", asset_account: "3980"},

  { category_key: "Handelswaren", origin_key: "DE", account_number: "3401", account_name: "Wareneingang Handelswaren 19%", counter_part: "3961", asset_account: "3981" },
  { category_key: "Handelswaren", origin_key: "EU", account_number: "3426", account_name: "EU - Wareneingang Handelswaren - I.g.E. 19% VSt./U", counter_part: "3961", asset_account: "3981" },
  { category_key: "Handelswaren", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3961", asset_account: "3981" },

  { category_key: "Bauteile", origin_key: "DE", account_number: "3402", account_name: "Wareneingang Bauteile 19%", counter_part: "3962", asset_account: "3982" },
  { category_key: "Bauteile", origin_key: "EU", account_number: "3427", account_name: "EU - Wareneingang Bauteile - I.g.E. 19% VSt./USt.", counter_part: "3962", asset_account: "3982" },
  { category_key: "Bauteile", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3962", asset_account: "3982" },

  { category_key: "Naturstein", origin_key: "DE", account_number: "3403", account_name: "Wareneingang Naturstein 19%", counter_part: "3963", asset_account: "3983" },
  { category_key: "Naturstein", origin_key: "EU", account_number: "3428", account_name: "EU - Wareneingang Naturstein -I.g.E. 19% VSt./USt.", counter_part: "3963", asset_account: "3983" },
  { category_key: "Naturstein", origin_key: "Drittland", account_number: "noch nicht angelegt", account_name: "noch nicht angelegt", counter_part: "3963", asset_account: "3983" },
];

// ---------------------- Helpers ----------------------
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
  // NEW: Read directly from shipment item (not position)
  return Number(item.shipping_costs_proportional ?? 0);
};

const calcLineTotal = (item: ISI): number => {
  const qty = Number(item.quantity_delivered ?? 0);
  const price = getUnitPriceNet(item) ?? 0;
  return qty * price;
};

const sumItems = (items: ISI[]): number => items.reduce((acc, it) => acc + calcLineTotal(it), 0);

const sumShipping = (items: ISI[]): number => items.reduce((acc, it) => acc + getShippingSeparate(it), 0);

// ---------------------- Helpers for Warenausgang (Order Items / COGS) ----------------------
const getOrderItemInventoryCategory = (item: OrderItem): string | null => {
  return item.app_products?.inventory_cagtegory ?? null;
};

const getOrderItemSku = (item: OrderItem): string => {
  return item.app_products?.bb_sku ?? "--";
};

const getOrderItemQuantity = (item: OrderItem): number => {
  return Number(item.bb_Quantity ?? 0);
};

/**
 * Calculate cost of material per order item based on product type:
 * 1. Normal product: bb_net_purchase_price
 * 2. BOM product: sum(component.qty * component.bb_net_purchase_price)
 * 3. Antique product: bb_net_purchase_price OR 300.00 default (if 0 or null)
 * 4. Special product: unit_price_net from app_purchase_orders_positions_special OR 0 if not linked
 */
const calculateMaterialCost = (item: OrderItem): number => {
  const product = item.app_products;
  if (!product) return 0;

  const sku = product.bb_sku ?? "";
  const quantity = getOrderItemQuantity(item);

  // 4. Special product (Sonder)
  if (sku.startsWith("Sonder")) {
    const specialPositions = item.app_purchase_orders_positions_special ?? [];
    if (specialPositions.length > 0) {
      const specialPrice = Number(specialPositions[0]?.unit_price_net ?? 0);
      return specialPrice * quantity;
    }
    // If no special position linked, return 0 (no cost data available)
    return 0;
  }

  // 2. BOM product (has recipes)
  const recipes = product.bom_recipes ?? [];
  if (recipes.length > 0) {
    const bomCost = recipes.reduce((acc, recipe) => {
      const componentQty = Number(recipe.quantity ?? 0);
      const componentPrice = Number(recipe.billbee_component?.bb_net_purchase_price ?? 0);
      return acc + (componentQty * componentPrice);
    }, 0);
    return bomCost * quantity;
  }

  // 3. Antique product
  if (product.is_antique === true) {
    const purchasePrice = Number(product.bb_net_purchase_price ?? 0);
    // Use 300 EUR default if price is 0 or not set
    const antiquePrice = purchasePrice > 0 ? purchasePrice : 300;
    return antiquePrice * quantity;
  }

  // 1. Normal product
  const normalPrice = Number(product.bb_net_purchase_price ?? 0);
  return normalPrice * quantity;
};

const sumOrderItemCosts = (items: OrderItem[]): number =>
  items.reduce((acc, item) => acc + calculateMaterialCost(item), 0);

/**
 * Expand order items: BOM products are split into their components
 * with their respective categories. Non-BOM products remain unchanged.
 */
const expandOrderItems = (items: OrderItem[]): ExpandedOrderItem[] => {
  const expanded: ExpandedOrderItem[] = [];

  for (const item of items) {
    const product = item.app_products;
    if (!product) {
      expanded.push({ 
        ...item, 
        component_category: null, 
        is_bom_component: false,
        component_sku: null,
        bom_sku: null,
      });
      continue;
    }

    const recipes = product.bom_recipes ?? [];
    const sku = product.bb_sku ?? "";

    // Check if it's a BOM product (has recipes and not a special product)
    const isBOM = recipes.length > 0 && !sku.startsWith("Sonder");

    if (isBOM) {
      // Split BOM into components
      for (const recipe of recipes) {
        const componentCategory = recipe.billbee_component?.inventory_cagtegory ?? null;
        const componentSku = recipe.billbee_component?.bb_sku ?? null;
        const componentQty = Number(recipe.quantity ?? 0);
        const componentPrice = Number(recipe.billbee_component?.bb_net_purchase_price ?? 0);
        const itemQty = Number(item.bb_Quantity ?? 0);
        const componentCost = componentQty * componentPrice * itemQty;

        // Only include if component has a category and cost > 0
        if (componentCategory && componentCost > 0) {
          expanded.push({
            ...item,
            component_category: componentCategory,
            is_bom_component: true,
            component_sku: componentSku,
            bom_sku: sku,
          });
        }
      }
    } else {
      // Normal product, antique, or special product
      expanded.push({
        ...item,
        component_category: product.inventory_cagtegory ?? null,
        is_bom_component: false,
        component_sku: null,
        bom_sku: null,
      });
    }
  }

  return expanded;
};

/**
 * Calculate cost for an expanded order item.
 * For BOM components, calculates the cost of that specific component.
 */
const calculateExpandedItemCost = (item: ExpandedOrderItem): number => {
  const product = item.app_products;
  if (!product) return 0;

  const quantity = Number(item.bb_Quantity ?? 0);

  // If it's a BOM component, calculate component-specific cost
  if (item.is_bom_component) {
    const recipes = product.bom_recipes ?? [];
    const targetCategory = item.component_category;

    // Sum costs of all components matching this category
    const componentCost = recipes.reduce((acc, recipe) => {
      const componentCategory = recipe.billbee_component?.inventory_cagtegory ?? null;
      if (componentCategory === targetCategory) {
        const componentQty = Number(recipe.quantity ?? 0);
        const componentPrice = Number(recipe.billbee_component?.bb_net_purchase_price ?? 0);
        return acc + (componentQty * componentPrice);
      }
      return acc;
    }, 0);

    return componentCost * quantity;
  }

  // For non-BOM items, use the original calculation
  return calculateMaterialCost(item);
};

const getOriginBucketForShipment = (shipment: InboundShipment): OriginBucket => {
  const first = shipment.app_inbound_shipment_items?.[0] ?? null;
  const taxCountry = first?.app_purchase_orders?.app_suppliers?.tax_country;
  return getOriginBucket(taxCountry);
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

const toCSV = (rows: ExportRow[]) => {
  const header = [
    "Bezeichnung",
    "Betrag",
    "Gegenkonto",
    "Rechnungsnummer (RNr-KNr)",
    "Versanddatum",
    "Konto",
    "Buchungstext formatiert",
  ].join(";");

  const lines = rows.map((r) =>
    [
      r.bezeichnung,
      formatNumberDE(r.betrag, { decimals: 2 }),
      r.gegenkonto,
      r.rechnungsnummer,
      r.versanddatum,
      r.konto,
      r.buchungstext,
    ].join(";"),
  );

  return [header, ...lines].join("\n");
};

// ---------------------- Page ----------------------
export default function MonatsabschlussPage() {
  const [range, setRange] = useState<RangeValue>(null);

  const filters: CrudFilters = useMemo(() => {
    const start = range?.[0];
    const end = range?.[1];

    if (!start || !end) return [];

    return [
      { field: "delivered_at", operator: "gte", value: start.toISOString() },
      { field: "delivered_at", operator: "lte", value: end.toISOString() },
    ];
  }, [range]);

  const outboundFilters: CrudFilters = useMemo(() => {
    const start = range?.[0];
    const end = range?.[1];

    if (!start || !end) return [];

    return [
      { field: "app_orders.bb_InvoiceDate", operator: "gte", value: start.toISOString() },
      { field: "app_orders.bb_InvoiceDate", operator: "lte", value: end.toISOString() },
      { field: "is_active", operator: "eq", value: true }
    ];
  }, [range]);

  const previousMonthFilters: CrudFilters = useMemo(() => {
    const start = range?.[0];
    const end = range?.[1];

    if (!start || !end) return [];

    const duration = end.diff(start, 'days');
    const prevPeriodEnd = start.clone().subtract(1, 'day');
    const prevPeriodStart = prevPeriodEnd.clone().subtract(duration, 'days');

    return [
      { field: "app_orders.bb_InvoiceDate", operator: "gte", value: prevPeriodStart.toISOString() },
      { field: "app_orders.bb_InvoiceDate", operator: "lte", value: prevPeriodEnd.toISOString() },
      { field: "is_active", operator: "eq", value: true }
    ];
  }, [range]);

  const previousYearFilters: CrudFilters = useMemo(() => {
    const start = range?.[0];
    const end = range?.[1];

    if (!start || !end) return [];

    const prevYearStart = start.clone().subtract(1, 'year');
    const prevYearEnd = end.clone().subtract(1, 'year');

    return [
      { field: "app_orders.bb_InvoiceDate", operator: "gte", value: prevYearStart.toISOString() },
      { field: "app_orders.bb_InvoiceDate", operator: "lte", value: prevYearEnd.toISOString() },
      { field: "is_active", operator: "eq", value: true }
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
      // WICHTIG: shipping_costs_proportional ist jetzt auf app_inbound_shipment_items
      select:
        "id, inbound_number, delivered_at, invoice_number, delivery_note_number, shipping_cost_separate, app_inbound_shipment_items(id, quantity_delivered, shipping_costs_proportional, app_purchase_orders(app_suppliers(id, tax_country)), app_purchase_orders_positions_normal(unit_price_net, app_products(inventory_cagtegory, bb_sku)), app_purchase_orders_positions_special(unit_price_net, billbee_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(inventory_cagtegory, bb_sku)))",
    },
    pagination: { mode: "off" },
    filters,
    sorters: [{ field: "delivered_at", order: "desc" }],
    queryOptions: { keepPreviousData: true },
  });

  const shipments: InboundShipment[] = inboundShipments?.data ?? [];

  const {
    data: orderItemsData,
    isLoading: loadingOrderItems,
    isError: isErrorOrderItems,
  } = useList<OrderItem>({
    resource: "app_order_items",
    meta: {
      select:
        "id, bb_Quantity, app_orders!inner(id, bb_InvoiceDate, bb_OrderNumber, app_customers(bb_Name)), app_products(bb_sku, inventory_cagtegory, is_antique, bb_net_purchase_price, bom_recipes!bom_recipes_billbee_bom_id_fkey(quantity, billbee_component:app_products!bom_recipes_billbee_component_id_fkey(bb_sku, bb_net_purchase_price, inventory_cagtegory))), app_purchase_orders_positions_special(unit_price_net)",
    },
    pagination: { mode: "off" },
    filters: outboundFilters,
    sorters: [{ field: "app_orders.bb_InvoiceDate", order: "desc" }],
    queryOptions: { keepPreviousData: true },
  });

  const orderItems: OrderItem[] = orderItemsData?.data ?? [];

  const {
    data: previousMonthData,
  } = useList<OrderItem>({
    resource: "app_order_items",
    meta: {
      select:
        "id, app_orders!inner(id, bb_InvoiceDate), app_products(bb_sku)",
    },
    pagination: { mode: "off" },
    filters: previousMonthFilters,
    queryOptions: { keepPreviousData: true, enabled: previousMonthFilters.length > 0 },
  });

  const previousMonthItems: OrderItem[] = previousMonthData?.data ?? [];

  const {
    data: previousYearData,
  } = useList<OrderItem>({
    resource: "app_order_items",
    meta: {
      select:
        "id, app_orders!inner(id, bb_InvoiceDate), app_products(bb_sku)",
    },
    pagination: { mode: "off" },
    filters: previousYearFilters,
    queryOptions: { keepPreviousData: true, enabled: previousYearFilters.length > 0 },
  });

  const previousYearItems: OrderItem[] = previousYearData?.data ?? [];

  // Data Quality Check: Validate ANK allocation
  const ankValidation = useMemo(() => {
    const issues: { shipment: InboundShipment; header: number; calculated: number; diff: number }[] = [];
    
    for (const shipment of shipments) {
      const headerANK = Number(shipment.shipping_cost_separate ?? 0);
      const allItems: ISI[] = shipment.app_inbound_shipment_items ?? [];
      const calculatedANK = sumShipping(allItems);
      const diff = Math.abs(headerANK - calculatedANK);
      
      // Tolerance: 0.10 EUR (accounting for rounding)
      if (diff > 0.10 && headerANK > 0) {
        issues.push({ shipment, header: headerANK, calculated: calculatedANK, diff });
      }
    }
    
    return issues;
  }, [shipments]);

  // Data Quality Check: Validate order items with 0 cost (excluding service items)
  const zeroCostValidation = useMemo(() => {
    const issues: OrderItem[] = [];
    
    for (const item of orderItems) {
      const category = getOrderItemInventoryCategory(item);
      const cost = calculateMaterialCost(item);
      const sku = getOrderItemSku(item);
      
      // Exclude service items (Kein Inventar or null category)
      const isService = category === "Kein Inventar" || category === null;
      
      // Flag if cost is 0 and not a service item
      if (cost === 0 && !isService) {
        issues.push(item);
      }
    }
    
    return issues;
  }, [orderItems]);

  // Statistics: Count Sonder positions
  const sonderStats = useMemo(() => {
    const countSonder = (items: OrderItem[]) => 
      items.filter(item => {
        const sku = getOrderItemSku(item);
        return sku.startsWith("Sonder");
      }).length;

    const current = countSonder(orderItems);
    const prevMonth = countSonder(previousMonthItems);
    const prevYear = countSonder(previousYearItems);

    const monthChange = prevMonth > 0 ? ((current - prevMonth) / prevMonth) * 100 : 0;
    const yearChange = prevYear > 0 ? ((current - prevYear) / prevYear) * 100 : 0;

    return {
      current,
      prevMonth,
      prevYear,
      monthChange,
      yearChange,
    };
  }, [orderItems, previousMonthItems, previousYearItems]);

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
        gegenkonto: account.asset_account,
        rechnungsnummer: "",
        versanddatum: endDate,
        konto: account.account_number,
        buchungstext: `${titlePrefix}${bezeichnung}`,
      });
    }

    // 3) ANK (Anschaffungsnebenkosten) aus shipping_costs_proportional:
    //    -> anteilig je Bestandskonto (asset_account)
    const ankByAssetAccount = new Map<string, number>();

    for (const [k, shipTotal] of Array.from(shippingByBucket.entries())) {
      if (!shipTotal || Math.abs(shipTotal) < 0.000001) continue;

      const { category_key, origin_key } = parseBucketKey(k);
      const account = ACCOUNTS.find((a) => a.category_key === category_key && a.origin_key === origin_key);
      if (!account) continue;

      ankByAssetAccount.set(account.asset_account, (ankByAssetAccount.get(account.asset_account) ?? 0) + shipTotal);
    }

    for (const [assetAccount, ankTotal] of Array.from(ankByAssetAccount.entries())) {
      const amount = -Number(ankTotal);
      if (Math.abs(amount) < 0.000001) continue;

      const bezeichnung = "Anschaffungsnebenkosten";

      rows.push({
        bezeichnung,
        betrag: amount,
        gegenkonto: assetAccount,
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

  const buildWarenausgangExportRows = (): ExportRow[] => {
    const endDate = range?.[1] ? range[1].format("DD.MM.YYYY") : dayjs().format("DD.MM.YYYY");
    const titlePrefix = `Warenausgang (BuBu) - ${endDate} Monatsabschluss - `;

    // Expand BOM products into components
    const expandedItems = expandOrderItems(orderItems);

    // Group costs by component category
    const costsByCategory = new Map<string, number>();

    for (const item of expandedItems) {
      const category = item.component_category;
      if (!category || category === "Kein Inventar") continue; // Skip service items

      const cost = calculateExpandedItemCost(item);
      costsByCategory.set(category, (costsByCategory.get(category) ?? 0) + cost);
    }

    const rows: ExportRow[] = [];

    // Create export rows for each category
    for (const cat of CATEGORY_KEYS) {
      const categoryTotal = costsByCategory.get(cat.key) ?? 0;
      if (Math.abs(categoryTotal) < 0.000001) continue;

      // Find the counter_part (inventory account) for this category
      const account = ACCOUNTS.find((a) => a.category_key === cat.key && a.origin_key === "DE");
      if (!account) continue;

      const amount = -Number(categoryTotal); // Negative for expense
      const bezeichnung = `Warenausgang ${cat.label}`;

      rows.push({
        bezeichnung,
        betrag: amount,
        gegenkonto: account.counter_part, //Bestandsveränderungskonto(e.g., 3960, 3961, etc.)
        rechnungsnummer: "",
        versanddatum: endDate,
        konto: account.asset_account, //Bestandskonto (e.g., 3980, 3981, etc.)
        buchungstext: `${titlePrefix}${bezeichnung}`,
      });
    }

    return rows.filter((r) => Math.abs(r.betrag) >= 0.000001);
  };

  const handleExport = () => {
    const rows = buildExportRows();
    const csv = toCSV(rows);
    const endDate = range?.[1] ? range[1].format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    downloadTextFile(`monatsabschluss-wareneingang-${endDate}.csv`, csv);
  };

  const handleWarenausgangExport = () => {
    const rows = buildWarenausgangExportRows();
    const csv = toCSV(rows);
    const endDate = range?.[1] ? range[1].format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
    downloadTextFile(`monatsabschluss-warenausgang-${endDate}.csv`, csv);
  };

  // --- Panels: Shipment -> Items (für eine gegebene Menge categoryItems je Shipment) ---
  const buildShipmentPanels = (shipmentsWithCategory: { shipment: InboundShipment; categoryItems: ISI[] }[]) => {
    return shipmentsWithCategory.map(({ shipment, categoryItems }) => {
      const shipmentTotal = sumItems(categoryItems);
      const shipmentANK = sumShipping(categoryItems);
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
            <Typography.Text type="secondary"><strong>{formatCurrencyEUR(shipmentTotal)}</strong></Typography.Text>
            <Typography.Text type="secondary">(ANK {formatCurrencyEUR(shipmentANK)})</Typography.Text>
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

                    <Typography.Text strong>{formatCurrencyEUR(lineTotal)}</Typography.Text>
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
            <Typography.Text type="secondary">{formatCurrencyEUR(bucketGoodsTotal)}</Typography.Text>
            <Typography.Text type="secondary">(ANK {formatCurrencyEUR(bucketShipping)})</Typography.Text>
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
    const categoryANK = shipmentsWithCategory.reduce((acc, x) => acc + sumShipping(x.categoryItems), 0);
    const categoryLabel = CATEGORY_KEYS.find((c) => c.key === categoryKey)?.label ?? categoryKey;

    return {
      key: categoryKey,
      label: (
        <Space size={8}>
          <span>{categoryLabel}</span>
          <Typography.Text type="secondary">{formatCurrencyEUR(categoryTotal)}</Typography.Text>
          <Typography.Text type="secondary">(ANK {formatCurrencyEUR(categoryANK)})</Typography.Text>
        </Space>
      ),
      children: <Collapse items={buildOriginPanelsForCategory(categoryKey, shipmentsWithCategory)} />,
    };
  };

  const itemsCategoryCollapse = CATEGORY_KEYS.map((c) => buildCategoryPanel(c.key));

  // ---------------------- Build Warenausgang Collapse Panels ----------------------
  const buildWarenausgangOrderPanels = (categoryItems: ExpandedOrderItem[]) => {
    // Group items by order
    const orderMap = new Map<number, ExpandedOrderItem[]>();
    
    for (const item of categoryItems) {
      const orderId = item.app_orders?.id;
      if (!orderId) continue;
      
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, []);
      }
      orderMap.get(orderId)?.push(item);
    }

    return Array.from(orderMap.entries()).map(([orderId, items]) => {
      const order = items[0]?.app_orders;
      const orderTotal = items.reduce((acc, item) => acc + calculateExpandedItemCost(item), 0);
      const shippedAt = order?.bb_InvoiceDate ? dayjs(order.bb_InvoiceDate).format("DD.MM.YYYY") : "--";
      const orderNumber = order?.bb_OrderNumber ?? orderId.toString();
      const customerName = order?.app_customers?.bb_Name ?? "Unbekannter Kunde";

      return {
        key: orderId.toString(),
        label: (
          <Space size={8}>
            <strong>{customerName}</strong>
            <span>
              {shippedAt} –{" "}
              <Link href={`/kundenberatung/auftrag/${orderId}`}>Auftrag {orderNumber}</Link>
            </span>
            <Typography.Text type="secondary">{formatCurrencyEUR(orderTotal)}</Typography.Text>
          </Space>
        ),
        children: (
          <List
            dataSource={items}
            renderItem={(item) => {
              const sku = item.is_bom_component && item.component_sku 
                ? item.component_sku 
                : getOrderItemSku(item);
              const qty = getOrderItemQuantity(item);
              const cost = calculateExpandedItemCost(item);
              const unitCost = qty !== 0 ? cost / qty : 0;
              const displaySku = item.is_bom_component && item.bom_sku
                ? `${sku} (aus ${item.bom_sku})` 
                : sku;

              return (
                <List.Item>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Space>
                      <Typography.Text strong>{displaySku}</Typography.Text>
                      <Typography.Text>{qty} Stück</Typography.Text>
                      <Typography.Text>{formatCurrencyEUR(unitCost)} / Stück</Typography.Text>
                    </Space>
                    <Typography.Text strong>{formatCurrencyEUR(cost)}</Typography.Text>
                  </Space>
                </List.Item>
              );
            }}
          />
        ),
      };
    });
  };

  const buildWarenausgangCategoryPanel = (categoryKey: string) => {
    const expandedItems = expandOrderItems(orderItems);
    const categoryItems = expandedItems.filter((item) => item.component_category === categoryKey);
    
    if (categoryItems.length === 0) return null;

    const categoryTotal = categoryItems.reduce((acc, item) => acc + calculateExpandedItemCost(item), 0);
    const categoryLabel = CATEGORY_KEYS.find((c) => c.key === categoryKey)?.label ?? categoryKey;

    return {
      key: categoryKey,
      label: (
        <Space size={8}>
          <span>{categoryLabel}</span>
          <Typography.Text type="secondary">{formatCurrencyEUR(categoryTotal)}</Typography.Text>
          <Typography.Text type="secondary">({categoryItems.length} Positionen)</Typography.Text>
        </Space>
      ),
      children: <Collapse items={buildWarenausgangOrderPanels(categoryItems)} />,
    };
  };

  const itemsWarenausgangCollapse = CATEGORY_KEYS.map((c) => buildWarenausgangCategoryPanel(c.key)).filter(
    (panel) => panel !== null,
  );

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
      <Space direction="vertical" style={{ width: "100%", marginBottom: 16 }}>
        <DateRangeFilter
          value={range}
          onChangeAction={setRange}
          storageKey="monatsabschluss-range"
          isLoading={loadingInboundShipments}
        />

        {ankValidation.length > 0 && (
          <Alert
            type="warning"
            message="ANK-Allokation Warnung"
            description={
              <div>
                <p>
                  Bei {ankValidation.length} Wareneingang(en) stimmt die Summe der item-level ANK nicht mit dem
                  Header-Wert überein. Dies deutet auf fehlende Trigger-Ausführung hin:
                </p>
                <ul>
                  {ankValidation.slice(0, 5).map((issue) => (
                    <li key={issue.shipment.id}>
                      <Link href={`/lager/wareneingang/${issue.shipment.id}`}>
                        {issue.shipment.inbound_number ?? issue.shipment.id}
                      </Link>
                      : Header {formatCurrencyEUR(issue.header)} vs. Berechnet {formatCurrencyEUR(issue.calculated)} (Δ{" "}
                      {formatCurrencyEUR(issue.diff)})
                    </li>
                  ))}
                  {ankValidation.length > 5 && <li>... und {ankValidation.length - 5} weitere</li>}
                </ul>
                <Typography.Text type="secondary">
                  Tipp: Öffnen Sie jeden betroffenen Wareneingang und speichern Sie ihn erneut, um den Trigger
                  manuell auszulösen.
                </Typography.Text>
              </div>
            }
            showIcon
            closable
          />
        )}
      </Space>

      <Tabs
        items={[
          {
            key: "inbound_shipments",
            label: "Wareneingang",
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Collapse items={itemsCategoryCollapse} />
                <Button onClick={handleExport} type="primary" block>
                  Wareneingang Export
                </Button>
              </Space>
            ),
          },
          {
            key: "outbound_shipments",
            label: "Warenausgang",
            children: loadingOrderItems ? (
              <LoadingFallback />
            ) : isErrorOrderItems ? (
              <Alert type="error" message="Fehler beim Laden der Warenausgänge" showIcon />
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {range?.[0] && range?.[1] && (
                  <Card>
                    <Space size="large" wrap>
                      <Statistic 
                        title="Sonder-Positionen (aktuell)" 
                        value={sonderStats.current} 
                      />
                      <Statistic
                        title="Vergleich zum Vorzeitraum"
                        value={sonderStats.monthChange}
                        precision={1}
                        suffix="%"
                        valueStyle={{ color: sonderStats.monthChange >= 0 ? '#3f8600' : '#cf1322' }}
                        prefix={sonderStats.monthChange >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      />
                      <Statistic
                        title="Vorzeitraum absolut"
                        value={sonderStats.prevMonth}
                        valueStyle={{ fontSize: '16px' }}
                      />
                      <Statistic
                        title="Vergleich zum Vorjahreszeitraum"
                        value={sonderStats.yearChange}
                        precision={1}
                        suffix="%"
                        valueStyle={{ color: sonderStats.yearChange >= 0 ? '#3f8600' : '#cf1322' }}
                        prefix={sonderStats.yearChange >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      />
                      <Statistic
                        title="Vorjahreszeitraum absolut"
                        value={sonderStats.prevYear}
                        valueStyle={{ fontSize: '16px' }}
                      />
                    </Space>
                  </Card>
                )}
                {zeroCostValidation.length > 0 && (
                  <Alert
                    type="warning"
                    message="Materialkosten-Warnung"
                    description={
                      <div>
                        <p>
                          {zeroCostValidation.length} Artikel haben Materialkosten von 0,00 EUR (exkl. Service-Artikel):
                        </p>
                        <ul>
                          {zeroCostValidation.slice(0, 10).map((item) => {
                            const sku = getOrderItemSku(item);
                            const orderId = item.app_orders?.id;
                            const orderNumber = item.app_orders?.bb_OrderNumber ?? orderId?.toString() ?? "--";
                            const customerName = item.app_orders?.app_customers?.bb_Name ?? "Unbekannt";
                            
                            return (
                              <li key={item.id}>
                                <strong>{sku}</strong> in{" "}
                                <Link href={`/kundenberatung/auftrag/${orderId}`}>
                                  Auftrag {orderNumber}
                                </Link>
                                {" "}({customerName})
                              </li>
                            );
                          })}
                          {zeroCostValidation.length > 10 && <li>... und {zeroCostValidation.length - 10} weitere</li>}
                        </ul>
                        <Typography.Text type="secondary">
                          Mögliche Ursachen: Fehlende Einkaufspreise (bb_net_purchase_price), fehlende BOM-Komponenten,
                          nicht verknüpfte Sonderbestellungen, oder Antiquitäten ohne Preis.
                        </Typography.Text>
                      </div>
                    }
                    showIcon
                    closable
                  />
                )}
                <Collapse items={itemsWarenausgangCollapse} />
                <Button onClick={handleWarenausgangExport} type="primary" block>
                  Warenausgang Export
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Show>
  );
}
