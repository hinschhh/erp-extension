"use client";

import React, { useEffect, useState } from "react";
import { NextPage } from "next";
import { useDataProvider } from "@refinedev/core";
import { Layout, PageHeader } from "@refinedev/antd";
import { Row, Col, Card, Table, Spin, Typography } from "antd";

// Interfaces (anpassen, falls Ihre Supabase-Schema anders heißt)
interface StockEntry {
    id: string;
    date: string;
    supplier_id: string;
    product_id: string;
    quantity: number;
}

interface PurchaseOrder {
    id: string;
    supplier_id: string;
    due_date: string;
    status: string;
}

interface Supplier {
    id: string;
    name: string;
}

const IncomingDashboard: NextPage = () => {
    const dataProvider = useDataProvider();
    const [loading, setLoading] = useState(true);

    // Kennzahlen
    const [receivedThisMonth, setReceivedThisMonth] = useState(0);
    const [outstandingTotal, setOutstandingTotal] = useState(0);

    // Listen
    const [outstandingBySupplier, setOutstandingBySupplier] = useState<Array<{ supplier: string; count: number }>>([]);
    const [recentEntries, setRecentEntries] = useState<StockEntry[]>([]);
    const [overdueOrders, setOverdueOrders] = useState<PurchaseOrder[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const now = new Date();
                const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

                // 1. Wareneingang diesen Monat
                const { data: entriesThisMonth } = await dataProvider().getList<StockEntry>({
                    resource: "stock_entries",
                    filters: [
                        { field: "date", operator: "gte", value: firstOfMonth }
                    ],
                });
                setReceivedThisMonth(entriesThisMonth.reduce((sum, e) => sum + e.quantity, 0));

                // 2. Aktuelle Außenstände (offene Bestellungen)
                const { data: outstanding } = await dataProvider().getList<PurchaseOrder>({
                    resource: "purchase_orders",
                    filters: [
                        { field: "status", operator: "ne", value: "received" }
                    ],
                });
                setOutstandingTotal(outstanding.length);

                // 3. Außenstände pro Lieferant
                const { data: suppliers } = await dataProvider().getList<Supplier>({ resource: "suppliers" });
                const bySupplier = suppliers.map(s => ({ supplier: s.name, count: 0 }));
                outstanding.forEach(o => {
                    const idx = bySupplier.findIndex(b => b.supplier === suppliers.find(s => s.id === o.supplier_id)?.name);
                    if (idx > -1) bySupplier[idx].count++;
                });
                setOutstandingBySupplier(bySupplier);

                // 4. Letzte Wareneingänge
                const { data: recent } = await dataProvider().getList<StockEntry>({
                    resource: "stock_entries",
                    sort: [{ field: "date", order: "desc" }],
                    pagination: { pageSize: 5 },
                });
                setRecentEntries(recent);

                // 5. Überfällige Lieferungen
                const today = now.toISOString();
                const { data: overdue } = await dataProvider().getList<PurchaseOrder>({
                    resource: "purchase_orders",
                    filters: [
                        { field: "status", operator: "ne", value: "received" },
                        { field: "due_date", operator: "lt", value: today }
                    ],
                });
                setOverdueOrders(overdue);

            } catch (error) {
                console.error("Error loading incoming dashboard:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [dataProvider]);

    return (
        <Layout>
            <PageHeader title="Wareneingang / Nachbestellungen" />
            <div style={{ padding: 24 }}>
                {loading ? (
                    <Spin />
                ) : (
                    <>
                        <Row gutter={16} style={{ marginBottom: 16 }}>
                            <Col span={12}>
                                <Card>
                                    <Typography.Title level={4}>Wareneingang diesen Monat</Typography.Title>
                                    <Typography.Title level={2}>{receivedThisMonth}</Typography.Title>
                                </Card>
                            </Col>
                            <Col span={12}>
                                <Card>
                                    <Typography.Title level={4}>Aktuelle Außenstände</Typography.Title>
                                    <Typography.Title level={2}>{outstandingTotal}</Typography.Title>
                                </Card>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Card title="Außenstände nach Lieferant" style={{ marginBottom: 16 }}>
                                    <Table
                                        dataSource={outstandingBySupplier}
                                        columns={[
                                            { title: "Lieferant", dataIndex: "supplier", key: "supplier" },
                                            { title: "Anzahl", dataIndex: "count", key: "count" },
                                        ]}
                                        pagination={false}
                                        rowKey="supplier"
                                    />
                                </Card>
                            </Col>
                            <Col span={12}>
                                <Card title="Überfällige Lieferungen" style={{ marginBottom: 16 }}>
                                    <Table
                                        dataSource={overdueOrders}
                                        columns={[
                                            { title: "ID", dataIndex: "id", key: "id" },
                                            { title: "Lieferant ID", dataIndex: "supplier_id", key: "supplier_id" },
                                            { title: "Fälligkeitsdatum", dataIndex: "due_date", key: "due_date" },
                                        ]}
                                        pagination={false}
                                        rowKey="id"
                                    />
                                </Card>
                            </Col>
                        </Row>

                        <Row gutter={16}>
                            <Col span={12}>
                                <Card title="Letzte Wareneingänge">
                                    <Table
                                        dataSource={recentEntries}
                                        columns={[
                                            { title: "Datum", dataIndex: "date", key: "date" },
                                            { title: "Lieferant ID", dataIndex: "supplier_id", key: "supplier_id" },
                                            { title: "Menge", dataIndex: "quantity", key: "quantity" },
                                        ]}
                                        pagination={false}
                                        rowKey="id"
                                    />
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>
        </Layout>
    );
};

export default IncomingDashboard;