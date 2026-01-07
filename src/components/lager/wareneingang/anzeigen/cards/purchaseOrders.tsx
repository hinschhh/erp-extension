"use client";

import { Tables } from "@/types/supabase";
import { Card, List, Space, Typography } from "antd";
import Link from "next/link";

type purchaseOrders = Tables<"app_purchase_orders">;

export default function PurchaseOrdersCard({purchaseOrders}: {purchaseOrders: purchaseOrders[]}) {
    return (
        <Card title="Enthaltene EK-Bestellungen" style={{ marginTop: 8, padding: 0 }}>
            <List
                dataSource={purchaseOrders}
                renderItem={item => (
                    <List.Item>
                        <Space direction="vertical" size={0}>
                            <Typography.Text><Link href={`/einkauf/bestellungen/${item.id}`}><strong> {item.order_number ?? "--"}</strong></Link></Typography.Text>
                            <Typography.Text type="secondary" style={{fontSize:"80%"}}>Auftragsbestätigung: <Link href={`${item.confirmation_file_url}`}>{item.confirmation_number ?? "--"}</Link></Typography.Text>
                       </Space>
                    </List.Item>
                )}
                style={{ marginTop: 0 }}
            />
            
        </Card>
    );
}