"use client";

import { useList } from "@refinedev/core";
import { CascaderProps, Typography } from "antd";
import { Tables } from "@/types/supabase";

type Order = Tables<"app_orders_with_customers_view"> & { id: number };
type OrderItem = Tables<"view_order_items_active_with_attributes_and_products_view"> & { id: number };


const buildOptions = (
    orders?: Order[],
    items?: OrderItem[],
): CascaderProps["options"] => {
    if (!orders || !items) return [];

    // Gruppieren der Items nach fk_app_orders_id
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
                // Nur relevante Attribute filtern
                const filteredAttributes = Array.isArray(item.attributes)
                    ? item.attributes.filter(
                        (a) =>
                            a &&
                            typeof a === "object" &&
                            ("bb_Name" in a) &&
                            (a.bb_Name === "Grundmodell" || a.bb_Name === "Maße")
                    )
                    : [];

                return {
                    value: item.id,
                    label: (
                        <div>
                            {/* Hauptzeile */}
                            <Typography.Text ellipsis>
                                {item.bb_sku ?? ""}{" "}
                                {item.bb_name ? `– ${item.bb_name}` : ""}{" "}
                                (Menge: {item.qty_ordered})
                            </Typography.Text>

                            {/* Subline – nur anzeigen, wenn es passende Attribute gibt */}
                            {filteredAttributes.length > 0 && (
                                <div style={{ fontSize: "12px", color: "#888" }}>
                                    {filteredAttributes
                                        .map((a) => 
                                            typeof a === "object" && a !== null && "bb_Name" in a && "bb_Value" in a
                                                ? `${a.bb_Name}: ${a.bb_Value}`
                                                : ""
                                        )
                                        .join(" · ")}
                                </div>
                            )}
                        </div>
                    ),
                };
            });



        return {
            value: order.id, // Ebene 1: Order-ID
            label: `${order["bb_import_ab-nummer"] ?? ""} - (${order.customer_name ?? ""})`,
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
        resource: "app_orders_with_customers_view",
        pagination: { mode: "off" },
        filters: [
            { field: "bb_State", operator: "in", value: [1,2,3,16] },
            {field: "sonder_item_count", operator: "gt", value: 0},
        ],
    });

    // Ebene 2: Items laden
    const { data: itemsData, isLoading: loadingItems } =
        useList<OrderItem>({
            resource:
                "view_order_items_active_with_attributes_and_products_view",
            pagination: { mode: "off" },
            filters: [
                { field: "bb_sku", operator: "contains", value: "Sonder" },
            ],
        });

    // Transformation ohne React-State
    const options = buildOptions(ordersData?.data, itemsData?.data);

    return {
        options,
        loading: loadingOrders || loadingItems,
    };
};
