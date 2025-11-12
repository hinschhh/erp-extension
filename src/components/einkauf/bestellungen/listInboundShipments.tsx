"use client";
import { ISStatusTag } from "@components/common/tags/states/is";
import { useTable } from "@refinedev/antd";
import { Card, Table } from "antd";

export default function ZugehoerigeWareneingänge({ orderId }: { orderId: string }) {
    const { tableProps } = useTable({
        resource: "app_inbound_shipment_items",
        meta: { select: "*, app_inbound_shipments(id, inbound_number, fk_bb_supplier, status, arrived_at, delivery_note_no)" },
        filters: { initial: [{ field: "order_id", operator: "eq", value: orderId }], mode: "server" },
        pagination: { pageSize: 10 },
        syncWithLocation: false,
    });
  return (
    <Card title="Zugehörige Wareneingänge" style={{ marginTop: 24 }}>
        <Table {...tableProps}
        rowKey="id"
        >
            <Table.Column dataIndex="id" title="Wareneingangs-ID" hidden />
            <Table.Column dataIndex={["app_inbound_shipments", "inbound_number"]} title="Wareneingangsnummer" sorter
                render={(_, record) => {
                    return (<a href={`/lager/wareneingang/bearbeiten/${record.shipment_id}`}>{record.app_inbound_shipments?.inbound_number}</a>);
                }}
            />
            <Table.Column dataIndex={["app_inbound_shipments", "status"]} title="Status" 
                render={(_, record) => {
                        return (<ISStatusTag status={record.item_status} />);
                }}
            />
            <Table.Column dataIndex={["app_inbound_shipments", "delivery_note_no"]} title="Lieferscheinnummer" />
            <Table.Column dataIndex={["app_inbound_shipments", "arrived_at"]} title="Eingangsdatum"  sorter />
        </Table>
    </Card>
  );
}