"use client";

import { useTable, Show, ListButton, RefreshButton } from "@refinedev/antd";
import { useParams } from "next/navigation";
import { Tables } from "@/types/supabase";
import { Button, Card, Col, Descriptions, Row, Space, Table, Timeline, Typography } from "antd";
import { useOne, useShow } from "@refinedev/core";
import { GlobalOutlined } from "@ant-design/icons";
import  OrderItemsList from "@components/kundenberatung/auftraege/show/lists/OrderItems";

type Orders = Tables<"app_orders">;
type OrderItems = Tables<"app_order_items">;

export default function PageAuftragAnzeigen() {
    const params = useParams() as { id: string };
    const orderId = params?.id;

    const { queryResult } = useShow({
        resource: "app_orders",
        id: orderId,
        meta: { select: "*, app_order_items(*, app_products(*), app_purchase_orders_positions_special(*), app_purchase_orders_positions_normal(*)), app_customers(*)" },
    });

    const order = queryResult?.data?.data;
    const items = order?.app_order_items || [];
    const itemsActive = items.filter((item: OrderItems) => item.is_active);

    console.log("Order ID:", orderId);

    return (
    <Show title="Auftrag anzeigen"
        headerButtons={<>
            <ListButton hideText />
            <RefreshButton hideText />
            <Button href={order?.bb_WebUrl} icon={<GlobalOutlined />} style={{backgroundColor: "#00bf63", color: "white"}}>Zu Billbee</Button>
        </>}
    >
        <Row gutter={16} style={{ padding: 0, margin: 0}}>
                <Col span={18} style={{ padding: 0, margin: 0}}>
                    <Card title="Zusammenfassung">
                        <Row gutter={24}>
                            <Col span={12}>
                                <Space direction="vertical" size={16}>
                                    <Typography.Text >Bestellsumme: </Typography.Text>
                                   
                                </Space>
                            </Col>
                            <Col span={12}>
                                <Space direction="vertical" size={16}>
                                    <Timeline>
                                        <Timeline.Item><strong>Bestellt am: </strong> </Timeline.Item>
                                       
                                    </Timeline>
                                </Space>
                            </Col>
                        </Row>
                    </Card>
                    <Card style={{ marginTop: 8 }}>
                        <Space direction="vertical" size={32} style={{ width: "100%" }}>
                            <OrderItemsList items={itemsActive} />
                        </Space>
                    </Card>
                </Col>
                <Col span={6}>
                <Card title="Anmerkungen">
                    <Typography.Text></Typography.Text>
                </Card>
                </Col>
            </Row>

    </Show>

    );
}