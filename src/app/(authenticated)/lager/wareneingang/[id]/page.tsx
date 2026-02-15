"use client";

import { useShow } from "@refinedev/core";
import { Show, EditButton,  ListButton, RefreshButton, DateField } from "@refinedev/antd";
import { Card, Col, Row, Space, Typography } from "antd";
import { Tables } from "@/types/supabase";
import { useParams } from "next/navigation";
import { formatCurrencyEUR } from "@utils/formats";
import ProcessButton from "@components/einkauf/bestellungen/show/buttons/processButton";
import InboundShipmentsList from "@components/lager/wareneingang/anzeigen/lists/iSShowList";
import PurchaseOrdersCard from "@components/lager/wareneingang/anzeigen/cards/purchaseOrders";
import Link from "next/link";
import InventoryCategoriesCard from "@components/einkauf/bestellungen/show/cards/inventoryCategoriesCards";

export type InboundShipment = Tables<"app_inbound_shipments"> & {
  app_inbound_shipment_items?: (Tables<"app_inbound_shipment_items"> & {
    app_purchase_orders?: Tables<"app_purchase_orders"> | null;

    app_purchase_orders_positions_normal?: (Tables<"app_purchase_orders_positions_normal"> & {
      app_products?: Tables<"app_products"> | null;
    }) | null;

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
  })[];
};

export default function ViewPurchaseOrderPage() {
    const shipmentId = useParams().id as string;

    const { query: { data, isFetching, isError, refetch } } = useShow<InboundShipment>({
        id: shipmentId,
        resource: "app_inbound_shipments",
        meta: { select: "*, app_inbound_shipment_items(*, app_purchase_orders(*), app_purchase_orders_positions_normal(*, app_products(*)), app_purchase_orders_positions_special(*, base_model:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(id, bb_sku, supplier_sku, purchase_details), billbee_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(id, bb_sku, inventory_cagtegory, purchase_details), app_orders(id, bb_OrderNumber, app_customers(bb_Name))))" },
    });

    const shipment = data?.data;
    const items= shipment?.app_inbound_shipment_items || [];
    const itemsNormal = items
    .filter(i => i.app_purchase_orders_positions_normal)
    .sort((a, b) => {
        const orderA = a.app_purchase_orders?.order_number ?? "";
        const orderB = b.app_purchase_orders?.order_number ?? "";
        return orderA.localeCompare(orderB, "de", { numeric: true });
    });

    const itemsSpecial = items.filter(i => i.app_purchase_orders_positions_special)
    .sort((a, b) => {
        const orderA = a.app_purchase_orders?.order_number ?? "";
        const orderB = b.app_purchase_orders?.order_number ?? "";
        return orderA.localeCompare(orderB, "de", { numeric: true });
    });

    const purchaseOrders = items.map(item => item.app_purchase_orders);
    const uniquePurchaseOrders = Array.from(new Set(purchaseOrders.map(po => po?.id)))
        .map(id => purchaseOrders.find(po => po?.id === id))
        .filter((po): po is NonNullable<typeof po> => po !== null && po !== undefined);
    
    // FIXED: Use quantity_delivered from inbound shipment items instead of qty_ordered from PO items
    const sumFurniture = itemsNormal.filter(item => item.app_purchase_orders_positions_normal?.app_products?.inventory_cagtegory === "Möbel").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_normal?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_normal?.unit_price_net) : item.app_purchase_orders_positions_normal?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0) + itemsSpecial.filter(item => item.app_purchase_orders_positions_special?.billbee_product?.inventory_cagtegory === "Möbel").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_special?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_special?.unit_price_net) : item.app_purchase_orders_positions_special?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0);

    const sumTradeGoods = itemsNormal.filter(item => item.app_purchase_orders_positions_normal?.app_products?.inventory_cagtegory === "Handelswaren").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_normal?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_normal?.unit_price_net) : item.app_purchase_orders_positions_normal?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0) + itemsSpecial.filter(item => item.app_purchase_orders_positions_special?.billbee_product?.inventory_cagtegory === "Handelswaren").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_special?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_special?.unit_price_net) : item.app_purchase_orders_positions_special?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0);

    const sumParts = itemsNormal.filter(item => item.app_purchase_orders_positions_normal?.app_products?.inventory_cagtegory === "Bauteile").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_normal?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_normal?.unit_price_net) : item.app_purchase_orders_positions_normal?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0) + itemsSpecial.filter(item => item.app_purchase_orders_positions_special?.billbee_product?.inventory_cagtegory === "Bauteile").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_special?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_special?.unit_price_net) : item.app_purchase_orders_positions_special?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0);

    const sumStones = itemsNormal.filter(item => item.app_purchase_orders_positions_normal?.app_products?.inventory_cagtegory === "Naturstein").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_normal?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_normal?.unit_price_net) : item.app_purchase_orders_positions_normal?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0) + itemsSpecial.filter(item => item.app_purchase_orders_positions_special?.billbee_product?.inventory_cagtegory === "Naturstein").reduce((acc, item) => {
      const qty = typeof item.quantity_delivered === "string" ? Number(item.quantity_delivered) : item.quantity_delivered ?? 0;
      const unit = typeof item.app_purchase_orders_positions_special?.unit_price_net === "string" ? Number(item.app_purchase_orders_positions_special?.unit_price_net) : item.app_purchase_orders_positions_special?.unit_price_net ?? 0;
      return acc + qty * unit;
    }, 0);

    const sumInventoryCategories = [sumFurniture, sumTradeGoods, sumParts, sumStones]; 


    if (isFetching) {
        return <div>Lade Bestelldetails...</div>;
    }

    if (isError) {
        return <div>Fehler beim Laden der Bestelldetails.</div>;
    } 
    
    return (
        <Show
            headerProps={{
                title: `Wareneingang: ${shipment?.inbound_number ?? "--"}`,
               subTitle: <Space>{shipment?.fk_bb_supplier}</Space>
            }}

            contentProps={{
                style: {background: "none", padding: "0px" },
            }}

            headerButtons={() => (
                <Space>
                    <ProcessButton />
                    <EditButton title={"Bearbeiten"} recordItemId={shipmentId} hideText/>
                    <ListButton hideText />
                    <RefreshButton hideText />
                </Space>
            )}
        >   
            <Row gutter={16} style={{ padding: 0, margin: 0}}>
                <Col span={18} style={{ padding: 0, margin: 0}}>
                    <Card style={{ marginTop: 8 }}>
                        <Space direction="vertical" size={32} style={{ width: "100%" }}>
                            <InboundShipmentsList itemsNormal={itemsNormal ?? []} itemsSpecial={itemsSpecial ?? []} title="Gelieferte Positionen" />
                        </Space>
                    </Card>
                </Col>
                <Col span={6}>
                <Card title="Zusammenfassung">
                    <Space direction="vertical" size={0}>
                        <Space direction="horizontal" size={1}><strong>Geliefert am: </strong> {(!!!shipment?.delivered_at) ? "--" : <DateField format={"DD.MM.YYYY"} value={shipment?.delivered_at ?? undefined} />}</Space>
                        <Typography.Text type="secondary">Rechnung: <Link href={shipment?.invoice_file_url ?? "--"}>{shipment?.invoice_number}</Link></Typography.Text>
                        <Typography.Text type="secondary">Lieferschein: <Link href={shipment?.delivery_note_file_url ?? "--"}>{shipment?.delivery_note_number}</Link></Typography.Text>
                        <Typography.Text type="secondary">Lieferkosten (separat): {shipment?.shipping_cost === 0 ? "--" : formatCurrencyEUR(shipment?.shipping_cost)}</Typography.Text>
                    </Space>
                </Card>
                <Card title="Anmerkungen" style={{ marginTop: 8}}>
                    <Typography.Text>{"Keine Anmerkungen vorhanden."}</Typography.Text>
                </Card>
                <PurchaseOrdersCard purchaseOrders={uniquePurchaseOrders} />
                <InventoryCategoriesCard sumInventoryCategories={sumInventoryCategories} />
                </Col>
            </Row>
        </Show>
    );
}