"use client";

import { useList } from "@refinedev/core";
import { CascaderProps, Typography } from "antd";
import { Tables } from "@/types/supabase";

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

    // Cascader-Struktur erzeugen (nur Daten, kein JSX in Arrays)
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
            value: order.id, // Ebene 1: Order-ID
            label: `${order.bb_OrderNumber ?? ""} - (${order.app_customers?.bb_Name ?? ""})`,
            children,
        };
    });
};


/**
 * refine-Hook: Liefert Cascader Options + Loading-State
 * Nur refine-useList, keine React-State/Effects
 */
export const useOrderItemCascader = (): {
    options: CascaderProps["options"];
    loading: boolean;
} => {
    // Ebene 1: Orders laden
    const { data: ordersData, isLoading: loadingOrders } = useList<Order>({
        resource: "app_orders",
        pagination: { mode: "off" },
        filters: [
            { field: "bb_State", operator: "in", value: [1,2,3,4,16] },
        ],
        meta: {
            select: "*, app_customers!fk_app_customers_id(bb_Name)",
        },
    });

    // Ebene 2: Items laden
    const { data: itemsData, isLoading: loadingItems } =
        useList<OrderItem>({
            resource: "app_order_items",
            pagination: { mode: "off" },
            filters: [
                { field: "bb_InvoiceSKU", operator: "contains", value: "Sonder" },
            ],
            meta: {
                select: "*, app_products(bb_sku, bb_name), app_order_item_attributes(bb_Name, bb_Value)",
            },
        });

    // Transformation ohne React-State
    const options = buildOptions(ordersData?.data, itemsData?.data);

    return {
        options,
        loading: loadingOrders || loadingItems,
    };
};
