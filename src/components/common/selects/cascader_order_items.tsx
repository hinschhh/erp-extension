"use client";

import { useList } from "@refinedev/core";
import { CascaderProps } from "antd";
import { Tables } from "@/types/supabase";
import { useState, useMemo } from "react";

type Order = Tables<"app_orders"> & {
    app_customers?: Pick<Tables<"app_customers">, "bb_Name"> | null;
};

type OrderItem = Tables<"app_order_items"> & {
    app_products?: Pick<Tables<"app_products">, "bb_sku" | "bb_name"> | null;
    app_order_item_attributes?: Pick<Tables<"app_order_item_attributes">, "bb_Name" | "bb_Value">[];
};

const buildOptions = (
    orders?: Order[],
    items?: OrderItem[],
): CascaderProps["options"] => {
    if (!orders || !items) return [];

    // Items nach Bestellung gruppieren
    const itemsByOrderId = new Map<number, OrderItem[]>();

    for (const item of items) {
        const orderId = item.fk_app_orders_id;
        if (!orderId) continue;

        const group = itemsByOrderId.get(orderId) ?? [];
        group.push(item);
        itemsByOrderId.set(orderId, group);
    }

    // Cascader-Struktur erzeugen
    return orders.map((order) => {
        const children: CascaderProps["options"] =
            (itemsByOrderId.get(order.id as number) ?? []).map((item) => {
                // relevante Attribute filtern
                const filteredAttributes = Array.isArray(item.app_order_item_attributes)
                    ? item.app_order_item_attributes.filter(
                        (a) =>
                            a &&
                            typeof a === "object" &&
                            "bb_Name" in a &&
                            (a.bb_Name === "Grundmodell" || a.bb_Name === "Maße"),
                    )
                    : [];

                // Subline als Text zusammenbauen
                const attributesText =
                    filteredAttributes.length > 0
                        ? filteredAttributes
                              .map((a) =>
                                  typeof a === "object" &&
                                  a !== null &&
                                  "bb_Name" in a &&
                                  "bb_Value" in a
                                      ? `${a.bb_Name}: ${a.bb_Value}`
                                      : "",
                              )
                              .filter(Boolean)
                              .join(" · ")
                        : "";

                const sku = item.app_products?.bb_sku;
                const name = item.app_products?.bb_name;
                const mainLabel = `${sku ?? ""}${
                    name ? ` – ${name}` : ""
                } (Menge: ${item.bb_Quantity ?? 0})`;

                const fullLabel =
                    attributesText.length > 0
                        ? `${mainLabel} | ${attributesText}`
                        : mainLabel;

                return {
                    value: item.id,
                    label: fullLabel,
                };
            });

        return {
            value: order.id,
            label: `${order.bb_OrderNumber ?? ""} - (${order.app_customers?.bb_Name ?? ""})`,
            children,
        };
    });
};


/**
 * refine-Hook: Liefert Cascader Options + Loading-State mit dynamischer Suche
 * Items werden nur für die aktuell geladenen 500 Orders abgefragt (optimiert)
 * 
 * @param currentOrderIds - Wenn gesetzt, werden diese Orders zusätzlich geladen (für bereits verknüpfte Items)
 * @param currentOrderItemIds - Wenn gesetzt, werden diese Items zusätzlich geladen
 * @param filters - Optionale Filter für Orders (z.B. bb_ShippedAt, bb_State)
 */
export const useOrderItemCascader = (
    currentOrderIds?: number[],
    currentOrderItemIds?: number[],
    filters?: any[],
): {
    options: CascaderProps["options"];
    loading: boolean;
    onSearch: (value: string) => void;
} => {
    const [searchTerm, setSearchTerm] = useState<string>("");

    // Filter für Orders aufbauen
    const orderFiltersBase = useMemo(() => filters ?? [], [filters]);
    
    const orderNumberFilters = useMemo(() => {
        if (!searchTerm) return orderFiltersBase;
        return [
            ...orderFiltersBase,
            { 
                field: "bb_OrderNumber", 
                operator: "contains", 
                value: searchTerm 
            },
        ];
    }, [orderFiltersBase, searchTerm]);

    const customerNameFilters = useMemo(() => {
        if (!searchTerm) return [];
        return [
            ...orderFiltersBase,
            { 
                field: "app_customers.bb_Name", 
                operator: "contains", 
                value: searchTerm 
            },
        ];
    }, [orderFiltersBase, searchTerm]);

    // Query 1: Orders nach Bestellnummer suchen
    const { data: ordersByNumberData, isLoading: loadingOrdersByNumber } = useList<Order>({
        resource: "app_orders",
        pagination: { 
            current: 1, 
            pageSize: 600,
            mode: "server"
        },
        filters: orderNumberFilters,
        sorters: [{ field: "id", order: "desc" }],
        meta: {
            select: "*, app_customers(bb_Name)",
        },
    });

    // Query 2: Orders nach Kundenname suchen (nur wenn searchTerm vorhanden)
    const { data: ordersByCustomerData, isLoading: loadingOrdersByCustomer } = useList<Order>({
        resource: "app_orders", 
        pagination: { 
            current: 1,
            pageSize: 600,
            mode: "server"
        },
        filters: customerNameFilters,
        sorters: [{ field: "id", order: "desc" }],
        meta: {
            select: "*, app_customers(bb_Name)",
        },
        queryOptions: {
            enabled: !!searchTerm,
        },
    });

    // Fallback: Bereits verknüpfte Orders laden, falls nicht in der Liste
    const { data: currentOrdersData, isLoading: loadingCurrentOrders } = useList<Order>({
        resource: "app_orders",
        pagination: { mode: "off" },
        filters: currentOrderIds && currentOrderIds.length > 0
            ? [{ field: "id", operator: "in", value: currentOrderIds }]
            : [],
        meta: {
            select: "*, app_customers(bb_Name)",
        },
        queryOptions: {
            enabled: !!currentOrderIds && currentOrderIds.length > 0,
        },
    });

    // Orders zusammenführen: search results + current orders
    const mergedOrders = useMemo(() => {
        const ordersByNumber = ordersByNumberData?.data ?? [];
        const ordersByCustomer = ordersByCustomerData?.data ?? [];
        const currentOrders = currentOrdersData?.data ?? [];

        // Duplikate vermeiden durch ID-Set
        const uniqueOrders = new Map<number, Order>();

        // Alle Orders sammeln
        [...ordersByNumber, ...ordersByCustomer, ...currentOrders].forEach(order => {
            if (order.id && !uniqueOrders.has(order.id as number)) {
                uniqueOrders.set(order.id as number, order);
            }
        });

        return Array.from(uniqueOrders.values());
    }, [ordersByNumberData?.data, ordersByCustomerData?.data, currentOrdersData?.data]);

    // Order-IDs für Item-Abfrage sammeln
    const orderIds = useMemo(
        () => mergedOrders.map(o => o.id).filter((id): id is number => id !== undefined),
        [mergedOrders]
    );

    // Ebene 2: Items laden - NUR für die geladenen Orders (max 500 Orders)
    const { data: itemsData, isLoading: loadingItems } = useList<OrderItem>({
        resource: "app_order_items",
        pagination: { mode: "off" },
        sorters: [{ field: "created_at", order: "desc" }],
        filters: orderIds.length > 0
            ? [{ field: "fk_app_orders_id", operator: "in", value: orderIds }]
            : [],
        meta: {
            select: "*, app_orders(bb_InvoiceDate), app_products(bb_sku, bb_name), app_order_item_attributes(bb_Name, bb_Value)",
        },
        queryOptions: {
            enabled: orderIds.length > 0,
        },
    });

    // Fallback: Bereits verknüpfte Items laden, falls nicht in der Liste
    const { data: currentItemsData, isLoading: loadingCurrentItems } = useList<OrderItem>({
        resource: "app_order_items",
        pagination: { mode: "off" },
        filters: currentOrderItemIds && currentOrderItemIds.length > 0
            ? [{ field: "id", operator: "in", value: currentOrderItemIds }]
            : [],
        meta: {
            select: "*, app_products(bb_sku, bb_name), app_order_item_attributes(bb_Name, bb_Value)",
        },
        queryOptions: {
            enabled: !!currentOrderItemIds && currentOrderItemIds.length > 0,
        },
    });

    // Items zusammenführen
    const mergedItems = useMemo(() => {
        const items = itemsData?.data ?? [];
        const currentItems = currentItemsData?.data ?? [];
        
        const existingIds = new Set(items.map(i => i.id));
        const additionalItems = currentItems.filter(i => !existingIds.has(i.id));
        
        return [...additionalItems, ...items];
    }, [itemsData?.data, currentItemsData?.data]);

    // Cascader Options bauen
    const options = useMemo(
        () => buildOptions(mergedOrders, mergedItems),
        [mergedOrders, mergedItems]
    );

    const handleSearch = (value: string) => {
        setSearchTerm(value);
    };

    return {
        options,
        loading: loadingOrdersByNumber || loadingOrdersByCustomer || loadingItems || loadingCurrentOrders || loadingCurrentItems,
        onSearch: handleSearch,
    };
};
