"use client";
import { useEditableTable, DeleteButton, EditButton, SaveButton, NumberField } from "@refinedev/antd";
import { Button, Card, Form, InputNumber, Space, Table, message, Tag } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import SelectISItemModal from "./modals/selectItem";
import SelectPOOrderModal from "./modals/selectOrder";
import { Tables } from "@/types/supabase";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { parseNumber } from "@utils/formats";
import { ISStatusTag } from "@components/common/tags/states/is";
import TextArea from "antd/es/input/TextArea";

type InboundItems = Tables<"app_inbound_shipment_items">;

export default function InboundItems({ inboundShipmentId, inboundShipmentStatus, inboundShipmentSupplier }: { inboundShipmentId: string, inboundShipmentStatus: "planned" | "delivered" | "posted", inboundShipmentSupplier: string }) {
  const [qtyOpenByPoItem, setQtyOpenByPoItem] = useState<Record<string, number>>({});

  const {
    formProps,
    isEditing,
    setId,
    saveButtonProps,
    cancelButtonProps,
    editButtonProps,
    tableProps,
  } = useEditableTable<InboundItems>({
    resource: "app_inbound_shipment_items",
    pagination: { mode: "off" },
    meta: {
      // wir brauchen po_item_normal_id & order_id für das Nachladen der offenen Menge
      select: "id, shipment_id, order_id, po_item_normal_id, quantity_delivered, item_status, app_purchase_orders_positions_normal(app_products(bb_sku, supplier_sku), internal_notes), app_purchase_orders(order_number, invoice_number), app_purchase_orders_positions_special(supplier_sku, internal_notes, order_confirmation_ref)",
    },
    filters: {
      permanent: [
        {
          field: "shipment_id",
          operator: "eq",
          value: inboundShipmentId,
        },
      ],
    },
    sorters: {
      mode: "server",
    },
  });

  const form = formProps.form!;

  // Wenn Tabellen-Daten da sind: offene Mengen der zugehörigen PO-Positionen aus der View holen
  useEffect(() => {
      const loadQtyOpen = async () => {
        const supabase = supabaseBrowserClient;
        const rows = (tableProps?.dataSource as InboundItems[] | undefined) ?? [];
        const ids = Array.from(
          new Set(
          rows
            .map((r) => r.po_item_normal_id)
            .filter((x): x is string => Boolean(x))
        )
      );
      if (!ids.length) {
        setQtyOpenByPoItem({});
        return;
      }

      // Aus der View die offenen Mengen je Position holen
      const { data, error } = await supabase
        .from("app_purchase_orders_positions_normal_view")
        .select("id, qty_open")
        .in("id", ids);

      if (error) {
        console.error("Fehler beim Laden qty_open:", error);
        message.error("Konnte offene Mengen nicht laden.");
        return;
      }

      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { id: string; qty_open: number }[]) {
        map[String(r.id)] = Number(r.qty_open ?? 0);
      }
      setQtyOpenByPoItem(map);
    };

    loadQtyOpen();
  }, [tableProps?.dataSource]);

  // Hilfsfunktion: Maximal zulässige Menge = ursprünglicher Wert + aktuell offene Menge
  const getMaxForRow = (row: InboundItems, originalValue: number) => {
    const open = row.po_item_normal_id ? qtyOpenByPoItem[row.po_item_normal_id] ?? 0 : 0;
    const base = Number(originalValue ?? 0);
    const max = Math.max(0, base + open);
    return max;
  };

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3>Positionen</h3>
        <Space>
          <SelectISItemModal />
          <SelectPOOrderModal inboundShipmentId={inboundShipmentId} inboundShipmentStatus={inboundShipmentStatus} inboundShipmentSupplier={inboundShipmentSupplier} />
        </Space>
      </div>
      <Form {...formProps}>
        <Table
          {...tableProps}
          rowKey="id"
          onRow={(record) => ({
            onClick: (event: any) => {
              if (event.target.nodeName === "TD") {
                setId && setId(record.id);
              }
            },
          })}
        >
          <Table.Column title="Bestellung" dataIndex={["app_purchase_orders", "order_number"]} sorter />
          <Table.Column title="Rechnung" dataIndex={["app_purchase_orders","invoice_number"]} sorter />
          <Table.Column title="AB-Ref" dataIndex={["app_purchase_orders_positions_special", "order_confirmation_ref"]} sorter />
          <Table.Column title="Normal/Sonder" dataIndex="po_item_normal_id" sorter render={(_, record) => {
            if (record.po_item_normal_id) {
              return <Tag color="default">Normal</Tag>;
            }
            return <Tag color="green">Sonder</Tag>;
          }} />
          <Table.Column
            title="SKU"
            dataIndex={["app_purchase_orders_positions_normal", "app_products", "bb_sku"]}
            sorter
          />
          <Table.Column title="Ext. SKU" dataIndex={["app_purchase_orders_positions_normal", "app_products", "supplier_sku"]} render={(_, record) => {
            if (record.po_item_normal_id) {
              return record.app_purchase_orders_positions_normal?.app_products?.supplier_sku ?? "—";
            }
            return record.app_purchase_orders_positions_special?.supplier_sku ?? "—";

          }} />
          <Table.Column title="Status" dataIndex="item_status" render={(_, record) => {
            return (<ISStatusTag status={record.item_status} />);
          }}/>
          <Table.Column
            title="Menge (WE)"
            dataIndex="quantity_delivered"
            render={(value: number, record: InboundItems) => {
              if (isEditing(record.id)) {
                const max = getMaxForRow(record, Number(value ?? 0));
                return (
                  <Form.Item
                    name="quantity_delivered"
                    style={{ margin: 0 }}
                    initialValue={value}
                    rules={[
                      {
                        validator: async (_, v) => {
                          const num = parseNumber(v);
                          if (num == null || isNaN(num)) return Promise.reject("Bitte Zahl eingeben");
                          if (num < 0) return Promise.reject("Darf nicht negativ sein");
                          if (num > max)
                            return Promise.reject(
                              `Maximal erlaubt: ${max.toFixed(3)} (offen + ursprünglicher Wert)`
                            );
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <InputNumber
                      min={0}
                      max={max}
                      step={1}
                      style={{ width: "100%" }}
                      onBlur={(e) => {
                        const v = parseNumber((e.target as HTMLInputElement).value);
                        if (v != null && v > max) {
                          form.setFieldValue("quantity_delivered", max);
                        }
                      }}
                    />
                  </Form.Item>
                );
              }
              return <NumberField value={value} />;
            }}
          />
          <Table.Column 
            title="Anmerkungen"
            dataIndex="internal_notes"
            render={(_, record) => {
                const notes =
                record.app_purchase_orders_positions_normal?.internal_notes ??
                record.app_purchase_orders_positions_special?.internal_notes ??
                "";
              return <div>{notes}</div>;
            }}
          />
          <Table.Column
            title="Aktionen"
            key="actions"
            fixed="right"
            render={(_, record: InboundItems) => {
              if (isEditing(record.id)) {
                return (
                  <Space>
                    <SaveButton {...saveButtonProps} hideText size="small" />
                    <Button {...cancelButtonProps} size="small">
                      <CloseOutlined />
                    </Button>
                  </Space>
                );
              }
              return (
                <Space>
                  <EditButton {...editButtonProps(record.id)} hideText size="small" />
                  <DeleteButton
                    hideText
                    size="small"
                    resource="app_inbound_shipment_items"
                    recordItemId={record.id}
                    mutationMode="pessimistic"
                    confirmTitle="Position wirklich löschen?"
                    confirmOkText="Löschen"
                    confirmCancelText="Abbrechen"
                    onError={(err) => console.error("Delete error:", err)}
                    disabled={record.item_status === "posted"}
                  />
                </Space>
              );
            }}
          />
        </Table>
      </Form>
    </Card>
  );
}
