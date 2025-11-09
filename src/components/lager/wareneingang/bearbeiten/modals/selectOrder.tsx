"use client";

import { useInvalidate, useOne } from "@refinedev/core";
import { useRouter } from "next/navigation";
import { FolderOpenOutlined } from "@ant-design/icons";
import { Button, Form, Select, Table, message } from "antd";
import { useModalForm, useSelect, useTable } from "@refinedev/antd";
import Modal from "antd/es/modal/Modal";
import { Tables } from "@/types/supabase";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowserClient } from "@/utils/supabase/client";

type POItemsNormal = Omit<Tables<"app_purchase_orders_positions_normal_view">, "id"> & { id: string };
type POItemsSpecial = Omit<Tables<"app_purchase_orders_positions_special_view">, "id"> & { id: string };

export default function SelectPOOrderModal({ inboundShipmentId, inboundShipmentStatus }: { inboundShipmentId: string, inboundShipmentStatus: "planned" | "delivered" | "posted" }) {
  const [selectedNormalIds, setSelectedNormalIds] = useState<string[]>([]);
  const [selectedSpecialIds, setSelectedSpecialIds] = useState<string[]>([]);

  const invalidate = useInvalidate();
  const router = useRouter();

  const {data, isLoading, refetch} = useOne({
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

  const { selectProps: selectPropsPO } = useSelect({
    resource: "app_purchase_orders",
    optionLabel: (item) => {
      const dateLabel = item.ordered_at ? new Date(item.ordered_at).toLocaleDateString() : "kein Datum";
      const supplier = item.supplier ?? "unbekannt";
      const invoice = item.invoice_number ?? "—";
      return `${item.order_number ?? "ohne Nummer"} - (${supplier} - ${invoice}) vom ${dateLabel}`;
    },
    sorters: [{ field: "ordered_at", order: "desc" }],
    filters: [
      {

        field: "ordered_at",
        operator: "nnull",
        value: null,
      },
    ],
    onSearch: (value) => [
    { field: "order_number", operator: "contains", value: `%${value}%` },
    { field: "supplier", operator: "contains", value: `%${value}%` },
    { field: "invoice_number", operator: "contains", value: `%${value}%` },
  ],
  meta: { or: true },
  });

  const orderId: string | null = Form.useWatch("order_id", form);
  const status: "planned" | "delivered" | "posted" = inboundShipmentStatus;

  const { tableProps: tablePropsNormal } = useTable<POItemsNormal>({
    resource: "app_purchase_orders_positions_normal_view",
    filters: {
      mode: "server",
      permanent: [
        { field: "order_id", operator: "eq", value: orderId },
        { field: "qty_open", operator: "gt", value: 0 },
      ],
    },
    meta: { select: "id, order_id, qty_open, qty_ordered, app_products(bb_sku)" },
    queryOptions: {
      enabled: !!orderId,
    },
  });

  const { tableProps: tablePropsSpecial } = useTable<POItemsSpecial>({
    resource: "app_purchase_orders_positions_special_view",
    filters: {
      mode: "server",
      permanent: [
        { field: "order_id", operator: "eq", value: orderId },
        { field: "qty_open", operator: "gt", value: 0 },
      ],
    },
    sorters: { initial: [{ field: "internal_notes", order: "asc" }] },
    meta: { select: "*, base_model:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(bb_sku, supplier_sku, purchase_details), special_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(bb_sku)" },
    queryOptions: {
      enabled: !!orderId,
    },
  });


  const orderIdVal: string | null = orderId ?? null;

  // OPTIONAL: Beim Laden einer Bestellung alle offenen Positionen automatisch vorselektieren
  useEffect(() => {
    if (!orderIdVal) {
      setSelectedNormalIds([]);
      return;
    }
    const rows = (tablePropsNormal?.dataSource as any[] | undefined) ?? [];
    const ids = rows.map((r) => String(r.id));
    setSelectedNormalIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdVal, tablePropsNormal?.dataSource]);

  useEffect(() => {
    if (!orderIdVal) {
      setSelectedSpecialIds([]);
      return;
    }
    const rows = (tablePropsSpecial?.dataSource as any[] | undefined) ?? [];
    const ids = rows.map((r) => String(r.id));
    setSelectedSpecialIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdVal, tablePropsSpecial?.dataSource]);

  const handleSave = async () => {
    const supabase = supabaseBrowserClient;

    if (!inboundShipmentId) {
      message.error("Keine Inbound-Shipment-ID übergeben.");
      return;
    }

    const vals = await form.validateFields().catch(() => null);
    if (!vals) return;

    if (!orderIdVal) {
      message.warning("Bitte zuerst eine Bestellung auswählen.");
      return;
    }
    if (!selectedNormalIds.length && !selectedSpecialIds.length) {
      message.warning("Bitte mindestens eine Position (normal oder Sonderposition) auswählen.");
      return;
    }

    const normalRows = (tablePropsNormal?.dataSource as any[] | undefined) ?? [];
    const specialRows = (tablePropsSpecial?.dataSource as any[] | undefined) ?? [];
    const mapByIdNormal = new Map<string, any>(normalRows.map((r) => [String(r.id), r]));
    const mapByIdSpecial = new Map<string, any>(specialRows.map((r) => [String(r.id), r]));

    // Offene Menge automatisch übernehmen
    const rowsNormal = selectedNormalIds.map((id) => {
      const row = mapByIdNormal.get(String(id));
      const qty = Number(row?.qty_open ?? 0);
      return {
        shipment_id: inboundShipmentId,
        order_id: row?.order_id ?? orderIdVal,
        po_item_normal_id: id,
        po_item_special_id: null,
        quantity_delivered: qty, // <-- automatisch offene Menge
        item_status: status,
      };
    });
    const rowsSpecial = selectedSpecialIds.map((id) => {
      const row = mapByIdSpecial.get(String(id));
      const qty = Number(row?.qty_open ?? 0);
      return {
        shipment_id: inboundShipmentId,
        order_id: row?.order_id ?? orderIdVal,
        po_item_normal_id: null,
        po_item_special_id: id,
        quantity_delivered: qty, // <-- automatisch offene Menge
        item_status: status,
      };
    });

    // 0-Mengen rausfiltern (Sicherheit)
    const payloadNormal = rowsNormal.filter((r) => r.quantity_delivered > 0);
    const payloadSpecial = rowsSpecial.filter((r) => r.quantity_delivered > 0);

    const { error: errorNormal } = await supabase.from("app_inbound_shipment_items").insert(payloadNormal);
    if (errorNormal) {
      message.error(`Speichern fehlgeschlagen: ${errorNormal.message}`);
      return;
    }

    const { error: errorSpecial } = await supabase.from("app_inbound_shipment_items").insert(payloadSpecial);
    if (errorSpecial) {
      message.error(`Speichern fehlgeschlagen: ${errorSpecial.message}`);
      return;
    }

    invalidate({
        invalidates: ["list", "many", "detail"], // sicherheitshalber breit
        resource: "app_inbound_shipment_items",
    });
    invalidate({ invalidates: ["list", "many", "detail"], resource: "app_purchase_orders_positions_normal_view" });
    invalidate({ invalidates: ["list", "many", "detail"], resource: "app_purchase_orders_positions_special_view" });

// wenn du App Router/Suspense nutzt:
router.refresh();

    message.success("Wareneingang-Positionen gespeichert.");
    setSelectedNormalIds([]);
    setSelectedSpecialIds([]);
    modalProps?.onCancel?.(undefined as any);
  };

  return (
    <>
      {data?.data?.status !== "posted" && (
        <Button onClick={() => show()} icon={<FolderOpenOutlined />}>
          Bestellung wählen
        </Button>
      )}
      {data?.data?.status === "posted" && (
        <Button onClick={() => show()} icon={<FolderOpenOutlined />} disabled>
          Bestellung wählen
        </Button>
      )}
      <Modal
        {...modalProps}
        title="Gelieferte Positionen auswählen"
        footer={[
          <Button key="cancel" onClick={() => modalProps?.onCancel?.(undefined as any)}>
            Abbrechen
          </Button>,
          <Button key="save" type="primary" onClick={handleSave}>
            Ausgewählte Positionen speichern
          </Button>,
        ]}
      >
        <Form {...formProps} form={form} layout="vertical" initialValues={{ selected_normal_ids: [] }}>
          <Form.Item name="order_id" label="Bestellung auswählen" required>
            <Select {...selectPropsPO} placeholder="Bestellung auswählen" filterOption={(input, option) => {
              return typeof option?.label === "string" && option.label.toLowerCase().includes(input.toLowerCase());
            }} />
          </Form.Item>
          <Form.Item>
            <h4>Normale Positionen der Bestellung</h4>
            <Table
              rowKey="id"
              {...tablePropsNormal}
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
              {...tablePropsSpecial}
              rowSelection={{
                type: "checkbox",
                selectedRowKeys: selectedSpecialIds,
                onChange: (keys) => {
                  setSelectedSpecialIds(keys as string[]);
                },
                preserveSelectedRowKeys: true,
              }}
            >
              <Table.Column title="SKU" dataIndex={["special_product", "bb_sku"]} render={(value, record) => {
                return (
                <span>
                    <strong>{`${record.supplier_sku ?? "—"} - `}</strong>
                    <strong>{record.internal_notes ? `${record.internal_notes}` : ""}</strong>
                    {record.order_confirmation_ref ? ` (${record.order_confirmation_ref}) – ` : ""}
                    <strong>{`${record.base_model?.bb_sku ?? "—"}`}</strong>
                    {value ? ` (${value})` : ""}
                </span>
                );
              }}/>
              <Table.Column title="Offene Menge" dataIndex="qty_open" />
              <Table.Column title="Bestellte Menge" dataIndex="qty_ordered" />
            </Table>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
