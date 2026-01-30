"use client";

import type { CrudFilters } from "@refinedev/core";
import { useList } from "@refinedev/core";
import { Card, Col, Row, Statistic, Typography, Skeleton, Space, Radio } from "antd";
import { Line, Column } from "@ant-design/plots";
import { Tables } from "@/types/supabase";
import { useState, useMemo } from "react";
import { FileTextOutlined } from "@ant-design/icons";
import { DateRangeFilter, type RangeValue } from "@/components/common/filters/DateRangeFilter";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

type OrderItem = Pick<Tables<"app_order_items">, "id" | "fk_app_products_id" | "bb_Quantity" | "bb_TotalPrice"> & {
  app_products?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room"> | null;
  app_purchase_orders_positions_special?: Array<
    Pick<Tables<"app_purchase_orders_positions_special">, "base_model_billbee_product_id"> & {
      base_model?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room"> | null;
    }
  > | null;
};

type Order = Tables<"app_orders"> & {
  app_customers?: Pick<Tables<"app_customers">, "bb_InvoiceAddress_CountryISO2" | "bb_Name"> | null;
  app_order_items?: OrderItem[];
};

const currency = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

export default function DashboardPage() {
  // Zeitraum-State (wird von DateRangeFilter initialisiert)
  const [dateRange, setDateRange] = useState<RangeValue>(null);
  const [compareMode, setCompareMode] = useState<"none" | "previous-year" | "previous-period">("none");

  // Berechne Vergleichszeitraum
  const comparisonRange: RangeValue = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1] || compareMode === "none") return null;

    const start = dateRange[0];
    const end = dateRange[1];
    const daysDiff = end.diff(start, "day");

    if (compareMode === "previous-year") {
      return [start.subtract(1, "year"), end.subtract(1, "year")];
    } else {
      // previous-period: gleiche Länge, direkt davor
      return [start.subtract(daysDiff + 1, "day"), start.subtract(1, "day")];
    }
  }, [dateRange, compareMode]);

  // Filter für Angebote
  const offersFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    return [
      { field: "offered_at", operator: "gte", value: start.toISOString() },
      { field: "offered_at", operator: "lte", value: end.toISOString() },
    ];
  }, [dateRange]);

  // Filter für Umsatz (Versanddatum)
  const salesFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    return [
      { field: "bb_ShippedAt", operator: "gte", value: start.toISOString() },
      { field: "bb_ShippedAt", operator: "lte", value: end.toISOString() },
    ];
  }, [dateRange]);

  // Filter für Auftragseingang (neue Bestellungen)
  const ordersInFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    return [
      { field: "bb_CreatedAt", operator: "gte", value: start.toISOString() },
      { field: "bb_CreatedAt", operator: "lte", value: end.toISOString() },
    ];
  }, [dateRange]);

  // Lade Angebote
  const { data: offersData, isLoading: offersLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: offersFilters,
    sorters: [{ field: "offered_at", order: "desc" }],
    meta: {
      select: "id, bb_TotalCost, offered_at",
    },
    queryOptions: { keepPreviousData: true },
  });

  // Lade Umsatz (versendete Bestellungen)
  const { data: salesData, isLoading: salesLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: salesFilters,
    sorters: [{ field: "bb_ShippedAt", order: "desc" }],
    meta: {
      select: "id, bb_TotalCost, bb_ShippedAt, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room))",
    },
    queryOptions: { keepPreviousData: true },
  });

  // Lade Auftragseingang (neue Bestellungen)
  const { data: ordersInData, isLoading: ordersInLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: ordersInFilters,
    sorters: [{ field: "bb_CreatedAt", order: "desc" }],
    meta: {
      select: "id, bb_TotalCost, bb_CreatedAt, bb_State",
    },
    queryOptions: { keepPreviousData: true },
  });

  const offers = offersData?.data || [];
  const sales = salesData?.data || [];
  const ordersIn = ordersInData?.data || [];

  // Vergleichs-Filter und Queries
  const comparisonOffersFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "offered_at", operator: "gte", value: comparisonRange[0].toISOString() },
      { field: "offered_at", operator: "lte", value: comparisonRange[1].toISOString() },
    ];
  }, [comparisonRange]);

  const comparisonSalesFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "bb_ShippedAt", operator: "gte", value: comparisonRange[0].toISOString() },
      { field: "bb_ShippedAt", operator: "lte", value: comparisonRange[1].toISOString() },
    ];
  }, [comparisonRange]);

  const comparisonOrdersInFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "bb_CreatedAt", operator: "gte", value: comparisonRange[0].toISOString() },
      { field: "bb_CreatedAt", operator: "lte", value: comparisonRange[1].toISOString() },
    ];
  }, [comparisonRange]);

  const { data: comparisonOffersData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonOffersFilters,
    meta: { select: "id, bb_TotalCost, offered_at" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const { data: comparisonSalesData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonSalesFilters,
    meta: { select: "id, bb_TotalCost, bb_ShippedAt, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room))" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const { data: comparisonOrdersInData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonOrdersInFilters,
    meta: { select: "id, bb_TotalCost, bb_CreatedAt, bb_State" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const comparisonOffers = comparisonOffersData?.data || [];
  const comparisonSales = comparisonSalesData?.data || [];
  const comparisonOrdersIn = comparisonOrdersInData?.data || [];

  // Lade Bestände zum Ende des Zeitraums
  // Offene Angebote (bb_State = 14, erstellt bis Ende des Zeitraums)
  const openOffersFilters: CrudFilters = useMemo(() => {
    const end = dateRange?.[1];
    if (!end) return [{ field: "bb_State", operator: "eq", value: 14 }];

    return [
      { field: "bb_State", operator: "eq", value: 14 },
      { field: "offered_at", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  const { data: openOffersData, isLoading: openOffersLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: openOffersFilters,
    meta: {
      select: "id, bb_TotalCost, bb_State, offered_at",
    },
    queryOptions: { keepPreviousData: true },
  });

  // Auftragsbestand (bb_State in [1,2,3,13], erstellt bis Ende Zeitraum, noch nicht oder nach Zeitraum versendet)
  const orderBacklogFilters: CrudFilters = useMemo(() => {
    const end = dateRange?.[1];
    if (!end) return [{ field: "bb_State", operator: "in", value: [1, 2, 3, 13] }];

    return [
      { field: "bb_State", operator: "in", value: [1, 2, 3, 13] },
      { field: "bb_CreatedAt", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  const { data: orderBacklogData, isLoading: orderBacklogLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: orderBacklogFilters,
    meta: {
      select: "id, bb_TotalCost, bb_State, bb_ShippedAt, bb_CreatedAt",
    },
    queryOptions: { keepPreviousData: true },
  });

  // Anzahlungen (bb_State in [1,2,3,13], erstellt bis Ende Zeitraum, noch nicht oder nach Zeitraum versendet)
  const paymentsFilters: CrudFilters = useMemo(() => {
    const end = dateRange?.[1];
    if (!end) return [{ field: "bb_State", operator: "in", value: [1, 2, 3, 13] }];

    return [
      { field: "bb_State", operator: "in", value: [1, 2, 3, 13] },
      { field: "bb_CreatedAt", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  const { data: allOrdersForPayments, isLoading: paymentsLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: paymentsFilters,
    meta: {
      select: "id, bb_TotalCost, bb_PaidAmount, bb_State, bb_ShippedAt, bb_CreatedAt",
    },
    queryOptions: { keepPreviousData: true },
  });

  const openOffers = openOffersData?.data || [];
  const orderBacklog = orderBacklogData?.data || [];
  const allOrdersPayments = allOrdersForPayments?.data || [];

  // Berechne KPIs
  const kpis = useMemo(() => {
    if (!offers.length && !sales.length && !ordersIn.length && !openOffers.length && !orderBacklog.length && !allOrdersPayments.length) return null;

    // Zeitraum-KPIs
    const angeboteSum = offers.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    
    // Umsatz: nur nicht-stornierte Bestellungen
    const salesFiltered = sales.filter((o) => ![6, 8, 14].includes(o.bb_State || 0));
    const umsatzSum = salesFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    
    // Auftragseingang: keine Angebote (bb_State != 14) und nicht storniert
    const ordersInFiltered = ordersIn.filter((o) => o.bb_State !== 14 && ![6, 8, 14].includes(o.bb_State || 0));
    const auftragseingangSum = ordersInFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);

    // Bestands-KPIs zum Ende des Zeitraums
    const offeneAngeboteSum = openOffers.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    
    // Auftragsbestand: nur Aufträge, die am Ende des Zeitraums noch nicht versendet waren
    const end = dateRange?.[1];
    const orderBacklogFiltered = orderBacklog.filter((o) => 
      !o.bb_ShippedAt || (end && new Date(o.bb_ShippedAt) > end.endOf("day").toDate())
    );
    const auftragsbestandSum = orderBacklogFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    
    // Erhaltene Anzahlungen: Summe aller bb_PaidAmount von Aufträgen, die am Ende des Zeitraums noch nicht versendet waren
    const paymentsFiltered = allOrdersPayments.filter((o) => 
      !o.bb_ShippedAt || (end && new Date(o.bb_ShippedAt) > end.endOf("day").toDate())
    );
    const anzahlungenSum = paymentsFiltered.reduce((sum, o) => sum + (o.bb_PaidAmount || 0), 0);
    const anzahlungenCount = paymentsFiltered.filter((o) => (o.bb_PaidAmount || 0) > 0).length;

    return {
      angeboteGeschrieben: { total: angeboteSum, count: offers.length },
      umsatz: { total: umsatzSum, count: salesFiltered.length },
      auftragseingang: { total: auftragseingangSum, count: ordersInFiltered.length },
      offeneAngebote: { total: offeneAngeboteSum, count: openOffers.length },
      auftragsbestand: { total: auftragsbestandSum, count: orderBacklog.length },
      anzahlungen: { total: anzahlungenSum, count: anzahlungenCount },
    };
  }, [offers, sales, ordersIn, openOffers, orderBacklog, allOrdersPayments, dateRange]);

  // Berechne Vergleichs-KPIs
  const comparisonKpis = useMemo(() => {
    if (compareMode === "none" || !comparisonOffers.length && !comparisonSales.length && !comparisonOrdersIn.length) return null;

    const compAngeboteSum = comparisonOffers.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    const compSalesFiltered = comparisonSales.filter((o) => ![6, 8, 14].includes(o.bb_State || 0));
    const compUmsatzSum = compSalesFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    const compOrdersInFiltered = comparisonOrdersIn.filter((o) => o.bb_State !== 14 && ![6, 8, 14].includes(o.bb_State || 0));
    const compAuftragseingangSum = compOrdersInFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);

    return {
      angeboteGeschrieben: { total: compAngeboteSum, count: comparisonOffers.length },
      umsatz: { total: compUmsatzSum, count: compSalesFiltered.length },
      auftragseingang: { total: compAuftragseingangSum, count: compOrdersInFiltered.length },
    };
  }, [comparisonOffers, comparisonSales, comparisonOrdersIn, compareMode]);

  // Chart-Daten mit adaptiver Aggregation
  const chartData = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return [];

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

    // Aggregiere Zeitraum-KPIs
    const groupedData = new Map<string, { angebote: number; umsatz: number; auftragseingang: number }>();

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

    // Initialisiere alle Perioden mit 0
    allPeriods.forEach(key => {
      groupedData.set(key, { angebote: 0, umsatz: 0, auftragseingang: 0 });
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

    // Angebote
    offers.forEach((o) => {
      const key = getGroupKey(o.offered_at);
      if (!key) return;
      const existing = groupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
      existing.angebote += o.bb_TotalCost || 0;
      groupedData.set(key, existing);
    });

    // Umsatz (ohne stornierte)
    sales.filter((o) => ![6, 8, 9].includes(o.bb_State || 0)).forEach((o) => {
      const key = getGroupKey(o.bb_ShippedAt);
      if (!key) return;
      const existing = groupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
      existing.umsatz += o.bb_TotalCost || 0;
      groupedData.set(key, existing);
    });

    // Auftragseingang (ohne Angebote und stornierte)
    ordersIn
      .filter((o) => o.bb_State !== 14 && ![6, 8, 9].includes(o.bb_State || 0))
      .forEach((o) => {
        const key = getGroupKey(o.bb_CreatedAt);
        if (!key) return;
        const existing = groupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
        existing.auftragseingang += o.bb_TotalCost || 0;
        groupedData.set(key, existing);
      });

    // Konvertiere zu Array und sortiere - stelle sicher, dass alle Kategorien für alle Perioden vorhanden sind
    const sortedKeys = Array.from(groupedData.keys()).sort();
    const result: Array<{ date: string; value: number; category: string }> = [];
    
    // Erstelle für jede Periode alle drei Kategorien (auch wenn Wert 0 ist)
    sortedKeys.forEach((key) => {
      const data = groupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
      const displayDate = getDisplayLabel(key);
      result.push({ date: displayDate, value: data.angebote, category: "Angebote" });
      result.push({ date: displayDate, value: data.auftragseingang, category: "Auftragseingang" });
      result.push({ date: displayDate, value: data.umsatz, category: "Umsatz" });
    });

    // Füge Vergleichsdaten hinzu, wenn aktiviert
    if (compareMode !== "none" && comparisonRange?.[0] && comparisonRange?.[1]) {
      const compStart = comparisonRange[0];
      const compGroupedData = new Map<string, { angebote: number; umsatz: number; auftragseingang: 0 }>();

      // Initialisiere Vergleichsperioden
      allPeriods.forEach(key => {
        compGroupedData.set(key, { angebote: 0, umsatz: 0, auftragseingang: 0 });
      });

      // Aggregiere Vergleichsdaten mit Offset
      const offsetDays = dateRange[0].diff(compStart, "day");

      comparisonOffers.forEach((o) => {
        const originalDate = dayjs(o.offered_at).add(offsetDays, "day");
        const key = getGroupKey(originalDate.toISOString());
        if (!key) return;
        const existing = compGroupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
        existing.angebote += o.bb_TotalCost || 0;
        compGroupedData.set(key, existing);
      });

      comparisonSales.filter((o) => ![6, 8, 9].includes(o.bb_State || 0)).forEach((o) => {
        const originalDate = dayjs(o.bb_ShippedAt).add(offsetDays, "day");
        const key = getGroupKey(originalDate.toISOString());
        if (!key) return;
        const existing = compGroupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
        existing.umsatz += o.bb_TotalCost || 0;
        compGroupedData.set(key, existing);
      });

      comparisonOrdersIn
        .filter((o) => o.bb_State !== 14 && ![6, 8, 9].includes(o.bb_State || 0))
        .forEach((o) => {
          const originalDate = dayjs(o.bb_CreatedAt).add(offsetDays, "day");
          const key = getGroupKey(originalDate.toISOString());
          if (!key) return;
          const existing = compGroupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
          existing.auftragseingang += o.bb_TotalCost || 0;
          compGroupedData.set(key, existing);
        });

      // Füge Vergleichsdaten zum Result hinzu
      sortedKeys.forEach((key) => {
        const data = compGroupedData.get(key) || { angebote: 0, umsatz: 0, auftragseingang: 0 };
        const displayDate = getDisplayLabel(key);
        const suffix = compareMode === "previous-year" ? " (Vorjahr)" : " (Vorzeitraum)";
        result.push({ date: displayDate, value: data.angebote, category: "Angebote" + suffix });
        result.push({ date: displayDate, value: data.auftragseingang, category: "Auftragseingang" + suffix });
                result.push({ date: displayDate, value: data.umsatz, category: "Umsatz" + suffix });
      });
    }

    return result;
  }, [offers, sales, ordersIn, dateRange, compareMode, comparisonRange, comparisonOffers, comparisonSales, comparisonOrdersIn]);

  // Länder-Umsatzverteilung
  const countryData = useMemo(() => {
    if (!sales.length) return [];

    const countryMap = new Map<string, { current: number; comparison: number }>();
    
    sales
      .filter((o) => ![6, 8, 9].includes(o.bb_State || 0))
      .forEach((o) => {
        const country = o.app_customers?.bb_InvoiceAddress_CountryISO2 || "Unbekannt";
        const existing = countryMap.get(country) || { current: 0, comparison: 0 };
        existing.current += o.bb_TotalCost || 0;
        countryMap.set(country, existing);
      });

    // Füge Vergleichsdaten hinzu, wenn aktiviert
    if (compareMode !== "none" && comparisonSales.length > 0) {
      comparisonSales
        .filter((o) => ![6, 8, 9].includes(o.bb_State || 0))
        .forEach((o) => {
          const country = o.app_customers?.bb_InvoiceAddress_CountryISO2 || "Unbekannt";
          const existing = countryMap.get(country) || { current: 0, comparison: 0 };
          existing.comparison += o.bb_TotalCost || 0;
          countryMap.set(country, existing);
        });
    }

    const result: Array<{ country: string; value: number; category: string }> = [];
    const suffix = compareMode === "previous-year" ? " (Vorjahr)" : compareMode === "previous-period" ? " (Vorzeitraum)" : "";

    countryMap.forEach((data, country) => {
      result.push({ country, value: data.current, category: "Aktuell" });
      if (compareMode !== "none") {
        result.push({ country, value: data.comparison, category: suffix.trim() });
      }
    });

    // Sortiere nach aktuellem Wert
    const sortedCountries = Array.from(countryMap.entries())
      .sort((a, b) => b[1].current - a[1].current)
      .map(([country]) => country);

    return result.sort((a, b) => {
      const aIdx = sortedCountries.indexOf(a.country);
      const bIdx = sortedCountries.indexOf(b.country);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.category === "Aktuell" ? -1 : 1;
    });
  }, [sales, comparisonSales, compareMode]);

  // Segment-Umsatzverteilung (nach room)
  const segmentData = useMemo(() => {
    if (!sales.length) return [];

    const segmentMap = new Map<string, { current: number; comparison: number }>();
    
    sales
      .filter((o) => ![6, 8, 9].includes(o.bb_State || 0))
      .forEach((o) => {
        o.app_order_items?.forEach((item) => {
          const segment = item.app_products?.room || "Sonstiges";
          const existing = segmentMap.get(segment) || { current: 0, comparison: 0 };
          existing.current += item.bb_TotalPrice || 0;
          segmentMap.set(segment, existing);
        });
      });

    // Füge Vergleichsdaten hinzu, wenn aktiviert
    if (compareMode !== "none" && comparisonSales.length > 0) {
      comparisonSales
        .filter((o) => ![6, 8, 9].includes(o.bb_State || 0))
        .forEach((o) => {
          o.app_order_items?.forEach((item) => {
            const segment = item.app_products?.room || "Sonstiges";
            const existing = segmentMap.get(segment) || { current: 0, comparison: 0 };
            existing.comparison += item.bb_TotalPrice || 0;
            segmentMap.set(segment, existing);
          });
        });
    }

    const result: Array<{ segment: string; value: number; category: string }> = [];
    const suffix = compareMode === "previous-year" ? " (Vorjahr)" : compareMode === "previous-period" ? " (Vorzeitraum)" : "";

    segmentMap.forEach((data, segment) => {
      result.push({ segment, value: data.current, category: "Aktuell" });
      if (compareMode !== "none") {
        result.push({ segment, value: data.comparison, category: suffix.trim() });
      }
    });

    // Sortiere nach aktuellem Wert
    const sortedSegments = Array.from(segmentMap.entries())
      .sort((a, b) => b[1].current - a[1].current)
      .map(([segment]) => segment);

    return result.sort((a, b) => {
      const aIdx = sortedSegments.indexOf(a.segment);
      const bIdx = sortedSegments.indexOf(b.segment);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.category === "Aktuell" ? -1 : 1;
    });
  }, [sales, comparisonSales, compareMode]);

  const isLoading = offersLoading || salesLoading || ordersInLoading || openOffersLoading || orderBacklogLoading || paymentsLoading;

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Cockpit
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            Übersicht über Auftragseingang, Umsatz, Bestände
          </Typography.Paragraph>
          <Space direction="horizontal" size="middle" style={{ marginTop: 16 }}>
            <DateRangeFilter
              value={dateRange}
              onChangeAction={setDateRange}
              storageKey="dashboard-range"
              isLoading={isLoading}
              label="Zeitraum"
            />
            <Radio.Group
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="none">Kein Vergleich</Radio.Button>
              <Radio.Button value="previous-year">Vorjahresvergleich</Radio.Button>
              <Radio.Button value="previous-period">Vorzeitraumvergleich</Radio.Button>
            </Radio.Group>
            
          </Space>
        </div>

        {isLoading ? (
          <Row gutter={[24, 24]}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Col xs={24} md={12} lg={8} key={i}>
                <Card>
                  <Skeleton active />
                </Card>
              </Col>
            ))}
          </Row>
        ) : kpis ? (
        <>
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12} lg={8}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Angebote geschrieben (Zeitraum)"
                  value={kpis.angeboteGeschrieben.total}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.angeboteGeschrieben.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
                {compareMode !== "none" && comparisonKpis && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                    {compareMode === "previous-year" ? "Vorjahr: " : "Vorzeitraum: "}
                    {currency(comparisonKpis.angeboteGeschrieben.total)}
                    {" "}(
                    <Typography.Text
                      type={kpis.angeboteGeschrieben.total >= comparisonKpis.angeboteGeschrieben.total ? "success" : "danger"}
                    >
                      {((kpis.angeboteGeschrieben.total - comparisonKpis.angeboteGeschrieben.total) / (comparisonKpis.angeboteGeschrieben.total || 1) * 100).toFixed(1)}%
                    </Typography.Text>
                    )
                  </Typography.Text>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Auftragseingang (Zeitraum)"
                  value={kpis.auftragseingang.total}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.auftragseingang.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
                {compareMode !== "none" && comparisonKpis && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                    {compareMode === "previous-year" ? "Vorjahr: " : "Vorzeitraum: "}
                    {currency(comparisonKpis.auftragseingang.total)}
                    {" "}(
                    <Typography.Text
                      type={kpis.auftragseingang.total >= comparisonKpis.auftragseingang.total ? "success" : "danger"}
                    >
                      {((kpis.auftragseingang.total - comparisonKpis.auftragseingang.total) / (comparisonKpis.auftragseingang.total || 1) * 100).toFixed(1)}%
                    </Typography.Text>
                    )
                  </Typography.Text>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Umsatz (Zeitraum)"
                  value={kpis.umsatz.total}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.umsatz.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
                {compareMode !== "none" && comparisonKpis && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                    {compareMode === "previous-year" ? "Vorjahr: " : "Vorzeitraum: "}
                    {currency(comparisonKpis.umsatz.total)}
                    {" "}(
                    <Typography.Text
                      type={kpis.umsatz.total >= comparisonKpis.umsatz.total ? "success" : "danger"}
                    >
                      {((kpis.umsatz.total - comparisonKpis.umsatz.total) / (comparisonKpis.umsatz.total || 1) * 100).toFixed(1)}%
                    </Typography.Text>
                    )
                  </Typography.Text>
                )}
              </Card>
            </Col>
          </Row>
          <Row gutter={[24, 24]}>
          <Col xs={24} md={12} lg={8}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Offene Angebote"
                  value={kpis.offeneAngebote.total}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.offeneAngebote.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Auftragsbestand"
                  value={kpis.auftragsbestand.total}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.auftragsbestand.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={8}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Erhaltene Anzahlungen"
                  value={kpis.anzahlungen.total}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.anzahlungen.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
              </Card>
            </Col>
        </Row>
        {chartData.length > 0 && (
            <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
              <Typography.Title level={4}>Entwicklung</Typography.Title>
              <Line
                data={chartData}
                xField="date"
                yField="value"
                seriesField="category"
                colorField="category"
                height={300}
                scale={{
                  x: {
                    type: "point",
                  },
                  color: {
                    range: compareMode === "none" 
                      ? ["#1890ff", "#52c41a", "#faad14"]
                      : ["#1890ff", "#52c41a", "#faad14", "#91d5ff", "#b7eb8f", "#ffd591"],
                  },
                }}
                axis={{
                  x: {
                    labelAutoRotate: false,
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
                      return `Periode: ${v}`;
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
                smooth={true}
                style={{
                  lineWidth: 2,
                }}
                point={{
                  size: 3,
                  shape: "circle",
                }}
                legend={{
                  position: "top",
                  itemName: {
                    style: {
                      fontSize: 12,
                    },
                  },
                }}
              />
            </Card>
          )}
          {countryData.length > 0 && (
            <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
              <Typography.Title level={4}>Umsatzverteilung nach Ländern</Typography.Title>
              <Column
                data={countryData}
                xField="country"
                yField="value"
                seriesField="category"
                colorField="category"
                height={300}
                scale={{
                  color: {
                    range: compareMode === "none" ? ["#1890ff"] : ["#1890ff", "#91d5ff"],
                  },
                }}
                axis={{
                  x: {
                    labelAutoRotate: false,
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
                      return `Land: ${v}`;
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
                legend={compareMode !== "none" ? {
                  position: "top",
                } : false}
              />
            </Card>
          )}
          {segmentData.length > 0 && (
            <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
              <Typography.Title level={4}>Umsatzverteilung nach Segmenten</Typography.Title>
              <Column
                data={segmentData}
                xField="segment"
                yField="value"
                seriesField="category"
                colorField="category"
                height={300}
                scale={{
                  color: {
                    range: compareMode === "none" ? ["#722ed1"] : ["#722ed1", "#d3adf7"],
                  },
                }}
                axis={{
                  x: {
                    labelAutoRotate: false,
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
                      return `Segment: ${v}`;
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
                legend={compareMode !== "none" ? {
                  position: "top",
                } : false}
              />
            </Card>
          )}
        </>
        ) : (
          <Card>
            <Typography.Text type="secondary">Keine Daten verfügbar</Typography.Text>
          </Card>
        )}
      </Space>
    </div>
  );
}
