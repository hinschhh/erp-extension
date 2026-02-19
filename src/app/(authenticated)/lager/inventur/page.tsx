"use client";

import { Space, Card, Table, Form, Input, Button, Alert, App as AntdApp, Progress, Collapse, Typography, Statistic, Row, Col, DatePicker } from "antd";
import { List, useTable } from "@refinedev/antd";
import React, { useState, useEffect, useMemo } from "react";
import dayjs from "dayjs";

import { Database } from "@/types/supabase";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { CheckOutlined, EditOutlined, BarChartOutlined } from "@ant-design/icons";

const { Panel } = Collapse;
const { Title, Text } = Typography;

type InventorySession =
  Database["public"]["Tables"]["app_inventory_sessions"]["Row"];

interface SessionWithProgress extends InventorySession {
  countable_products: number;
  counted_products: number;
}

interface ProductWithSnapshot {
  id: number;
  bb_name: string | null;
  bb_sku: string | null;
  inventory_cagtegory: string | null;
  bb_category1: string | null;
  bb_category2: string | null;
  bb_category3: string | null;
  cost_price: number;
  bb_stock_current: number;
  total_value: number;
}

interface CategoryData {
  category: string;
  products: ProductWithSnapshot[];
  totalValue: number;
  totalQuantity: number;
  subcategories: Map<string, ProductWithSnapshot[]>;
}

interface InventoryValueData {
  categories: Map<string, CategoryData>;
  totalInventoryValue: number;
}

interface HistoricalInventoryData {
  targetDate: string;
  estimatedValue: number;
  currentValue: number;
  inboundMovements: number;
  outboundMovements: number;
  productsCount: number;
}

// Types for order items (Warenausgang)
type OrderItem = {
  id: number;
  bb_Quantity: number | null;
  fk_app_products_id: number | null;
  app_products?: {
    bb_sku?: string | null;
    inventory_cagtegory?: string | null;
    is_antique?: boolean | null;
    bb_costnet?: number | null;
    bom_recipes?: {
      quantity?: number | null;
      billbee_component?: {
        bb_sku?: string | null;
        cost_price?: number | null;
        inventory_cagtegory?: string | null;
      } | null;
    }[] | null;
  } | null;
  app_purchase_orders_positions_special?: {
    unit_price_net?: number | null;
  }[] | null;
  app_orders?: {
    bb_InvoiceDate?: string | null;
  } | null;
};

// Expanded order item for component-based grouping
type ExpandedOrderItem = OrderItem & {
  component_category?: string | null;
  is_bom_component?: boolean;
  component_sku?: string | null;
  bom_sku?: string | null;
};

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
 * 1. Normal product: bb_costnet (total cost including acquisition costs)
 * 2. BOM product: sum(component.qty * component.cost_price) 
 * 3. Antique product: bb_costnet OR 300.00 default (if 0 or null)
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
      const componentPrice = Number(recipe.billbee_component?.cost_price ?? 0);
      return acc + (componentQty * componentPrice);
    }, 0);
    return bomCost * quantity;
  }

  // 3. Antique product
  if (product.is_antique === true) {
    const purchasePrice = Number(product.bb_costnet ?? 0);
    // Use 300 EUR default if price is 0 or not set
    const antiquePrice = purchasePrice > 0 ? purchasePrice : 300;
    return antiquePrice * quantity;
  }

  // 1. Normal product
  const normalPrice = Number(product.bb_costnet ?? 0);
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
        const componentPrice = Number(recipe.billbee_component?.cost_price ?? 0);
        const itemQty = Number(item.bb_Quantity ?? 0);
        const componentCost = componentQty * componentPrice * itemQty;

        // Include components with category and non-zero cost (including cancellations)
        if (componentCategory && componentCost !== 0) {
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
        const componentPrice = Number(recipe.billbee_component?.cost_price ?? 0);
        return acc + (componentQty * componentPrice);
      }
      return acc;
    }, 0);

    return componentCost * quantity;
  }

  // For non-BOM items, use the original calculation
  return calculateMaterialCost(item);
};

export default function InventarPage() {
  const { message } = AntdApp.useApp();
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<InventorySession | null>(null);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progressData, setProgressData] = useState<Record<number, { countable: number; counted: number }>>({});
  const [inventoryData, setInventoryData] = useState<InventoryValueData | null>(null);
  const [loadingInventoryData, setLoadingInventoryData] = useState(false);
  const [historicalData, setHistoricalData] = useState<HistoricalInventoryData | null>(null);
  const [loadingHistoricalData, setLoadingHistoricalData] = useState(false);
  const [targetDate, setTargetDate] = useState<dayjs.Dayjs>(dayjs().subtract(30, 'day'));

  // Lade Inventarwerte-Daten für aktuelle Bestände
  const { tableProps: productsTableProps } = useTable({
    resource: "app_products",
    filters: {
      permanent: [
        { field: "bb_is_active", operator: "eq", value: true }
      ]
    },
    queryOptions: {
      enabled: false, // Wir triggern das manuell wenn benötigt
    }
  });

  // Lade Sessions
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoading(true);
      const { data, error } = await supabaseBrowserClient
        .from("app_inventory_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fehler beim Laden der Sessions:", error);
        message.error("Fehler beim Laden der Inventuren");
      } else {
        setSessions(data || []);
      }
      setIsLoading(false);
    };

    loadSessions();

    // Live-Updates
    const channel = supabaseBrowserClient
      .channel("inventory_sessions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_inventory_sessions" },
        () => {
          loadSessions();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [message]);

  // Berechne Fortschritt für jede Session
  useEffect(() => {
    if (sessions.length === 0) return;

    const loadProgress = async () => {
      const progressMap: Record<number, { countable: number; counted: number }> = {};
      
      for (const session of sessions) {
        // Zähle relevante Snapshots (Produkte mit Bestand im letzten Jahr oder aktuellem Bestand <> 0)
        const { data: snapshots, error: snapshotError } = await supabaseBrowserClient
          .from("app_inventory_snapshots")
          .select("fk_products, bb_stock_current")
          .eq("session_id", session.id);

        if (snapshotError || !snapshots) {
          console.error("Fehler beim Laden der Snapshots:", snapshotError);
          continue;
        }

        if (snapshots.length === 0) {
          progressMap[session.id] = { countable: 0, counted: 0 };
          continue;
        }

        const productIds = snapshots.map(s => s.fk_products);
        
        // Filtere Produkte: nur die mit Bewegung im letzten Jahr oder aktuellem Bestand
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        // Prüfe welche Produkte im letzten Jahr in Bestellungen vorkamen
        const { data: normalPositions } = await supabaseBrowserClient
          .from("app_purchase_orders_positions_normal")
          .select("billbee_product_id")
          .in("billbee_product_id", productIds)
          .gte("created_at", oneYearAgo.toISOString());

        const { data: specialPositions } = await supabaseBrowserClient
          .from("app_purchase_orders_positions_special")
          .select("billbee_product_id")
          .in("billbee_product_id", productIds)
          .gte("created_at", oneYearAgo.toISOString());

        const productsWithActivity = new Set([
          ...(normalPositions?.map(p => p.billbee_product_id) || []),
          ...(specialPositions?.map(p => p.billbee_product_id) || [])
        ]);

        // Füge Produkte mit aktuellem Bestand <> 0 hinzu
        snapshots
          .filter(s => s.bb_stock_current !== 0)
          .forEach(s => productsWithActivity.add(s.fk_products));

        const countableProducts = productsWithActivity.size;

        // Zähle gezählte Produkte (nur die relevanten)
        const { data: counts } = await supabaseBrowserClient
          .from("app_inventory_counts")
          .select("fk_products")
          .eq("session_id", session.id);

        const countedRelevantProducts = new Set(
          counts?.filter(c => productsWithActivity.has(c.fk_products))
                 .map(c => c.fk_products) || []
        );

        progressMap[session.id] = {
          countable: countableProducts,
          counted: countedRelevantProducts.size
        };
      }

      setProgressData(progressMap);
    };

    loadProgress();
  }, [sessions]);

  // Funktion zum Laden der Inventarwerte-Daten
  const loadInventoryValueData = async () => {
    if (loadingInventoryData) return;
    
    setLoadingInventoryData(true);
    try {
      // Lade Produkte mit korrekter Bestandsberechnung aus rpt_products_inventory_purchasing
      const { data: productsWithStock, error } = await supabaseBrowserClient
        .from("rpt_products_inventory_purchasing")
        .select(`
          product_id,
          sku,
          inventory_cagtegory,
          stock_physical,
          stock_free,
          unit_cost_net
        `)
        .gt("stock_physical", 0); // Physischer Lagerbestand > 0

      if (error) {
        console.error("Fehler beim Laden der Inventardaten:", error);
        message.error("Fehler beim Laden der Inventarwerte");
        return;
      }

      if (!productsWithStock || productsWithStock.length === 0) {
        message.info("Keine Produkte mit Lagerbestand gefunden");
        setInventoryData({
          categories: new Map(),
          totalInventoryValue: 0
        });
        return;
      }

      // Lade zusätzliche Produktinformationen für die gefundenen Produkte
      const productIds = productsWithStock.map(p => p.product_id).filter(id => id != null);
      
      const { data: productDetails, error: productError } = await supabaseBrowserClient
        .from("app_products")
        .select("id, bb_name, bb_sku, inventory_cagtegory, bb_category1, bb_category2, bb_category3")
        .eq("bb_is_active", true)
        .in("id", productIds);

      if (productError) {
        console.error("Fehler beim Laden der Produktdetails:", productError);
        message.error("Fehler beim Laden der Produktdetails");
        return;
      }

      // Erstelle ein Map für schnellen Zugriff auf Produktdetails
      const productDetailsMap = new Map();
      productDetails?.forEach(product => {
        productDetailsMap.set(product.id, product);
      });

      // Aggregiere Daten nach Kategorien
      const categoriesMap = new Map<string, CategoryData>();
      let totalInventoryValue = 0;

      productsWithStock.forEach((inventoryRecord: any) => {
        const productDetail = productDetailsMap.get(inventoryRecord.product_id);
        if (!productDetail) return; // Skip wenn Produktdetails nicht gefunden
        
        const stockPhysical = inventoryRecord.stock_physical || 0;
        const unitCost = inventoryRecord.unit_cost_net || 0;
        const totalValue = stockPhysical * unitCost;
        totalInventoryValue += totalValue;

        const productWithSnapshot: ProductWithSnapshot = {
          id: inventoryRecord.product_id,
          bb_name: productDetail.bb_name,
          bb_sku: inventoryRecord.sku,
          inventory_cagtegory: inventoryRecord.inventory_cagtegory,
          bb_category1: productDetail.bb_category1,
          bb_category2: productDetail.bb_category2,
          bb_category3: productDetail.bb_category3,
          cost_price: unitCost,
          bb_stock_current: stockPhysical,
          total_value: totalValue
        };

        const category = inventoryRecord.inventory_cagtegory || "Ohne Kategorie";
        
        if (!categoriesMap.has(category)) {
          categoriesMap.set(category, {
            category,
            products: [],
            totalValue: 0,
            totalQuantity: 0,
            subcategories: new Map()
          });
        }

        const categoryData = categoriesMap.get(category)!;
        categoryData.products.push(productWithSnapshot);
        categoryData.totalValue += totalValue;
        categoryData.totalQuantity += stockPhysical;

        // Gruppiere nach Subkategorie (bb_category1)
        const subcategory = productDetail.bb_category1 || "Ohne Subkategorie";
        if (!categoryData.subcategories.has(subcategory)) {
          categoryData.subcategories.set(subcategory, []);
        }
        categoryData.subcategories.get(subcategory)!.push(productWithSnapshot);
      });

      setInventoryData({
        categories: categoriesMap,
        totalInventoryValue
      });

      message.success(`Inventarwerte für ${productsWithStock.length} Produkte geladen`);
    } catch (err: any) {
      console.error("Fehler beim Laden der Inventardaten:", err);
      message.error("Fehler beim Laden der Inventarwerte");
    } finally {
      setLoadingInventoryData(false);
    }
  };

  // Funktion zur Berechnung des geschätzten Inventarwerts zu einem Stichtag
  const calculateHistoricalInventoryValue = async () => {
    if (loadingHistoricalData || !inventoryData) {
      if (!inventoryData) {
        message.warning("Bitte laden Sie zuerst die aktuellen Inventarwerte");
      }
      return;
    }
    
    setLoadingHistoricalData(true);
    try {
      const targetDateStr = targetDate.format('YYYY-MM-DD');
      const today = dayjs().format('YYYY-MM-DD');
      
      // 1. Hole alle Produkte mit aktuellem Bestand
      const { data: currentProducts } = await supabaseBrowserClient
        .from("rpt_products_inventory_purchasing")
        .select("product_id, sku, stock_physical, unit_cost_net")
        .gt("stock_physical", 0);

      if (!currentProducts) {
        message.error("Fehler beim Laden der aktuellen Produktdaten");
        return;
      }

      const productIds = currentProducts.map(p => p.product_id).filter((id): id is number => id !== null);
      let totalInboundMovements = 0;
      let totalOutboundMovements = 0;
      let estimatedValue = 0;

      // 2. Berechne Wareneingänge zwischen Stichtag und heute (inkl. Anschaffungsnebenkosten)
      // Verwende die gleiche Logik wie in monatsabschluss: Lade Shipments mit delivered_at Filter
      const { data: inboundShipmentsData, error: shipmentsError } = await supabaseBrowserClient
        .from("app_inbound_shipments")
        .select(`
          id,
          delivered_at,
          app_inbound_shipment_items (
            id,
            quantity_delivered,
            shipping_costs_proportional,
            app_purchase_orders_positions_normal (
              billbee_product_id,
              unit_price_net
            ),
            app_purchase_orders_positions_special (
              billbee_product_id,
              unit_price_net
            )
          )
        `)
        .gte("delivered_at", targetDateStr)
        .lte("delivered_at", today);

      if (shipmentsError) {
        console.error("Fehler beim Laden der Wareneingänge:", shipmentsError);
        message.error("Fehler beim Laden der Wareneingänge");
        return;
      }

      const inboundShipments = inboundShipmentsData || [];

      let totalNormalInbound = 0;
      let totalNormalANK = 0;
      let totalSpecialInbound = 0;
      let totalSpecialANK = 0;

      for (const shipment of inboundShipments) {
        const items = shipment.app_inbound_shipment_items || [];
        
        for (const item of items) {
          // Bestimme Product ID und Unit Price (aus Position)
          let productId: number | null = null;
          let unitPrice = 0;
          let isNormal = false;

          if (item.app_purchase_orders_positions_normal) {
            productId = item.app_purchase_orders_positions_normal.billbee_product_id;
            unitPrice = Number(item.app_purchase_orders_positions_normal.unit_price_net ?? 0);
            isNormal = true;
          } else if (item.app_purchase_orders_positions_special) {
            productId = item.app_purchase_orders_positions_special.billbee_product_id;
            unitPrice = Number(item.app_purchase_orders_positions_special.unit_price_net ?? 0);
            isNormal = false;
          }

          // Skip wenn keine Product ID vorhanden
          if (!productId) continue;

          const quantity = Number(item.quantity_delivered ?? 0);
          const shippingCost = Number(item.shipping_costs_proportional ?? 0);
          const lineTotal = quantity * unitPrice;

          if (isNormal) {
            totalNormalInbound += lineTotal;
            totalNormalANK += shippingCost;
          } else {
            totalSpecialInbound += lineTotal;
            totalSpecialANK += shippingCost;
          }

          totalInboundMovements += lineTotal + shippingCost;
        }
      }

      console.log(`=== INBOUND MOVEMENTS BREAKDOWN ===`);
      console.log(`Normal Positions: ${totalNormalInbound.toFixed(2)} EUR`);
      console.log(`Normal ANK: ${totalNormalANK.toFixed(2)} EUR`);
      console.log(`Special Positions: ${totalSpecialInbound.toFixed(2)} EUR`);
      console.log(`Special ANK: ${totalSpecialANK.toFixed(2)} EUR`);
      console.log(`Total Inbound (inkl. ANK): ${totalInboundMovements.toFixed(2)} EUR`);

      // 3. Berechne Warenausgänge zwischen Stichtag und heute
      // Verwende die gleiche Logik wie in monatsabschluss/page.tsx
      const { data: orderItemsData, error: orderItemsError } = await supabaseBrowserClient
        .from("app_order_items")
        .select(`
          id,
          bb_Quantity,
          fk_app_products_id,
          app_orders!inner (
            bb_InvoiceDate
          ),
          app_products (
            bb_sku,
            inventory_cagtegory,
            is_antique,
            bb_costnet,
            bom_recipes!bom_recipes_billbee_bom_id_fkey (
              quantity,
              billbee_component:app_products!bom_recipes_billbee_component_id_fkey (
                bb_sku,
                cost_price,
                inventory_cagtegory
              )
            )
          ),
          app_purchase_orders_positions_special (
            unit_price_net
          )
        `)
        .eq("is_active", true)
        .not("app_orders.bb_InvoiceDate", "is", null)
        .gte("app_orders.bb_InvoiceDate", targetDateStr)
        .lte("app_orders.bb_InvoiceDate", today);

      if (orderItemsError) {
        console.error("Fehler beim Laden der Order Items:", orderItemsError);
        message.error("Fehler beim Laden der Warenausgänge");
        return;
      }

      const orderItems: OrderItem[] = orderItemsData || [];

      console.log(`=== ORDER ITEMS ANALYSIS ===`);
      console.log(`Total Order Items: ${orderItems.length}`);

      // Verwende die gleichen Helper-Funktionen wie in monatsabschluss
      const expandedItems = expandOrderItems(orderItems);
      
      console.log(`Expanded Items: ${expandedItems.length}`);

      // Berechne Gesamtkosten (skip service items wie in monatsabschluss)
      totalOutboundMovements = 0;
      for (const item of expandedItems) {
        const category = item.component_category;
        if (!category || category === "Kein Inventar") continue; // Skip service items
        
        totalOutboundMovements += calculateExpandedItemCost(item);
      }

      console.log(`Total Outbound Movements: ${totalOutboundMovements.toFixed(2)} EUR`);

      // 4. Berechne geschätzten Wert zum Stichtag
      // Formel: Wert_Stichtag = Wert_heute - Wareneingänge + Warenausgänge
      estimatedValue = inventoryData.totalInventoryValue - totalInboundMovements + totalOutboundMovements;

      setHistoricalData({
        targetDate: targetDateStr,
        estimatedValue: Math.max(0, estimatedValue), // Verhindere negative Werte
        currentValue: inventoryData.totalInventoryValue,
        inboundMovements: totalInboundMovements,
        outboundMovements: totalOutboundMovements,
        productsCount: currentProducts.length
      });

      // Debug-Informationen loggen
      console.log(`=== DEBUGGING HISTORICAL CALCULATION ===`);
      console.log(`Target Date: ${targetDateStr}`);
      console.log(`Total Order Items found: ${orderItems.length}`);
      console.log(`Expanded Items: ${expandedItems.length}`);
      console.log(`Total Outbound Movements: ${totalOutboundMovements.toFixed(2)} EUR`);
      
      // Detailaufteilung nach Kategorien
      const categoryBreakdown = new Map<string, { count: number; total: number }>();
      for (const item of expandedItems) {
        const category = item.component_category;
        if (!category || category === "Kein Inventar") continue; // Skip service items
        
        if (!categoryBreakdown.has(category)) {
          categoryBreakdown.set(category, { count: 0, total: 0 });
        }
        const catData = categoryBreakdown.get(category)!;
        catData.count += 1;
        catData.total += calculateExpandedItemCost(item);
      }

      console.log(`=== CATEGORY BREAKDOWN ===`);
      categoryBreakdown.forEach((data, category) => {
        console.log(`${category}: ${data.count} items, ${data.total.toFixed(2)} EUR`);
      });

      message.success(`Geschätzter Inventarwert für ${targetDate.format('DD.MM.YYYY')} berechnet`);
    } catch (err: any) {
      console.error("Fehler bei der historischen Berechnung:", err);
      message.error("Fehler bei der Berechnung des historischen Inventarwerts");
    } finally {
      setLoadingHistoricalData(false);
    }
  };

  // Memoized category data für bessere Performance
  const categoryDataArray = useMemo(() => {
    if (!inventoryData) return [];
    
    return Array.from(inventoryData.categories.entries())
      .map(([categoryName, categoryData]) => ({
        key: categoryName,
        categoryName,
        ...categoryData
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [inventoryData]);

  // Kombiniere Session-Daten mit Fortschritt
  const sessionsWithProgress: SessionWithProgress[] = sessions.map((session: InventorySession) => ({
    ...session,
    countable_products: progressData[session.id]?.countable || 0,
    counted_products: progressData[session.id]?.counted || 0
  }));

  const handleStart = async (values: { name: string; note?: string }) => {
    const name = values?.name?.trim();
    if (!name) {
      message.error("Bitte einen Namen fuer die Inventur angeben.");
      return;
    }

    try {
      setStarting(true);
      const { data, error } = await (supabaseBrowserClient as any).rpc(
        "rpc_app_inventory_session_start",
        {
          p_name: name,
          p_note: values?.note ?? null,
        }
      );
      if (error) {
        throw error;
      }
      setSession(data as InventorySession);
      message.success("Inventur gestartet und Snapshot erstellt.");
    } catch (err: any) {
      const msg = err?.message ?? "Inventur konnte nicht gestartet werden.";
      message.error(msg);
    } finally {
      setStarting(false);
    }
  };

  return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>      

        <List title="Inventur">
          <Space direction="vertical">
          <Card title="Inventur starten" bordered>
          <Form layout="vertical" onFinish={handleStart}>
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: "Name der Inventur fehlt." }]}
            >
              <Input placeholder="z. B. Jahresinventur 2025" />
            </Form.Item>
            <Form.Item label="Notiz" name="note">
              <Input.TextArea rows={2} placeholder="Optional: Beschreibung/Notiz" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={starting}>
                Inventur starten & Snapshot erzeugen
              </Button>
            </Form.Item>
          </Form>
          {session ? (
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message={`Inventur "${session.name}" gestartet`}
              description={`Status: ${session.status}, Snapshot: ${session.snapshot_taken_at ?? "-"}`}
            />
          ) : null}
        </Card>
          <Table<SessionWithProgress>
            dataSource={sessionsWithProgress} 
            rowKey="id"
            loading={isLoading}
            title={() => "Vergangene Inventuren"}
          >
            <Table.Column title="Bezeichnung" dataIndex="name" sorter />
            <Table.Column title="Status" dataIndex="status" sorter />
            <Table.Column title="Anmerkungen" dataIndex="note" sorter />
            <Table.Column title="Fortschritt" dataIndex="countable_products" 
              render={(_, record: SessionWithProgress) => {
                const percent = record.countable_products > 0 
                  ? Math.round((record.counted_products / record.countable_products) * 100)
                  : 0;
                return <Progress percent={percent} />;
              }}
            />
            <Table.Column title="Aktionen" key="actions" render={(_, record: SessionWithProgress) => (
              <Space>
                <Button href={`/lager/inventur/zaehlen/${record.id}`} icon={<EditOutlined />}>Zählen</Button>
                <Button href={`/lager/inventur/pruefen/${record.id}`} icon={<CheckOutlined />}>Differenzen prüfen</Button>
              </Space>
            )} />
          </Table>
           {/* Inventarwerte-Übersicht */}
        <Card 
          title={<><BarChartOutlined /> Inventarwerte nach Kategorien</>} 
          bordered
          extra={
            <Button 
              type="primary" 
              onClick={loadInventoryValueData}
              loading={loadingInventoryData}
            >
              Inventarwerte laden
            </Button>
          }
        >
          {inventoryData && (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Statistic
                    title="Gesamtinventarwert"
                    value={inventoryData.totalInventoryValue}
                    precision={2}
                    suffix="€"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Kategorien"
                    value={inventoryData.categories.size}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Produkte mit Bestand"
                    value={Array.from(inventoryData.categories.values())
                      .reduce((sum, cat) => sum + cat.products.length, 0)}
                  />
                </Col>
              </Row>

              <Collapse size="small">
                {categoryDataArray.map((categoryData) => (
                  <Panel
                    key={categoryData.key}
                    header={
                      <Row style={{ width: '100%' }} align="middle">
                        <Col flex="auto">
                          <Text strong>{categoryData.categoryName}</Text>
                        </Col>
                        <Col>
                          <Text type="secondary">
                            {categoryData.products.length} Produkte | {categoryData.totalValue.toFixed(2)}€
                          </Text>
                        </Col>
                      </Row>
                    }
                  >
                    <Collapse size="small" ghost>
                      {Array.from(categoryData.subcategories.entries())
                        .sort(([,a], [,b]) => {
                          const valueA = a.reduce((sum, p) => sum + p.total_value, 0);
                          const valueB = b.reduce((sum, p) => sum + p.total_value, 0);
                          return valueB - valueA;
                        })
                        .map(([subcat, products]) => {
                          const subcatValue = products.reduce((sum, p) => sum + p.total_value, 0);
                          return (
                            <Panel
                              key={`${categoryData.key}-${subcat}`}
                              header={
                                <Row style={{ width: '100%' }} align="middle">
                                  <Col flex="auto">
                                    <Text>{subcat}</Text>
                                  </Col>
                                  <Col>
                                    <Text type="secondary">
                                      {products.length} Produkte | {subcatValue.toFixed(2)}€
                                    </Text>
                                  </Col>
                                </Row>
                              }
                            >
                              <Table
                                size="small"
                                dataSource={products}
                                rowKey="id"
                                pagination={false}
                                scroll={{ x: true }}
                              >
                                <Table.Column
                                  title="Artikel"
                                  dataIndex="bb_name"
                                  key="bb_name"
                                  render={(name, record: ProductWithSnapshot) => (
                                    <div>
                                      <div><strong>{name || "Unbenannt"}</strong></div>
                                      <Text type="secondary" style={{ fontSize: '0.85em' }}>
                                        {record.bb_sku}
                                      </Text>
                                    </div>
                                  )}
                                />
                                <Table.Column
                                  title="Bestand"
                                  dataIndex="bb_stock_current"
                                  key="bb_stock_current"
                                  align="right"
                                  render={(value) => <Text>{value}</Text>}
                                />
                                <Table.Column
                                  title="Stückkosten"
                                  dataIndex="cost_price"
                                  key="cost_price"
                                  align="right"
                                  render={(value) => <Text>{value?.toFixed(2)}€</Text>}
                                />
                                <Table.Column
                                  title="Gesamtwert"
                                  dataIndex="total_value"
                                  key="total_value"
                                  align="right"
                                  render={(value) => <Text strong>{value?.toFixed(2)}€</Text>}
                                />
                                <Table.Column
                                  title="Kategorie 2"
                                  dataIndex="bb_category2"
                                  key="bb_category2"
                                  render={(value) => <Text type="secondary">{value || "-"}</Text>}
                                />
                                <Table.Column
                                  title="Kategorie 3"
                                  dataIndex="bb_category3"
                                  key="bb_category3"
                                  render={(value) => <Text type="secondary">{value || "-"}</Text>}
                                />
                              </Table>
                            </Panel>
                          );
                        })
                      }
                    </Collapse>
                  </Panel>
                ))}
              </Collapse>
            </>
          )}
          
          {!inventoryData && (
            <Alert
              message="Inventarwerte-Übersicht"
              description="Klicken Sie auf 'Inventarwerte laden', um eine Übersicht der aktuellen Lagerbestände nach Kategorien zu erhalten."
              type="info"
              showIcon
            />
          )}
        </Card>
        {/* Historical Inventory Value */}
        <Card 
          title={<><BarChartOutlined /> Geschätzter Inventarwert zu Stichtag</>} 
          bordered
          extra={
            <Space>
              <DatePicker
                value={targetDate}
                onChange={(date) => date && setTargetDate(date)}
                format="DD.MM.YYYY"
                placeholder="Stichtag wählen"
                disabledDate={(current) => current && current > dayjs().subtract(1, 'day')}
              />
              <Button 
                type="primary" 
                onClick={calculateHistoricalInventoryValue}
                loading={loadingHistoricalData}
                disabled={!inventoryData}
              >
                Berechnen
              </Button>
            </Space>
          }
        >
          {historicalData ? (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Statistic
                    title={`Geschätzter Wert (${dayjs(historicalData.targetDate).format('DD.MM.YYYY')})`}
                    value={historicalData.estimatedValue}
                    precision={2}
                    suffix="€"
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Aktueller Wert"
                    value={historicalData.currentValue}
                    precision={2}
                    suffix="€"
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Wareneingänge inkl. ANK"
                    value={historicalData.inboundMovements}
                    precision={2}
                    suffix="€"
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Warenausgänge (addiert)"
                    value={historicalData.outboundMovements}
                    precision={2}
                    suffix="€"
                    valueStyle={{ color: '#f5222d' }}
                  />
                </Col>
              </Row>
              <Alert
                message="Berechnungslogik"
                description={`Geschätzter Wert = Aktueller Wert (${historicalData.currentValue.toFixed(2)}€) - Wareneingänge inkl. ANK (${historicalData.inboundMovements.toFixed(2)}€) + Warenausgänge (${historicalData.outboundMovements.toFixed(2)}€) = ${historicalData.estimatedValue.toFixed(2)}€`}
                type="info"
                showIcon
                style={{ marginTop: 16 }}
              />
            </>
          ) : (
            <Alert
              message="Stichtag-Berechnung"
              description="Laden Sie zuerst die aktuellen Inventarwerte, wählen Sie einen Stichtag und klicken Sie auf 'Berechnen', um den geschätzten Inventarwert zu diesem Datum zu ermitteln."
              type="info"
              showIcon
            />
          )}
        </Card>
          </Space>
        </List>
      </Space>
  );
}
