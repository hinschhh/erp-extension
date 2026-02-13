"use client";

import { Table } from "antd";
import { Tables } from "@/types/supabase";
import Link from "next/link";

type BomRecipe = {
    quantity?: number | null;
    billbee_component?: {
        cost_price?: number | null;
    } | null;
};

type OrderItems = Tables<"app_order_items"> & {
    app_products?: (Pick<Tables<"app_products">, "bb_name" | "bb_sku" | "bb_costnet" | "cost_price" | "is_antique" | "bb_is_bom"> & {
        bom_recipes?: BomRecipe[] | null;
    }) | null;
    app_purchase_orders_positions_special?: Pick<Tables<"app_purchase_orders_positions_special">, "unit_price_net" | "order_id">[] | null;
    app_order_item_attributes?: Pick<Tables<"app_order_item_attributes">, "bb_Name" | "bb_Value">[] | null;
};

// Hilfsfunktion: Berechnet den Einkaufspreis basierend auf Produkttyp
const calculatePurchasePrice = (item: OrderItems): number => {
    const product = item.app_products;
    if (!product) return 0;

    const sku = product.bb_sku ?? "";

    // 1. Sonderbestellungen (SKU beginnt mit "Sonder")
    if (sku.startsWith("Sonder")) {
        const specialPositions = item.app_purchase_orders_positions_special ?? [];
        if (specialPositions.length > 0) {
            return Number(specialPositions[0]?.unit_price_net ?? 0);
        }
        return 0; // Keine Verknüpfung vorhanden
    }

    // 2. Antike (pauschal 300 EUR)
    if (product.is_antique === true) {
        return 300;
    }

    // 3. BOMs (Summe der Komponenten-EKPs - nur Warenwert ohne Beschaffungskosten)
    if (product.bb_is_bom === true) {
        const recipes = product.bom_recipes ?? [];
        const bomCost = recipes.reduce((acc, recipe) => {
            const qty = Number(recipe.quantity ?? 0);
            const price = Number(recipe.billbee_component?.cost_price ?? 0);
            return acc + (qty * price);
        }, 0);
        return bomCost;
    }

    // 4. Normale Produkte - Einkaufspreis ohne Beschaffungskosten
    return Number(product.cost_price ?? 0);
};

export default function OrderItemsList({ items }: { items: OrderItems[] }) {

    return (
        <Table 
            dataSource={items} 
            rowKey="id" 
            pagination={false}
            summary={() => {
                // Berechne Summen
                const totalQuantity = items.reduce((sum, item) => sum + Number(item.bb_Quantity ?? 0), 0);
                
                const totalVKGesamt = items.reduce((sum, item) => sum + Number(item.bb_TotalPrice ?? 0), 0);
                
                const totalVKNetto = items.reduce((sum, item) => {
                    const totalPrice = Number(item.bb_TotalPrice ?? 0);
                    const taxAmount = Number(item.bb_TaxAmount ?? 0);
                    return sum + (totalPrice - taxAmount);
                }, 0);
                
                const totalEKGesamt = items.reduce((sum, item) => {
                    const unitPurchasePrice = calculatePurchasePrice(item);
                    const quantity = Number(item.bb_Quantity ?? 0);
                    return sum + (unitPurchasePrice * quantity);
                }, 0);
                
                const totalRohertrag = totalVKNetto - totalEKGesamt;
                const totalRohertragsmarge = totalVKNetto > 0 ? (totalRohertrag / totalVKNetto) * 100 : 0;

                return (
                    <Table.Summary fixed>
                        <Table.Summary.Row style={{ fontWeight: 'bold' }}>
                            <Table.Summary.Cell index={0}>Gesamt</Table.Summary.Cell>
                            <Table.Summary.Cell index={1}>{totalQuantity}</Table.Summary.Cell>
                            <Table.Summary.Cell index={2}>€ {totalVKGesamt.toFixed(2)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={3}>€ {totalVKNetto.toFixed(2)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={4}>—</Table.Summary.Cell>
                            <Table.Summary.Cell index={5}>€ {totalEKGesamt.toFixed(2)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={6}>€ {totalRohertrag.toFixed(2)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={7}>{totalRohertragsmarge.toFixed(2)} %</Table.Summary.Cell>
                        </Table.Summary.Row>
                    </Table.Summary>
                );
            }}
        >
            <Table.Column 
                title="Produkt" 
                dataIndex={["app_products", "bb_name"]}
                render={(value, record: OrderItems) => {
                    const product = record.app_products;
                    const sku = product?.bb_sku ?? "";
                    const isSpecialOrder = sku.startsWith("Sonder");
                    const specialPositions = record.app_purchase_orders_positions_special ?? [];
                    const orderId = specialPositions.length > 0 ? specialPositions[0]?.order_id : null;
                    
                    return (
                        <div>
                            <div>{value || "—"}</div>
                            {isSpecialOrder && orderId && (
                                <div style={{ fontSize: "0.85em", marginTop: 4 }}>
                                    <Link href={`/einkauf/bestellungen/${orderId}`} style={{ color: "#1890ff" }}>
                                        → Zur Bestellung
                                    </Link>
                                </div>
                            )}
                            {record.app_order_item_attributes && record.app_order_item_attributes.length > 0 && (
                                <div style={{ fontSize: "0.85em", color: "#888", marginTop: 4 }}>
                                    {record.app_order_item_attributes.map((attr, idx) => (
                                        <div key={idx}>
                                            {attr.bb_Name}: {attr.bb_Value}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }}
            />
            <Table.Column title="Menge" dataIndex="bb_Quantity" />
            <Table.Column 
                title="VK Gesamt" 
                dataIndex="bb_TotalPrice" 
                render={(value) => value ? `€ ${value.toFixed(2)}` : "—"} 
            />
            <Table.Column 
                title="VK Netto" 
                dataIndex="bb_TotalPrice"
                render={(value, record: OrderItems) => {
                    const totalPrice = Number(value ?? 0);
                    const taxAmount = Number(record.bb_TaxAmount ?? 0);
                    const netPrice = totalPrice - taxAmount;
                    return `€ ${netPrice.toFixed(2)}`;
                }}
            />
            <Table.Column 
                title="EK pro Stk." 
                render={(_, record: OrderItems) => {
                    const unitPurchasePrice = calculatePurchasePrice(record);
                    return unitPurchasePrice > 0 ? `€ ${unitPurchasePrice.toFixed(2)}` : "—";
                }}
            />
            <Table.Column 
                title="EK Gesamt" 
                render={(_, record: OrderItems) => {
                    const unitPurchasePrice = calculatePurchasePrice(record);
                    const quantity = Number(record.bb_Quantity ?? 0);
                    const totalPurchasePrice = unitPurchasePrice * quantity;
                    return totalPurchasePrice > 0 ? `€ ${totalPurchasePrice.toFixed(2)}` : "—";
                }}
            />
            <Table.Column 
                title="Rohertrag"
                render={(_, record: OrderItems) => {
                    const totalPrice = Number(record.bb_TotalPrice ?? 0);
                    const taxAmount = Number(record.bb_TaxAmount ?? 0);
                    const netPrice = totalPrice - taxAmount;
                    
                    const unitPurchasePrice = calculatePurchasePrice(record);
                    const quantity = Number(record.bb_Quantity ?? 0);
                    const totalPurchasePrice = unitPurchasePrice * quantity;
                    
                    const grossProfit = netPrice - totalPurchasePrice;
                    return `€ ${grossProfit.toFixed(2)}`;
                }}
            />
            <Table.Column 
                title="Rohertragsmarge"
                render={(_, record: OrderItems) => {
                    const totalPrice = Number(record.bb_TotalPrice ?? 0);
                    const taxAmount = Number(record.bb_TaxAmount ?? 0);
                    const netPrice = totalPrice - taxAmount;
                    
                    const unitPurchasePrice = calculatePurchasePrice(record);
                    const quantity = Number(record.bb_Quantity ?? 0);
                    const totalPurchasePrice = unitPurchasePrice * quantity;
                    
                    const grossProfit = netPrice - totalPurchasePrice;
                    const grossMargin = netPrice > 0 ? (grossProfit / netPrice) * 100 : 0;
                    return `${grossMargin.toFixed(2)} %`;
                }}
            />
        </Table>
    );
}