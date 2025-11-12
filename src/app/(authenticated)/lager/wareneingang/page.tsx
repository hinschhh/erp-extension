"use client";

import { List, useTable,CreateButton, EditButton, DeleteButton, DateField } from "@refinedev/antd";
import { Table, Card, Space } from "antd";
import {Tables } from "@/types/supabase";
import { ISStatusTag } from "@components/common/tags/states/is";

type InboundShipment = Tables<"app_inbound_shipments">;

export default function InboundShipmentsListPage() {
const {tableProps} = useTable<InboundShipment>({
  resource: "app_inbound_shipments",
  meta: { select: "*, app_inbound_shipment_items(*, app_purchase_orders(invoice_number))" },
  sorters: { initial: [{ field: "created_at", order: "desc" }], mode: "server"  },
  filters: { initial: [], mode: "server" },
  pagination: { pageSize: 20 },
  syncWithLocation: true,
});

return (


<List
  title="Wareneingänge"
  headerButtons={
    <CreateButton hideText/>
  }
>
  <Table {...tableProps} rowKey="id">
    <Table.Column title="Wareneingangsnummer" dataIndex="inbound_number" sorter />
    <Table.Column title="Status" dataIndex="status" sorter 
    render={(_, record) => (
      <ISStatusTag status={record.status} />
    )}
    />
    <Table.Column
      title="Lieferdatum"
      dataIndex="arrived_at"
      sorter
      render={(_, record: InboundShipment) => (
        <DateField value={record.arrived_at} format="DD.MM.YYYY" />
      )}
    />
    <Table.Column title="Lieferscheinnummer" dataIndex="delivery_note_no" sorter />
    <Table.Column title="Rechnungsnummer" dataIndex={["app_inbound_shipment_items", "app_purchase_orders", "invoice_number"]} sorter />
    <Table.Column title="Lieferant" dataIndex="fk_bb_supplier" sorter />
    <Table.Column title="Notiz" dataIndex="notes" sorter />
    <Table.Column title="Aktionen" key="actions" render={(_, record) => (
      <Space>
        <EditButton hideText size="small" recordItemId={record.id} />
        <DeleteButton
          hideText
          size="small"
          recordItemId={record.id}
          mutationMode="pessimistic"          // sofort löschen (kein Undo)
          confirmTitle="Position wirklich löschen?"
          confirmOkText="Löschen"
          confirmCancelText="Abbrechen"
          onError={(err) => console.error("Delete error:", err)}
          disabled={(record.status === "posted")}
        />
      </Space>
    )} />
  </Table>
</List>

);
};

