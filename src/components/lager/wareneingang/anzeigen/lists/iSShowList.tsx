"use client";

import { Tables } from "@/types/supabase";
import { ISStatusTag } from "@components/common/tags/states/is";
import { formatCurrencyEUR } from "@utils/formats";
import { Col, List, Row, Space, Tag, Typography } from "antd";
import Link from "next/link";

export type InboundShipmentItem = Tables<"app_inbound_shipment_items"> & {
  app_purchase_orders?: Tables<"app_purchase_orders"> | null;

  app_purchase_orders_positions_normal?: (Tables<"app_purchase_orders_positions_normal"> & {
    app_products?: Tables<"app_products"> | null;
    app_orders?: (Pick<Tables<"app_orders">, "id" | "bb_OrderNumber"> & {
      app_customers?: Pick<Tables<"app_customers">, "bb_Name"> | null;
    }) | null;
  })| null;

  app_purchase_orders_positions_special?: (Tables<"app_purchase_orders_positions_special"> & {
    base_model?: Pick<
      Tables<"app_products">,
      "id" | "bb_sku" | "supplier_sku" | "purchase_details"
    > | null;

    billbee_product?: Pick<
      Tables<"app_products">,
      "id" | "bb_sku" | "inventory_cagtegory" | "purchase_details"
    > | null;

    app_orders?: (Pick<Tables<"app_orders">, "id" | "bb_OrderNumber"> & {
      app_customers?: Pick<Tables<"app_customers">, "bb_Name"> | null;
    }) | null;
  }) | null;
};

type Props = {
  itemsNormal: InboundShipmentItem[];
  itemsSpecial: InboundShipmentItem[];
  /** Optional: Überschrift über der Liste */
  title?: string;
};

const formatEUR = (v: number | null | undefined) =>
  typeof v === "number"
    ? v.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
    : "—";

const formatQty = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("de-DE", { maximumFractionDigits: 3 });
};

export default function InboundShipmentsList({itemsNormal, itemsSpecial, title}: Props) {
    return (
        <>
            {/*Normale Positionen*/}
            <Typography.Title level={5}>{title ?? "Wareneingangspositionen"}</Typography.Title>
            {itemsNormal.length > 0 && (
            <List
                dataSource={itemsNormal}
                renderItem={(item) => (
                    <List.Item style={{ paddingBlock: 12 }}>
                    <Row gutter={{ xs: 24, sm: 24, md: 24, lg: 24 }} style={{ width: "100%" }}>
                        <Col span={9} style={{ minWidth: 0 }}>
                            <Space direction="horizontal" size={8} style={{ width: "100%" }}>
                                <Typography.Text strong style={{ display: "block" }} ellipsis>
                                    <Link href={`../../artikel/anzeigen/${item.app_purchase_orders_positions_normal?.app_products?.id}`}>{item.app_purchase_orders_positions_normal?.app_products?.bb_sku ?? "bb_sku fehlt"}</Link>
                                </Typography.Text>
                                {(item.app_purchase_orders_positions_normal?.app_orders?.bb_OrderNumber && item.app_purchase_orders_positions_normal?.app_orders?.app_customers?.bb_Name) && (<Link href={`../../kundenberatung/auftrag/${item.app_purchase_orders_positions_normal?.app_orders?.id}`}><Tag>{item.app_purchase_orders_positions_normal?.app_orders?.bb_OrderNumber ?? "Bestellnummer fehlt"} - {item.app_purchase_orders_positions_normal?.app_orders?.app_customers?.bb_Name ?? "Kundenname fehlt"}</Tag></Link>)}
                            </Space>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                                    {item.app_purchase_orders_positions_normal?.app_products?.supplier_sku ?? (item?.app_purchase_orders_positions_normal?.app_products?.supplier_sku ?? "supplier_sku fehlt")}
                                </Typography.Text>
                                {item.app_purchase_orders_positions_normal?.internal_notes?.trim() ? (
                                    <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                                        Anmerkung: {item.app_purchase_orders_positions_normal?.internal_notes}
                                    </Typography.Text>
                                ) : null}
                            </Space>
                                
                        </Col>
                        <Col span={9}>
                            <Space direction="horizontal" align="end">
                                {!!!item.app_purchase_orders?.confirmation_number ? <></> : (<Tag color="geekblue"><strong>{item.app_purchase_orders?.confirmation_number ?? "--"}</strong></Tag>)}
                                <ISStatusTag status={item.item_status as string || ""} />
                            </Space>                        
                        </Col>
                        <Col span={3}>
                            <Space direction="vertical" align="end">
                                <Typography.Text style={{textAlign: "end"}}>
                                    {formatEUR((item.app_purchase_orders_positions_normal?.unit_price_net ?? 0) * (item.quantity_delivered ?? 0))}
                                </Typography.Text>
                                {typeof item.shipping_costs_proportional === "number" && (
                                    <Typography.Text type="secondary" style={{textAlign: "end"}}>
                                        zzgl. {formatEUR(item.shipping_costs_proportional)}
                                    </Typography.Text>
                                )}
                            </Space>
                        </Col>
                        <Col span={3}>
                            <Space direction="vertical" align="end">
                                <Typography.Text style={{textAlign: "end"}}>{formatQty(item.quantity_delivered)} von {formatQty(item.app_purchase_orders_positions_normal?.qty_ordered)}</Typography.Text>
                            </Space>
                        </Col>
                    </Row>
                </List.Item>
                )}
            />)}

            {/*Sonderpositionen*/}
            {itemsSpecial.length > 0 && (
            <List
                dataSource={itemsSpecial}
                renderItem={(item) => (
                    <List.Item style={{ paddingBlock: 12 }}>
                    <Row gutter={{ xs: 24, sm: 24, md: 24, lg: 24 }} style={{ width: "100%" }}>
                        <Col span={9} style={{ minWidth: 0 }}>
                            <Space direction="horizontal" size={8} style={{ width: "100%" }}>
                                <Typography.Text strong style={{ display: "block" }} ellipsis>
                                    <Link href={`../../artikel/anzeigen/${item.app_purchase_orders_positions_special?.base_model?.id ?? item.app_purchase_orders_positions_special?.billbee_product?.id}`}>
                                        {item.app_purchase_orders_positions_special?.base_model?.bb_sku ?? item.app_purchase_orders_positions_special?.billbee_product?.bb_sku ?? "bb_sku fehlt"}
                                    </Link>
                                </Typography.Text>
                                {!!!item.app_purchase_orders_positions_special ? <></> : (<Tag color={"orange-inverse"}>{"SB"}</Tag>)}
                                {(item.app_purchase_orders_positions_special?.app_orders?.bb_OrderNumber && item.app_purchase_orders_positions_special?.app_orders?.app_customers?.bb_Name) && (<Link href={`../../kundenberatung/auftrag/${item.app_purchase_orders_positions_special?.app_orders?.id}`}><Tag>{item.app_purchase_orders_positions_special?.app_orders?.bb_OrderNumber ?? "Bestellnummer fehlt"} - {item.app_purchase_orders_positions_special?.app_orders?.app_customers?.bb_Name ?? "Kundenname fehlt"}</Tag></Link>)}
                            </Space>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                                <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                                    {item.app_purchase_orders_positions_special?.supplier_sku ?? "nicht vergeben"}
                                </Typography.Text>
                                {item.app_purchase_orders_positions_special?.internal_notes?.trim() ? (
                                    <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                                        Anmerkung: {item.app_purchase_orders_positions_special?.internal_notes}
                                    </Typography.Text>
                                ) : null}
                                
                            </Space>
                                
                        </Col>
                        <Col span={9}>
                            <Space direction="horizontal" align="end">
                                {!!!item.app_purchase_orders?.confirmation_number ? <></> : (<Tag color="geekblue"><strong>{item.app_purchase_orders?.confirmation_number ?? "--"}</strong></Tag>)}
                                <ISStatusTag status={item.item_status as string || ""} />
                            </Space>                        
                        </Col>
                        <Col span={3}>
                            <Space direction="vertical" align="end">
                                <Typography.Text style={{textAlign: "end"}}>
                                    {formatEUR((item.app_purchase_orders_positions_special?.unit_price_net ?? 0) * (item.quantity_delivered ?? 0))}
                                </Typography.Text>
                                {typeof item.shipping_costs_proportional === "number" && (
                                    <Typography.Text type="secondary" style={{textAlign: "end"}}>
                                        zzgl. {formatEUR(item.shipping_costs_proportional)}
                                    </Typography.Text>
                                )}
                            </Space>
                        </Col>
                        <Col span={3}>
                            <Space direction="vertical" align="end">
                                <Typography.Text style={{textAlign: "end"}}>
                                    {formatQty(item.quantity_delivered)} von {formatQty(item.app_purchase_orders_positions_special?.qty_ordered)}
                                </Typography.Text>
                                {item.quantity_delivered < (item.app_purchase_orders_positions_special?.qty_ordered ?? 0) && (
                                    <Tag color={"orange"}>Teillieferung</Tag>
                                )}
                            </Space>
                        </Col>
                    </Row>
                </List.Item>
                )}
            />)}
        </>
    );
}