"use client";

import { useTable, Show, ListButton, RefreshButton } from "@refinedev/antd";
import { useParams } from "next/navigation";
import { Tables } from "@/types/supabase";
import { Button, Descriptions, Table } from "antd";
import { useOne, useShow } from "@refinedev/core";
import { GlobalOutlined } from "@ant-design/icons";

type OrderItems = Tables<"app_order_items">;

export default function PageAuftragAnzeigen() {
    const params = useParams() as { id: string };
    const orderId = params?.id;

    const { queryResult } = useShow({
        resource: "app_orders",
        id: orderId,
        meta: { select: "*, app_customers(*)" },
    });

    const record = queryResult?.data?.data;

    const {tableProps} = useTable<OrderItems>({
        resource: "app_order_items",
        meta: { select: "*, app_products(*)" },
        pagination: { pageSize: 100 },
        filters: { permanent: [{ field: "fk_app_orders_id", operator: "eq", value: orderId }], mode: "server" },
        sorters: { initial:[{field:"id", order:"asc"}],mode: "server" },
    });

    console.log("Order ID:", orderId);

    return (
    <Show title="Auftrag anzeigen"
        headerButtons={<>
            <ListButton hideText />
            <RefreshButton hideText />
            <Button href={record?.bb_WebUrl} icon={<GlobalOutlined />} style={{backgroundColor: "#00bf63", color: "white"}}>Zu Billbee</Button>
        </>}
    >
        <Descriptions column={1} bordered>
            <Descriptions.Item label="Auftragsnummer">{record?.bb_OrderNumber}</Descriptions.Item>
            <Descriptions.Item label="Kunde">{record?.app_customers?.bb_Name}</Descriptions.Item>
            <Descriptions.Item label="Status">{record?.bb_State}</Descriptions.Item>
            <Descriptions.Item label="Erstellt am">{record?.bb_CreatedAt}</Descriptions.Item>
        </Descriptions>

        <Table {...tableProps} rowKey="id" style={{ marginTop: 24 }}>
            <Table.Column title="SKU" dataIndex={["app_products", "bb_sku"]} />
            <Table.Column title="Menge" dataIndex="bb_Quantity" />
            <Table.Column title="Preis" dataIndex="bb_TotalPrice" />
        </Table>


    </Show>

    );
}