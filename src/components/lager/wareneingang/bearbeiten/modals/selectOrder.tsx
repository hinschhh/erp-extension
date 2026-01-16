"use client";

import { useCreateMany, useOne } from "@refinedev/core";
import { useRouter } from "next/navigation";
import { FolderOpenOutlined } from "@ant-design/icons";
import { Button, Form, Select, Table } from "antd";
import { useModalForm, useSelect, useTable } from "@refinedev/antd";
import Modal from "antd/es/modal/Modal";
import { Tables } from "@/types/supabase";
import { useEffect, useMemo, useState } from "react";

type POItemsNormal = Tables<"app_purchase_orders_positions_normal">;
type POItemsSpecial = Tables<"app_purchase_orders_positions_special">;

/**
 * Berechnet offene Menge und reichert Positionsdaten an
 */
function enrichPositionData(rows: readonly any[], receivedItemsKey: string) {
  return rows.map((row) => {
    const qtyOrdered = Number(row.qty_ordered ?? 0);
    const items = row[receivedItemsKey] || [];
    const qtyReceived = items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity_delivered || 0),
      0
    );
    const qtyOpen = Math.max(qtyOrdered - qtyReceived, 0);

    return { ...row, qty_received: qtyReceived, qty_open: qtyOpen };
  });
}

export default function SelectPOOrderModal({
  inboundShipmentId,
  inboundShipmentStatus,
  inboundShipmentSupplier,
}: {
  inboundShipmentId: string;
  inboundShipmentStatus: "planned" | "delivered" | "posted";
  inboundShipmentSupplier: string;
}) {
  const [selectedNormalIds, setSelectedNormalIds] = useState<string[]>([]);
  const [selectedSpecialIds, setSelectedSpecialIds] = useState<string[]>([]);

  const router = useRouter();

  const { data: shipmentData } = useOne({
    resource: "app_inbound_shipments",
    id: inboundShipmentId,
    meta: { select: "id,status" },
  });

  const { formProps, modalProps, show, form } = useModalForm({
    action: "create",
    resource: "app_inbound_shipment_items",
    redirect: false,
    warnWhenUnsavedChanges: false,
  });

  const { mutate: createItems } = useCreateMany();

  const { selectProps: selectPropsPO } = useSelect({
    resource: "app_purchase_orders",
    optionLabel: (item) => {
      const date = item.ordered_at ? new Date(item.ordered_at).toLocaleDateString() : "kein Datum";
      return `${item.order_number ?? "ohne Nummer"} - (${item.supplier ?? "unbekannt"} - ${item.invoice_number ?? "—"}) vom ${date}`;
    },
    sorters: [{ field: "ordered_at", order: "desc" }],
    filters: [
      { field: "ordered_at", operator: "nnull", value: null },
      { field: "status", operator: "ne", value: "delivered" },
      { field: "supplier", operator: "eq", value: inboundShipmentSupplier },
    ],
    onSearch: (value) => [
      {
        field: "multi-filter",
        operator: "or",
        value: [
          { field: "order_number", operator: "contains", value: `%${value}%` },
          { field: "supplier", operator: "contains", value: `%${value}%` },
          { field: "invoice_number", operator: "contains", value: `%${value}%` },
        ],
      },
    ],
    meta: { or: true },
  });

  const orderId: string | null = Form.useWatch("order_id", form);

  // Zentrale Query: Normale Positionen mit Produkt-Info und bereits gelieferten Items
  const { tableProps: tablePropsNormal } = useTable<POItemsNormal>({
    resource: "app_purchase_orders_positions_normal",
    filters: {
      mode: "server",
      permanent: [{ field: "order_id", operator: "eq", value: orderId }],
    },
    meta: {
      select:
        "id, order_id, qty_ordered, billbee_product_id, app_products!billbee_product_id(bb_sku), app_inbound_shipment_items!po_item_normal_id(quantity_delivered)",
    },
    queryOptions: { enabled: !!orderId },
  });

  // Zentrale Query: Sonderpositionen mit allen Produkt-Infos und bereits gelieferten Items
  const { tableProps: tablePropsSpecial } = useTable<POItemsSpecial>({
    resource: "app_purchase_orders_positions_special",
    filters: {
      mode: "server",
      permanent: [{ field: "order_id", operator: "eq", value: orderId }],
    },
    meta: {
      select:
        "id, order_id, qty_ordered, supplier_sku, internal_notes, order_confirmation_ref, base_product:app_products!base_model_billbee_product_id(bb_sku), special_product:app_products!billbee_product_id(bb_sku), app_inbound_shipment_items!po_item_special_id(quantity_delivered)",
    },
    queryOptions: { enabled: !!orderId },
  });

  // Reichere Daten mit berechneten Feldern an
  const enrichedNormalData = useMemo(
    () => enrichPositionData(tablePropsNormal?.dataSource ?? [], "app_inbound_shipment_items"),
    [tablePropsNormal?.dataSource]
  );

  const enrichedSpecialData = useMemo(
    () => enrichPositionData(tablePropsSpecial?.dataSource ?? [], "app_inbound_shipment_items"),
    [tablePropsSpecial?.dataSource]
  );

  // Auto-select alle offenen Positionen beim Laden einer Bestellung
  useEffect(() => {
    if (!orderId) {
      setSelectedNormalIds([]);
      return;
    }
    const ids = enrichedNormalData.map((r) => String(r.id));
    setSelectedNormalIds(ids);
  }, [orderId, enrichedNormalData]);

  useEffect(() => {
    if (!orderId) {
      setSelectedSpecialIds([]);
      return;
    }
    const ids = enrichedSpecialData.map((r) => String(r.id));
    setSelectedSpecialIds(ids);
  }, [orderId, enrichedSpecialData]);

  const handleSave = async () => {
    const vals = await form.validateFields().catch(() => null);
    if (!vals || !orderId) return;
    if (!selectedNormalIds.length && !selectedSpecialIds.length) return;

    // Erstelle Payload aus ausgewählten Positionen
    const createPayload = (
      ids: string[],
      data: any[],
      poItemKey: "po_item_normal_id" | "po_item_special_id"
    ) =>
      ids
        .map((id) => {
          const row = data.find((r) => String(r.id) === id);
          if (!row || row.qty_open <= 0) return null;
          return {
            shipment_id: inboundShipmentId,
            order_id: orderId,
            [poItemKey]: id,
            [poItemKey === "po_item_normal_id" ? "po_item_special_id" : "po_item_normal_id"]: null,
            quantity_delivered: row.qty_open,
            item_status: inboundShipmentStatus,
          };
        })
        .filter(Boolean);

    const allItems = [
      ...createPayload(selectedNormalIds, enrichedNormalData, "po_item_normal_id"),
      ...createPayload(selectedSpecialIds, enrichedSpecialData, "po_item_special_id"),
    ].filter((item): item is NonNullable<typeof item> => item !== null);

    if (allItems.length === 0) return;

    createItems(
      {
        resource: "app_inbound_shipment_items",
        values: allItems,
        successNotification: { message: "Wareneingang-Positionen gespeichert", type: "success" },
        errorNotification: { message: "Speichern fehlgeschlagen", type: "error" },
      },
      {
        onSuccess: () => {
          router.refresh();
          setSelectedNormalIds([]);
          setSelectedSpecialIds([]);
          modalProps?.onCancel?.(undefined as any);
        },
      }
    );
  };

  const isPosted = shipmentData?.data?.status === "posted";

  return (
    <>
      <Button
        onClick={() => show()}
        icon={<FolderOpenOutlined />}
        disabled={isPosted}
      >
        Bestellung wählen
      </Button>
      <Modal
        {...modalProps}
        title="Gelieferte Positionen auswählen"
        footer={[
          <Button
            key="cancel"
            onClick={() => modalProps?.onCancel?.(undefined as any)}
          >
            Abbrechen
          </Button>,
          <Button key="save" type="primary" onClick={handleSave}>
            Ausgewählte Positionen speichern
          </Button>,
        ]}
      >
        <Form
          {...formProps}
          form={form}
          layout="vertical"
          initialValues={{ selected_normal_ids: [] }}
        >
          <Form.Item name="order_id" label="Bestellung auswählen" required>
            <Select
              {...selectPropsPO}
              placeholder="Bestellung auswählen"
              filterOption={(input, option) => {
                return (
                  typeof option?.label === "string" &&
                  option.label.toLowerCase().includes(input.toLowerCase())
                );
              }}
            />
          </Form.Item>
          <Form.Item>
            <h4>Normale Positionen der Bestellung</h4>
            <Table
              rowKey="id"
              dataSource={enrichedNormalData}
              loading={!!orderId && tablePropsNormal.loading}
              pagination={tablePropsNormal.pagination}
              rowSelection={{
                type: "checkbox",
                selectedRowKeys: selectedNormalIds,
                onChange: (keys) => {
                  setSelectedNormalIds(keys as string[]);
                },
                preserveSelectedRowKeys: true,
              }}
            >
              <Table.Column title="SKU" dataIndex={["app_products", "bb_sku"]} />
              <Table.Column title="Offene Menge" dataIndex="qty_open" />
              <Table.Column title="Bestellte Menge" dataIndex="qty_ordered" />
            </Table>
          </Form.Item>
          <Form.Item>
            <h4>Sonderpositionen der Bestellung</h4>
            <Table
              rowKey="id"
              dataSource={enrichedSpecialData}
              loading={!!orderId && tablePropsSpecial.loading}
              pagination={tablePropsSpecial.pagination}
              rowSelection={{
                type: "checkbox",
                selectedRowKeys: selectedSpecialIds,
                onChange: (keys) => setSelectedSpecialIds(keys as string[]),
                preserveSelectedRowKeys: true,
              }}
            >
              <Table.Column
                title="SKU"
                render={(_, record: any) => (
                  <span>
                    <strong>{`${record.supplier_sku ?? "—"} - `}</strong>
                    <strong>{record.internal_notes || ""}</strong>
                    {record.order_confirmation_ref && ` (${record.order_confirmation_ref}) – `}
                    <strong>{record.base_product?.bb_sku ?? "—"}</strong>
                    {record.special_product?.bb_sku && ` (${record.special_product.bb_sku})`}
                  </span>
                )}
              />
              <Table.Column title="Offene Menge" dataIndex="qty_open" />
              <Table.Column title="Bestellte Menge" dataIndex="qty_ordered" />
            </Table>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
