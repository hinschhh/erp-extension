"use client";
import { useEditableTable, DeleteButton, EditButton, SaveButton, NumberField } from "@refinedev/antd";
import { Button, Card, Form, InputNumber, Space, Table, Tag } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import SelectISItemModal from "./modals/selectItem";
import SelectPOOrderModal from "./modals/selectOrder";
import { Tables } from "@/types/supabase";
import { useMemo } from "react";
import { parseNumber } from "@utils/formats";
import { ISStatusTag } from "@components/common/tags/states/is";

type InboundItems = Tables<"app_inbound_shipment_items"> & {
  app_purchase_orders?: {
    order_number: string;
    invoice_number: string | null;
  };
  app_purchase_orders_positions_normal?: {
    qty_ordered: number;
    internal_notes: string | null;
    app_products?: {
      bb_sku: string;
      supplier_sku: string | null;
    };
  };
  app_purchase_orders_positions_special?: {
    qty_ordered: number;
    supplier_sku: string | null;
    internal_notes: string | null;
    order_confirmation_ref: string | null;
  };
};

/**
 * Berechnet qty_open für alle PO-Items basierend auf bereits zugeordneten Mengen
 */
function calculateQtyOpenMap(rows: readonly any[]): Record<string, number> {
  const qtyOrderedMap: Record<string, number> = {};
  const qtyDeliveredMap: Record<string, number> = {};

  rows.forEach((row) => {
    const poItemId = String(row.po_item_normal_id || row.po_item_special_id || "");
    if (!poItemId) return;

    // Sammle qty_ordered aus der PO-Position (nur einmal pro PO-Item)
    const poItem = row.po_item_normal_id 
      ? row.app_purchase_orders_positions_normal 
      : row.app_purchase_orders_positions_special;
    
    if (poItem && !qtyOrderedMap[poItemId]) {
      qtyOrderedMap[poItemId] = Number(poItem.qty_ordered ?? 0);
    }

    // Summiere alle quantity_delivered für dieses PO-Item
    qtyDeliveredMap[poItemId] = (qtyDeliveredMap[poItemId] ?? 0) + Number(row.quantity_delivered ?? 0);
  });

  // Berechne qty_open = qty_ordered - qty_delivered
  const result: Record<string, number> = {};
  Object.keys(qtyOrderedMap).forEach((poItemId) => {
    const ordered = qtyOrderedMap[poItemId] ?? 0;
    const delivered = qtyDeliveredMap[poItemId] ?? 0;
    result[poItemId] = Math.max(0, ordered - delivered);
  });

  return result;
}

export default function InboundItems({ inboundShipmentId, inboundShipmentStatus, inboundShipmentSupplier }: { inboundShipmentId: string, inboundShipmentStatus: "planned" | "delivered" | "posted", inboundShipmentSupplier: string }) {
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
      select: "id, shipment_id, order_id, po_item_normal_id, po_item_special_id, quantity_delivered, item_status, app_purchase_orders(order_number, invoice_number), app_purchase_orders_positions_normal(qty_ordered, internal_notes, app_products!billbee_product_id(bb_sku, supplier_sku)), app_purchase_orders_positions_special(qty_ordered, supplier_sku, internal_notes, order_confirmation_ref)",
    },
    filters: {
      permanent: [{ field: "shipment_id", operator: "eq", value: inboundShipmentId }],
    },
    sorters: { mode: "off" },
  });

  const form = formProps.form!;

  // Berechne qty_open für alle PO-Items aus den geladenen Daten
  const qtyOpenByPoItem = useMemo(
    () => calculateQtyOpenMap(tableProps?.dataSource ?? []),
    [tableProps?.dataSource]
  );

  // Hilfsfunktion: Maximal zulässige Menge = ursprünglicher Wert + aktuell offene Menge
  const getMaxForRow = (row: InboundItems, originalValue: number) => {
    const poItemId = row.po_item_normal_id || row.po_item_special_id;
    const open = poItemId ? qtyOpenByPoItem[String(poItemId)] ?? 0 : 0;
    return Math.max(0, Number(originalValue ?? 0) + open);
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
          <Table.Column title="Bestellung" dataIndex={["app_purchase_orders", "order_number"]} />
          <Table.Column title="Rechnung" dataIndex={["app_purchase_orders","invoice_number"]} />
          <Table.Column title="AB-Ref" dataIndex={["app_purchase_orders_positions_special", "order_confirmation_ref"]} />
          <Table.Column 
            title="Normal/Sonder" 
            dataIndex="po_item_normal_id"
            render={(_, record: InboundItems) => 
              record.po_item_normal_id ? <Tag color="default">Normal</Tag> : <Tag color="green">Sonder</Tag>
            } 
          />
          <Table.Column
            title="SKU"
            dataIndex={["app_purchase_orders_positions_normal", "app_products", "bb_sku"]}
          />
          <Table.Column 
            title="Ext. SKU" 
            render={(_, record: InboundItems) => 
              record.po_item_normal_id
                ? record.app_purchase_orders_positions_normal?.app_products?.supplier_sku ?? "—"
                : record.app_purchase_orders_positions_special?.supplier_sku ?? "—"
            } 
          />
          <Table.Column 
            title="Status" 
            dataIndex="item_status" 
            render={(_, record: InboundItems) => <ISStatusTag status={record.item_status ?? "planned"} />}
          />
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
                          if (num > max) return Promise.reject(`Maximal erlaubt: ${max.toFixed(3)}`);
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
                        if (v != null && v > max) form.setFieldValue("quantity_delivered", max);
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
            key="internal_notes"
            render={(_, record: InboundItems) => 
              record.app_purchase_orders_positions_normal?.internal_notes ??
              record.app_purchase_orders_positions_special?.internal_notes ??
              ""
            }
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
