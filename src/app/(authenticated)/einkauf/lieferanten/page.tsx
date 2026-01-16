"use client";

import { CreateButton, DeleteButton, EditButton, List, Show, ShowButton, useTable } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Input, Space, Table } from "antd";

type Supplier =  Tables<"app_suppliers">;

export default function LieferantenPage() {

    const { tableProps, sorters, filters, setFilters } = useTable<Supplier>({
    resource: "app_suppliers",
    meta: { select: "*" },
    sorters: { initial: [{ field: "id", order: "desc" }], mode: "server" },
    })

    return (
    <List title="Einkauf - Bestellungen"
      headerButtons={
        <>
          <CreateButton hideText/>
        </>
      }
    >
        <Table rowKey="id" {...tableProps} >
            <Table.Column dataIndex="id" title="ID" sorter />
            <Table.Column dataIndex="default_order_channel" title="Bestellkanal" />
            <Table.Column dataIndex="default_payment_method" title="Zahlungsmethode" />
            <Table.Column dataIndex="default_leadtime_days" title="Lieferzeit in Tagen" />
            <Table.Column title="Aktionen" dataIndex="actions" render={(_, record) => (
                <Space>
                    <ShowButton hideText size="small" recordItemId={record.id} />
                    <EditButton hideText size="small" recordItemId={record.id} />
                    <DeleteButton hideText size="small" recordItemId={record.id} />
                </Space>
            )} 
            />
        </Table>
    </List>
    );
} 