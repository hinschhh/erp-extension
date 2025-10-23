"use client";

import { Create, useForm, useSelect } from "@refinedev/antd";
import { useNavigation } from "@refinedev/core";
import { App, Form, Input, Space, Select, InputNumber, Divider, DatePicker } from "antd";
import type { SelectProps } from "antd";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@utils/supabase/client";
import InboundItemList from "@/components/lager/wareneingang/anlegen/InboundItemList";
import type { Database } from "@/types/supabase";

type DB = Database;

type InboundShipmentInsert = DB["public"]["Tables"]["app_inbound_shipments"]["Insert"];
type InboundItemInsert    = DB["public"]["Tables"]["app_inbound_shipment_items"]["Insert"];
type PoNormalRowBase      = DB["public"]["Tables"]["app_purchase_orders_positions_normal"]["Row"];
type PoSpecialRowBase     = DB["public"]["Tables"]["app_purchase_orders_positions_special"]["Row"];
type PurchaseOrderRow     = DB["public"]["Tables"]["app_purchase_orders"]["Row"];

type PoNormalRow = PoNormalRowBase & {
  ref_billbee_products_mirror?: { sku?: string } | null;
  app_purchase_orders?: Pick<PurchaseOrderRow, "invoice_number" | "order_number" | "supplier"> | null;
};
type PoSpecialRow = PoSpecialRowBase & {
  ref_billbee_products_mirror?: { sku?: string } | null;
  app_purchase_orders?: Pick<PurchaseOrderRow, "invoice_number" | "order_number" | "supplier"> | null;
};

export default function InboundShipmentCreatePage() {
  const { message } = App.useApp();
  const { show } = useNavigation();

  const { formProps, saveButtonProps } = useForm({
    resource: "app_inbound_shipments",
    redirect: false, // wir navigieren selbst
    onMutationError: (e) => message.error(e?.message ?? "Fehler beim Speichern"),
  });

  const [form] = Form.useForm();
  const supplierId = Form.useWatch("supplier_id", form) as string | undefined;

  // Lieferanten
  const supplierSelect = useSelect({
    resource: "app_suppliers",
    optionLabel: "name",
    optionValue: "id",
    filters: [{ field: "active", operator: "eq", value: true }],
    meta: { select: "id,name" },
  });

  // NORMAL-Positionen
  const poNormal = useSelect<PoNormalRow>({
    resource: "app_purchase_orders_positions_normal",
    optionValue: "id",
    optionLabel: (item) => {
      const sku = item.ref_billbee_products_mirror?.sku ?? "";
      const inv = item.app_purchase_orders?.invoice_number ?? "";
      const onr = item.app_purchase_orders?.order_number ?? "";
      const open =
        (item as any)?.qty_open ??
        (Number((item as any)?.qty_ordered ?? 0) - Number((item as any)?.qty_received_total ?? 0));
      return `${sku} · ${inv} · ${onr} · offen: ${open ?? 0}`;
    },
    meta: {
      select: `
        id,
        order_id,
        po_item_status,
        qty_open,
        qty_ordered,
        qty_received_total,
        ref_billbee_products_mirror!app_purchase_orders_positions_normal_billbee_product_id_fkey(sku),
        app_purchase_orders!inner(invoice_number, order_number, supplier_id)
      `,
    },
    filters: [
      { field: "po_item_status", operator: "eq", value: "in_production" },
      { field: "qty_open", operator: "gt", value: 0 },
      supplierId ? { field: "app_purchase_orders.supplier_id", operator: "eq", value: supplierId } : undefined,
    ].filter(Boolean) as any,
    queryOptions: { enabled: !!supplierId },
    debounce: 300,
  });

  // SPECIAL-Positionen
  const poSpecial = useSelect<PoSpecialRow>({
    resource: "app_purchase_orders_positions_special",
    optionValue: "id",
    optionLabel: (item) => {
      const sku = item.ref_billbee_products_mirror?.sku ?? "";
      const inv = item.app_purchase_orders?.invoice_number ?? "";
      const onr = item.app_purchase_orders?.order_number ?? "";
      const open =
        (item as any)?.qty_open ??
        (Number((item as any)?.qty_ordered ?? 0) - Number((item as any)?.qty_received_total ?? 0));
      return `${sku} · ${inv} · ${onr} · offen: ${open ?? 0}`;
    },
    meta: {
      select: `
        id,
        order_id,
        po_item_status,
        qty_open,
        qty_ordered,
        qty_received_total,
        ref_billbee_products_mirror!app_purchase_orders_positions_special_billbee_product_id_fkey(sku),
        app_purchase_orders!inner(invoice_number, order_number, supplier_id)
      `,
    },
    filters: [
      { field: "po_item_status", operator: "eq", value: "in_production" },
      { field: "qty_open", operator: "gt", value: 0 },
      supplierId ? { field: "app_purchase_orders.supplier_id", operator: "eq", value: supplierId } : undefined,
    ].filter(Boolean) as any,
    queryOptions: { enabled: !!supplierId },
    debounce: 300,
  });

  // Indizes & Offen-Mengen
  const normalRows = (poNormal.queryResult.data?.data ?? []) as any[];
  const specialRows = (poSpecial.queryResult.data?.data ?? []) as any[];

  const normalOrderById = new Map(normalRows.map((r) => [r.id, r.order_id]));
  const specialOrderById = new Map(specialRows.map((r) => [r.id, r.order_id]));

  const normalOpen = new Map<string, number>(
    normalRows.map((r) => [
      r.id,
      (r?.qty_open ?? (Number(r?.qty_ordered ?? 0) - Number(r?.qty_received_total ?? 0))) as number,
    ])
  );
  const specialOpen = new Map<string, number>(
    specialRows.map((r) => [
      r.id,
      (r?.qty_open ?? (Number(r?.qty_ordered ?? 0) - Number(r?.qty_received_total ?? 0))) as number,
    ])
  );

  const onFinish = async (values: any) => {
    const supabase = supabaseBrowserClient;
    let shipmentId: string | null = null; // für kompensierendes Löschen

    try {
      if (!values?.supplier_id) throw new Error("Bitte Lieferant wählen.");

      // --- Frontend-Guard: Überlieferung verhindern (ohne for..of über Map) ---
      const wantedByPoId = new Map<string, number>();
      const addWanted = (poId: string, qty: number) =>
        wantedByPoId.set(poId, (wantedByPoId.get(poId) ?? 0) + qty);

      (values.itemsNormal ?? []).forEach((r: any) => {
        addWanted(String(r.purchase_order_position_id), Number(r.qty_received ?? 0));
      });
      (values.itemsSpecial ?? []).forEach((r: any) => {
        addWanted(String(r.purchase_order_position_id), Number(r.qty_received ?? 0));
      });

      wantedByPoId.forEach((wanted, poId) => {
        const open = normalOpen.get(poId) ?? specialOpen.get(poId);
        if (open == null) throw new Error(`Ausgewählte Position ${poId} ist ungültig oder nicht geladen.`);
        if (!(wanted > 0)) throw new Error(`Menge für Position ${poId} muss > 0 sein.`);
        if (wanted > open) {
          throw new Error(`Überlieferung erkannt: Gewünscht ${wanted}, offen ${open} bei Position ${poId}.`);
        }
      });

      // --- Header einfügen ---
      const header: InboundShipmentInsert = {
        fk_bb_supplier: values.supplier_id,
        delivery_note_no: values.delivery_note_no ?? null,
        note: values.note ?? null,
        arrived_at: values.arrived_at ? (values.arrived_at as dayjs.Dayjs).toDate().toISOString() : undefined,
        shipping_cost_separate:
          typeof values?.shipping_cost_separate === "number" ? values.shipping_cost_separate : null,
      };

      const { data: headerInserted, error: headerErr } = await supabase
        .from("app_inbound_shipments")
        .insert(header)
        .select("id")
        .single();

      if (headerErr || !headerInserted?.id) throw headerErr ?? new Error("Header konnte nicht angelegt werden.");
      shipmentId = headerInserted.id as string;

      // --- Details vorbereiten ---
      type ItemRow = { purchase_order_position_id: string; qty_received: number };
      const norm: ItemRow[] = values.itemsNormal ?? [];
      const spec: ItemRow[] = values.itemsSpecial ?? [];

      const details: InboundItemInsert[] = [
        ...norm.map((row) => {
          const poId = String(row.purchase_order_position_id);
          const orderId = normalOrderById.get(poId);
          if (!orderId) throw new Error("Ausgewählte Standard-Position ist ungültig.");
          return {
            shipment_id: shipmentId!,
            order_id: orderId,
            po_item_normal_id: poId,
            po_item_special_id: null,
            quantity_delivered: Number(row.qty_received),
          };
        }),
        ...spec.map((row) => {
          const poId = String(row.purchase_order_position_id);
          const orderId = specialOrderById.get(poId);
          if (!orderId) throw new Error("Ausgewählte Sonder-Position ist ungültig.");
          return {
            shipment_id: shipmentId!,
            order_id: orderId,
            po_item_normal_id: null,
            po_item_special_id: poId,
            quantity_delivered: Number(row.qty_received),
          };
        }),
      ];

      if (details.length === 0) throw new Error("Bitte mindestens eine Position hinzufügen.");

      // --- Details speichern ---
      const { error: detailErr } = await supabase.from("app_inbound_shipment_items").insert(details);
      if (detailErr) throw detailErr;

      // --- Erfolg: explizit auf Show-Seite leiten ---
      show("app_inbound_shipments", shipmentId);
      return { id: shipmentId };
    } catch (e: any) {
      // kompensierendes Löschen (Header + Items) falls Header bereits angelegt
      if (shipmentId) {
        try {
          await supabase.from("app_inbound_shipment_items").delete().eq("shipment_id", shipmentId);
          await supabase.from("app_inbound_shipments").delete().eq("id", shipmentId);
        } catch {
          /* Best-effort cleanup */
        }
      }
      message.error(e?.message ?? "Fehler beim Speichern");
      throw e;
    }
  };

  return (
    <Create
      title="Wareneingang anlegen"
      saveButtonProps={{ ...saveButtonProps, htmlType: "submit", form: "inbound-form" }}
    >
      <Form
        {...formProps}
        id="inbound-form"
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ arrived_at: dayjs() }}
      >
        <Form.Item label="Hersteller" name="supplier_id" rules={[{ required: true }]}>
          <Select {...(supplierSelect.selectProps as SelectProps<string>)} placeholder="Hersteller wählen" showSearch />
        </Form.Item>

        <Space style={{ gap: 12, width: "100%" }}>
          <Form.Item label="Lieferschein-Nr." name="delivery_note_no" style={{ flex: 1 }}>
            <Input />
          </Form.Item>

          <Form.Item label="Lieferdatum" name="arrived_at" style={{ flex: 1 }}>
            <DatePicker placeholder="Datum wählen" format="DD.MM.YYYY" />
          </Form.Item>

          <Form.Item label="Versandkosten (separate Rechnung)" name="shipping_cost_separate" style={{ flex: 1 }}>
            <InputNumber min={0} step={0.01} placeholder="0,00" formatter={(value) => `${value} €`} />
          </Form.Item>
        </Space>

        <Form.Item label="Notiz" name="note">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Divider orientation="left">Gelieferte Positionen</Divider>

        <InboundItemList
          name="itemsNormal"
          addLabel="Standard-Position hinzufügen"
          selectProps={poNormal.selectProps as SelectProps<string>}
        />

        <InboundItemList
          name="itemsSpecial"
          addLabel="Sonder-Position hinzufügen"
          selectProps={poSpecial.selectProps as SelectProps<string>}
        />
      </Form>
    </Create>
  );
}
