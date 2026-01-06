"use client";

import React from "react";
import { Badge, Col, List, Row, Space, Tag, Typography } from "antd";
import type { Tables } from "@/types/supabase";
import Link from "next/link";
import { PoItemStatusTag } from "@components/common/tags/states/po_item";

type PoPositionNormal = Tables<"app_purchase_orders_positions_normal"> & {
  app_products?: Pick<Tables<"app_products">, "id" |"bb_sku" | "supplier_sku" | "purchase_details"> | null;
  app_orders?: Pick<Tables<"app_orders">, "bb_OrderNumber"> & {
    app_customers?: Pick<Tables<"app_customers">, "bb_Name"> | null;
  }| null;
  
};

type Props = {
  items: PoPositionNormal[];
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

export function PoPositionsNormalShowList({ items, title }: Props) {
  return (
    (items.length === 0) ? <Space/> :
    <div>
      {title ? (
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          {title}
        </Typography.Title>
      ) : null}

      <List
        dataSource={items}
        split
        renderItem={(item) => {
          const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
          const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;

          const qtySafe = Number.isFinite(qty) ? (qty as number) : 0;
          const unitSafe = Number.isFinite(unit) ? (unit as number) : 0;
          const total = qtySafe * unitSafe;

          return (
            <List.Item style={{ paddingBlock: 12 }}>
                <Row gutter={{ xs: 24, sm: 24, md: 24, lg: 24 }} style={{ width: "100%" }}>
                    <Col span={18} style={{ minWidth: 0 }}>
                        <Space direction="horizontal" size={8} style={{ width: "100%" }}>
                            <Typography.Text strong style={{ display: "block" }} ellipsis>
                                <Link href={`../../artikel/anzeigen/${item.app_products?.id}`}>{item.app_products?.bb_sku ?? "bb_sku fehlt"}</Link>
                            </Typography.Text>
                            <PoItemStatusTag status={item.po_item_status as string || ""} />
                            {(item.app_orders?.bb_OrderNumber && item.app_orders?.app_customers?.bb_Name) && (<Tag>{item.app_orders?.bb_OrderNumber ?? "Bestellnummer fehlt"} - {item.app_orders?.app_customers?.bb_Name ?? "Kundenname fehlt"}</Tag>)}
                        </Space>
                        <Space direction="vertical" size={2} style={{ width: "100%" }}>
                          <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                                  {item.app_products?.supplier_sku ?? "supplier_sku fehlt"}
                          </Typography.Text> 
                          <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                                  {item.app_products?.purchase_details ?? "purchase_details fehlen"}
                          </Typography.Text> 
                          {item.internal_notes?.trim() ? (
                              <Typography.Text type="secondary" style={{ display: "block" }} ellipsis>
                              Anmerkung: {item.internal_notes}
                              </Typography.Text>
                          ) : null}
                        </Space>
                    </Col>
                    <Col span={3}>
                      <Space direction="vertical" align="end">
                          <Typography.Text style={{textAlign: "end"}}>{formatQty(qtySafe)} x {formatEUR(unitSafe)}</Typography.Text>
                          <Typography.Text type="secondary" style={{textAlign: "end", fontSize:"90%"}}>COGS: {formatEUR(unitSafe + (item.shipping_costs_proportional ?? 0)/(qtySafe))}</Typography.Text>
                      </Space>
                    </Col>
                    <Col span={3} style={{ textAlign: "end", whiteSpace: "nowrap" }}>
                        <Space direction="horizontal" align="end">
                            <Typography.Text strong>{formatEUR(total)}</Typography.Text>
                        </Space>
                    </Col>
                </Row>
            </List.Item>
          );
        }}
      />
    </div>
  );
}
