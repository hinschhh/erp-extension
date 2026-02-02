"use client";

import type { CrudFilters } from "@refinedev/core";
import { useList } from "@refinedev/core";
import { Card, Col, Row, Statistic, Typography, Skeleton, Space, Radio, Modal, Table } from "antd";
import { Line, Column } from "@ant-design/plots";
import { Tables } from "@/types/supabase";
import { useState, useMemo } from "react";
import { FileTextOutlined, EuroOutlined, EyeOutlined } from "@ant-design/icons";
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
  const [countryChartMode, setCountryChartMode] = useState<"offers" | "orders" | "sales">("orders");
  const [segmentChartMode, setSegmentChartMode] = useState<"offers" | "orders" | "sales">("orders");
  const [specialOrderChartMode, setSpecialOrderChartMode] = useState<"offers" | "orders" | "sales">("orders");
  const [oposModalOpen, setOposModalOpen] = useState(false);
  const [paidModalOpen, setPaidModalOpen] = useState(false);
  const [partiallyPaidModalOpen, setPartiallyPaidModalOpen] = useState(false);
  const [unpaidModalOpen, setUnpaidModalOpen] = useState(false);

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
      { field: "offered_at", operator: "gte", value: start.startOf("day").toISOString() },
      { field: "offered_at", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  // Filter für Umsatz (Versanddatum)
  const salesFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    return [
      { field: "bb_ShippedAt", operator: "gte", value: start.startOf("day").toISOString() },
      { field: "bb_ShippedAt", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  // Filter für Auftragseingang (neue Bestellungen)
  const ordersInFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    return [
      { field: "bb_CreatedAt", operator: "gte", value: start.startOf("day").toISOString() },
      { field: "bb_CreatedAt", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  // Filter für Zahlungen (Zahlungsdatum)
  const paymentsReceivedFilters: CrudFilters = useMemo(() => {
    const start = dateRange?.[0];
    const end = dateRange?.[1];

    if (!start || !end) return [];

    return [
      { field: "bb_PayedAt", operator: "gte", value: start.startOf("day").toISOString() },
      { field: "bb_PayedAt", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  // Lade Angebote
  const { data: offersData, isLoading: offersLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: offersFilters,
    sorters: [{ field: "offered_at", order: "desc" }],
    meta: {
      select: "id, bb_TotalCost, offered_at, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room, bb_sku))",
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
      select: "id, bb_TotalCost, bb_ShippedAt, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room, bb_sku))",
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
      select: "id, bb_TotalCost, bb_CreatedAt, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room, bb_sku))",
    },
    queryOptions: { keepPreviousData: true },
  });

  // Lade Zahlungen (nach Zahlungsdatum)
  const { data: paymentsReceivedData, isLoading: paymentsReceivedLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: paymentsReceivedFilters,
    sorters: [{ field: "bb_PayedAt", order: "desc" }],
    meta: {
      select: "id, bb_TotalCost, bb_PaidAmount, bb_PayedAt, bb_State, bb_CreatedAt, bb_ShippedAt, app_customers(bb_Name, bb_InvoiceAddress_CountryISO2)",
    },
    queryOptions: { keepPreviousData: true },
  });

  const offers = offersData?.data || [];
  const sales = salesData?.data || [];
  const ordersIn = ordersInData?.data || [];
  const paymentsReceived = (paymentsReceivedData?.data || []).filter(
    (o) => o.bb_PayedAt && o.bb_PaidAmount && o.bb_PaidAmount > 0
  );

  // Vergleichs-Filter und Queries
  const comparisonPaymentsReceivedFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "bb_PayedAt", operator: "gte", value: comparisonRange[0].startOf("day").toISOString() },
      { field: "bb_PayedAt", operator: "lte", value: comparisonRange[1].endOf("day").toISOString() },
    ];
  }, [comparisonRange]);

  const comparisonOffersFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "offered_at", operator: "gte", value: comparisonRange[0].startOf("day").toISOString() },
      { field: "offered_at", operator: "lte", value: comparisonRange[1].endOf("day").toISOString() },
    ];
  }, [comparisonRange]);

  const comparisonSalesFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "bb_ShippedAt", operator: "gte", value: comparisonRange[0].startOf("day").toISOString() },
      { field: "bb_ShippedAt", operator: "lte", value: comparisonRange[1].endOf("day").toISOString() },
    ];
  }, [comparisonRange]);

  const comparisonOrdersInFilters: CrudFilters = useMemo(() => {
    if (!comparisonRange?.[0] || !comparisonRange?.[1]) return [];
    return [
      { field: "bb_CreatedAt", operator: "gte", value: comparisonRange[0].startOf("day").toISOString() },
      { field: "bb_CreatedAt", operator: "lte", value: comparisonRange[1].endOf("day").toISOString() },
    ];
  }, [comparisonRange]);

  const { data: comparisonOffersData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonOffersFilters,
    meta: { select: "id, bb_TotalCost, offered_at, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room, bb_sku))" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const { data: comparisonSalesData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonSalesFilters,
    meta: { select: "id, bb_TotalCost, bb_ShippedAt, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room, bb_sku))" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const { data: comparisonOrdersInData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonOrdersInFilters,
    meta: { select: "id, bb_TotalCost, bb_CreatedAt, bb_State, app_customers(bb_InvoiceAddress_CountryISO2), app_order_items(id, bb_TotalPrice, app_products(room, bb_sku))" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const { data: comparisonPaymentsReceivedData } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: comparisonPaymentsReceivedFilters,
    meta: { select: "id, bb_TotalCost, bb_PaidAmount, bb_PayedAt, bb_State" },
    queryOptions: { enabled: compareMode !== "none" && !!comparisonRange, keepPreviousData: true },
  });

  const comparisonOffers = comparisonOffersData?.data || [];
  const comparisonSales = comparisonSalesData?.data || [];
  const comparisonOrdersIn = comparisonOrdersInData?.data || [];
  const comparisonPaymentsReceived = (comparisonPaymentsReceivedData?.data || []).filter(
    (o) => o.bb_PayedAt && o.bb_PaidAmount && o.bb_PaidAmount > 0
  );

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
      select: "id, bb_OrderNumber, bb_TotalCost, bb_PaidAmount, bb_State, bb_ShippedAt, bb_CreatedAt, app_customers(bb_Name, bb_InvoiceAddress_CountryISO2)",
    },
    queryOptions: { keepPreviousData: true },
  });

  // OPOS: Versendete Aufträge bis Ende Zeitraum mit Zahlungsinfo (ab 01.06.2026)
  const oposFilters: CrudFilters = useMemo(() => {
    const end = dateRange?.[1];
    if (!end) return [];

    return [
      { field: "bb_ShippedAt", operator: "gte", value: "2026-06-01T00:00:00.000Z" },
      { field: "bb_ShippedAt", operator: "lte", value: end.endOf("day").toISOString() },
    ];
  }, [dateRange]);

  const { data: oposData, isLoading: oposLoading } = useList<Order>({
    resource: "app_orders",
    pagination: { mode: "off" },
    filters: oposFilters,
    meta: {
      select: "id, bb_OrderNumber, bb_TotalCost, bb_PaidAmount, bb_State, bb_ShippedAt, bb_CreatedAt, app_customers(bb_Name, bb_InvoiceAddress_CountryISO2)",
    },
    queryOptions: { keepPreviousData: true },
  });

  const openOffers = openOffersData?.data || [];
  const orderBacklog = orderBacklogData?.data || [];
  const allOrdersPayments = allOrdersForPayments?.data || [];
  const opos = oposData?.data || [];

  // Berechne KPIs
  const kpis = useMemo(() => {
    if (!offers.length && !sales.length && !ordersIn.length && !paymentsReceived.length && !openOffers.length && !orderBacklog.length && !allOrdersPayments.length && !opos.length) return null;

    // Zeitraum-KPIs
    const angeboteSum = offers.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    
    // Umsatz: nur nicht-stornierte Bestellungen
    const salesFiltered = sales.filter((o) => ![6, 8, 14].includes(o.bb_State || 0));
    const umsatzSum = salesFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    
    // Auftragseingang: keine Angebote (bb_State != 14) und nicht storniert
    const ordersInFiltered = ordersIn.filter((o) => o.bb_State !== 14 && ![6, 8, 14].includes(o.bb_State || 0));
    const auftragseingangSum = ordersInFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);

    // Erhaltene Zahlungen: Summe aller bb_PaidAmount von Zahlungen im Zeitraum
    const zahlungenSum = paymentsReceived.reduce((sum, o) => sum + (o.bb_PaidAmount || 0), 0);
    const zahlungenCount = paymentsReceived.filter((o) => (o.bb_PaidAmount || 0) > 0).length;

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

    // OPOS: Versendete Aufträge mit offenen Posten (Differenz zwischen TotalCost und PaidAmount)
    // Nur Aufträge ab 01.06.2026
    const cutoffDate = new Date("2026-06-01T00:00:00.000Z");
    const oposFiltered = opos.filter((o) => {
      const totalCost = o.bb_TotalCost || 0;
      const paidAmount = o.bb_PaidAmount || 0;
      const diff = totalCost - paidAmount;
      const shippedDate = o.bb_ShippedAt ? new Date(o.bb_ShippedAt) : null;
      return diff > 0 && ![6, 8, 9, 14].includes(o.bb_State || 0) && shippedDate && shippedDate >= cutoffDate;
    });
    const oposSum = oposFiltered.reduce((sum, o) => {
      const totalCost = o.bb_TotalCost || 0;
      const paidAmount = o.bb_PaidAmount || 0;
      return sum + (totalCost - paidAmount);
    }, 0);

    return {
      angeboteGeschrieben: { total: angeboteSum, count: offers.length },
      umsatz: { total: umsatzSum, count: salesFiltered.length },
      auftragseingang: { total: auftragseingangSum, count: ordersInFiltered.length },
      zahlungenErhalten: { total: zahlungenSum, count: zahlungenCount },
      offeneAngebote: { total: offeneAngeboteSum, count: openOffers.length },
      auftragsbestand: { total: auftragsbestandSum, count: orderBacklog.length },
      anzahlungen: { total: anzahlungenSum, count: anzahlungenCount },
      opos: { total: oposSum, count: oposFiltered.length, orders: oposFiltered },
    };
  }, [offers, sales, ordersIn, paymentsReceived, openOffers, orderBacklog, allOrdersPayments, opos, dateRange]);

  // Berechne Vergleichs-KPIs
  const comparisonKpis = useMemo(() => {
    if (compareMode === "none" || !comparisonOffers.length && !comparisonSales.length && !comparisonOrdersIn.length && !comparisonPaymentsReceived.length) return null;

    const compAngeboteSum = comparisonOffers.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    const compSalesFiltered = comparisonSales.filter((o) => ![6, 8, 14].includes(o.bb_State || 0));
    const compUmsatzSum = compSalesFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    const compOrdersInFiltered = comparisonOrdersIn.filter((o) => o.bb_State !== 14 && ![6, 8, 14].includes(o.bb_State || 0));
    const compAuftragseingangSum = compOrdersInFiltered.reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
    const compZahlungenSum = comparisonPaymentsReceived.reduce((sum, o) => sum + (o.bb_PaidAmount || 0), 0);

    return {
      angeboteGeschrieben: { total: compAngeboteSum, count: comparisonOffers.length },
      umsatz: { total: compUmsatzSum, count: compSalesFiltered.length },
      auftragseingang: { total: compAuftragseingangSum, count: compOrdersInFiltered.length },
      zahlungenErhalten: { total: compZahlungenSum, count: comparisonPaymentsReceived.filter((o) => (o.bb_PaidAmount || 0) > 0).length },
    };
  }, [comparisonOffers, comparisonSales, comparisonOrdersIn, comparisonPaymentsReceived, compareMode]);

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
    const sourceData = countryChartMode === "offers" ? offers : (countryChartMode === "sales" ? sales : ordersIn);
    const comparisonSourceData = countryChartMode === "offers" ? comparisonOffers : (countryChartMode === "sales" ? comparisonSales : comparisonOrdersIn);

    if (!sourceData.length) return [];

    const countryMap = new Map<string, { current: number; comparison: number }>();
    
    // Filter: Status 6, 8, 9 (storniert/abgelehnt) und bei orders auch Status 14 (Angebote)
    const excludedStates = countryChartMode === "orders" ? [6, 8, 9, 14] : [6, 8, 9];
    
    sourceData
      .filter((o) => !excludedStates.includes(o.bb_State || 0))
      .forEach((o) => {
        const country = o.app_customers?.bb_InvoiceAddress_CountryISO2 || "Unbekannt";
        const existing = countryMap.get(country) || { current: 0, comparison: 0 };
        existing.current += o.bb_TotalCost || 0;
        countryMap.set(country, existing);
      });

    // Füge Vergleichsdaten hinzu, wenn aktiviert
    if (compareMode !== "none" && comparisonSourceData.length > 0) {
      comparisonSourceData
        .filter((o) => !excludedStates.includes(o.bb_State || 0))
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
    const sourceData = segmentChartMode === "offers" ? offers : (segmentChartMode === "sales" ? sales : ordersIn);
    const comparisonSourceData = segmentChartMode === "offers" ? comparisonOffers : (segmentChartMode === "sales" ? comparisonSales : comparisonOrdersIn);

    if (!sourceData.length) return [];

    const segmentMap = new Map<string, { current: number; comparison: number }>();
    
    // Filter: Status 6, 8, 9 (storniert/abgelehnt) und bei orders auch Status 14 (Angebote)
    const excludedStates = segmentChartMode === "orders" ? [6, 8, 9, 14] : [6, 8, 9];
    
    sourceData
      .filter((o) => !excludedStates.includes(o.bb_State || 0))
      .forEach((o) => {
        o.app_order_items?.forEach((item) => {
          const segment = item.app_products?.room || "Sonstiges";
          const existing = segmentMap.get(segment) || { current: 0, comparison: 0 };
          existing.current += item.bb_TotalPrice || 0;
          segmentMap.set(segment, existing);
        });
      });

    // Füge Vergleichsdaten hinzu, wenn aktiviert
    if (compareMode !== "none" && comparisonSourceData.length > 0) {
      comparisonSourceData
        .filter((o) => !excludedStates.includes(o.bb_State || 0))
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
  }, [offers, sales, ordersIn, comparisonOffers, comparisonSales, comparisonOrdersIn, segmentChartMode, compareMode]);

  // Sonderbestellungen vs. Normale Produkte
  const specialOrderData = useMemo(() => {
    const sourceData = specialOrderChartMode === "offers" ? offers : (specialOrderChartMode === "sales" ? sales : ordersIn);
    const comparisonSourceData = specialOrderChartMode === "offers" ? comparisonOffers : (specialOrderChartMode === "sales" ? comparisonSales : comparisonOrdersIn);

    if (!sourceData.length) return [];

    const excludedStates = specialOrderChartMode === "orders" ? [6, 8, 9, 14] : [6, 8, 9];

    // Kategorien:
    // 1. Sonderbestellungen (Items mit "Sonder" im SKU)
    // 2. Normale Produkte in gemischten Bestellungen (Bestellungen mit mind. 1 Sonderbestellung)
    // 3. Normale Produkte in reinen Normalbestellungen
    const categoryMap = new Map<string, { current: number; comparison: number }>();
    categoryMap.set("Sonderbestellungen", { current: 0, comparison: 0 });
    categoryMap.set("Normale in gemischten Bestellungen", { current: 0, comparison: 0 });
    categoryMap.set("Reine Normalbestellungen", { current: 0, comparison: 0 });

    // Verarbeite aktuelle Daten
    sourceData
      .filter((o) => !excludedStates.includes(o.bb_State || 0))
      .forEach((order) => {
        if (!order.app_order_items?.length) return;

        // Prüfe ob Bestellung Sonderbestellungen enthält
        const hasSpecialOrder = order.app_order_items.some(
          (item) => item.app_products?.bb_sku?.toLowerCase().includes("sonder")
        );

        order.app_order_items.forEach((item) => {
          const isSpecialItem = item.app_products?.bb_sku?.toLowerCase().includes("sonder");
          const value = item.bb_TotalPrice || 0;

          if (isSpecialItem) {
            categoryMap.get("Sonderbestellungen")!.current += value;
          } else if (hasSpecialOrder) {
            categoryMap.get("Normale in gemischten Bestellungen")!.current += value;
          } else {
            categoryMap.get("Reine Normalbestellungen")!.current += value;
          }
        });
      });

    // Verarbeite Vergleichsdaten
    if (compareMode !== "none" && comparisonSourceData.length > 0) {
      comparisonSourceData
        .filter((o) => !excludedStates.includes(o.bb_State || 0))
        .forEach((order) => {
          if (!order.app_order_items?.length) return;

          const hasSpecialOrder = order.app_order_items.some(
            (item) => item.app_products?.bb_sku?.toLowerCase().includes("sonder")
          );

          order.app_order_items.forEach((item) => {
            const isSpecialItem = item.app_products?.bb_sku?.toLowerCase().includes("sonder");
            const value = item.bb_TotalPrice || 0;

            if (isSpecialItem) {
              categoryMap.get("Sonderbestellungen")!.comparison += value;
            } else if (hasSpecialOrder) {
              categoryMap.get("Normale in gemischten Bestellungen")!.comparison += value;
            } else {
              categoryMap.get("Reine Normalbestellungen")!.comparison += value;
            }
          });
        });
    }

    const result: Array<{ category: string; value: number; type: string }> = [];
    const suffix = compareMode === "previous-year" ? " (Vorjahr)" : compareMode === "previous-period" ? " (Vorzeitraum)" : "";

    categoryMap.forEach((data, category) => {
      result.push({ category, value: data.current, type: "Aktuell" });
      if (compareMode !== "none") {
        result.push({ category, value: data.comparison, type: suffix.trim() });
      }
    });

    return result;
  }, [offers, sales, ordersIn, comparisonOffers, comparisonSales, comparisonOrdersIn, specialOrderChartMode, compareMode]);

  const isLoading = offersLoading || salesLoading || ordersInLoading || paymentsReceivedLoading || openOffersLoading || orderBacklogLoading || paymentsLoading || oposLoading;

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
              <Col xs={24} md={12} lg={6} key={i}>
                <Card>
                  <Skeleton active />
                </Card>
              </Col>
            ))}
          </Row>
        ) : kpis ? (
        <>
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12} lg={6}>
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
            <Col xs={24} md={12} lg={6}>
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
            <Col xs={24} md={12} lg={6}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Erhaltene Zahlungen (Zeitraum)"
                  value={kpis.zahlungenErhalten.total}
                  precision={0}
                  prefix={<EuroOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis.zahlungenErhalten.count})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
                {compareMode !== "none" && comparisonKpis && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 8 }}>
                    {compareMode === "previous-year" ? "Vorjahr: " : "Vorzeitraum: "}
                    {currency(comparisonKpis.zahlungenErhalten.total)}
                    {" "}(
                    <Typography.Text
                      type={kpis.zahlungenErhalten.total >= comparisonKpis.zahlungenErhalten.total ? "success" : "danger"}
                    >
                      {((kpis.zahlungenErhalten.total - comparisonKpis.zahlungenErhalten.total) / (comparisonKpis.zahlungenErhalten.total || 1) * 100).toFixed(1)}%
                    </Typography.Text>
                    )
                  </Typography.Text>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
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
            <Col xs={24} md={12} lg={6}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Offene Angebote"
                  value={kpis?.offeneAngebote.total || 0}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis?.offeneAngebote.count || 0})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Auftragsbestand"
                  value={kpis?.auftragsbestand.total || 0}
                  precision={0}
                  prefix={<FileTextOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis?.auftragsbestand.count || 0})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
                <Statistic
                  title="Erhaltene Anzahlungen"
                  value={kpis?.anzahlungen.total || 0}
                  precision={0}
                  prefix={<EuroOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis?.anzahlungen.count || 0})
                    </Typography.Text>
                  }
                  formatter={(value) => currency(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Card 
                style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)", cursor: "pointer" }}
                onClick={() => setOposModalOpen(true)}
              >
                <Statistic
                  title={
                    <span>
                      OPOS (Offene Posten) <EyeOutlined style={{ fontSize: 12, marginLeft: 4, color: "#8c8c8c" }} />
                    </span>
                  }
                  value={kpis?.opos.total || 0}
                  precision={0}
                  prefix={<EuroOutlined />}
                  suffix={
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      ({kpis?.opos.count || 0})
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
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Space direction="horizontal" style={{ width: "100%", justifyContent: "space-between" }}>
                  <Typography.Title level={4} style={{ marginBottom: 0 }}>
                    {countryChartMode === "offers" ? "Angebotsvolumen" : (countryChartMode === "orders" ? "Auftragseingang" : "Umsatzverteilung")} nach Ländern
                  </Typography.Title>
                  <Radio.Group
                    value={countryChartMode}
                    onChange={(e) => setCountryChartMode(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                  >
                    <Radio.Button value="offers">Angebotsvolumen</Radio.Button>
                    <Radio.Button value="orders">Auftragseingang</Radio.Button>
                    <Radio.Button value="sales">Umsatz</Radio.Button>
                  </Radio.Group>
                </Space>
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
              </Space>
            </Card>
          )}
          {segmentData.length > 0 && (
            <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Space direction="horizontal" style={{ width: "100%", justifyContent: "space-between" }}>
                  <Typography.Title level={4} style={{ marginBottom: 0 }}>
                    {segmentChartMode === "offers" ? "Angebotsvolumen" : (segmentChartMode === "orders" ? "Auftragseingang" : "Umsatzverteilung")} nach Segmenten
                  </Typography.Title>
                  <Radio.Group
                    value={segmentChartMode}
                    onChange={(e) => setSegmentChartMode(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                  >
                    <Radio.Button value="offers">Angebotsvolumen</Radio.Button>
                    <Radio.Button value="orders">Auftragseingang</Radio.Button>
                    <Radio.Button value="sales">Umsatz</Radio.Button>
                  </Radio.Group>
                </Space>
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
              </Space>
            </Card>
          )}
          {specialOrderData.length > 0 && (
            <Card style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}>
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Space direction="horizontal" style={{ width: "100%", justifyContent: "space-between" }}>
                  <Typography.Title level={4} style={{ marginBottom: 0 }}>
                    {specialOrderChartMode === "offers" ? "Angebotsvolumen" : (specialOrderChartMode === "orders" ? "Auftragseingang" : "Umsatzverteilung")} nach Bestellart
                  </Typography.Title>
                  <Radio.Group
                    value={specialOrderChartMode}
                    onChange={(e) => setSpecialOrderChartMode(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    size="small"
                  >
                    <Radio.Button value="offers">Angebotsvolumen</Radio.Button>
                    <Radio.Button value="orders">Auftragseingang</Radio.Button>
                    <Radio.Button value="sales">Umsatz</Radio.Button>
                  </Radio.Group>
                </Space>
              <Column
                data={specialOrderData}
                xField="category"
                yField="value"
                seriesField="type"
                colorField="type"
                height={300}
                scale={{
                  color: {
                    range: compareMode === "none" ? ["#52c41a"] : ["#52c41a", "#95de64"],
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
                      return `Kategorie: ${v}`;
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
              </Space>
            </Card>
          )}
          {allOrdersPayments.length > 0 && (() => {
            // Calculate payment data for unshipped orders
            const paidOrders = allOrdersPayments.filter((o) => {
              const totalCost = o.bb_TotalCost || 0;
              const paidAmount = o.bb_PaidAmount || 0;
              return !o.bb_ShippedAt && paidAmount >= totalCost && totalCost > 0 && ![6, 8, 9, 14].includes(o.bb_State || 0);
            });
            const partiallyPaidOrders = allOrdersPayments.filter((o) => {
              const totalCost = o.bb_TotalCost || 0;
              const paidAmount = o.bb_PaidAmount || 0;
              return !o.bb_ShippedAt && paidAmount > 0 && paidAmount < totalCost && ![6, 8, 9, 14].includes(o.bb_State || 0);
            });
            const unpaidOrders = allOrdersPayments.filter((o) => {
              const totalCost = o.bb_TotalCost || 0;
              const paidAmount = o.bb_PaidAmount || 0;
              return !o.bb_ShippedAt && paidAmount === 0 && totalCost > 0 && ![6, 8, 9, 14].includes(o.bb_State || 0);
            });
            const totalOrders = paidOrders.length + partiallyPaidOrders.length + unpaidOrders.length;
            const totalOrderValue = [...paidOrders, ...partiallyPaidOrders, ...unpaidOrders].reduce((sum, o) => sum + (o.bb_TotalCost || 0), 0);
            const totalPaidValue = [...paidOrders, ...partiallyPaidOrders].reduce((sum, o) => sum + (o.bb_PaidAmount || 0), 0);
            const anzahlungsquote = totalOrderValue > 0 ? (totalPaidValue / totalOrderValue * 100) : 0;

            return (
              <>
                <Card 
                style={{ borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}
                title={
                  <Typography.Title level={4} style={{ marginBottom: 0 }}>
                    Zahlungsübersicht
                  </Typography.Title>
                }
              >
                <Row gutter={[24, 16]}>
                  <Col xs={24} md={6}>
                    <Card 
                      style={{ backgroundColor: "#f6ffed", border: "1px solid #b7eb8f", cursor: "pointer" }}
                      onClick={() => setPaidModalOpen(true)}
                      hoverable
                    >
                      <Statistic
                        title={
                          <span>
                            Bezahlte Aufträge <EyeOutlined style={{ fontSize: 12, marginLeft: 4, color: "#8c8c8c" }} />
                          </span>
                        }
                        value={paidOrders.length}
                        suffix={`/ ${totalOrders}`}
                        valueStyle={{ color: "#52c41a" }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card 
                      style={{ backgroundColor: "#fffbe6", border: "1px solid #ffe58f", cursor: "pointer" }}
                      onClick={() => setPartiallyPaidModalOpen(true)}
                      hoverable
                    >
                      <Statistic
                        title={
                          <span>
                            Angezahlte Aufträge <EyeOutlined style={{ fontSize: 12, marginLeft: 4, color: "#8c8c8c" }} />
                          </span>
                        }
                        value={partiallyPaidOrders.length}
                        suffix={`/ ${totalOrders}`}
                        valueStyle={{ color: "#faad14" }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card 
                      style={{ backgroundColor: "#fff1f0", border: "1px solid #ffccc7", cursor: "pointer" }}
                      onClick={() => setUnpaidModalOpen(true)}
                      hoverable
                    >
                      <Statistic
                        title={
                          <span>
                            Unbezahlte Aufträge <EyeOutlined style={{ fontSize: 12, marginLeft: 4, color: "#8c8c8c" }} />
                          </span>
                        }
                        value={unpaidOrders.length}
                        suffix={`/ ${totalOrders}`}
                        valueStyle={{ color: "#ff4d4f" }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} md={6}>
                    <Card style={{ backgroundColor: "#e6f7ff", border: "1px solid #91d5ff" }}>
                      <Statistic
                        title="Anzahlungsquote"
                        value={anzahlungsquote}
                        precision={1}
                        suffix="%"
                        valueStyle={{ color: "#1890ff" }}
                      />
                    </Card>
                  </Col>
                </Row>
              </Card>
              {/* Drilldown Modals for Payment Details */}
              <Modal
                title="Bezahlte Aufträge"
                open={paidModalOpen}
                onCancel={() => setPaidModalOpen(false)}
                width={1000}
                footer={null}
              >
                <Table
                  dataSource={paidOrders}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: "Auftragsnummer",
                      dataIndex: "bb_OrderNumber",
                      key: "bb_OrderNumber",
                      render: (value, record) => (
                        <a href={`/kundenberatung/auftraege/show/${record.id}`} target="_blank" rel="noopener noreferrer">
                          {value || "-"}
                        </a>
                      ),
                    },
                    {
                      title: "Kunde",
                      dataIndex: ["app_customers", "bb_Name"],
                      key: "customer",
                      render: (value) => value || "Unbekannt",
                      sorter: (a, b) => {
                        const nameA = a.app_customers?.bb_Name || "";
                        const nameB = b.app_customers?.bb_Name || "";
                        return nameA.localeCompare(nameB);
                      },
                    },
                    {
                      title: "Gesamt",
                      dataIndex: "bb_TotalCost",
                      key: "total",
                      render: (value) => currency(value || 0),
                      align: "right" as const,
                      sorter: (a, b) => (a.bb_TotalCost || 0) - (b.bb_TotalCost || 0),
                    },
                    {
                      title: "Bezahlt",
                      dataIndex: "bb_PaidAmount",
                      key: "paid",
                      render: (value) => currency(value || 0),
                      align: "right" as const,
                    },
                    {
                      title: "Erstellt am",
                      dataIndex: "bb_CreatedAt",
                      key: "created",
                      render: (value) => value ? new Date(value).toLocaleDateString("de-DE") : "-",
                      sorter: (a, b) => {
                        const dateA = a.bb_CreatedAt ? new Date(a.bb_CreatedAt).getTime() : 0;
                        const dateB = b.bb_CreatedAt ? new Date(b.bb_CreatedAt).getTime() : 0;
                        return dateA - dateB;
                      },
                      defaultSortOrder: "descend" as const,
                    },
                    {
                      title: "Land",
                      dataIndex: ["app_customers", "bb_InvoiceAddress_CountryISO2"],
                      key: "country",
                      render: (value) => value || "-",
                    },
                  ]}
                />
              </Modal>
              <Modal
                title="Angezahlte Aufträge"
                open={partiallyPaidModalOpen}
                onCancel={() => setPartiallyPaidModalOpen(false)}
                width={1100}
                footer={null}
              >
                <Table
                  dataSource={partiallyPaidOrders}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: "Auftragsnummer",
                      dataIndex: "bb_OrderNumber",
                      key: "bb_OrderNumber",
                      render: (value, record) => (
                        <a href={`/kundenberatung/auftraege/show/${record.id}`} target="_blank" rel="noopener noreferrer">
                          {value || "-"}
                        </a>
                      ),
                    },
                    {
                      title: "Kunde",
                      dataIndex: ["app_customers", "bb_Name"],
                      key: "customer",
                      render: (value) => value || "Unbekannt",
                    },
                    {
                      title: "Gesamt",
                      dataIndex: "bb_TotalCost",
                      key: "total",
                      render: (value) => currency(value || 0),
                      align: "right" as const,
                    },
                    {
                      title: "Bezahlt",
                      dataIndex: "bb_PaidAmount",
                      key: "paid",
                      render: (value) => currency(value || 0),
                      align: "right" as const,
                    },
                    {
                      title: "Offen",
                      key: "open",
                      render: (_, record) => {
                        const open = (record.bb_TotalCost || 0) - (record.bb_PaidAmount || 0);
                        return <Typography.Text strong style={{ color: "#faad14" }}>{currency(open)}</Typography.Text>;
                      },
                      align: "right" as const,
                    },
                    {
                      title: "Erstellt am",
                      dataIndex: "bb_CreatedAt",
                      key: "created",
                      render: (value) => value ? new Date(value).toLocaleDateString("de-DE") : "-",
                    },
                    {
                      title: "Land",
                      dataIndex: ["app_customers", "bb_InvoiceAddress_CountryISO2"],
                      key: "country",
                      render: (value) => value || "-",
                    },
                  ]}
                />
              </Modal>
              <Modal
                title="Unbezahlte Aufträge"
                open={unpaidModalOpen}
                onCancel={() => setUnpaidModalOpen(false)}
                width={1000}
                footer={null}
              >
                <Table
                  dataSource={unpaidOrders}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  columns={[
                    {
                      title: "Auftragsnummer",
                      dataIndex: "bb_OrderNumber",
                      key: "bb_OrderNumber",
                      render: (value, record) => (
                        <a href={`/kundenberatung/auftraege/show/${record.id}`} target="_blank" rel="noopener noreferrer">
                          {value || "-"}
                        </a>
                      ),
                    },
                    {
                      title: "Kunde",
                      dataIndex: ["app_customers", "bb_Name"],
                      key: "customer",
                      render: (value) => value || "Unbekannt",
                      sorter: (a, b) => {
                        const nameA = a.app_customers?.bb_Name || "";
                        const nameB = b.app_customers?.bb_Name || "";
                        return nameA.localeCompare(nameB);
                      },
                    },
                    {
                      title: "Gesamt",
                      dataIndex: "bb_TotalCost",
                      key: "total",
                      render: (value) => currency(value || 0),
                      align: "right" as const,
                      sorter: (a, b) => (a.bb_TotalCost || 0) - (b.bb_TotalCost || 0),
                    },
                    {
                      title: "Erstellt am",
                      dataIndex: "bb_CreatedAt",
                      key: "created",
                      render: (value) => value ? new Date(value).toLocaleDateString("de-DE") : "-",
                      sorter: (a, b) => {
                        const dateA = a.bb_CreatedAt ? new Date(a.bb_CreatedAt).getTime() : 0;
                        const dateB = b.bb_CreatedAt ? new Date(b.bb_CreatedAt).getTime() : 0;
                        return dateA - dateB;
                      },
                      defaultSortOrder: "descend" as const,
                    },
                    {
                      title: "Land",
                      dataIndex: ["app_customers", "bb_InvoiceAddress_CountryISO2"],
                      key: "country",
                      render: (value) => value || "-",
                    },
                  ]}
                />
              </Modal>
              </>
            );
          })()}
          <Modal
            title="OPOS - Offene Posten"
            open={oposModalOpen}
            onCancel={() => setOposModalOpen(false)}
            width={1000}
            footer={null}
          >
            <Table
              dataSource={kpis?.opos.orders || []}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              columns={[
                {
                  title: "Auftragsnummer",
                  dataIndex: "bb_OrderNumber",
                  key: "bb_OrderNumber",
                  render: (value, record) => (
                    <a href={`/kundenberatung/auftraege/show/${record.id}`} target="_blank" rel="noopener noreferrer">
                      {value || "-"}
                    </a>
                  ),
                },
                {
                  title: "Kunde",
                  dataIndex: ["app_customers", "bb_Name"],
                  key: "customer",
                  render: (value) => value || "Unbekannt",
                },
                {
                  title: "Gesamt",
                  dataIndex: "bb_TotalCost",
                  key: "total",
                  render: (value) => currency(value || 0),
                  align: "right" as const,
                },
                {
                  title: "Bezahlt",
                  dataIndex: "bb_PaidAmount",
                  key: "paid",
                  render: (value) => currency(value || 0),
                  align: "right" as const,
                },
                {
                  title: "Offen",
                  key: "open",
                  render: (_, record) => {
                    const open = (record.bb_TotalCost || 0) - (record.bb_PaidAmount || 0);
                    return <Typography.Text strong style={{ color: "#ff4d4f" }}>{currency(open)}</Typography.Text>;
                  },
                  align: "right" as const,
                },
                {
                  title: "Versandt am",
                  dataIndex: "bb_ShippedAt",
                  key: "shipped",
                  render: (value) => value ? new Date(value).toLocaleDateString("de-DE") : "-",
                },
                {
                  title: "Land",
                  dataIndex: ["app_customers", "bb_InvoiceAddress_CountryISO2"],
                  key: "country",
                  render: (value) => value || "-",
                },
              ]}
            />
          </Modal>
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
