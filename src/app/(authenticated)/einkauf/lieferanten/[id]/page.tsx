"use client";

import { EditButton, ListButton, RefreshButton, Show, useTable } from "@refinedev/antd";
import { useShow, useOne } from "@refinedev/core";
import { Tables } from "@/types/supabase";
import { Card, Col, DatePicker, Row, Space, Statistic, Table, Typography } from "antd";
import { useParams } from "next/navigation";
import { useState, useMemo } from "react";
import dayjs, { Dayjs } from "dayjs";
import { ClockCircleOutlined, EuroOutlined, ShoppingOutlined } from "@ant-design/icons";

const { RangePicker } = DatePicker;
const { Title } = Typography;

type SupplierWithOrders = Tables<"app_suppliers"> & {
    app_purchase_orders?: any[];
};
type NormalPosition = Tables<"app_purchase_orders_positions_normal"> & {
    app_products: Tables<"app_products"> | null;
};
type SpecialPosition = Tables<"app_purchase_orders_positions_special"> & {
    app_products: Tables<"app_products"> | null;
};
type Position = NormalPosition | SpecialPosition;

export default function LieferantShowPage() {
    const supplierId = useParams()?.id as string;
    
    // Zeitraum für Statistiken - Standard: letzte 90 Tage
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
        dayjs().subtract(90, 'day'),
        dayjs()
    ]);

    const { query: { data, isFetching, isError, refetch }} = useShow<SupplierWithOrders>({
        resource: "app_suppliers",
        id: supplierId,
        meta: { select: "*, app_purchase_orders(*, app_purchase_orders_positions_normal(*, app_inbound_shipment_items(app_inbound_shipments(delivered_at)), app_products!app_purchase_orders_positions_normal_billbee_product_id_fkey(*)), app_purchase_orders_positions_special(*, app_inbound_shipment_items(app_inbound_shipments(delivered_at)), app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(*)))" }
    });

    // Lade offene Bestellungen - gefiltert nach Zeitraum
    const { tableProps: openOrdersTableProps, tableQuery } = useTable({
        resource: "app_purchase_orders",
        syncWithLocation: false,
        filters: {
            permanent: [
                {
                    field: "supplier",
                    operator: "eq",
                    value: supplierId,
                },
                {
                    field: "status",
                    operator: "in",
                    value: ["draft", "ordered", "confirmed", "in_production"],
                },
            ],
        },
        meta: {
            select: "*, app_purchase_orders_positions_normal(*, app_products!app_purchase_orders_positions_normal_billbee_product_id_fkey(*)), app_purchase_orders_positions_special(*, app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(*))"
        },
        sorters: {
            initial: [
                {
                    field: "ordered_at",
                    order: "desc",
                },
            ],
        },
    });

    const supplier = data?.data;

    // Berechne Statistiken für offene Bestellungen - Stand heute
    const openOrdersStats = useMemo(() => {
        const orders = supplier?.app_purchase_orders?.filter(order => {
            return ["ordered", "confirmed", "in_production", "partially_in_production", "partially_delivered"].includes(order.status);
        }) || [];
        
        let totalValue = 0;
        let totalPositions = 0;

        orders.forEach((order: any) => {
            // Normale Positionen
            order.app_purchase_orders_positions_normal?.filter((position: Position) =>{ return ["ordered", "confirmed", "in_production"].includes(position.po_item_status as string)}).forEach((item: any) => {
                totalValue += (item.qty_ordered || 0) * (item.unit_price_net || 0);
                totalPositions++;
            });
            // Spezial-Positionen
            order.app_purchase_orders_positions_special?.filter((position: Position) =>{ return ["ordered", "confirmed", "in_production"].includes(position.po_item_status as string)}).forEach((item: any) => {
                totalValue += (item.qty_ordered || 0) * (item.unit_price_net || 0);
                totalPositions++;
            });
            // Versandkosten
            totalValue += order.shipping_cost_net || 0;
        });

        return {
            count: orders.length,
            totalValue,
            totalPositions,
        };
    }, [supplier?.app_purchase_orders]);

    // Berechne Zeitraum-Statistiken
    const periodStats = useMemo(() => {
        if (!supplier?.app_purchase_orders) return null;

        const [startDate, endDate] = dateRange;
        
        // 1. Lieferzeit-Analyse - gefiltert nach delivered_at im Zeitraum
        const deliveryTimes: number[] = [];
        supplier.app_purchase_orders.forEach((po: any) => {
            if (!po.ordered_at) return;
            
            // Sammle alle shipment delivered_at Daten
            const deliveredDates: { delivered_at: string, ordered_at: string }[] = [];
            
            po.app_purchase_orders_positions_normal?.forEach((item: any) => {
                item.app_inbound_shipment_items?.forEach((shipmentItem: any) => {
                    if (shipmentItem.app_inbound_shipments?.delivered_at) {
                        deliveredDates.push({
                            delivered_at: shipmentItem.app_inbound_shipments.delivered_at,
                            ordered_at: po.ordered_at
                        });
                    }
                });
            });
            
            po.app_purchase_orders_positions_special?.forEach((item: any) => {
                item.app_inbound_shipment_items?.forEach((shipmentItem: any) => {
                    if (shipmentItem.app_inbound_shipments?.delivered_at) {
                        deliveredDates.push({
                            delivered_at: shipmentItem.app_inbound_shipments.delivered_at,
                            ordered_at: po.ordered_at
                        });
                    }
                });
            });
            
            // Filtere nach Zeitraum und berechne Lieferzeit
            deliveredDates.forEach(({ delivered_at, ordered_at }) => {
                const deliveredDate = dayjs(delivered_at);
                if (deliveredDate.isAfter(startDate) && deliveredDate.isBefore(endDate.add(1, 'day'))) {
                    const leadTime = deliveredDate.diff(dayjs(ordered_at), 'day');
                    deliveryTimes.push(leadTime);
                }
            });
        });

        const avgLeadTime = deliveryTimes.length > 0
            ? deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length
            : null;

        // 2. Bestellvolumen - gefiltert nach ordered_at im Zeitraum
        let totalOrderVolume = 0;
        let ordersInPeriod = 0;
        
        supplier.app_purchase_orders.forEach((po: any) => {
            if (!po.ordered_at) return;
            const orderedDate = dayjs(po.ordered_at);
            
            if (orderedDate.isAfter(startDate) && orderedDate.isBefore(endDate.add(1, 'day'))) {
                ordersInPeriod++;
                
                po.app_purchase_orders_positions_normal?.forEach((item: any) => {
                    totalOrderVolume += (item.qty_ordered || 0) * (item.unit_price_net || 0);
                });
                
                po.app_purchase_orders_positions_special?.forEach((item: any) => {
                    totalOrderVolume += (item.qty_ordered || 0) * (item.unit_price_net || 0);
                });
                
                totalOrderVolume += po.shipping_cost_net || 0;
            }
        });

        return {
            avgLeadTime: avgLeadTime !== null ? Math.round(avgLeadTime) : null,
            deliveryCount: deliveryTimes.length,
            totalOrderVolume,
            ordersInPeriod,
        };
    }, [supplier?.app_purchase_orders, dateRange]);

    if (isFetching) {
        return <div>Lädt...</div>;
    }
    if (isError) {
        return <div>Fehler beim Laden des Lieferanten.</div>;
    }

    // Expandierte Zeilen für Drilldown
    const expandedRowRender = (record: any) => {
        const normalPositions = record.app_purchase_orders_positions_normal || [];
        const specialPositions = record.app_purchase_orders_positions_special || [];
        const allPositions = [...normalPositions, ...specialPositions];

        const columns = [
            {
                title: 'Artikel',
                dataIndex: ['app_products', 'id'],
                key: 'product',
                render: (_: any, position: any) => position.app_products?.bb_sku || 'Sonderartikel',
            },
            {
                title: 'Menge bestellt',
                dataIndex: 'qty_ordered',
                key: 'qty_ordered',
                render: (qty: number) => qty?.toFixed(2) || '0',
            },
            {
                title: 'Einzelpreis (netto)',
                dataIndex: 'unit_price_net',
                key: 'unit_price_net',
                render: (price: number) => `${(price || 0).toFixed(2)} €`,
            },
            {
                title: 'Gesamt (netto)',
                key: 'total',
                render: (_: any, position: any) => {
                    const total = (position.qty_ordered || 0) * (position.unit_price_net || 0);
                    return `${total.toFixed(2)} €`;
                },
            },
            {
                title: 'Status',
                dataIndex: 'po_item_status',
                key: 'status',
            },
        ];

        return (
            <Table
                columns={columns}
                dataSource={allPositions}
                pagination={false}
                rowKey={(pos: any) => pos.id}
                size="small"
            />
        );
    };

    return (
    <Show
         headerProps={{
                title: `Lieferant: ${supplier?.id ?? "--"}`,
                subTitle: `Kreditorennummer: ${supplier?.account_number ?? "--"}`,
            }}

            contentProps={{
                style: {background: "none", padding: "0px" },
            }}

            headerButtons={() => (
                <Space>
                    <EditButton title={"Bearbeiten"} recordItemId={supplierId} hideText/>
                    <ListButton hideText />
                    <RefreshButton hideText />
                </Space>
            )}
    >
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {/* Zeitraum-Statistiken */}
            <Card>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Title level={4} style={{ margin: 0 }}>Lieferanten-Statistiken</Title>
                        <RangePicker
                            value={dateRange}
                            onChange={(dates) => dates && setDateRange([dates[0]!, dates[1]!])}
                            format="DD.MM.YYYY"
                            allowClear={false}
                        />
                    </div>
                    
                    <Row gutter={16}>
                        <Col span={12}>
                            <Card>
                                <Statistic
                                    title="Durchschnittliche Lieferzeit"
                                    value={periodStats?.avgLeadTime ?? "N/A"}
                                    suffix="Tage"
                                    prefix={<ClockCircleOutlined />}
                                />
                                <div style={{ marginTop: 8, fontSize: 12 }}>
                                    Basierend auf {periodStats?.deliveryCount ?? 0} Lieferung(en) im Zeitraum
                                </div>
                            </Card>
                        </Col>
                        <Col span={12}>
                            <Card>
                                <Statistic
                                    title="Bestellvolumen (netto)"
                                    value={periodStats?.totalOrderVolume.toFixed(2) ?? "0.00"}
                                    suffix="€"
                                    prefix={<EuroOutlined />}
                                    precision={2}
                                />
                                <div style={{ marginTop: 8, fontSize: 12 }}>
                                    {periodStats?.ordersInPeriod ?? 0} Bestellung(en) im Zeitraum
                                </div>
                            </Card>
                        </Col>
                    </Row>
                </Space>
            </Card>

            {/* Offene Bestellungen */}
            <Card>
                <Title level={4} style={{ margin: 0 }}>Offene Bestellungen (Stand heute)</Title>
                <Row gutter={16} style={{ marginTop: 16 }}>
                    <Col span={24}>
                        <Card>
                            <Statistic
                                title={`Gesamtwert offener Bestellungen`}
                                value={openOrdersStats.totalValue.toFixed(2)}
                                suffix="€"
                                prefix={<ShoppingOutlined />}
                                precision={2}
                            />
                            <div style={{ marginTop: 8, fontSize: 12 }}>
                                {openOrdersStats.count} Bestellung(en) mit {openOrdersStats.totalPositions} Position(en)
                            </div>
                        </Card>
                    </Col>
                </Row>
            </Card>

            {/* Offene Bestellungen Tabelle */}
            <Card>
                <Title level={4}>Offene Bestellungen</Title>
                <Table
                    {...openOrdersTableProps}
                    rowKey="id"
                    expandable={{
                        expandedRowRender,
                        rowExpandable: (record) => {
                            const hasPositions = 
                                (record.app_purchase_orders_positions_normal?.length || 0) > 0 ||
                                (record.app_purchase_orders_positions_special?.length || 0) > 0;
                            return hasPositions;
                        },
                    }}
                    columns={[
                        {
                            title: 'Bestellnummer',
                            dataIndex: 'order_number',
                            key: 'order_number',
                        },
                        {
                            title: 'Status',
                            dataIndex: 'status',
                            key: 'status',
                        },
                        {
                            title: 'Bestelldatum',
                            dataIndex: 'ordered_at',
                            key: 'ordered_at',
                            render: (date: string) => date ? dayjs(date).format('DD.MM.YYYY') : '-',
                        },
                        {
                            title: 'Geplante Lieferung',
                            dataIndex: 'dol_planned_at',
                            key: 'dol_planned_at',
                            render: (date: string) => date ? dayjs(date).format('DD.MM.YYYY') : '-',
                        },
                        {
                            title: 'Positionen',
                            key: 'positions',
                            render: (_: any, record: any) => {
                                const normalCount = record.count_positions_normal || 0;
                                const specialCount = record.count_positions_special || 0;
                                return normalCount + specialCount;
                            },
                        },
                        {
                            title: 'Offene Menge',
                            dataIndex: 'qty_open_total',
                            key: 'qty_open_total',
                            render: (qty: number) => qty?.toFixed(2) || '0',
                        },
                    ]}
                />
            </Card>
        </Space>
    </Show>);
}