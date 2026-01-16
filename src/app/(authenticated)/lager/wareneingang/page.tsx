"use client";

import { List, useTable,CreateButton, EditButton, DeleteButton, DateField, Show, ShowButton } from "@refinedev/antd";
import { Table, Card, Space } from "antd";
import {Tables } from "@/types/supabase";
import { ISStatusTag } from "@components/common/tags/states/is";

type InboundShipment = Tables<"app_inbound_shipments">;

export default function InboundShipmentsListPage() {
const {tableProps} = useTable<InboundShipment>({
  resource: "app_inbound_shipments",
  meta: { select: "*, app_inbound_shipment_items(*, app_purchase_orders_positions_normal(unit_price_net, qty_ordered), app_purchase_orders_positions_special(unit_price_net, qty_ordered),  app_purchase_orders(id, invoice_number, confirmation_number))" },
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
    <Table.Column
      title="Lieferdatum"
      dataIndex="delivered_at"
      sorter
      render={(_, record: InboundShipment) => (
        <DateField value={record.delivered_at} format="DD.MM.YYYY" />
      )}
    />
    <Table.Column title="Lieferant" dataIndex="fk_bb_supplier" sorter />
    <Table.Column title="Status" dataIndex="status" sorter 
    render={(_, record) => (
      <ISStatusTag status={record.status} />
    )}
    />
    <Table.Column title="Lieferscheinnummer" dataIndex="delivery_note_number" sorter />
    <Table.Column
      title="Rechnung(en)"
      render={(_, record) => {
        const items = record?.app_inbound_shipment_items ?? [];

        
        // Map: order_id -> { displayNumber, amount }
        const byOrder = new Map<string, { displayNumber: string; amount: number }>();
        let totalAmount = 0;

        for (const it of items) {
          const orderId = it?.app_purchase_orders?.id || "unbekannt";
          const displayNumber = it?.app_purchase_orders?.invoice_number 
            || it?.app_purchase_orders?.confirmation_number 
            || "fehlt";

          // Position (normal oder special)
          const pos =
            it.app_purchase_orders_positions_normal
            ??
            it.app_purchase_orders_positions_special;

          const unit = Number(pos?.unit_price_net ?? 1);
          const qtyDelivered = Number(it?.quantity_delivered ?? 0);

          // Basis: Preis * gelieferte Menge
          let amount = unit * qtyDelivered;

          const existing = byOrder.get(orderId);
          byOrder.set(orderId, {
            displayNumber,
            amount: (existing?.amount ?? 0) + amount,
          });

          totalAmount = totalAmount + amount;
        }



        // Sortiert nach displayNumber und formatiert ausgeben
        const entries = Array.from(byOrder.values()).sort((a, b) =>
          a.displayNumber.localeCompare(b.displayNumber, "de-DE")
        );

        if (!entries.length) return "—";

        return (
          <div>
            <strong>Gesamt: {totalAmount.toLocaleString("de-DE", {
              style: "currency",
              currency: "EUR",
              minimumFractionDigits: 2,
            })}</strong>
            {entries.map(({ displayNumber, amount }) => (
              <div key={displayNumber}>
                {`${displayNumber}: ${amount.toLocaleString("de-DE", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                })}`}
              </div>
            ))}
          </div>
        );
      }}
    />


    <Table.Column title="Notiz" dataIndex="notes" sorter />
    <Table.Column title="Aktionen" key="actions" render={(_, record) => (
      <Space>
        <ShowButton hideText size="small" recordItemId={record.id} />
        <EditButton hideText size="small" recordItemId={record.id} />
        <DeleteButton
          hideText
          size="small"
          recordItemId={record.id}
          mutationMode="pessimistic"          // sofort löschen (kein Undo)
          confirmTitle="Wareneingang wirklich löschen?"
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

