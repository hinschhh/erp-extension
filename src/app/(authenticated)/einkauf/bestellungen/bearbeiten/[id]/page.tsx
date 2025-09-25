// src/app/(authenticated)/einkauf/bestellungen/bearbeiten/[id]/page.tsx
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/types/supabase";
import {
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Drawer,
  Switch,
} from "antd";
import {
  FileTextOutlined,
  LinkOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
  EditOutlined,
  ThunderboltOutlined,
  CloseOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";

const { Paragraph, Text } = Typography;

// DB-Typen
type Po = Tables<"app_purchase_orders">;
type PoUpdate = Partial<Po>;
type PosNormal = Tables<"app_purchase_orders_positions_normal">;
type PosSpecial = Tables<"app_purchase_orders_positions_special">;
type Supplier = Tables<"app_suppliers">;

// Produkt-Option (aus rpt_products_full)
type ProductFull = {
  billbee_product_id: number;
  sku: string | null;
  external_sku: string | null;
  name: string | null;
  manufacturer: string | null;
  purchase_details: string | null;
  net_purchase_price: number | null;
};

// -------- Order-Status (UI – DB ist maßgeblich für Drilldown/Rollup) --------
const STATUS_OPTIONS = [
  { value: "draft", label: "Entwurf" },
  { value: "ordered", label: "Bestellt" },
  { value: "confirmed", label: "Bestätigt" },
  { value: "partially_in_production", label: "Teilw. in Produktion", disabled: true },
  { value: "in_production", label: "In Produktion", disabled: true },
  { value: "partially_delivered", label: "Teilw. geliefert", disabled: true },
  { value: "delivered", label: "Geliefert", disabled: true },
  { value: "cancelled", label: "Storniert" }, // manuell erlaubt
] as const;

const toDate = (d?: string | null) => (d ? dayjs(d) : undefined);
const fromDate = (d?: Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);

// UI-Helfer (Overflow vermeiden)
const cellEllipsis = (content?: React.ReactNode, tooltip?: React.ReactNode) => (
  <Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: tooltip ?? content }}>
    {content ?? "—"}
  </Paragraph>
);

// -------- Positions-Status --------
type ItemStatus =
  | "draft"
  | "ordered"
  | "confirmed"
  | "in_production"
  | "delivered"
  | "paused"
  | "cancelled";

const ITEM_STATUS_META: Record<ItemStatus, { color: string; icon: React.ReactNode; label: string }> =
  {
    draft: { color: "default", icon: <FileTextOutlined />, label: "Entwurf" },
    ordered: { color: "blue", icon: <ThunderboltOutlined />, label: "Bestellt" },
    confirmed: { color: "geekblue", icon: <ScheduleOutlined />, label: "Bestätigt" },
    in_production: { color: "processing", icon: <CalendarOutlined />, label: "In Produktion" },
    delivered: { color: "success", icon: <CheckCircleOutlined />, label: "Wareneingang" },
    paused: { color: "default", icon: <ClockCircleOutlined />, label: "Pausiert" },
    cancelled: { color: "red", icon: <CloseOutlined />, label: "Storniert" },
  };

// Fallback-Ableitung aus Datumsfeldern (nur Anzeige/Optimistic)
const deriveItemStatusFromDates = (r: {
  proforma_confirmed_at?: string | null;
  sketch_confirmed_at?: string | null;
  dol_planned_at?: string | null;
  dol_actual_at?: string | null;
  goods_received_at?: string | null;
}): ItemStatus => {
  if (r.goods_received_at) return "delivered";
  if (r.dol_actual_at) return "in_production";
  if (r.dol_planned_at) return "in_production";
  if (r.sketch_confirmed_at) return "in_production";
  if (r.proforma_confirmed_at) return "confirmed";
  return "confirmed";
};

const effectiveItemStatus = (r: any): ItemStatus => {
  const db = r?.po_item_status as ItemStatus | undefined;
  if (db === "cancelled") return "cancelled";
  if (db === "paused") return "paused";
  const derived = deriveItemStatusFromDates(r);
  if (db === "delivered" || db === "in_production") return db;
  return derived;
};

/* ===========================
   Sketch-Workflow Button
   =========================== */
type ConfirmSketchButtonProps = {
  position: Pick<PosSpecial, "id" | "sketch_needed" | "sketch_confirmed_at" | "po_item_status">;
  onSuccess?: () => void;
};

const ConfirmSketchButton: React.FC<ConfirmSketchButtonProps> = ({ position, onSuccess }) => {
  const { message, modal } = App.useApp();
  const disabled = !position.sketch_needed || position.sketch_confirmed_at != null;

  const handleConfirm = async () => {
    modal.confirm({
      title: "Skizze bestätigen?",
      content: "Nach Bestätigung rückt eine bestätigte Position automatisch in Produktion vor.",
      okText: "Bestätigen",
      cancelText: "Abbrechen",
      async onOk() {
        const supabase = supabaseBrowserClient;
        const { error } = await supabase.rpc("api_po_item_confirm_sketch", {
          p_item_id: position.id,
          p_confirmed_on: dayjs().format("YYYY-MM-DD"),
        });
        if (error) {
          message.error(error.message || "Fehler beim Bestätigen der Skizze.");
          return;
        }
        message.success("Skizze wurde bestätigt.");
        onSuccess?.();
      },
    });
  };

  if (!position.sketch_needed) return null;

  return (
    <Tooltip
      title={
        position.sketch_confirmed_at
          ? `Bereits bestätigt am ${dayjs(position.sketch_confirmed_at).format("DD.MM.YYYY")}`
          : "Skizze bestätigen"
      }
    >
      <Button type="primary" icon={<CheckCircleOutlined />} disabled={disabled} onClick={handleConfirm}>
        Skizze bestätigen
      </Button>
    </Tooltip>
  );
};

// -------- Drawer State --------
type EditTarget =
  | { kind: "normal"; row: PosNormal }
  | { kind: "special"; row: PosSpecial }
  | null;

// Date fields we manage in drawer
type DrawerForm = {
  proforma_confirmed_at?: Dayjs | null;
  sketch_confirmed_at?: Dayjs | null;
  dol_planned_at?: Dayjs | null;
  dol_actual_at?: Dayjs | null;
  goods_received_at?: Dayjs | null;
};

export default function BestellungBearbeitenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowserClient, []); // FIX: init client
  const { message } = App.useApp();

  const [form] = Form.useForm<Po>();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [orderSupplierName, setOrderSupplierName] = React.useState<string | null>(null);

  const [posNormal, setPosNormal] = React.useState<PosNormal[]>([]);
  const [posSpecial, setPosSpecial] = React.useState<PosSpecial[]>([]);

  // Auswahl für Batch-Aktionen
  const [selectedNormalKeys, setSelectedNormalKeys] = React.useState<React.Key[]>([]);
  const [selectedSpecialKeys, setSelectedSpecialKeys] = React.useState<React.Key[]>([]);

  // Inline-Edit (Normal)
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editBuf, setEditBuf] = React.useState<{
    qty_ordered?: number;
    unit_price_net?: number | null;
    internal_notes?: string | null;
  }>({});

  // Inline-Edit (Special)
  const [editingSpecialId, setEditingSpecialId] = React.useState<string | null>(null);
  const [editBufSpecial, setEditBufSpecial] = React.useState<{
    qty_ordered?: number;
    unit_price_net?: number | null;
    details_override?: string | null;
    supplier_sku?: string | null;
    order_confirmation_ref?: string | null;
    external_file_url?: string | null;
  }>({});

  // Status Drawer
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [drawerTarget, setDrawerTarget] = React.useState<EditTarget>(null);
  const [drawerForm] = Form.useForm<DrawerForm>();

  // Produkt-Cache
  const [productCache, setProductCache] = React.useState<Record<number, ProductFull>>({});

  // Modals
  const [openNormal, setOpenNormal] = React.useState(false);
  const [openSpecial, setOpenSpecial] = React.useState(false);
  const [formNormal] = Form.useForm<
    TablesInsert<"app_purchase_orders_positions_normal"> & { details_override?: string }
  >();
  const [formSpecial] = Form.useForm<
    TablesInsert<"app_purchase_orders_positions_special"> & { base_model_billbee_product_id?: number }
  >();

  // AutoComplete-Optionen
  type Option = { value: string; label: string; full: ProductFull };
  const [optionsNormal, setOptionsNormal] = React.useState<Option[]>([]);
  const [optionsSpecial, setOptionsSpecial] = React.useState<Option[]>([]);
  const [optionsBase, setOptionsBase] = React.useState<Option[]>([]);
  const [searchingNormal, setSearchingNormal] = React.useState(false);
  const [searchingSpecial, setSearchingSpecial] = React.useState(false);
  const [searchingBase, setSearchingBase] = React.useState(false);

  // Anzeige-Kontext im Modal
  const [selectedFullNormal, setSelectedFullNormal] = React.useState<ProductFull | null>(null);
  const [selectedFullSpecial, setSelectedFullSpecial] = React.useState<ProductFull | null>(null);
  const [selectedBaseModel, setSelectedBaseModel] = React.useState<ProductFull | null>(null);

  const hydrateProductCache = React.useCallback(
    async (ids: number[]) => {
      const unique = Array.from(new Set(ids.filter((x) => Number.isFinite(x))));
      if (!unique.length) return;
      const toFetch = unique.filter((pid) => !productCache[pid]);
      if (!toFetch.length) return;

      const { data, error } = await supabase
        .from("rpt_products_full")
        .select("id,sku,external_sku,name,manufacturer,purchase_details,net_purchase_price")
        .in("id", toFetch);

      if (error) {
        message.error(error.message);
        return;
      }

      const next = { ...productCache };
      (data ?? []).forEach((r: any) => {
        next[r.id] = {
          billbee_product_id: r.id,
          sku: r.sku ?? null,
          external_sku: r.external_sku ?? null,
          name: r.name ?? null,
          manufacturer: r.manufacturer ?? null,
          purchase_details: r.purchase_details ?? null,
          net_purchase_price: r.net_purchase_price ?? null,
        };
      });
      setProductCache(next);
    },
    [supabase, productCache, message],
  );

  // positions neu laden (für Button onSuccess)
  const refreshPositions = React.useCallback(async () => {
    const [{ data: n }, { data: s2 }] = await Promise.all([
      supabase
        .from("app_purchase_orders_positions_normal")
        .select("*")
        .eq("order_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("app_purchase_orders_positions_special")
        .select("*")
        .eq("order_id", id)
        .order("created_at", { ascending: true }),
    ]);

    setPosNormal(n || []);
    setPosSpecial(s2 || []);

    // Produktdaten hydrieren
    const normalIds = (n ?? []).map((p) => Number(p.billbee_product_id));
    const specialIds = (s2 ?? []).flatMap((p) => [
      Number(p.billbee_product_id),
      Number(p.base_model_billbee_product_id),
    ]);
    hydrateProductCache([...normalIds, ...specialIds]);
  }, [id, supabase, hydrateProductCache]);

  // Load
  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: po, error: e1 }, { data: supp }] = await Promise.all([
        supabase.from("app_purchase_orders").select("*").eq("id", id).maybeSingle(),
        supabase.from("app_suppliers").select("*").order("name", { ascending: true }),
      ]);
      if (e1) {
        message.error(`Fehler beim Laden: ${e1.message}`);
        setLoading(false);
        return;
      }
      if (po) {
        form.setFieldsValue({
          ...po,
          ordered_at: toDate(po.ordered_at) as any,
          proforma_confirmed_at: toDate(po.proforma_confirmed_at) as any,
          sketch_confirmed_at: toDate(po.sketch_confirmed_at) as any,
          dol_planned_at: toDate(po.dol_planned_at) as any,
          dol_actual_at: toDate(po.dol_actual_at) as any,
          goods_received_at: toDate(po.goods_received_at) as any,
          invoice_date: toDate(po.invoice_date) as any,
        });
      }
      setSuppliers(supp || []);
      if (supp && po?.supplier_id) {
        const s = supp.find((x) => x.id === po.supplier_id);
        setOrderSupplierName(s?.name ?? null);
      }

      await refreshPositions();
      setLoading(false);
    })();
  }, [id, supabase, form, message, refreshPositions]);

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const payload: PoUpdate = {
        supplier_id: v.supplier_id!,
        status: v.status!, // DB-Enum (draft|ordered|confirmed)
        ordered_at: fromDate(v.ordered_at as any)!,
        proforma_confirmed_at: fromDate(v.proforma_confirmed_at as any),
        sketch_confirmed_at: fromDate(v.sketch_confirmed_at as any),
        dol_planned_at: fromDate(v.dol_planned_at as any),
        dol_actual_at: fromDate(v.dol_actual_at as any),
        goods_received_at: fromDate(v.goods_received_at as any),
        invoice_number: v.invoice_number ?? null,
        invoice_date: fromDate(v.invoice_date as any),
        shipping_cost_net: v.shipping_cost_net ?? 0,
        notes: v.notes ?? null,
      };
      const { error } = await supabase.from("app_purchase_orders").update(payload).eq("id", id);
      if (error) throw error;
      message.success("Gespeichert");
      router.push(`/einkauf/bestellungen`);
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Suche in rpt_products_full (nach Manufacturer=Supplier)
  const searchProducts = React.useCallback(
    async (q: string, mode: "normal" | "special" | "base") => {
      const supplierName = orderSupplierName?.trim();
      if (!supplierName || !q || q.trim().length < 2) {
        if (mode === "normal") setOptionsNormal([]);
        if (mode === "special") setOptionsSpecial([]);
        if (mode === "base") setOptionsBase([]);
        return;
      }

      if (mode === "normal") setSearchingNormal(true);
      if (mode === "special") setSearchingSpecial(true);
      if (mode === "base") setSearchingBase(true);

      const { data, error } = await supabase
        .from("rpt_products_full")
        .select("id,sku,external_sku,name,manufacturer,purchase_details,net_purchase_price")
        .ilike("manufacturer", supplierName)
        .or(`external_sku.ilike.%${q}%,name.ilike.%${q}%,purchase_details.ilike.%${q}%`)
        .limit(100);

      if (error) {
        if (mode === "normal") setSearchingNormal(false);
        if (mode === "special") setSearchingSpecial(false);
        if (mode === "base") setSearchingBase(false);
        return message.error(error.message);
      }

      const filtered: ProductFull[] = (data ?? []).map((r: any) => ({
        billbee_product_id: r.id,
        sku: r.sku ?? null,
        external_sku: r.external_sku ?? null,
        name: r.name ?? null,
        manufacturer: r.manufacturer ?? null,
        purchase_details: r.purchase_details ?? null,
        net_purchase_price: r.net_purchase_price ?? null,
      }));

      const opts: Option[] = filtered.map((r) => ({
        value: String(r.billbee_product_id),
        label: `${r.sku ?? "(ohne SKU)"} — ${r.external_sku ?? ""}`,
        full: r,
      }));

      if (mode === "normal") {
        setOptionsNormal(opts);
        setSearchingNormal(false);
      } else if (mode === "special") {
        setOptionsSpecial(opts);
        setSearchingSpecial(false);
      } else {
        setOptionsBase(opts);
        setSearchingBase(false);
      }
    },
    [orderSupplierName, supabase, message],
  );

  // Override-Schutz
  const askOverride = (current?: string | null, incoming?: string | null) =>
    new Promise<boolean>((resolve) => {
      if (current && current.trim() !== "" && incoming && incoming.trim() !== "") {
        Modal.confirm({
          title: "Details überschreiben?",
          content:
            "Für diese Position existiert bereits ein Details-Override. Möchtest du ihn durch die Einkaufsdetails aus der Extension ersetzen?",
          okText: "Überschreiben",
          cancelText: "Behalten",
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      } else {
        resolve(true);
      }
    });

  // Auswahl-Handler: Normal
  const onSelectNormal = async (_: string, option: Option) => {
    const full = option.full;
    setSelectedFullNormal(full);

    const current = formNormal.getFieldValue("details_override") as string | undefined;
    const allow = await askOverride(current, full.purchase_details ?? undefined);

    formNormal.setFieldsValue({
      billbee_product_id: Number(option.value),
      unit_price_net: full.net_purchase_price ?? undefined,
      qty_ordered: formNormal.getFieldValue("qty_ordered") ?? 1,
      internal_notes: formNormal.getFieldValue("internal_notes"),
      details_override: allow ? full.purchase_details ?? undefined : current,
    } as any);
  };

  // Auswahl-Handler: Sonder (SB-Produkt)
  const onSelectSpecial = async (_: string, option: Option) => {
    const full = option.full;
    setSelectedFullSpecial(full);
    formSpecial.setFieldsValue({
      billbee_product_id: Number(option.value),
    } as any);
  };

  // Auswahl-Handler: Grundmodell
  const onSelectBaseModel = async (_: string, option: Option) => {
    const full = option.full;
    setSelectedBaseModel(full);

    const current = formSpecial.getFieldValue("details_override") as string | undefined;
    const allow = await askOverride(current, full.purchase_details ?? undefined);

    formSpecial.setFieldsValue({
      base_model_billbee_product_id: Number(option.value),
      supplier_sku: formSpecial.getFieldValue("supplier_sku") ?? full.external_sku ?? undefined,
      unit_price_net: formSpecial.getFieldValue("unit_price_net") ?? full.net_purchase_price ?? undefined,
      details_override: allow ? full.purchase_details ?? undefined : current,
    } as any);
  };

  // Submit
  const submitNormal = async () => {
    try {
      const v = await formNormal.validateFields();
      const insert: TablesInsert<"app_purchase_orders_positions_normal"> = {
        order_id: id as string,
        billbee_product_id: v.billbee_product_id!,
        qty_ordered: v.qty_ordered ?? 1,
        unit_price_net: v.unit_price_net ?? null,
        internal_notes: v.internal_notes ?? null,
      } as any;

      const { data, error } = await supabase
        .from("app_purchase_orders_positions_normal")
        .insert(insert)
        .select("*")
        .single();
      if (error) throw error;

      await refreshPositions();
      setOpenNormal(false);
      setSelectedFullNormal(null);
      formNormal.resetFields();
      message.success("Position hinzugefügt");
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    }
  };

  const submitSpecial = async () => {
    try {
      const v = await formSpecial.validateFields();
      if (!v.base_model_billbee_product_id) {
        return message.error("Bitte ein Grundmodell auswählen.");
      }

      const insert: TablesInsert<"app_purchase_orders_positions_special"> = {
        order_id: id as string,
        billbee_product_id: v.billbee_product_id!, // SB-Produkt
        base_model_billbee_product_id: v.base_model_billbee_product_id!,
        supplier_sku: v.supplier_sku ?? null,
        details_override: v.details_override ?? null,
        order_confirmation_ref: v.order_confirmation_ref ?? null,
        external_file_url: v.external_file_url ?? null,
        qty_ordered: v.qty_ordered ?? 1,
        unit_price_net: v.unit_price_net ?? null,
        dol_actual_at: null,
        sketch_needed: v.sketch_needed ?? true,
      } as any;

      const { error } = await supabase
        .from("app_purchase_orders_positions_special")
        .insert(insert);
      if (error) throw error;

      await refreshPositions();
      setOpenSpecial(false);
      setSelectedFullSpecial(null);
      setSelectedBaseModel(null);
      formSpecial.resetFields();
      message.success("Sonder-Position hinzugefügt");
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    }
  };

  // Inline-Edit (Normal)
  const startEdit = (r: PosNormal) => {
    setEditingId(r.id);
    setEditBuf({
      qty_ordered: r.qty_ordered ?? 0,
      unit_price_net: r.unit_price_net ?? null,
      internal_notes: r.internal_notes ?? null,
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditBuf({ });
  };
  const saveEdit = async (row: PosNormal) => {
    const qty = typeof editBuf.qty_ordered === "number" ? editBuf.qty_ordered : 0;
    const price =
      typeof editBuf.unit_price_net === "number" || editBuf.unit_price_net === null
        ? editBuf.unit_price_net
        : 0;

    const payload: Partial<PosNormal> = {
      qty_ordered: qty,
      unit_price_net: price as number | 0.0,
      internal_notes: (editBuf.internal_notes ?? "") === "" ? null : editBuf.internal_notes ?? null,
    };

    const { error } = await supabase
      .from("app_purchase_orders_positions_normal")
      .update(payload)
      .eq("id", row.id);

    if (error) {
      message.error(error.message);
      return;
    }

    await refreshPositions();
    message.success("Position aktualisiert");
    cancelEdit();
  };

  // Inline-Edit (Special)
  const startEditSpecial = (r: PosSpecial) => {
    setEditingSpecialId(r.id);
    setEditBufSpecial({
      qty_ordered: r.qty_ordered ?? 0,
      unit_price_net: r.unit_price_net ?? null,
      details_override: r.details_override ?? null,
      supplier_sku: r.supplier_sku ?? null,
      order_confirmation_ref: r.order_confirmation_ref ?? null,
      external_file_url: r.external_file_url ?? null,
    });
  };
  const cancelEditSpecial = () => {
    setEditingSpecialId(null);
    setEditBufSpecial({});
  };
  const saveEditSpecial = async (row: PosSpecial) => {
    const payload: Partial<PosSpecial> = {
      qty_ordered:
        typeof editBufSpecial.qty_ordered === "number" ? editBufSpecial.qty_ordered : row.qty_ordered,
      unit_price_net:
        typeof editBufSpecial.unit_price_net === "number" || editBufSpecial.unit_price_net === null
          ? (editBufSpecial.unit_price_net as number | 0.0)
          : row.unit_price_net ?? null,
      details_override:
        (editBufSpecial.details_override ?? "") === ""
          ? null
          : (editBufSpecial.details_override as string | null),
      supplier_sku:
        (editBufSpecial.supplier_sku ?? "") === ""
          ? null
          : (editBufSpecial.supplier_sku as string | null),
      order_confirmation_ref:
        (editBufSpecial.order_confirmation_ref ?? "") === ""
          ? null
          : (editBufSpecial.order_confirmation_ref as string | null),
      external_file_url:
        (editBufSpecial.external_file_url ?? "") === ""
          ? null
          : (editBufSpecial.external_file_url as string | null),
      sketch_needed:
        typeof editBufSpecial?.qty_ordered !== "undefined"
          ? undefined
          : undefined,
    };

    const { error } = await supabase
      .from("app_purchase_orders_positions_special")
      .update(payload)
      .eq("id", row.id);

    if (error) {
      message.error(error.message);
      return;
    }

    await refreshPositions();
    message.success("Sonder-Position aktualisiert");
    cancelEditSpecial();
  };

  // -------- Status Drawer öffnen/füllen --------
  const openStatusDrawer = (target: EditTarget) => {
    setDrawerTarget(target);
    if (!target) return;
    const r = target.row as any;
    drawerForm.setFieldsValue({
      proforma_confirmed_at: toDate(r.proforma_confirmed_at ?? null) as any,
      sketch_confirmed_at: toDate(r.sketch_confirmed_at ?? null) as any,
      dol_planned_at: toDate(r.dol_planned_at ?? null) as any,
      dol_actual_at: toDate(r.dol_actual_at ?? null) as any,
      goods_received_at: toDate(r.goods_received_at ?? null) as any,
    });
    setDrawerOpen(true);
  };

  const saveStatusDrawer = async () => {
    try {
      const v = await drawerForm.validateFields();
      const payload = {
        proforma_confirmed_at: fromDate(v.proforma_confirmed_at ?? null),
        sketch_confirmed_at: fromDate(v.sketch_confirmed_at ?? null),
        dol_planned_at: fromDate(v.dol_planned_at ?? null),
        dol_actual_at: fromDate(v.dol_actual_at ?? null),
        goods_received_at: fromDate(v.goods_received_at ?? null),
      } as any;

      if (!drawerTarget) return;
      if (drawerTarget.kind === "normal") {
        const { error } = await supabase
          .from("app_purchase_orders_positions_normal")
          .update(payload)
          .eq("id", (drawerTarget.row as PosNormal).id);
        if (error) throw error;

        await refreshPositions();
      } else {
        const { error } = await supabase
          .from("app_purchase_orders_positions_special")
          .update(payload)
          .eq("id", (drawerTarget.row as PosSpecial).id);
        if (error) throw error;

        await refreshPositions();
      }
      message.success("Status aktualisiert");
      setDrawerOpen(false);
      setDrawerTarget(null);
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    }
  };

  // -------- Batch-Aktionen --------
  const batchUpdatePositions = async (
    kind: "normal" | "special",
    ids: React.Key[],
    payload: Partial<
      Pick<PosNormal, "proforma_confirmed_at" | "dol_planned_at" | "dol_actual_at" | "goods_received_at">
    >,
  ) => {
    if (!ids.length) {
      message.info("Bitte Positionen auswählen.");
      return;
    }
    const table = kind === "normal" ? "app_purchase_orders_positions_normal" : "app_purchase_orders_positions_special";
    const { error } = await supabase.from(table).update(payload as any).in("id", ids as string[]);
    if (error) {
      message.error(error.message);
      return;
    }
    await refreshPositions();
    if (kind === "normal") setSelectedNormalKeys([]);
    else setSelectedSpecialKeys([]);
    message.success(`${ids.length} Position(en) aktualisiert`);
  };

const batchMenu = (kind: "normal" | "special") => {
  const ids = kind === "normal" ? selectedNormalKeys : selectedSpecialKeys;

  const setBatchStatus = async (next: ItemStatus) => {
    if (!ids.length) {
      message.info("Bitte Positionen auswählen.");
      return;
    }

    const table =
      kind === "normal"
        ? "app_purchase_orders_positions_normal"
        : "app_purchase_orders_positions_special";

    const { error } = await supabase
      .from(table)
      .update({ po_item_status: next })
      .in("id", ids as string[]);

    if (error) {
      message.error(error.message);
      return;
    }

    await refreshPositions();
    if (kind === "normal") setSelectedNormalKeys([]);
    else setSelectedSpecialKeys([]);

    message.success(
      `${ids.length} Position(en) auf "${ITEM_STATUS_META[next].label}" gesetzt`
    );
  };

  // Status-Auswahl (ohne "draft", damit keine Downgrades angeboten werden)
  const statusChoices = (Object.keys(ITEM_STATUS_META) as ItemStatus[])
    .filter((k) => k !== "draft")
    .map((k) => ({
      key: `status_${k}`,
      label: ITEM_STATUS_META[k].label,
      onClick: () => setBatchStatus(k),
    }));

  return { items: statusChoices };
};


  // --------- Hilfs-Komponente: DOL (Einzel-Edit in Tabelle) ---------
  const DolCell: React.FC<{ row: PosNormal | PosSpecial }> = ({ row }) => {
    const table =
      "base_model_billbee_product_id" in row
        ? "app_purchase_orders_positions_special"
        : "app_purchase_orders_positions_normal";

    const value = (row as any).dol_actual_at as string | null | undefined;

    return (
      <Space.Compact className="w-full">
        <DatePicker
          className="w-full"
          value={toDate(value ?? null) as any}
          onChange={async (d) => {
            const payload = { dol_actual_at: fromDate(d ?? null) };
            const { error } = await supabase.from(table).update(payload).eq("id", row.id);
            if (error) return message.error(error.message);
            await refreshPositions();
            message.success("DOL aktualisiert");
          }}
        />
          {/* Verzögerung berechnen und anzeigen */}
  {row.dol_actual_at && row.dol_planned_at && dayjs(row.dol_actual_at).isAfter(dayjs(row.dol_planned_at)) && (
    <Typography.Text type="danger">
      {dayjs(row.dol_actual_at).diff(dayjs(row.dol_planned_at), "day")} Tage verzögert
    </Typography.Text>
  )}
      </Space.Compact>
    );
  };
  // Merker für vorherigen Status (zurücksetzen bei Abbruch)
const [prevPoStatus, setPrevPoStatus] = React.useState<Po["status"] | undefined>(undefined);

// beim Laden der PO (nach form.setFieldsValue(...))
React.useEffect(() => {
  const fetchPo = async () => {
    const { data: po, error } = await supabase
      .from("app_purchase_orders")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      message.error(`Fehler beim Laden: ${error.message}`);
      return;
    }
    if (po) setPrevPoStatus(po.status);
  };

  fetchPo();
}, [id, supabase, message]);

// Helper: Supplier-Leadtime (Tage)
const getSupplierLeadtimeDays = React.useCallback(() => {
  const supId = form.getFieldValue("supplier_id") as string | undefined;
  if (!supId) return 0;
  const s = suppliers.find(x => x.id === supId);
  // Feldname an dein Schema anpassen, falls anders benannt:
  const dlt = (s as any)?.default_leadtime_days as number | null | undefined;
  return Number.isFinite(dlt) ? (dlt as number) : 0;
}, [form, suppliers]);

// Handler für Statuswechsel mit Confirm-Dialog bei "confirmed"
const handlePoStatusChange = (next: Po["status"]) => {
  const current = form.getFieldValue("status") as Po["status"] | undefined;

  // Wenn nicht auf confirmed → normal setzen + prevStatus updaten
  if (next !== "confirmed") {
    form.setFieldsValue({ status: next });
    setPrevPoStatus(next);
    return;
  }

  // Auf confirmed → Pflichtdialog für DOL geplant
  const lead = getSupplierLeadtimeDays();
  let picked: Dayjs | null = dayjs().add(lead, "day");

  Modal.confirm({
    title: "Geplantes Verladedatum (DOL) festlegen",
    content: (
      <div>
        <p className="mb-2">
          Vorschlag: <b>{dayjs().add(lead, "day").format("DD.MM.YYYY")}</b> (heute +{" "}
          {lead} Tage Lieferanten-Leadtime)
        </p>
        <DatePicker
          className="w-full"
          defaultValue={dayjs().add(lead, "day")}
          onChange={(d) => (picked = d ?? null)}
        />
      </div>
    ),
    okText: "Übernehmen & bestätigen",
    cancelText: "Abbrechen",
    async onOk() {
      const dateStr = picked ? picked.format("YYYY-MM-DD") : dayjs().add(lead, "day").format("YYYY-MM-DD");
      // 1) Formularwerte setzen (Status + Proforma)
       const { error: ePo } = await supabase
    .from("app_purchase_orders")
    .update({
      status: "confirmed",
      proforma_confirmed_at: dateStr,
    })
    .eq("id", id);

  if (ePo) {
    message.error(ePo.message);
    // UI zurück auf vorherigen Status
    form.setFieldsValue({ status: prevPoStatus ?? "ordered" });
    return Promise.reject();
  }

      // Normal
      const { error: e1 } = await supabase
        .from("app_purchase_orders_positions_normal")
        .update({ dol_planned_at: dateStr, dol_actual_at: dateStr })
        .eq("order_id", id)
        .is("dol_planned_at", null);

      if (e1) {
        message.error(e1.message);
        // Status zurückdrehen
        form.setFieldsValue({ status: current ?? "ordered" });
        return Promise.reject();
      }

      // Special
      const { error: e2 } = await supabase
        .from("app_purchase_orders_positions_special")
        .update({ dol_planned_at: dateStr, dol_actual_at: dateStr })
        .eq("order_id", id)
        .is("dol_planned_at", null);

      if (e2) {
        message.error(e2.message);
        form.setFieldsValue({ status: current ?? "ordered" });
        return Promise.reject();
      }

      await refreshPositions();
      setPrevPoStatus("confirmed");
      message.success("Bestellung bestätigt & DOL geplant gesetzt");
      return Promise.resolve();
    },
    onCancel() {
      // Auswahl zurück auf vorherigen Status
      form.setFieldsValue({ status: current ?? prevPoStatus ?? "ordered" });
    },
  });
};


  // ------- Tabellen-Definitionen -------
  const columnsNormal = [
    {
      title: "SKU",
      width: 140,
      render: (_: any, r: PosNormal) => {
        const p = productCache[Number(r.billbee_product_id)];
        return cellEllipsis(p?.sku ?? "—", p?.sku ?? "—");
      },
    },
    {
      title: "Ext. SKU",
      width: 160,
      render: (_: any, r: PosNormal) => {
        const p = productCache[Number(r.billbee_product_id)];
        return cellEllipsis(p?.external_sku ?? "—", p?.external_sku ?? "—");
      },
    },
    {
      title: "Details",
      width: 280,
      render: (_: any, r: PosNormal) => {
        const p = productCache[Number(r.billbee_product_id)];
        return cellEllipsis(p?.purchase_details ?? "—", p?.purchase_details ?? "—");
      },
    },
    {
      title: "Menge",
      width: 110,
      render: (_: any, r: PosNormal) =>
        editingId === r.id ? (
          <InputNumber
            value={editBuf.qty_ordered}
            onChange={(v) => setEditBuf((s) => ({ ...s, qty_ordered: Number(v) }))}
            min={-100}
            step={1}
            className="w-full"
          />
        ) : (
          <Text>{r.qty_ordered}</Text>
        ),
    },
    {
      title: "Einzel Netto",
      width: 140,
      render: (_: any, r: PosNormal) =>
        editingId === r.id ? (
          <InputNumber
            value={editBuf.unit_price_net as number | null | undefined}
            onChange={(v) =>
              setEditBuf((s) => ({
                ...s,
                unit_price_net: v === null || v === undefined ? null : Number(v),
              }))
            }
            min={0}
            step={0.01}
            className="w-full"
          />
        ) : (
          <Text>{r.unit_price_net ?? "—"}</Text>
        ),
    },
    {
      title: "Gesamt Netto",
      width: 140,
      render: (_: any, r: PosNormal) => {
        const qty =
          editingId === r.id ? (typeof editBuf.qty_ordered === "number" ? editBuf.qty_ordered : 0) : (r.qty_ordered as number);
        const price =
          editingId === r.id
            ? typeof editBuf.unit_price_net === "number"
              ? editBuf.unit_price_net
              : 0
            : (r.unit_price_net as number) ?? 0;
        return <Text>{(qty * (price || 0)).toFixed(2)}</Text>;
      },
    },
    {
      title: "Verladung erwartet (DoL)",
      width: 200,
      render: (_: any, r: PosNormal) => <DolCell row={r} />,
    },
    {
      title: "Status",
      width: 160,
      render: (_: any, r: PosNormal) => {
        const s = (r.po_item_status as ItemStatus) || effectiveItemStatus(r);
        const meta = ITEM_STATUS_META[s];
        const updateStatus = async (next: ItemStatus) => {
  const { error } = await supabase
    .from("app_purchase_orders_positions_normal")
    .update({ po_item_status: next })
    .eq("id", r.id);
  if (error) return message.error(error.message);
  await refreshPositions();
  message.success("Status aktualisiert");
};

        return (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: (Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((k) => ({
                key: k,
                label: ITEM_STATUS_META[k].label,
                onClick: () => updateStatus(k),
              })),
            }}
          >
            <Tag color={meta.color} style={{ cursor: "pointer" }}>
              {meta.icon} {meta.label}
            </Tag>
          </Dropdown>
        );
      },
    },
    {
      title: "Anmerkungen",
      width: 280,
      render: (_: any, r: PosNormal) =>
        editingId === r.id ? (
          <Input.TextArea
            value={editBuf.internal_notes ?? ""}
            onChange={(e) => setEditBuf((s) => ({ ...s, internal_notes: e.target.value }))}
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
        ) : (
          cellEllipsis(r.internal_notes ?? "—", r.internal_notes ?? "—")
        ),
    },
    {
      title: "Aktionen",
      width: 120,
      fixed: "right" as const,
      render: (_: any, r: PosNormal) =>
        editingId === r.id ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Button type="primary" size="small" block onClick={() => saveEdit(r)}>
              Speichern
            </Button>
            <Button size="small" block onClick={cancelEdit}>
              Abbrechen
            </Button>
          </Space>
        ) : (
          <Space size="small">
            <Button size="small" onClick={() => startEdit(r)}>
              <EditOutlined />
            </Button>
            <Button
              danger
              size="small"
              onClick={async () => {
                const { error } = await supabase.from("app_purchase_orders_positions_normal").delete().eq("id", r.id);
                if (error) return message.error(error.message);
                await refreshPositions();
                message.success("Gelöscht");
              }}
            >
              <DeleteOutlined />
            </Button>
          </Space>
        ),
    },
  ];

  const columnsSpecial = [
    {
      title: "SKU",
      width: 240,
      render: (_: any, r: PosSpecial) => {
        const sb = productCache[Number(r.billbee_product_id)];
        const base = productCache[Number(r.base_model_billbee_product_id!)];
        return (
          <div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,.45)" }}>{sb?.name ?? "Sonderbestellung"}</div>
            <div style={{ fontWeight: 500 }}>{base?.sku ?? "—"}</div>
          </div>
        );
      },
    },
    {
      title: "Ext. SKU",
      width: 180,
      render: (_: any, r: PosSpecial) => {
        const base = productCache[Number(r.base_model_billbee_product_id!)];
        const effectiveExt = r.supplier_sku ?? base?.external_sku ?? "—";
        return editingSpecialId === r.id ? (
          <Input
            value={editBufSpecial.supplier_sku ?? ""}
            onChange={(e) => setEditBufSpecial((s) => ({ ...s, supplier_sku: e.target.value }))}
          />
        ) : (
          cellEllipsis(effectiveExt, effectiveExt)
        );
      },
    },
    {
      title: "Details",
      width: 320,
      render: (_: any, r: PosSpecial) => {
        const base = productCache[Number(r.base_model_billbee_product_id!)];
        const effectiveDetails = r.details_override ?? base?.purchase_details ?? "—";
        return editingSpecialId === r.id ? (
          <Input.TextArea
            value={editBufSpecial.details_override ?? ""}
            onChange={(e) => setEditBufSpecial((s) => ({ ...s, details_override: e.target.value }))}
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
        ) : (
          cellEllipsis(effectiveDetails, effectiveDetails)
        );
      },
    },
    {
      title: "Skizze",
      width: 200,
      render: (_: any, r: PosSpecial) => (
        <ConfirmSketchButton
          position={{
            id: r.id,
            sketch_needed: Boolean(r.sketch_needed),
            sketch_confirmed_at: r.sketch_confirmed_at,
            po_item_status: r.po_item_status,
          }}
          onSuccess={refreshPositions}
        />
      ),
    },
    {
      title: "Menge",
      width: 110,
      render: (_: any, r: PosSpecial) =>
        editingSpecialId === r.id ? (
          <InputNumber
            value={editBufSpecial.qty_ordered}
            onChange={(v) => setEditBufSpecial((s) => ({ ...s, qty_ordered: Number(v) }))}
            min={-100}
            step={1}
            className="w-full"
          />
        ) : (
          <Text>{r.qty_ordered}</Text>
        ),
    },
    {
      title: "EK Netto",
      width: 140,
      render: (_: any, r: PosSpecial) => {
        const base = productCache[Number(r.base_model_billbee_product_id!)];
        const effectivePrice = typeof r.unit_price_net === "number" ? r.unit_price_net : base?.net_purchase_price ?? 0;
        return editingSpecialId === r.id ? (
          <InputNumber
            value={
              typeof editBufSpecial.unit_price_net === "number"
                ? editBufSpecial.unit_price_net
                : editBufSpecial.unit_price_net === null
                ? null
                : r.unit_price_net ?? base?.net_purchase_price ?? null
            }
            onChange={(v) =>
              setEditBufSpecial((s) => ({ ...s, unit_price_net: v === null || v === undefined ? null : Number(v) }))
            }
            min={0}
            step={0.01}
            className="w-full"
          />
        ) : (
          <Text>{effectivePrice ?? "—"}</Text>
        );
      },
    },
    {
      title: "Gesamt Netto",
      width: 140,
      render: (_: any, r: PosSpecial) => {
        const base = productCache[Number(r.base_model_billbee_product_id!)];
        const price =
          editingSpecialId === r.id
            ? typeof editBufSpecial.unit_price_net === "number"
              ? editBufSpecial.unit_price_net
              : typeof r.unit_price_net === "number"
              ? r.unit_price_net
              : base?.net_purchase_price ?? 0
            : typeof r.unit_price_net === "number"
            ? r.unit_price_net
            : base?.net_purchase_price ?? 0;
        const qty =
          editingSpecialId === r.id
            ? typeof editBufSpecial.qty_ordered === "number"
              ? editBufSpecial.qty_ordered
              : r.qty_ordered ?? 0
            : r.qty_ordered ?? 0;
        return <Text>{(qty * (price || 0)).toFixed(2)}</Text>;
      },
    },
    {
      title: "Verladung erwartet (DoL)",
      width: 200,
      render: (_: any, r: PosSpecial) => <DolCell row={r} />,
    },
    {
      title: "Status",
      width: 160,
      render: (_: any, r: PosSpecial) => {
        const s = (r.po_item_status as ItemStatus) || effectiveItemStatus(r);
        const meta = ITEM_STATUS_META[s];
        const updateStatus = async (next: ItemStatus) => {
  const { error } = await supabase
    .from("app_purchase_orders_positions_special")
    .update({ po_item_status: next })
    .eq("id", r.id);
  if (error) return message.error(error.message);
  await refreshPositions();
  message.success("Status aktualisiert");
};

        return (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: (Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((k) => ({
                key: k,
                label: ITEM_STATUS_META[k].label,
                onClick: () => updateStatus(k),
              })),
            }}
          >
            <Tag color={meta.color} style={{ cursor: "pointer" }}>
              {meta.icon} {meta.label}
            </Tag>
          </Dropdown>
        );
      },
    },
    {
      title: "Dokumente",
      width: 120,
      render: (_: any, r: PosSpecial) =>
        editingSpecialId === r.id ? (
          <Input
            value={editBufSpecial.external_file_url ?? ""}
            onChange={(e) => setEditBufSpecial((s) => ({ ...s, external_file_url: e.target.value }))}
            placeholder="https://…"
          />
        ) : r.external_file_url ? (
          <Space>
            <Tooltip title="Planungsdokumente öffnen">
              <Button size="small" type="default" icon={<FileTextOutlined />} href={r.external_file_url as string} target="_blank" />
            </Tooltip>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "AB-Ref",
      width: 160,
      render: (_: any, r: PosSpecial) => cellEllipsis(r.order_confirmation_ref ?? "—", r.order_confirmation_ref ?? "—"),
    },
    {
      title: "Aktionen",
      width: 120,
      fixed: "right" as const,
      render: (_: any, r: PosSpecial) =>
        editingSpecialId === r.id ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Button type="primary" size="small" block onClick={() => saveEditSpecial(r)}>
              Speichern
            </Button>
            <Button size="small" block onClick={cancelEditSpecial}>
              Abbrechen
            </Button>
          </Space>
        ) : (
          <Space size="small">
            <Button size="small" onClick={() => startEditSpecial(r)}>
              <EditOutlined />
            </Button>
            <Button
              danger
              size="small"
              onClick={async () => {
                const { error } = await supabase.from("app_purchase_orders_positions_special").delete().eq("id", r.id);
                if (error) return message.error(error.message);
                await refreshPositions();
                message.success("Gelöscht");
              }}
            >
              <DeleteOutlined />
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <App>
      <div className="p-4">
        <Row justify="space-between" align="middle" className="mb-3">
          <Col>
            <h2 className="text-xl font-semibold">Bestellung bearbeiten</h2>
          </Col>
        </Row>

        <Tabs
          defaultActiveKey="main"
          items={[
            {
              key: "main",
              label: "Stammdaten",
              children: (
                <Card loading={loading}>
                  <Form form={form} layout="vertical">
                    <Row gutter={12}>
                      <Col xs={24} md={8}>
                        <Form.Item label="Bestellnummer" name="order_number">
                          <Input disabled />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          label="Lieferant"
                          name="supplier_id"
                          rules={[{ required: true, message: "Pflichtfeld" }]}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                            onChange={(val: string) => {
                              const s = suppliers.find((x) => x.id === val);
                              setOrderSupplierName(s?.name ?? null);
                            }}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          label="Status"
                          name="status"
                          rules={[{ required: true, message: "Pflichtfeld" }]}
                        >
                          <Select
                            options={STATUS_OPTIONS as any}   // oder PO_STATUS_OPTIONS, falls du die erweiterte Liste nutzt
                            onChange={handlePoStatusChange}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Bestellt am" name="ordered_at" rules={[{ required: true }]}>
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Proforma bestätigt" name="proforma_confirmed_at">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Skizze bestätigt" name="sketch_confirmed_at">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Lieferung geplant" name="dol_planned_at">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Verladung erwartet (DOL)" name="dol_actual_at">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Wareneingang" name="goods_received_at">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Rechnungsdatum" name="invoice_date">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Rechnungsnr." name="invoice_number">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Versandkosten (netto)" name="shipping_cost_net">
                          <InputNumber className="w-full" min={0} step={0.01} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={18}>
                        <Form.Item label="Notizen" name="notes">
                          <Input.TextArea rows={3} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row justify="end">
                      <Space>
                        <Button onClick={() => router.back()}>Zurück</Button>
                        <Button type="primary" loading={saving} onClick={onSave}>
                          Speichern
                        </Button>
                      </Space>
                    </Row>
                  </Form>
                </Card>
              ),
            },
            {
              key: "pos",
              label: "Positionen",
              children: (
                <div>
                  {/* Normale Positionen */}
                  <Card
                    title={
                      <Space>
                        <span>Normale Positionen</span>
                      </Space>
                    }
                    className="mb-4"
                    extra={
                      <Space>
                        <Dropdown menu={batchMenu("normal")} trigger={["click"]}>
                          <Button size="small">Batch</Button>
                        </Dropdown>
                        <Button onClick={() => setOpenNormal(true)}>+ Hinzufügen</Button>
                      </Space>
                    }
                  >
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={posNormal as any}
                      pagination={false}
                      columns={columnsNormal as any}
                      tableLayout="fixed"
                      scroll={{ x: 1400 }}
                      style={{ wordBreak: "break-word" }}
                      rowSelection={{
                        selectedRowKeys: selectedNormalKeys,
                        onChange: (keys) => setSelectedNormalKeys(keys),
                      }}
                    />
                  </Card>

                  {/* Sonder-Positionen */}
                  <Card
                    title="Sonder-Positionen"
                    extra={
                      <Space>
                        <Dropdown menu={batchMenu("special")} trigger={["click"]}>
                          <Button size="small">Batch</Button>
                        </Dropdown>
                        <Button onClick={() => setOpenSpecial(true)}>+ Hinzufügen</Button>
                      </Space>
                    }
                  >
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={posSpecial as any}
                      pagination={false}
                      columns={columnsSpecial as any}
                      tableLayout="fixed"
                      scroll={{ x: 1500 }}
                      style={{ wordBreak: "break-word" }}
                      rowSelection={{
                        selectedRowKeys: selectedSpecialKeys,
                        onChange: (keys) => setSelectedSpecialKeys(keys),
                      }}
                    />
                  </Card>
                </div>
              ),
            },
          ]}
        />

        {/* Modal: Normal */}
        <Modal
          title="Normale Position hinzufügen"
          open={openNormal}
          onCancel={() => {
            setOpenNormal(false);
            setSelectedFullNormal(null);
            formNormal.resetFields();
          }}
          onOk={submitNormal}
          okText="Hinzufügen"
          cancelText="Abbrechen"
        >
          <Form form={formNormal} layout="vertical">
            <Form.Item label="Produkt suchen (SKU / Titel / Einkaufstext)">
              <AutoComplete
                onSearch={(q) => searchProducts(q, "normal")}
                options={optionsNormal}
                onSelect={(_, o) => onSelectNormal(_, o as any)}
                placeholder="Gefiltert nach Lieferant (manufacturer)"
                notFoundContent={searchingNormal ? "Suche..." : undefined}
                className="w-full"
                filterOption={false}
              />
            </Form.Item>

            {selectedFullNormal && (
              <Descriptions size="small" column={1} className="mb-2">
                <Descriptions.Item label="SKU">{selectedFullNormal.sku ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Hersteller">{selectedFullNormal.manufacturer ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Ext. SKU">{selectedFullNormal.external_sku ?? "—"}</Descriptions.Item>
                <Descriptions.Item label="Einkaufsdetails (Vorschlag)">
                  {selectedFullNormal.purchase_details ?? "—"}
                </Descriptions.Item>
                <Descriptions.Item label="Letzter EK (Vorschlag)">
                  {selectedFullNormal.net_purchase_price ?? "—"}
                </Descriptions.Item>
              </Descriptions>
            )}

            <Form.Item name="billbee_product_id" hidden rules={[{ required: true }]}>
              <InputNumber />
            </Form.Item>

            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="EK Netto" name="unit_price_net" rules={[{ required: true }]}>
                  <InputNumber className="w-full" min={0} step={0.01} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Menge" name="qty_ordered" initialValue={1} rules={[{ required: true }]}>
                  <InputNumber className="w-full" min={-100} step={1} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="EK Anmerkungen" name="internal_notes">
              <Input.TextArea className="w-full" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal: Sonder */}
        <Modal
          title="Sonder-Position hinzufügen"
          open={openSpecial}
          onCancel={() => {
            setOpenSpecial(false);
            setSelectedFullSpecial(null);
            setSelectedBaseModel(null);
            formSpecial.resetFields();
          }}
          onOk={submitSpecial}
          okText="Hinzufügen"
          cancelText="Abbrechen"
        >
          <Form form={formSpecial} layout="vertical">
            <Form.Item label='SB-Produkt wählen ("Sonder ...")' required>
              <AutoComplete
                onSearch={(q) => searchProducts(q, "special")}
                options={optionsSpecial}
                onSelect={(_, o) => onSelectSpecial(_, o as any)}
                placeholder='Elternartikel (Sonder …), gefiltert nach manufacturer'
                notFoundContent={searchingSpecial ? "Suche..." : undefined}
                className="w-full"
                filterOption={false}
              />
            </Form.Item>

            <Form.Item label="Grundmodell wählen" required>
              <AutoComplete
                onSearch={(q) => searchProducts(q, "base")}
                options={optionsBase}
                onSelect={(_, o) => onSelectBaseModel(_, o as any)}
                placeholder="Grundmodell (liefert Ext. SKU / EK / Details)"
                notFoundContent={searchingBase ? "Suche..." : undefined}
                className="w-full"
                filterOption={false}
              />
            </Form.Item>

            {(selectedFullSpecial || selectedBaseModel) && (
              <Descriptions size="small" column={1} className="mb-2">
                {selectedFullSpecial && (
                  <Descriptions.Item label="SB-Produkt">{selectedFullSpecial.name ?? "—"}</Descriptions.Item>
                )}
                {selectedBaseModel && (
                  <>
                    <Descriptions.Item label="Grundmodell SKU">{selectedBaseModel.sku ?? "—"}</Descriptions.Item>
                    <Descriptions.Item label="Grundmodell Ext. SKU">
                      {selectedBaseModel.external_sku ?? "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Details (Vorschlag)">{selectedBaseModel.purchase_details ?? "—"}</Descriptions.Item>
                    <Descriptions.Item label="EK (Vorschlag)">{selectedBaseModel.net_purchase_price ?? "—"}</Descriptions.Item>
                  </>
                )}
              </Descriptions>
            )}

            {/* Hidden IDs */}
            <Form.Item name="billbee_product_id" hidden rules={[{ required: true }]}>
              <InputNumber />
            </Form.Item>
            <Form.Item name="base_model_billbee_product_id" hidden rules={[{ required: true }]}>
              <InputNumber />
            </Form.Item>

            {/* Überschreibbare Felder */}
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Ext. SKU (Override)" name="supplier_sku">
                  <Input placeholder="leer = Grundmodell-Ext. SKU verwenden" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="EK Netto (Override)" name="unit_price_net">
                  <InputNumber className="w-full" min={0} step={0.01} placeholder="leer = Grundmodell-EK" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Beschreibung (Details Override)" name="details_override">
              <Input.TextArea placeholder="leer = Grundmodell-Details" />
            </Form.Item>

            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Menge" name="qty_ordered" initialValue={1} rules={[{ required: true }]}>
                  <InputNumber className="w-full" min={0.001} step={0.001} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="AB-Referenz" name="order_confirmation_ref">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="Planungsdokumente (Link)" name="external_file_url">
              <Input prefix={<LinkOutlined />} placeholder="https://…" />
            </Form.Item>
            <Form.Item label="Skizze benötigt" name="sketch_needed" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </App>
  );
}
