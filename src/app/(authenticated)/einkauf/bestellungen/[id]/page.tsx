"use client";

import { useShow } from "@refinedev/core";
import { Show, EditButton, DateField, SaveButton, ListButton, RefreshButton } from "@refinedev/antd";
import { Button, Card, Col, Dropdown, Row, Space, Timeline, Typography } from "antd";
import { Tables } from "@/types/supabase";
import { useParams } from "next/navigation";
import Link from "next/link";
import { DownOutlined } from "@ant-design/icons";
import { PoStatusTag } from "@components/common/tags/states/po";
import { PoPositionsNormalShowList } from "@components/einkauf/bestellungen/show/lists/normalItems";
import InboundShipmentsCard from "@components/einkauf/bestellungen/show/cards/inboundShipmentCards";
import InventoryCategoriesCard from "@components/einkauf/bestellungen/show/cards/inventoryCategoriesCards";
import { PoPositionsSpecialShowList } from "@components/einkauf/bestellungen/show/lists/specialItems";
import { formatCurrencyEUR } from "@utils/formats";
import OrderStatusActionButton from "@components/common/buttons/po_order_confirm";
import ProcessButton from "@components/einkauf/bestellungen/show/buttons/processButton";

export type PurchaseOrder = Tables<"app_purchase_orders"> & {
  app_inbound_shipment_items?: (Pick<
    Tables<"app_inbound_shipment_items">,
    "id" | "order_id" | "shipment_id"
  > & {
    app_inbound_shipments?: Pick<
      Tables<"app_inbound_shipments">,
      "inbound_number" | "invoice_number" | "invoice_file_url" | "delivery_note_number" | "delivery_note_file_url" | "delivered_at"
    >[];
  })[];
} & {
  app_purchase_orders_positions_normal?: (Tables<"app_purchase_orders_positions_normal"> & {
    app_products?: Pick<Tables<"app_products">, "id" |"bb_sku" | "supplier_sku" | "inventory_cagtegory" | "purchase_details"> | null;
    app_inbound_shipment_items?: (Pick<
      Tables<"app_inbound_shipment_items">,
      "id" | "order_id" | "shipment_id"
    > & {
      app_inbound_shipments?: Pick<
        Tables<"app_inbound_shipments">,
        "inbound_number" | "invoice_number" | "invoice_file_url" | "delivery_note_number" | "delivery_note_file_url" | "delivered_at"
      >[];
    })[];
  })[];
  app_purchase_orders_positions_special?: (Tables<"app_purchase_orders_positions_special"> & {
    "base_model": Pick<Tables<"app_products">, "id" |"bb_sku" | "supplier_sku" | "purchase_details">;
    "billbee_product": Pick<Tables<"app_products">, "id" |"bb_sku" | "inventory_cagtegory" | "purchase_details">;
    app_inbound_shipment_items?: (Pick<
      Tables<"app_inbound_shipment_items">,
      "id" | "order_id" | "shipment_id"
    > & {
      app_inbound_shipments?: Pick<
        Tables<"app_inbound_shipments">,
        "inbound_number" | "invoice_number" | "invoice_file_url" | "delivery_note_number" | "delivery_note_file_url" | "delivered_at"
      >[];
    })[];
  })[];
};

export default function ViewPurchaseOrderPage() {
    const orderId = useParams().id as string;

    const { query: { data, isFetching, isError, refetch } } = useShow<PurchaseOrder>({
        id: orderId,
        resource: "app_purchase_orders",
        meta: { select: "*, app_purchase_orders_positions_normal(*, app_products(id, bb_sku, supplier_sku, inventory_cagtegory, purchase_details), app_orders(id, bb_OrderNumber, app_customers(bb_Name)), app_inbound_shipment_items(app_inbound_shipments(id, inbound_number, invoice_number, invoice_file_url, delivery_note_number, delivery_note_file_url, delivered_at))), app_purchase_orders_positions_special(*, base_model:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(id, bb_sku, supplier_sku, purchase_details), billbee_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(id, bb_sku, inventory_cagtegory, purchase_details), app_orders(id, bb_OrderNumber, app_customers(bb_Name)), app_inbound_shipment_items(app_inbound_shipments(id, inbound_number, invoice_number, invoice_file_url, delivery_note_number, delivery_note_file_url, delivered_at)))" },
    });

    const order = data?.data;
    const itemsNormal = data?.data.app_purchase_orders_positions_normal;
    const itemsSpecial = data?.data.app_purchase_orders_positions_special;
    const inboundShipmentsNormal = order?.app_purchase_orders_positions_normal?.flatMap((item) =>
      item.app_inbound_shipment_items?.flatMap((isi) => isi.app_inbound_shipments ?? []) ?? []
    ) ?? [];
    const inboundShipmentsSpecial = order?.app_purchase_orders_positions_special?.flatMap((item) =>
      item.app_inbound_shipment_items?.flatMap((isi) => isi.app_inbound_shipments ?? []) ?? []
    ) ?? [];

    const inboundShipments = inboundShipmentsNormal.concat(inboundShipmentsSpecial);
    const uniqueInboundShipments = inboundShipments.filter((s, i, arr) =>
      arr.findIndex(t => t.inbound_number === s.inbound_number && t.delivery_note_number === s.delivery_note_number) === i
    );

    const itemsNormalTotal = itemsNormal?.reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      return acc + qty * unit;
    }, 0) ?? 0;

    const itemsNormalDeliveredTotal = itemsNormal?.filter(item => item.po_item_status === "delivered").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      return acc + qty * unit;
    }, 0) ?? 0;

    const itemsSpecialTotal = itemsSpecial?.reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      return acc + qty * unit;
    }, 0) ?? 0;;

    const itemsSpecialDeliveredTotal = itemsSpecial?.filter(item => item.po_item_status === "delivered").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      return acc + qty * unit;
    }, 0) ?? 0;

    const deliveredTotal = itemsNormalDeliveredTotal+itemsSpecialDeliveredTotal;
    const orderTotal = itemsNormalTotal + itemsSpecialTotal;
    const openTotal = orderTotal - deliveredTotal;

    const sumFurniture = (itemsNormal ?? []).filter(item => item.app_products?.inventory_cagtegory === "Möbel").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0) + (itemsSpecial ?? []).filter(item => item.billbee_product.inventory_cagtegory === "Möbel").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0);
    const sumTradeGoods = (itemsNormal ?? []).filter(item => item.app_products?.inventory_cagtegory === "Handelswaren").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0) + (itemsSpecial ?? []).filter(item => item.billbee_product.inventory_cagtegory === "Handelswaren").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0);
    const sumParts = (itemsNormal ?? []).filter(item => item.app_products?.inventory_cagtegory === "Bauteile").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0) + (itemsSpecial ?? []).filter(item => item.billbee_product.inventory_cagtegory === "Bauteile").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0);
    const sumStones = (itemsNormal ?? []).filter(item => item.app_products?.inventory_cagtegory === "Naturstein").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0) + (itemsSpecial ?? []).filter(item => item.billbee_product.inventory_cagtegory === "Naturstein").reduce((acc, item) => {
      const qty = typeof item.qty_ordered === "string" ? Number(item.qty_ordered) : item.qty_ordered;
      const unit = typeof item.unit_price_net === "string" ? Number(item.unit_price_net) : item.unit_price_net;
      const shippingCost = typeof item.shipping_costs_proportional === "string" ? Number(item.shipping_costs_proportional) : item.shipping_costs_proportional;
      return acc + qty * unit + shippingCost;
    }, 0);
    const sumInventoryCategories = [sumFurniture, sumTradeGoods, sumParts, sumStones];
    const fullyDeliveredAt = uniqueInboundShipments.reduce<
        (typeof uniqueInboundShipments)[number] | null
        >((latest, current) => {
        const cur = current?.delivered_at ? new Date(current.delivered_at).getTime() : -Infinity;
        const lat = latest?.delivered_at ? new Date(latest.delivered_at).getTime() : -Infinity;

        return cur > lat ? current : latest;
    }, null);
 

    if (isFetching) {
        return <div>Lade Bestelldetails...</div>;
    }

    if (isError) {
        return <div>Fehler beim Laden der Bestelldetails.</div>;
    } 
    
    return (
        <Show
            headerProps={{
                title: `Bestellung: ${order?.order_number ?? "--"}`,
               subTitle: <Space>{order?.supplier} <PoStatusTag status={order?.status ??"--"} /></Space>
            }}

            contentProps={{
                style: {background: "none", padding: "0px" },
            }}

            headerButtons={() => (
                <Space>
                    <ProcessButton order={order} />
                    <EditButton title={"Bearbeiten"} recordItemId={orderId} hideText/>
                    <ListButton hideText />
                    <RefreshButton hideText />
                </Space>
            )}
        >   
            <Row gutter={16} style={{ padding: 0, margin: 0}}>
                <Col span={18} style={{ padding: 0, margin: 0}}>
                    <Card title="Zusammenfassung">
                        <Row gutter={24}>
                            <Col span={12}>
                                <Space direction="vertical" size={16}>
                                    <Typography.Text >Bestellsumme: {formatCurrencyEUR(orderTotal) ?? "--"}</Typography.Text>
                                    <Typography.Text style={{marginLeft: 16}}>Offen: {formatCurrencyEUR(openTotal) ?? "--"}</Typography.Text>
                                    <Typography.Text style={{marginLeft: 16}}>Geliefert: {formatCurrencyEUR(deliveredTotal) ?? "--"}</Typography.Text>
                                    <Typography.Text >Versandkosten: {formatCurrencyEUR(order?.shipping_cost_net) ?? "--"}</Typography.Text>
                                    <Typography.Text strong>Gesamtsumme: {formatCurrencyEUR(orderTotal + (order?.shipping_cost_net ?? 0)) ?? "--"}</Typography.Text>
                                </Space>
                            </Col>
                            <Col span={12}>
                                <Space direction="vertical" size={16}>
                                    <Timeline>
                                        <Timeline.Item><strong>Bestellt am: </strong> {(!!!order?.ordered_at) ? "--" : <DateField format={"DD.MM.YYYY"} value={order?.ordered_at ?? undefined} />}</Timeline.Item>
                                        <Timeline.Item>
                                            <Space direction="vertical" size={0}>
                                                <Space direction="horizontal" size={1}><strong>Bestätigt am: </strong> {(!!!order?.confirmed_at) ? "--" : <DateField format={"DD.MM.YYYY"} value={order?.confirmed_at ?? undefined} />}</Space>
                                                {(!!!order?.confirmed_at) ? null : <Typography.Text type="secondary" style={{fontSize:"80%"}}>Auftragsbestätigung: <Link href={order?.confirmation_file_url ?? "--"}>{order?.confirmation_number}</Link></Typography.Text>}
                                            </Space>
                                        </Timeline.Item>
                                        <Timeline.Item>{(!!!fullyDeliveredAt) ? (!!!order?.dol_planned_at ? <><strong>Geliefert am:</strong> "--"</> : <Typography.Text type="secondary"><strong>Vrstl. geliefert am: </strong><DateField format={"DD.MM.YYYY"} value={order?.dol_planned_at ?? undefined} type="secondary" /></Typography.Text>) : <><strong>Geliefert am: </strong><DateField format={"DD.MM.YYYY"} value={fullyDeliveredAt?.delivered_at ?? undefined} /></>}</Timeline.Item>
                                    </Timeline>
                                </Space>
                            </Col>
                        </Row>
                    </Card>
                    <Card style={{ marginTop: 8 }}>
                        <Space direction="vertical" size={32} style={{ width: "100%" }}>
                            <PoPositionsNormalShowList items={itemsNormal ?? []} title="Normale Positionen" />
                            <PoPositionsSpecialShowList items={itemsSpecial ?? []} title="Sonderpositionen" />
                        </Space>
                    </Card>
                </Col>
                <Col span={6}>
                <Card title="Anmerkungen">
                    <Typography.Text>{order?.notes ?? "Keine Anmerkungen vorhanden."}</Typography.Text>
                </Card>
                <InboundShipmentsCard inboundShipments={uniqueInboundShipments} />
                <InventoryCategoriesCard sumInventoryCategories={sumInventoryCategories}/>
                </Col>
            </Row>
        </Show>
    );
}