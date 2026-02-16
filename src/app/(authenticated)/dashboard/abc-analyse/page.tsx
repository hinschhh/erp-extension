"use client";

import type { CrudFilters } from "@refinedev/core";
import { useList } from "@refinedev/core";
import { Alert, Card, Col, Row, Typography, Skeleton, Space, Radio, Table, Progress, Statistic, Switch } from "antd";
import { Pie, Column, Line } from "@ant-design/plots";
import { Tables } from "@/types/supabase";
import { useState, useMemo } from "react";
import { TrophyOutlined, BarChartOutlined, RiseOutlined, DollarOutlined } from "@ant-design/icons";
import { DateRangeFilter, type RangeValue } from "@/components/common/filters/DateRangeFilter";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";
import Link from "next/link";

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

const { Title, Text } = Typography;

type OrderItem = Pick<Tables<"app_order_items">, "id" | "fk_app_products_id" | "bb_Quantity" | "bb_TotalPrice"> & {
  app_order_item_attributes?: Pick<Tables<"app_order_item_attributes">, "bb_Name" | "bb_Value">[] | null;
  app_products?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room" | "bb_category1" | "bb_category2" | "bb_category3" | "cost_price" | "bb_Price" | "bb_costnet" | "is_antique"> & {
    bom_recipes?: Array<{
      quantity: number | null;
      billbee_component?: {
        bb_sku: string | null;
        cost_price: number | null;
        inventory_cagtegory: string | null;
      } | null;
    }> | null;
  } | null;
  app_purchase_orders_positions_special?: Array<
    Pick<Tables<"app_purchase_orders_positions_special">, "billbee_product_id" | "unit_price_net" | "qty_ordered"> & {
      app_products?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room" | "bb_category1" | "bb_category2" | "bb_category3"> | null;
      app_inbound_shipment_items?: Array<
        Pick<Tables<"app_inbound_shipment_items">, "shipping_costs_proportional">
      > | null;
    }
  > | null;
};

type Order = Pick<Tables<"app_orders">, "id" | "bb_ShippedAt" | "bb_CreatedAt" | "bb_State" | "bb_OrderNumber"> & {
  app_customers?: Pick<Tables<"app_customers">, "bb_Name"> | null;
  app_order_items?: OrderItem[];
};

interface ProductAnalysis {
  productId: number;
  sku: string;
  name: string;
  room: string;
  category1: string;
  category2: string;
  category3: string;
  revenue: number;
  profit: number;
  materialCosts: number;
  quantity: number;
  materialCostRatio: number; // Materialkostenquote
  revenuePercent: number;
  profitPercent: number;
  revenueRank: number;
  profitRank: number;
  abcClassRevenue: 'A' | 'B' | 'C';
  abcClassProfit: 'A' | 'B' | 'C';
  normalRevenue: number;
  normalProfit: number;
  specialRevenue: number;
  specialProfit: number;
}

interface CategorySummary {
  key: string;
  name: string;
  revenue: number;
  profit: number;
  productCount: number;
  revenuePercent: number;
  profitPercent: number;
  materialCostRatio: number; // Durchschnittliche Materialkostenquote
  normalOrders: {
    revenue: number;
    profit: number;
    count: number;
    productCount: number;
    revenuePercent: number;
    profitPercent: number;
    materialCostRatio: number;
  };
  specialOrders: {
    revenue: number;
    profit: number;
    count: number;
    productCount: number;
    revenuePercent: number;
    profitPercent: number;
    materialCostRatio: number;
  };
}

const currency = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

const percent = (v: number) => `${v.toFixed(1)}%`;

/**
 * Berechne Materialkosten basierend auf der Logik aus buchhaltung/monatsabschluss:
 * 1. Normal product: bb_costnet
 * 2. BOM product: sum(component.qty * component.cost_price) 
 * 3. Antique product: bb_costnet OR 300.00 default (if 0 or null)
 * 4. Special product: unit_price_net from app_purchase_orders_positions_special OR 0 if not linked
 */
const calculateMaterialCost = (item: OrderItem, product: any, quantity: number): number => {
  const sku = product.bb_sku ?? "";

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
    const bomCost = recipes.reduce((acc: number, recipe: any) => {
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

export default function ABCAnalysePage() {
  // Zeitraum-State (wird von DateRangeFilter initialisiert)
  const [dateRange, setDateRange] = useState<RangeValue>(null);
  const [dataSource, setDataSource] = useState<"orders" | "sales">("sales");
  const [excludeUnlinkedSpecial, setExcludeUnlinkedSpecial] = useState(false);

  // Filter für HauptDaten basierend auf dataSource
  const mainFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    const field = dataSource === "sales" ? "bb_ShippedAt" : "bb_CreatedAt"; // Verwende bb_CreatedAt statt ordered_at
    return [
      { field, operator: "gte", value: start.startOf("day").toISOString() },
      { field, operator: "lte", value: end.endOf("day").toISOString() },
      // Status-Filter: Wie im Dashboard - ausschließe nur 6, 8, 14 (Status 5 und 9 sind erlaubt)
      { field: "bb_State", operator: "ne", value: 6 },
      { field: "bb_State", operator: "ne", value: 8 }, 
      { field: "bb_State", operator: "ne", value: 14 },
    ];
  }, [dateRange, dataSource]);

  // Lade Hauptdaten basierend auf dataSource
  const { data: mainData, isLoading: mainLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: mainFilters,
    sorters: [{ field: dataSource === "sales" ? "bb_ShippedAt" : "bb_CreatedAt", order: "desc" }],
    meta: {
      select: `
        id, bb_ShippedAt, bb_CreatedAt, bb_State, bb_OrderNumber,
        app_customers(bb_Name),
        app_order_items(
          id, bb_Quantity, bb_TotalPrice, fk_app_products_id, app_order_item_attributes(bb_Name, bb_Value),
          app_products(id, bb_sku, bb_name, room, bb_category1, bb_category2, bb_category3, cost_price, bb_Price, bb_costnet, is_antique, bom_recipes!bom_recipes_billbee_bom_id_fkey(quantity, billbee_component:app_products!bom_recipes_billbee_component_id_fkey(bb_sku, cost_price, inventory_cagtegory))),
          app_purchase_orders_positions_special(
            billbee_product_id, unit_price_net, qty_ordered,
            app_products!billbee_product_id(id, bb_sku, bb_name, room, bb_category1, bb_category2, bb_category3),
            app_inbound_shipment_items(shipping_costs_proportional)
          )
        )
      `,
    },
    queryOptions: { keepPreviousData: true },
  });

  const isLoading = mainLoading;

  // Lade alle Produkte um die zu finden, die sich nicht gedreht haben
  const { data: allProductsData, isLoading: allProductsLoading } = useList<Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room" | "bb_category1" | "bb_Price" | "bb_is_active" | "is_antique">>({
    resource: "app_products",
    pagination: { mode: "off" },
    filters: [
      { field: "bb_is_active", operator: "eq", value: true },
    ],
    meta: {
      select: "id, bb_sku, bb_name, room, bb_category1, bb_Price, bb_is_active, is_antique",
    },
    queryOptions: { keepPreviousData: true },
  });

  // Berechne ABC-Analyse aus den Daten
  const { productAnalysis, roomSummary, categorySummary, totalRevenue, totalProfit, totalMaterialCosts, zeroTurnoverProducts, specialPositionsWithoutPurchase, totalSpecialPositions } = useMemo(() => {
    const orders = mainData?.data || [];
    
    // Aggregiere Daten pro Produkt
    const productMap = new Map<number, {
      productId: number;
      sku: string;
      name: string;
      room: string;
      category1: string;
      category2: string;
      category3: string;
      revenue: number;
      profit: number;
      materialCosts: number;
      quantity: number;
      isBOM: boolean;
      normalRevenue: number;
      normalProfit: number;
      specialRevenue: number;
      specialProfit: number;
    }>();

    const specialPositionsWithoutPurchase: Array<{
      key: string;
      orderId: number;
      orderNumber: string;
      customerName: string;
      baseModelSku: string;
      sku: string;
      name: string;
      room: string;
      category1: string;
      revenue: number;
      profit: number;
      orderedAt: string | null;
      shippedAt: string | null;
    }> = [];
    let totalSpecialPositions = 0;

    orders.forEach(order => {
      order.app_order_items?.forEach(item => {
        if (!item.app_products) return;

        const product = item.app_products;
        const productId = product.id;
        const quantity = item.bb_Quantity || 0;
        const revenueGross = item.bb_TotalPrice ?? ((product.bb_Price || 0) * quantity); // Bruttoumsatz (inkl. 19% MwSt)
        const revenue = revenueGross / 1.19; // Nettoumsatz fuer konsistente Materialkostenquote
        
        // Berechne Profit mit korrekter Materialkostenberechnung (beide netto)
        let materialCosts = calculateMaterialCost(item, product, quantity);
        let profit = revenue - materialCosts;
        
        // Bestimme ob Normal- oder Sonderbestellung
        const hasSpecialPurchasePosition = item.app_purchase_orders_positions_special && 
          item.app_purchase_orders_positions_special.length > 0;
        const isSpecialOrder = hasSpecialPurchasePosition;
        const isSpecialSku = (product.bb_sku || "").startsWith("Sonder");

        if (isSpecialSku) {
          totalSpecialPositions += 1;
        }

        if (isSpecialSku && !hasSpecialPurchasePosition) {
          const baseModelSku = item.app_order_item_attributes
            ?.find(attr => attr.bb_Name === "Grundmodell")
            ?.bb_Value || "";
          specialPositionsWithoutPurchase.push({
            key: `${order.id}-${productId}-${item.id}`,
            orderId: order.id,
            orderNumber: order.bb_OrderNumber || "",
            customerName: order.app_customers?.bb_Name || "",
            baseModelSku,
            sku: product.bb_sku || "",
            name: product.bb_name || "",
            room: product.room || "Unbekannt",
            category1: product.bb_category1 || "Unbekannt",
            revenue,
            profit,
            orderedAt: order.bb_CreatedAt,
            shippedAt: order.bb_ShippedAt,
          });
        }

        if (excludeUnlinkedSpecial && isSpecialSku && !hasSpecialPurchasePosition) {
          return;
        }

        const existing = productMap.get(productId);
        if (existing) {
          existing.revenue += revenue;
          existing.profit += profit;
          existing.materialCosts += materialCosts;
          existing.quantity += quantity;
          if (isSpecialOrder) {
            existing.specialRevenue += revenue;
            existing.specialProfit += profit;
          } else {
            existing.normalRevenue += revenue;
            existing.normalProfit += profit;
          }
        } else {
          productMap.set(productId, {
            productId,
            sku: product.bb_sku || '',
            name: product.bb_name || '',
            room: product.room || 'Unbekannt',
            category1: product.bb_category1 || 'Unbekannt',
            category2: product.bb_category2 || '',
            category3: product.bb_category3 || '',
            revenue,
            profit,
            materialCosts,
            quantity,
            isBOM: (product.bom_recipes?.length || 0) > 0,
            normalRevenue: isSpecialOrder ? 0 : revenue,
            normalProfit: isSpecialOrder ? 0 : profit,
            specialRevenue: isSpecialOrder ? revenue : 0,
            specialProfit: isSpecialOrder ? profit : 0,
          });
        }
      });
    });

    const productList = Array.from(productMap.values());
    
    // Berechne Totale
    const totalRevenue = productList.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = productList.reduce((sum, p) => sum + p.profit, 0);
    const totalMaterialCosts = productList.reduce((sum, p) => sum + p.materialCosts, 0);

    // Sortiere für ABC-Klassifikation
    const sortedByRevenue = [...productList].sort((a, b) => b.revenue - a.revenue);
    const sortedByProfit = [...productList].sort((a, b) => b.profit - a.profit);

    // ABC-Klassifikation berechnen
    const calculateABCClass = (items: typeof productList, getValue: (item: typeof productList[0]) => number) => {
      const total = items.reduce((sum, item) => sum + getValue(item), 0);
      let cumulativeValue = 0;
      
      return items.map((item, index) => {
        cumulativeValue += getValue(item);
        const cumulativePercent = (cumulativeValue / total) * 100;
        
        let abcClass: 'A' | 'B' | 'C';
        if (cumulativePercent <= 80) abcClass = 'A';
        else if (cumulativePercent <= 95) abcClass = 'B';
        else abcClass = 'C';
        
        return { ...item, abcClass, rank: index + 1 };
      });
    };

    const revenueClassified = calculateABCClass(sortedByRevenue, p => p.revenue);
    const profitClassified = calculateABCClass(sortedByProfit, p => p.profit);

    // Merge die Klassifikationen
    const productAnalysis: ProductAnalysis[] = productList.map(product => {
      const revenueInfo = revenueClassified.find(p => p.productId === product.productId)!;
      const profitInfo = profitClassified.find(p => p.productId === product.productId)!;
      
      return {
        ...product,
        materialCostRatio: product.revenue > 0 ? (product.materialCosts / product.revenue) * 100 : 0,
        revenuePercent: totalRevenue > 0 ? (product.revenue / totalRevenue) * 100 : 0,
        profitPercent: totalProfit > 0 ? (product.profit / totalProfit) * 100 : 0,
        revenueRank: revenueInfo.rank,
        profitRank: profitInfo.rank,
        abcClassRevenue: revenueInfo.abcClass,
        abcClassProfit: profitInfo.abcClass,
      };
    });

    // Ermittle nicht gedrehte Produkte (ohne Antiques)
    const soldProductIds = new Set(productList.map(p => p.productId));
    const allProducts = allProductsData?.data || [];
    const zeroTurnoverProducts = allProducts.filter(product => 
      !soldProductIds.has(product.id) && product.bb_is_active && !product.is_antique
    );

    // Aggregiere nach Room
    const roomMap = new Map<string, CategorySummary>();
    productAnalysis.forEach(product => {
      const room = product.room;
      if (!roomMap.has(room)) {
        roomMap.set(room, {
          key: room,
          name: room,
          revenue: 0,
          profit: 0,
          productCount: 0,
          revenuePercent: 0,
          profitPercent: 0,
          materialCostRatio: 0,
          normalOrders: { revenue: 0, profit: 0, count: 0, productCount: 0, revenuePercent: 0, profitPercent: 0, materialCostRatio: 0 },
          specialOrders: { revenue: 0, profit: 0, count: 0, productCount: 0, revenuePercent: 0, profitPercent: 0, materialCostRatio: 0 },
        });
      }
      const roomData = roomMap.get(room)!;
      roomData.revenue += product.revenue;
      roomData.profit += product.profit;
      roomData.productCount += 1;
      
      // Aggregiere Normal- vs. Sonderbestellungen
      if (product.normalRevenue > 0) {
        roomData.normalOrders.revenue += product.normalRevenue;
        roomData.normalOrders.profit += product.normalProfit;
        roomData.normalOrders.count += 1;
        roomData.normalOrders.productCount += 1; // Jedes Produkt zählt
      }
      if (product.specialRevenue > 0) {
        roomData.specialOrders.revenue += product.specialRevenue;
        roomData.specialOrders.profit += product.specialProfit;
        roomData.specialOrders.count += 1;
        roomData.specialOrders.productCount += 1; // Jedes Produkt zählt
      }
    });

    // Aggregiere nach Kategorie 1
    const categoryMap = new Map<string, CategorySummary>();
    productAnalysis.forEach(product => {
      const category = product.category1;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          key: category,
          name: category,
          revenue: 0,
          profit: 0,
          productCount: 0,
          revenuePercent: 0,
          profitPercent: 0,
          materialCostRatio: 0,
          normalOrders: { revenue: 0, profit: 0, count: 0, productCount: 0, revenuePercent: 0, profitPercent: 0, materialCostRatio: 0 },
          specialOrders: { revenue: 0, profit: 0, count: 0, productCount: 0, revenuePercent: 0, profitPercent: 0, materialCostRatio: 0 },
        });
      }
      const categoryData = categoryMap.get(category)!;
      categoryData.revenue += product.revenue;
      categoryData.profit += product.profit;
      categoryData.productCount += 1;
      
      // Aggregiere Normal- vs. Sonderbestellungen
      if (product.normalRevenue > 0) {
        categoryData.normalOrders.revenue += product.normalRevenue;
        categoryData.normalOrders.profit += product.normalProfit;
        categoryData.normalOrders.count += 1;
        categoryData.normalOrders.productCount += 1; // Jedes Produkt zählt
      }
      if (product.specialRevenue > 0) {
        categoryData.specialOrders.revenue += product.specialRevenue;
        categoryData.specialOrders.profit += product.specialProfit;
        categoryData.specialOrders.count += 1;
        categoryData.specialOrders.productCount += 1; // Jedes Produkt zählt
      }
    });

    // Berechne Prozente für Summaries
    Array.from(roomMap.values()).forEach(summary => {
      summary.revenuePercent = totalRevenue > 0 ? (summary.revenue / totalRevenue) * 100 : 0;
      summary.profitPercent = totalProfit > 0 ? (summary.profit / totalProfit) * 100 : 0;
      // Gewichtete durchschnittliche Materialkostenquote
      const roomProducts = productAnalysis.filter(p => p.room === summary.name);
      const totalRoomMaterialCosts = roomProducts.reduce((sum, p) => sum + (p.revenue * p.materialCostRatio / 100), 0);
      summary.materialCostRatio = summary.revenue > 0 ? (totalRoomMaterialCosts / summary.revenue) * 100 : 0;
      
      // Berechne Prozente und Materialkostenquoten für Normal- und Sonderbestellungen
      const normalProducts = roomProducts.filter(p => p.normalRevenue > 0);
      const specialProducts = roomProducts.filter(p => p.specialRevenue > 0);
      
      // Anteile in Bezug auf Gesamtvolumen des Raums
      summary.normalOrders.revenuePercent = summary.revenue > 0 ? (summary.normalOrders.revenue / summary.revenue) * 100 : 0;
      summary.normalOrders.profitPercent = summary.profit > 0 ? (summary.normalOrders.profit / summary.profit) * 100 : 0;
      summary.specialOrders.revenuePercent = summary.revenue > 0 ? (summary.specialOrders.revenue / summary.revenue) * 100 : 0;
      summary.specialOrders.profitPercent = summary.profit > 0 ? (summary.specialOrders.profit / summary.profit) * 100 : 0;
      
      // Materialkostenquoten
      const totalNormalMaterialCosts = normalProducts.reduce((sum, p) => sum + (p.normalRevenue * p.materialCostRatio / 100), 0);
      const totalSpecialMaterialCosts = specialProducts.reduce((sum, p) => sum + (p.specialRevenue * p.materialCostRatio / 100), 0);
      summary.normalOrders.materialCostRatio = summary.normalOrders.revenue > 0 ? (totalNormalMaterialCosts / summary.normalOrders.revenue) * 100 : 0;
      summary.specialOrders.materialCostRatio = summary.specialOrders.revenue > 0 ? (totalSpecialMaterialCosts / summary.specialOrders.revenue) * 100 : 0;
    });

    Array.from(categoryMap.values()).forEach(summary => {
      summary.revenuePercent = totalRevenue > 0 ? (summary.revenue / totalRevenue) * 100 : 0;
      summary.profitPercent = totalProfit > 0 ? (summary.profit / totalProfit) * 100 : 0;
      // Gewichtete durchschnittliche Materialkostenquote
      const categoryProducts = productAnalysis.filter(p => p.category1 === summary.name);
      const totalCategoryMaterialCosts = categoryProducts.reduce((sum, p) => sum + (p.revenue * p.materialCostRatio / 100), 0);
      summary.materialCostRatio = summary.revenue > 0 ? (totalCategoryMaterialCosts / summary.revenue) * 100 : 0;
      
      // Berechne Prozente und Materialkostenquoten für Normal- und Sonderbestellungen
      const normalProducts = categoryProducts.filter(p => p.normalRevenue > 0);
      const specialProducts = categoryProducts.filter(p => p.specialRevenue > 0);
      
      // Anteile in Bezug auf Gesamtvolumen der Kategorie
      summary.normalOrders.revenuePercent = summary.revenue > 0 ? (summary.normalOrders.revenue / summary.revenue) * 100 : 0;
      summary.normalOrders.profitPercent = summary.profit > 0 ? (summary.normalOrders.profit / summary.profit) * 100 : 0;
      summary.specialOrders.revenuePercent = summary.revenue > 0 ? (summary.specialOrders.revenue / summary.revenue) * 100 : 0;
      summary.specialOrders.profitPercent = summary.profit > 0 ? (summary.specialOrders.profit / summary.profit) * 100 : 0;
      
      // Materialkostenquoten
      const totalNormalMaterialCosts = normalProducts.reduce((sum, p) => sum + (p.normalRevenue * p.materialCostRatio / 100), 0);
      const totalSpecialMaterialCosts = specialProducts.reduce((sum, p) => sum + (p.specialRevenue * p.materialCostRatio / 100), 0);
      summary.normalOrders.materialCostRatio = summary.normalOrders.revenue > 0 ? (totalNormalMaterialCosts / summary.normalOrders.revenue) * 100 : 0;
      summary.specialOrders.materialCostRatio = summary.specialOrders.revenue > 0 ? (totalSpecialMaterialCosts / summary.specialOrders.revenue) * 100 : 0;
    });

    const roomSummary = Array.from(roomMap.values()).sort((a, b) => 
      b.revenue - a.revenue
    );

    const categorySummary = Array.from(categoryMap.values()).sort((a, b) => 
      b.revenue - a.revenue
    );

    return {
      productAnalysis,
      roomSummary,
      categorySummary,
      totalRevenue,
      totalProfit,
      totalMaterialCosts,
      zeroTurnoverProducts,
      specialPositionsWithoutPurchase,
      totalSpecialPositions,
    };
  }, [mainData, allProductsData, excludeUnlinkedSpecial]); // analysisMode entfernt

  // Daten für Charts
  const chartData = useMemo(() => {
    // ABC-Verteilung
    const abcCounts = productAnalysis.reduce((acc, product) => {
      const abcClass = product.abcClassRevenue; // Fixiert auf revenue
      acc[abcClass] = (acc[abcClass] || 0) + 1;
      return acc;
    }, {} as Record<'A' | 'B' | 'C', number>);

    const abcData = [
      { category: 'A (Top 80%)', value: abcCounts.A || 0, color: '#52c41a' },
      { category: 'B (80-95%)', value: abcCounts.B || 0, color: '#faad14' },
      { category: 'C (95-100%)', value: abcCounts.C || 0, color: '#ff4d4f' },
    ];

    // Top 10 Produkte
    const sortedProducts = [...productAnalysis].sort((a, b) => 
      b.revenue - a.revenue // Fixiert auf revenue
    );
    
    const top10Data = sortedProducts.slice(0, 10).map(product => ({
      product: product.sku,
      value: product.revenue, // Fixiert auf revenue
      abcClass: product.abcClassRevenue, // Fixiert auf revenue
    }));

    return { abcData, top10Data };
  }, [productAnalysis]); // roomSummary, categorySummary entfernt

  // Materialkostenquote-Zeitreihe
  const materialCostQuotaData = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1] || !mainData?.data) return [];

    const orders = mainData.data;
    const start = dateRange[0];
    const end = dateRange[1];
    const daysDiff = end.diff(start, "day");

    // Aggregationslogik: bis 31 Tage = Tag, bis 90 Tage = Woche, darüber = Monat
    const groupBy = daysDiff <= 31 ? "day" : daysDiff <= 90 ? "week" : "month";

    // Funktion zum Formatieren des Gruppenschlüssels
    const getGroupKey = (date: string | null) => {
      if (!date) return null;
      const d = dayjs(date);
      if (groupBy === "day") return d.format("YYYY-MM-DD");
      if (groupBy === "week") return `${d.isoWeekYear()}-W${d.isoWeek().toString().padStart(2, "0")}`;
      return d.format("YYYY-MM");
    };

    // Erstelle alle Perioden im Zeitraum (auch leere), um vollständige Timeline zu haben
    const allPeriods = new Set<string>();
    let current = start.clone();
    while (current.isBefore(end) || current.isSame(end, "day")) {
      const key = getGroupKey(current.toISOString());
      if (key) allPeriods.add(key);
      
      if (groupBy === "day") current = current.add(1, "day");
      else if (groupBy === "week") current = current.add(1, "week");
      else current = current.add(1, "month");
    }

    // Aggregiere Materialkosten und Revenue nach Periode
    const groupedData = new Map<string, { materialCosts: number; revenue: number }>();
    allPeriods.forEach(key => {
      groupedData.set(key, { materialCosts: 0, revenue: 0 });
    });

    orders.forEach(order => {
      order.app_order_items?.forEach(item => {
        if (!item.app_products) return;

        const dateField = dataSource === "sales" ? order.bb_ShippedAt : order.bb_CreatedAt;
        const key = getGroupKey(dateField);
        if (!key) return;

        const quantity = item.bb_Quantity || 0;
        const revenueGross = item.bb_TotalPrice ?? ((item.app_products?.bb_Price || 0) * quantity);
        const revenue = revenueGross / 1.19; // Nettoumsatz
        const materialCosts = calculateMaterialCost(item, item.app_products, quantity);

        // Filter für excludeUnlinkedSpecial
        const hasSpecialPurchasePosition = item.app_purchase_orders_positions_special &&
          item.app_purchase_orders_positions_special.length > 0;
        const isSpecialSku = (item.app_products.bb_sku || "").startsWith("Sonder");

        if (excludeUnlinkedSpecial && isSpecialSku && !hasSpecialPurchasePosition) {
          return;
        }

        const existing = groupedData.get(key) || { materialCosts: 0, revenue: 0 };
        groupedData.set(key, { 
          materialCosts: existing.materialCosts + materialCosts,
          revenue: existing.revenue + revenue
        });
      });
    });

    // Funktion zum Formatieren des Display-Labels
    const getDisplayLabel = (key: string) => {
      if (groupBy === "day") {
        const d = dayjs(key);
        return d.format("DD.MM.YY");
      }
      if (groupBy === "week") {
        // Extrahiere Jahr und Woche aus Format "2026-W05"
        const match = key.match(/(\d{4})-W(\d{2})/);
        if (match) {
          return `KW${match[2]} '${match[1].slice(-2)}`;
        }
        return key;
      }
      // Monat: Format "2026-01" -> "Jan 26"
      const d = dayjs(key + "-01");
      return d.format("MMM YY");
    };

    // Konvertiere zu Array und sortiere - nur Materialkostenquote
    const sortedKeys = Array.from(groupedData.keys()).sort();
    const quotaData = sortedKeys.map(key => {
      const data = groupedData.get(key);
      const quota = data && data.revenue > 0 ? (data.materialCosts / data.revenue) * 100 : 0;
      return {
        date: getDisplayLabel(key),
        value: quota,
      };
    });

    return quotaData;
  }, [mainData, dateRange, dataSource, excludeUnlinkedSpecial]);

  // Tabellen-Spalten für Produktanalyse
  const productColumns = [
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
      fixed: 'left' as const,
    },
    {
      title: 'Produktname',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      ellipsis: true,
    },
    {
      title: 'Room',
      dataIndex: 'room',
      key: 'room',
      width: 120,
      filters: Array.from(new Set(productAnalysis.map(p => p.room))).map(room => ({ text: room, value: room })),
      onFilter: (value: any, record: ProductAnalysis) => record.room === value,
    },
    {
      title: 'Kategorie',
      dataIndex: 'category1',
      key: 'category1',
      width: 150,
      filters: Array.from(new Set(productAnalysis.map(p => p.category1))).filter(Boolean).map(cat => ({ text: cat, value: cat })),
      onFilter: (value: any, record: ProductAnalysis) => record.category1 === value,
    },
    {
      title: 'Volumen',
      key: 'revenue',
      width: 120,
      render: (_: any, record: ProductAnalysis) => currency(record.revenue),
      sorter: (a: ProductAnalysis, b: ProductAnalysis) => a.revenue - b.revenue,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: 'Rohertrag',
      key: 'profit',
      width: 120,
      render: (_: any, record: ProductAnalysis) => currency(record.profit),
      sorter: (a: ProductAnalysis, b: ProductAnalysis) => a.profit - b.profit,
    },
    {
      title: 'Menge',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      sorter: (a: ProductAnalysis, b: ProductAnalysis) => a.quantity - b.quantity,
    },
    {
      title: 'Materialkostenquote',
      key: 'materialCostRatio',
      width: 140,
      render: (_: any, record: ProductAnalysis) => percent(record.materialCostRatio),
      sorter: (a: ProductAnalysis, b: ProductAnalysis) => a.materialCostRatio - b.materialCostRatio,
    },
    {
      title: 'ABC Volumen',
      key: 'abcRevenue',
      width: 100,
      render: (_: any, record: ProductAnalysis) => (
        <span className={`abc-badge abc-${record.abcClassRevenue.toLowerCase()}`}>
          {record.abcClassRevenue}
        </span>
      ),
      filters: [
        { text: 'A', value: 'A' },
        { text: 'B', value: 'B' },
        { text: 'C', value: 'C' },
      ],
      onFilter: (value: any, record: ProductAnalysis) => record.abcClassRevenue === value,
    },
    {
      title: 'ABC Rohertrag',
      key: 'abcProfit',
      width: 100,
      render: (_: any, record: ProductAnalysis) => (
        <span className={`abc-badge abc-${record.abcClassProfit.toLowerCase()}`}>
          {record.abcClassProfit}
        </span>
      ),
      filters: [
        { text: 'A', value: 'A' },
        { text: 'B', value: 'B' },
        { text: 'C', value: 'C' },
      ],
      onFilter: (value: any, record: ProductAnalysis) => record.abcClassProfit === value,
    },
  ];

  // Tabellen-Spalten für Kategorie-Zusammenfassung
  const roomColumns = [
    {
      title: 'Room',
      key: 'name',
      render: (_: any, record: CategorySummary) => record.name,
      width: 200,
    },
    {
      title: 'Produkte',
      key: 'productCount',
      render: (_: any, record: CategorySummary) => record.productCount,
      sorter: (a: CategorySummary, b: CategorySummary) => a.productCount - b.productCount,
    },
    {
      title: 'Volumen',
      key: 'revenue',
      render: (_: any, record: CategorySummary) => currency(record.revenue),
      sorter: (a: CategorySummary, b: CategorySummary) => a.revenue - b.revenue,
    },
    {
      title: 'Volumen - Anteil',
      key: 'revenuePercent',
      render: (_: any, record: CategorySummary) => percent(record.revenuePercent),
    },
    {
      title: 'Rohertrag',
      key: 'profit',
      render: (_: any, record: CategorySummary) => currency(record.profit),
      sorter: (a: CategorySummary, b: CategorySummary) => a.profit - b.profit,
    },
    {
      title: 'Rohertrag - Anteil',
      key: 'profitPercent',
      render: (_: any, record: CategorySummary) => percent(record.profitPercent),
    },
    {
      title: 'Ø Materialkostenquote',
      key: 'materialCostRatio',
      render: (_: any, record: CategorySummary) => percent(record.materialCostRatio),
    },
  ];

  const categoryColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Anzahl Produkte',
      dataIndex: 'productCount',
      key: 'productCount',
    },
    {
      title: 'Volumen',
      key: 'revenue',
      render: (_: any, record: CategorySummary) => currency(record.revenue),
      sorter: (a: CategorySummary, b: CategorySummary) => a.revenue - b.revenue,
    },
    {
      title: 'Volumen - Anteil',
      key: 'revenuePercent',
      render: (_: any, record: CategorySummary) => percent(record.revenuePercent),
    },
    {
      title: 'Rohertrag',
      key: 'profit',
      render: (_: any, record: CategorySummary) => currency(record.profit),
      sorter: (a: CategorySummary, b: CategorySummary) => a.profit - b.profit,
    },
    {
      title: 'Rohertrag - Anteil',
      key: 'profitPercent',
      render: (_: any, record: CategorySummary) => percent(record.profitPercent),
    },
    {
      title: 'Ø Materialkostenquote',
      key: 'materialCostRatio',
      render: (_: any, record: CategorySummary) => percent(record.materialCostRatio),
    },
  ];

  // Erstelle expandierte Zeilen für Room-Summary
  const expandedRoomRowRender = (record: CategorySummary) => {
    const detailData = [
      {
        key: 'normal',
        type: 'Normalbestellungen',
        products: record.normalOrders.productCount,
        revenue: record.normalOrders.revenue,
        revenuePercent: record.normalOrders.revenuePercent,
        profit: record.normalOrders.profit,
        profitPercent: record.normalOrders.profitPercent,
        materialCostRatio: record.normalOrders.materialCostRatio,
      },
      {
        key: 'special',
        type: 'Sonderbestellungen',
        products: record.specialOrders.productCount,
        revenue: record.specialOrders.revenue,
        revenuePercent: record.specialOrders.revenuePercent,
        profit: record.specialOrders.profit,
        profitPercent: record.specialOrders.profitPercent,
        materialCostRatio: record.specialOrders.materialCostRatio,
      },
    ];

    const detailColumns = [
      {
        title: 'Bestellart',
        dataIndex: 'type',
        key: 'type',
        width: 160,
      },
      {
        title: 'Produkte',
        dataIndex: 'products',
        key: 'products',
        align: 'right' as const,
        width: 80,
      },
      {
        title: 'Volumen',
        dataIndex: 'revenue',
        key: 'revenue',
        align: 'right' as const,
        width: 120,
        render: (value: number) => currency(value),
      },
      {
        title: 'Anteil',
        dataIndex: 'revenuePercent',
        key: 'revenuePercent',
        align: 'right' as const,
        width: 80,
        render: (value: number) => `${value.toFixed(1)}%`,
      },
      {
        title: 'Rohertrag',
        dataIndex: 'profit',
        key: 'profit',
        align: 'right' as const,
        width: 120,
        render: (value: number) => currency(value),
      },
      {
        title: 'Anteil',
        dataIndex: 'profitPercent',
        key: 'profitPercent',
        align: 'right' as const,
        width: 80,
        render: (value: number) => `${value.toFixed(1)}%`,
      },
      {
        title: 'Materialkostenquote',
        dataIndex: 'materialCostRatio',
        key: 'materialCostRatio',
        align: 'right' as const,
        width: 140,
        render: (value: number) => `${value.toFixed(1)}%`,
      },
    ];

    return (
      <Table
        columns={detailColumns}
        dataSource={detailData}
        pagination={false}
        size="small"
        showHeader={true}
        rowKey="key"
      />
    );
  };

  // Erstelle expandierte Zeilen für Category-Summary
  const expandedCategoryRowRender = (record: CategorySummary) => {
    const detailData = [
      {
        key: 'normal',
        type: 'Normalbestellungen',
        products: record.normalOrders.productCount,
        revenue: record.normalOrders.revenue,
        revenuePercent: record.normalOrders.revenuePercent,
        profit: record.normalOrders.profit,
        profitPercent: record.normalOrders.profitPercent,
        materialCostRatio: record.normalOrders.materialCostRatio,
      },
      {
        key: 'special',
        type: 'Sonderbestellungen',
        products: record.specialOrders.productCount,
        revenue: record.specialOrders.revenue,
        revenuePercent: record.specialOrders.revenuePercent,
        profit: record.specialOrders.profit,
        profitPercent: record.specialOrders.profitPercent,
        materialCostRatio: record.specialOrders.materialCostRatio,
      },
    ];

    const detailColumns = [
      {
        title: 'Bestellart',
        dataIndex: 'type',
        key: 'type',
        width: 160,
      },
      {
        title: 'Produkte',
        dataIndex: 'products',
        key: 'products',
        align: 'right' as const,
        width: 80,
      },
      {
        title: 'Volumen',
        dataIndex: 'revenue',
        key: 'revenue',
        align: 'right' as const,
        width: 120,
        render: (value: number) => currency(value),
      },
      {
        title: 'Anteil',
        dataIndex: 'revenuePercent',
        key: 'revenuePercent',
        align: 'right' as const,
        width: 80,
        render: (value: number) => `${value.toFixed(1)}%`,
      },
      {
        title: 'Rohertrag',
        dataIndex: 'profit',
        key: 'profit',
        align: 'right' as const,
        width: 120,
        render: (value: number) => currency(value),
      },
      {
        title: 'Anteil',
        dataIndex: 'profitPercent',
        key: 'profitPercent',
        align: 'right' as const,
        width: 80,
        render: (value: number) => `${value.toFixed(1)}%`,
      },
      {
        title: 'Materialkostenquote',
        dataIndex: 'materialCostRatio',
        key: 'materialCostRatio',
        align: 'right' as const,
        width: 140,
        render: (value: number) => `${value.toFixed(1)}%`,
      },
    ];

    return (
      <Table
        columns={detailColumns}
        dataSource={detailData}
        pagination={false}
        size="small"
        showHeader={true}
        rowKey="key"
      />
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0, color: "#1890ff" }}>
          <TrophyOutlined style={{ marginRight: 12 }} />
          ABC-Analyse
        </Title>
        <Typography.Paragraph style={{ marginTop: 8, color: "#8c8c8c", fontSize: 16 }}>
          ABC-Analyse nach Volumen und Rohertrag mit Aufschlüsselung nach Room und Kategorien
        </Typography.Paragraph>
        <Space direction="horizontal" size="middle" style={{ marginTop: 16 }}>
          <DateRangeFilter
            value={dateRange}
            onChangeAction={setDateRange}
            storageKey="abc-analysis-range"
            isLoading={isLoading}
            label="Zeitraum"
          />
          <Radio.Group
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="orders">Auftragseingang</Radio.Button>
            <Radio.Button value="sales">Umsatz</Radio.Button>
          </Radio.Group>
        </Space>
      </div>

      {isLoading ? (
        <Row gutter={[24, 24]}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} md={12} lg={6} key={i}>
              <Card>
                <Skeleton active />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <>
          <Row style={{ marginBottom: 16 }}>
            <Col xs={24}>
              <Alert
                type={specialPositionsWithoutPurchase.length > 0 ? "warning" : "success"}
                showIcon
                message="Sonderpositionen ohne Einkauf"
                description={
                  <div>
                    <div>
                      {specialPositionsWithoutPurchase.length} von {totalSpecialPositions} Sonderpositionen
                    </div>
                    <div>
                      {specialPositionsWithoutPurchase.length > 0
                        ? "Diese Sonderpositionen haben keine verknuepfte Einkaufsposition."
                        : "Keine Sonderpositionen ohne Einkauf im Zeitraum."}
                    </div>
                    <Space style={{ marginTop: 8 }}>
                      <Switch
                        checked={excludeUnlinkedSpecial}
                        onChange={setExcludeUnlinkedSpecial}
                        size="small"
                      />
                      <Text type="secondary">Aus Berechnung ausschliessen</Text>
                    </Space>
                  </div>
                }
              />
            </Col>
          </Row>

          {/* KPIs */}
          <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title={`Gesamt-${dataSource === "sales" ? "Volumen" : "Auftragseingang"} (Netto)`}
                  value={totalRevenue}
                  formatter={(value) => currency(Number(value))}
                  prefix={<DollarOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Gesamt-Rohertrag"
                  value={totalProfit}
                  formatter={(value) => currency(Number(value))}
                  prefix={<RiseOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Rohertragsmarge"
                  value={totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0}
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                  prefix={<RiseOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Materialkostenquote"
                  value={totalRevenue > 0 ? (totalMaterialCosts / totalRevenue) * 100 : 0}
                  formatter={(value) => `${Number(value).toFixed(1)}%`}
                  prefix={<BarChartOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* Charts */}
          <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={12}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Typography.Title level={4} style={{ marginBottom: 16 }}>
                  Materialkostenquote-Entwicklung
                </Typography.Title>
                {materialCostQuotaData.length > 0 ? (
                  <Line
                    data={materialCostQuotaData}
                    xField="date"
                    yField="value"
                    scale={{
                      x: {
                        type: "point",
                      },
                      y: {
                        domain: [0,100]
                      },
                    }}
                    axis={{
                      x: {
                        labelAutoRotate: false,
                      },
                      y: {

                        tickCount: 5,
                        labelFormatter: (v: number) => {
                          return `${Number(v).toFixed(0)}%`;
                        },
                      },
                    }}
                    tooltip={{
                      title: {
                        channel: "x",
                        valueFormatter: (v: string) => {
                          return `Periode: ${v}`;
                        },
                      },
                      items: [
                        {
                          channel: "y",
                          valueFormatter: (v: number) =>
                            `${v.toFixed(1)}%`,
                        },
                      ],
                    }}
                    smooth={true}
                    style={{
                      lineWidth: 2,
                    }}
                    point={{
                      size: 3,
                      shape: "circle",
                    }}
                    legend={false}
                  />
                ) : (
                  <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                    Keine Daten verfügbar
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Column
                  data={chartData.top10Data}
                  xField="product"
                  yField="value"
                  colorField="abcClass"
                  scale={{
                    color: {
                      range: ['#52c41a', '#faad14', '#ff4d4f'],
                    },
                  }}
                  axis={{
                    x: {
                      labelAutoRotate: true,
                    },
                    y: {
                      tickCount: 5,
                      labelFormatter: (v: number) => {
                        return `${(Number(v) / 1000).toFixed(0)} T€`;
                      },
                    },
                  }}
                  tooltip={{
                    title: {
                      channel: "x",
                      valueFormatter: (v: string) => {
                        return `Produkt: ${v}`;
                      },
                    },
                    items: [
                      {
                        channel: "y",
                        valueFormatter: (v: number) =>
                          `${v.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`,
                      },
                    ],
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Summary Tables */}
          <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={12}>
              <Card title="Zusammenfassung nach Room">
                <Table
                  dataSource={roomSummary}
                  columns={roomColumns}
                  rowKey="key"
                  size="small"
                  pagination={{ pageSize: 10 }}
                  expandable={{
                    expandedRowRender: expandedRoomRowRender,
                    rowExpandable: (record) => 
                      record.normalOrders.count > 0 || record.specialOrders.count > 0,
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Zusammenfassung nach Kategorien">
                <Table
                  dataSource={categorySummary}
                  columns={categoryColumns}
                  rowKey="key"
                  size="small"
                  pagination={{ pageSize: 10 }}
                  expandable={{
                    expandedRowRender: expandedCategoryRowRender,
                    rowExpandable: (record) => 
                      record.normalOrders.count > 0 || record.specialOrders.count > 0,
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Product Analysis Table */}
          <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
            <Col xs={24}>
              <Card title="Detaillierte Produktanalyse">
                <Table
                  dataSource={productAnalysis}
                  columns={productColumns}
                  rowKey="productId"
                  size="small"
                  scroll={{ x: 1400 }}
                  pagination={{
                    pageSize: 50,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `${range[0]}-${range[1]} von ${total} Produkten`,
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Zero Turnover Products */}
          {zeroTurnoverProducts.length > 0 && (
            <Row>
              <Col xs={24}>
                <Card title={`Produkte ohne ${dataSource === "sales" ? "Volumen" : "Auftragseingang"} im Zeitraum`}>
                  <Typography.Paragraph type="secondary">
                    Diese Produkte hatten im gewählten Zeitraum keine Bewegung:
                  </Typography.Paragraph>
                  <Table
                    dataSource={zeroTurnoverProducts}
                    columns={[
                      { title: 'SKU', dataIndex: 'bb_sku', key: 'sku', width: 120 },
                      { title: 'Name', dataIndex: 'bb_name', key: 'name', width: 300, ellipsis: true },
                      { title: 'Room', dataIndex: 'room', key: 'room', width: 120 },
                      { title: 'Kategorie', dataIndex: 'bb_category1', key: 'category', width: 150 },
                      { title: 'Verkaufspreis', dataIndex: 'bb_Price', key: 'price', width: 120, 
                        render: (price: number) => currency(price) },
                    ]}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {specialPositionsWithoutPurchase.length > 0 && (
            <Row style={{ marginTop: 16 }}>
              <Col xs={24}>
                <Table
                  dataSource={specialPositionsWithoutPurchase}
                  columns={[
                    {
                      title: 'Auftrag',
                      dataIndex: 'orderNumber',
                      key: 'orderNumber',
                      width: 200,
                      render: (_: string, record) => {
                        const label = `${record.orderNumber || record.orderId} - ${record.customerName || "Unbekannt"}`;
                        return (
                          <Link href={`/kundenberatung/auftrag/${record.orderId}`}>
                            {label}
                          </Link>
                        );
                      },
                    },
                    { 
                      title: 'Bestellt am', 
                      dataIndex: 'orderedAt', 
                      key: 'orderedAt', 
                      width: 120,
                      render: (date: string) => date ? dayjs(date).format('DD.MM.YYYY') : '—',
                      sorter: (a: any, b: any) => {
                        if (!a.orderedAt) return 1;
                        if (!b.orderedAt) return -1;
                        return dayjs(a.orderedAt).valueOf() - dayjs(b.orderedAt).valueOf();
                      },
                    },
                    { 
                      title: 'Versendet am', 
                      dataIndex: 'shippedAt', 
                      key: 'shippedAt', 
                      width: 120,
                      render: (date: string) => date ? dayjs(date).format('DD.MM.YYYY') : '—',
                      sorter: (a: any, b: any) => {
                        if (!a.shippedAt) return 1;
                        if (!b.shippedAt) return -1;
                        return dayjs(a.shippedAt).valueOf() - dayjs(b.shippedAt).valueOf();
                      },
                    },
                    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120 },
                    { title: 'Basemodell SKU', dataIndex: 'baseModelSku', key: 'baseModelSku', width: 160,
                      render: (value: string) => value || "—" },
                    { title: 'Room', dataIndex: 'room', key: 'room', width: 120 },
                    { title: 'Sonder-Volumen', dataIndex: 'revenue', key: 'revenue', width: 120,
                      render: (revenue: number) => currency(revenue) },
                  ]}
                  rowKey="key"
                  size="small"
                  pagination={{ pageSize: 20 }}
                />
              </Col>
            </Row>
          )}
        </>
      )}

      <style jsx global>{`
        .abc-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: bold;
          color: white;
        }
        
        .abc-a {
          background-color: #52c41a;
        }
        
        .abc-b {
          background-color: #faad14;
        }
        
        .abc-c {
          background-color: #ff4d4f;
        }
      `}</style>
    </div>
  );
}
