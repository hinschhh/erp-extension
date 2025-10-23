"use client";

import { List, useTable } from "@refinedev/antd";
import { Table, Card, Space } from "antd";
import {Tables, TablesInsert, TablesUpdate} from "@/types/supabase";

type InboundShipmentRow = Tables<"app_inbound_shipments">;
type InboundShipmentCreate = TablesInsert<"app_inbound_shipments">;
type InboundShipmentUpdate = TablesUpdate<"app_inbound_shipments">;

export default function InboundShipmentsListPage() {
const {tableProps} = useTable<InboundShipmentRow>({
  resource: "app_inbound_shipments",
});

const columns = [ 
  { title: "Eingang am", dataIndex: "arrived_at" },
  { title: "Lieferschein", dataIndex: "shipment_no" },
  { title: "Carrier", dataIndex: "carrier" },
  { title: "Tracking", dataIndex: "tracking_no" },
  { title: "Notiz", dataIndex: "note" },
];

return (
<>

<List>
  <Card title="Wareneingänge">
    <Space>Hier können Wareneingänge verwaltet werden.</Space>
  </Card>
  <Table {...tableProps} rowKey="id" columns={columns} />
</List>
</>
);
};

