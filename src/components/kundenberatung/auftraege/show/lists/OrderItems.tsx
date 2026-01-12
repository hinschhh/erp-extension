"use client";

import { Table } from "antd";
import { Tables } from "@/types/supabase";

type OrderItems = Tables<"app_order_items"> &{
    app_products?: Pick<Tables<"app_products">, "bb_name"> | null;
    app_purchase_orders_positions_special?: Pick<Tables<"app_purchase_orders_positions_special">, "unit_price_net"> | null;
};

export default function OrderItemsList({ items }: { items: OrderItems[] }) {

    return (
        <Table dataSource={items} rowKey="id" pagination={false}>
            <Table.Column title="Produkt" dataIndex={["app_products", "bb_name"]} />
            <Table.Column title="Menge" dataIndex="bb_Quantity" />
            <Table.Column title="Preis" dataIndex="bb_TotalPrice" 
                render={(value) => `€ ${value?.toFixed(2)}`} 
            />
            <Table.Column title="Netto-Preis" dataIndex="bb_NetPrice"
                    render={(value, record) => `€ ${(value - (record.bb_TaxAmount ?? 0))}`}
            />
            <Table.Column title="Materialkosten" dataIndex={["app_purchase_orders_positions_special", "unit_price_net"]}
                render={(value) => value ? `€ ${value.toFixed(2)}` : "—"}
            />
            <Table.Column title="Rohertrag"
                render={(_, record) => {
                    const netPrice = record.bb_NetPrice ?? 0;
                    const materialCost = record.app_purchase_orders_positions_special?.unit_price_net ?? 0;
                    const grossProfit = netPrice - materialCost;
                    return `€ ${grossProfit.toFixed(2)}`;
                }}
            />
            <Table.Column title="Rohertragsmarge"
                render={(_, record) => {
                    const netPrice = record.bb_NetPrice ?? 0;
                    const materialCost = record.app_purchase_orders_positions_special?.unit_price_net ?? 0;
                    const grossProfit = netPrice - materialCost;
                    const grossMargin = netPrice > 0 ? (grossProfit / netPrice) * 100 : 0;
                    return `${grossMargin.toFixed(2)} %`;
                }}
            />
        </Table>
    );
}