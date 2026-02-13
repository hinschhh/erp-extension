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
        meta: { 
            select: `*, 
                app_order_items(
                    *, 
                    app_products(
                        bb_sku, 
                        bb_name, 
                        bb_costnet, 
                        is_antique,
                        bb_is_bom,
                        bom_recipes!bom_recipes_billbee_bom_id_fkey(
                            quantity, 
                            billbee_component:app_products!bom_recipes_billbee_component_id_fkey(
                                bb_costnet
                            )
                        )
                    ), 
                    app_purchase_orders_positions_special(unit_price_net, order_id),
                    app_order_item_attributes(bb_Name, bb_Value)
                ), 
                app_customers(*)` 
        },
    });

    const order = queryResult?.data?.data;
    const items = order?.app_order_items || [];
    const itemsActive = items.filter((item: OrderItems) => item.is_active);
    const customer = order?.app_customers;

    // Zahlungsberechnungen
    const totalCost = order?.bb_TotalCost || 0;
    const paidAmount = order?.bb_PaidAmount || 0;
    const openAmount = totalCost - paidAmount;

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
                    <Card title="Bestelldetails">
                        <Descriptions column={2} bordered size="small">
                            <Descriptions.Item label="Bestellnummer">{order?.bb_OrderNumber || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Status">{order?.bb_State || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Bestellt am">
                                {order?.bb_CreatedAt ? new Date(order.bb_CreatedAt).toLocaleDateString("de-DE") : "—"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Rechnungsdatum">
                                {order?.bb_InvoiceDate ? new Date(order.bb_InvoiceDate).toLocaleDateString("de-DE") : "—"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Bestellsumme Brutto">
                                {order?.bb_TotalCost ? `€ ${Number(order.bb_TotalCost).toFixed(2)}` : "—"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Zahlungsart">{order?.bb_PaymentMethod || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Versandart" span={2}>{order?.bb_ShippingProviderId || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Bemerkungen" span={2}>
                                {order?.bb_Comments || order?.bb_SellerComment || "—"}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>
                    <Card style={{ marginTop: 8 }} title="Positionen">
                        <Space direction="vertical" size={32} style={{ width: "100%" }}>
                            <OrderItemsList items={itemsActive} />
                        </Space>
                    </Card>
                </Col>
                <Col span={6}>
                    <Card title="Kunde">
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="Name">{customer?.bb_Name || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Email">{customer?.bb_Email || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Telefon">{customer?.bb_Tel1 || "—"}</Descriptions.Item>
                            <Descriptions.Item label="Adresse">
                                {customer?.bb_Street && customer?.bb_Housenumber 
                                    ? `${customer.bb_Street} ${customer.bb_Housenumber}` 
                                    : "—"}
                            </Descriptions.Item>
                            <Descriptions.Item label="PLZ/Ort">
                                {customer?.bb_Zip && customer?.bb_City 
                                    ? `${customer.bb_Zip} ${customer.bb_City}` 
                                    : "—"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Land">{customer?.bb_CountryCode || "—"}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                    
                    <Card title="Zahlungsübersicht" style={{ marginTop: 8 }}>
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="Bestellsumme Brutto">
                                <Typography.Text strong>
                                    {totalCost > 0 ? `€ ${Number(totalCost).toFixed(2)}` : "€ 0,00"}
                                </Typography.Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Bezahlt">
                                <Typography.Text strong style={{ color: paidAmount > 0 ? "#52c41a" : "#8c8c8c" }}>
                                    {paidAmount > 0 ? `€ ${Number(paidAmount).toFixed(2)}` : "€ 0,00"}
                                </Typography.Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Offen">
                                <Typography.Text 
                                    strong 
                                    style={{ 
                                        color: openAmount > 0 ? "#faad14" : openAmount < 0 ? "#f5222d" : "#52c41a" 
                                    }}
                                >
                                    {openAmount !== 0 ? `€ ${Number(openAmount).toFixed(2)}` : "€ 0,00"}
                                </Typography.Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Zahlungsdatum">
                                {order?.bb_PayedAt 
                                    ? new Date(order.bb_PayedAt).toLocaleDateString("de-DE") 
                                    : "—"}
                            </Descriptions.Item>
                            <Descriptions.Item label="Zahlungsart">
                                {order?.bb_PaymentMethod || "—"}
                            </Descriptions.Item>
                        </Descriptions>
                        
                        <div style={{ marginTop: 16, padding: "8px 12px", backgroundColor: "#fafafa", borderRadius: "6px", borderLeft: "3px solid #1890ff" }}>
                            <Typography.Text style={{ fontSize: '13px', fontWeight: 500 }}>
                                Zahlungsstatus: {" "}
                                {openAmount <= 0 && paidAmount > 0 ? (
                                    <Typography.Text type="success" strong>Vollständig bezahlt</Typography.Text>
                                ) : paidAmount > 0 ? (
                                    <Typography.Text style={{ color: "#faad14" }} strong>Teilweise bezahlt</Typography.Text>
                                ) : (
                                    <Typography.Text type="secondary" strong>Unbezahlt</Typography.Text>
                                )}
                            </Typography.Text>
                        </div>
                    </Card>
                </Col>
            </Row>

    </Show>

    );
}