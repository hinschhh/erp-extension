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
  Switch,
  Alert,
  Steps,
  Progress,
  Divider
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

// -------------------- DB-Typen --------------------
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

// -------- Order-Status (UI – DB ist maßgeblich) --------
const STATUS_OPTIONS = [
  { value: "draft", label: "Entwurf" },
  { value: "ordered", label: "Bestellt" },
  { value: "confirmed", label: "Bestätigt" },
  { value: "partially_in_production", label: "Teilw. in Produktion", disabled: true },
  { value: "in_production", label: "In Produktion", disabled: true },
  { value: "partially_delivered", label: "Teilw. geliefert", disabled: true },
  { value: "delivered", label: "Geliefert", disabled: true },
  { value: "cancelled", label: "Storniert" },
] as const;

const toDate = (d?: string | null) => (d ? dayjs(d) : undefined);
const fromDate = (d?: Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);

// UI-Helfer (Overflow vermeiden)
const cellEllipsis = (content?: React.ReactNode, tooltip?: React.ReactNode) => (
  <Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: tooltip ?? content }}>
    {content ?? "—"}
  </Paragraph>
);
// --- Helper: Geldformat ---
const formatEUR = (n: number) =>
  (n ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

// --- Helper: Status → Step-Index ---
const statusToStepIndex = (s?: Po["status"]) => {
  switch (s) {
    case "draft": return 0;
    case "ordered": return 1;
    // alles ab "confirmed" bis inkl. teilw. geliefert zählt als Step 2..3
    case "confirmed":
    case "in_production":
    case "partially_in_production":
      return 2;
    case "partially_delivered":
    case "delivered":
      return 3;
    case "cancelled":
      return 3; // wir zeigen zusätzlich ein rotes Tag im UI (s.u.)
    default:
      return 0;
  }
};


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

// Fallback-Ableitung nur für Anzeige (DB ist Quelle der Wahrheit)
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
  return "draft";
};

const effectiveItemStatus = (r: any): ItemStatus => {
  const db = r?.po_item_status as ItemStatus | undefined;
  if (db) return db;
  return deriveItemStatusFromDates(r);
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
        const { error } = await supabase.rpc("rpc_po_confirm_sketch", {
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

// -------------------- Seite --------------------
export default function BestellungBearbeitenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowserClient, []);
  const { message } = App.useApp();

  const [form] = Form.useForm<Po>();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [orderSupplierName, setOrderSupplierName] = React.useState<string | null>(null);

  const [posNormal, setPosNormal] = React.useState<PosNormal[]>([]);
  const [posSpecial, setPosSpecial] = React.useState<PosSpecial[]>([]);

  // Tabellen-Paginierung
  const [pageNormal, setPageNormal] = React.useState(1);
  const [pageSpecial, setPageSpecial] = React.useState(1);
  const pageSize = 50;

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

    // Für die Auswertung:
  // --- Summen Positionen ---
const sumNormal = posNormal.reduce(
  (acc, r) => acc + Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0),
  0,
);
const sumSpecial = posSpecial.reduce(
  (acc, r) => acc + Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0),
  0,
);
const sumPositions = sumNormal + sumSpecial;

// --- Versandkosten / Separate Invoice (robust auf beide Schreibweisen) ---
const shipping = Number(form.getFieldValue("shipping_cost_net") ?? 0);
const separateInvoice =
  Boolean(
    form.getFieldValue("separate_invoice_for_shipping_cost"),
  );

// Versandkosten, die auf der Rechnung dieser Bestellung stehen
const shippingOnInvoice = separateInvoice ? 0 : shipping;

// Versandkosten als Anschaffungsnebenkosten (separate Rechnung)
const ancillaryCosts = separateInvoice ? shipping : 0;

// Rechnungssumme (nur Positionen + evtl. Versand auf Rechnung)
const invoiceSum = sumPositions + shippingOnInvoice;

// Anschaffungskosten (Rechnungssumme + Nebenkosten)
const acquisitionCost = invoiceSum + ancillaryCosts;

// --- Status-Helper ---
const isActiveItem = (p: any) => {
  const s = effectiveItemStatus(p);
  return s !== "paused" && s !== "cancelled";
};

// --- Zählungen pausiert/storniert (für Hinweis) ---
const pausedNormal = posNormal.filter((p) => effectiveItemStatus(p) === "paused").length;
const pausedSpecial = posSpecial.filter((p) => effectiveItemStatus(p) === "paused").length;
const cancelledNormal = posNormal.filter((p) => effectiveItemStatus(p) === "cancelled").length;
const cancelledSpecial = posSpecial.filter((p) => effectiveItemStatus(p) === "cancelled").length;

const pausedTotal = pausedNormal + pausedSpecial;
const cancelledTotal = cancelledNormal + cancelledSpecial;

// --- Aktive Positionen (für Progress-Berechnungen) ---
const normalActive = posNormal.filter(isActiveItem);
const specialActive = posSpecial.filter(isActiveItem);

const totalActiveNormal = normalActive.length;
const totalActiveSpecial = specialActive.length;
const totalActivePositions = totalActiveNormal + totalActiveSpecial;

// --- Delivered-Progress (nur aktive Positionen) ---
const deliveredActiveNormal = normalActive.filter((p) => effectiveItemStatus(p) === "delivered").length;
const deliveredActiveSpecial = specialActive.filter((p) => effectiveItemStatus(p) === "delivered").length;
const deliveredActiveTotal = deliveredActiveNormal + deliveredActiveSpecial;

const deliveredPercent = totalActivePositions
  ? Math.round((deliveredActiveTotal / totalActivePositions) * 100)
  : 0;

// --- Sketch-Progress (nur aktive Sonder-Positionen mit sketch_needed = true) ---
const sketchRequired = specialActive.filter((p) => Boolean(p.sketch_needed)).length;
const sketchConfirmed = specialActive.filter((p) => Boolean(p.sketch_needed) && p.sketch_confirmed_at).length;

const sketchPercent = sketchRequired ? Math.round((sketchConfirmed / sketchRequired) * 100) : 0;


// --- Verspätungsinfo wie gehabt ---
const dolPlanned = form.getFieldValue("dol_planned_at") as Dayjs | undefined;
const dolActual  = form.getFieldValue("dol_actual_at") as Dayjs | undefined;
const hasDelay   = dolPlanned && dolActual && dolActual.isAfter(dolPlanned);
const delayDays  = hasDelay ? dolActual!.diff(dolPlanned!, "day") : 0;



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

  // =====================
// Produkt-Suche & Select-Handler
// =====================

// (Optional) Umschalter, falls ihr in rpt_products_full bereits eine FTS-Spalte wie "fts" / "search" habt.
const ENABLE_FTS = false; // auf true setzen, wenn tsvector-Spalte existiert

// Supabase-Suche nach Produkten – gefiltert nach Hersteller = Lieferant
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

    // 1) Versuch: Full-Text-Search (wenn konfiguriert)
    let data: any[] | null = null;
    let error: any = null;

    if (ENABLE_FTS) {
  const { data: d1, error: e1 } = await supabase
    .from("rpt_products_full")
    .select("id,sku,external_sku,name,manufacturer,purchase_details,net_purchase_price")
    .ilike("manufacturer", `%${supplierName}%`)
    // PostgREST-Operator für Fulltext:
    // 'wfts' = websearch_to_tsquery, alternativ: 'plfts' (plainto), 'phfts' (phrase), 'fts' (to_tsquery)
    .filter("sku", "wfts", q)
    .limit(100);

  data = d1 ?? null;
  error = e1 ?? null;
}

    // 2) Fallback: ILIKE auf ein paar Felder
    if (!ENABLE_FTS || error) {
      const { data: d2, error: e2 } = await supabase
        .from("rpt_products_full")
        .select("id,sku,external_sku,name,manufacturer,purchase_details,net_purchase_price")
        .ilike("manufacturer", `%${supplierName}%`)
        .or(
          [
            `external_sku.ilike.%${q}%`,
            `name.ilike.%${q}%`,
            `purchase_details.ilike.%${q}%`,
            `sku.ilike.%${q}%`,
          ].join(","),
        )
        .limit(100);
      data = d2 ?? null;
      error = e2 ?? null;
    }

    if (error) {
      if (mode === "normal") setSearchingNormal(false);
      if (mode === "special") setSearchingSpecial(false);
      if (mode === "base") setSearchingBase(false);
      return message.error(error.message || "Produktsuche fehlgeschlagen.");
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
  [
    orderSupplierName,
    supabase,
    message,
    setOptionsNormal,
    setOptionsSpecial,
    setOptionsBase,
    setSearchingNormal,
    setSearchingSpecial,
    setSearchingBase,
  ],
);

// Kleiner Bestätigungsdialog, falls Details-Override überschrieben werden würde
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

// Auswahl-Handler: Normale Position – füllt Vorschlagsfelder im Modal
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

// Auswahl-Handler: Sonder-Position – wählt SB-Produkt
const onSelectSpecial = async (_: string, option: Option) => {
  const full = option.full;
  setSelectedFullSpecial(full);
  formSpecial.setFieldsValue({
    billbee_product_id: Number(option.value),
  } as any);
};

// Auswahl-Handler: Grundmodell – übernimmt Ext. SKU, EK & Details als Vorschlag
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

  // Merker für vorherigen Status (zurücksetzen bei Abbruch)
  const [prevPoStatus, setPrevPoStatus] = React.useState<Po["status"] | undefined>(undefined);

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
          separate_invoice_for_shipping_cost: (po as any)?.separate_invoice_for_shipping_cost ?? undefined,
          ordered_at: toDate(po.ordered_at) as any,
          proforma_confirmed_at: toDate(po.proforma_confirmed_at) as any,
          sketch_confirmed_at: toDate(po.sketch_confirmed_at) as any,
          dol_planned_at: toDate(po.dol_planned_at) as any,
          dol_actual_at: toDate(po.dol_actual_at) as any,
          goods_received_at: toDate(po.goods_received_at) as any,
          invoice_date: toDate(po.invoice_date) as any,
        });
        setPrevPoStatus(po.status);
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
      // Nur Felder, die nicht statusrelevant sind, gehen direkt per Update
      const payload: PoUpdate = {
        supplier_id: v.supplier_id!,

        invoice_number: v.invoice_number ?? null,
        invoice_date: fromDate(v.invoice_date as any),
        shipping_cost_net: v.shipping_cost_net ?? 0,
                separate_invoice_for_shipping_cost:
          typeof v.separate_invoice_for_shipping_cost === "boolean"
          ? v.separate_invoice_for_shipping_cost
          : null,
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

  // Supplier-Leadtime (Tage) – optionales Feld in Supplier
  const getSupplierLeadtimeDays = React.useCallback(() => {
    const supId = form.getFieldValue("supplier_id") as string | undefined;
    if (!supId) return 0;
    const s = suppliers.find((x) => x.id === supId);
    const dlt = (s as any)?.default_leadtime_days as number | null | undefined;
    return Number.isFinite(dlt) ? (dlt as number) : 0;
  }, [form, suppliers]);

  // ----------- Statuswechsel der Bestellung (RPC) -----------
  const handlePoStatusChange = (next: Po["status"]) => {
    const current = form.getFieldValue("status") as Po["status"] | undefined;

    // Wechsel auf "confirmed" → DOL-Dialog & RPC
    if (next === "confirmed") {
      const lead = getSupplierLeadtimeDays();
      let picked: Dayjs | null = dayjs().add(lead, "day");

      Modal.confirm({
        title: "Geplantes Verladedatum (DOL) festlegen",
        content: (
          <div>
            <p className="mb-2">
              Vorschlag: <b>{dayjs().add(lead, "day").format("DD.MM.YYYY")}</b> (heute + {lead} Tage Leadtime)
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
          const dateStr =
            picked ? picked.format("YYYY-MM-DD") : dayjs().add(lead, "day").format("YYYY-MM-DD");

          const { error } = await supabase.rpc("rpc_po_set_status", {
            p_po_id: id,
            p_next: "confirmed",
            p_dol_planned: dateStr,
          });

          if (error) {
            message.error(error.message);
            form.setFieldsValue({ status: prevPoStatus ?? "ordered" });
            return Promise.reject();
          }

          await refreshPositions();
          setPrevPoStatus("confirmed");
          form.setFieldsValue({ status: "confirmed", dol_planned_at: toDate(dateStr) as any });
          message.success("Bestellung bestätigt & geplanter DOL gesetzt");
          return Promise.resolve();
        },
        onCancel() {
          form.setFieldsValue({ status: current ?? prevPoStatus ?? "ordered" });
        },
      });

      return;
    }

    // Sonstige Statuswechsel → RPC ohne DOL
    Modal.confirm({
      title: "Status ändern?",
      content: `Status wird auf „${STATUS_OPTIONS.find((s) => s.value === next)?.label}“ gesetzt.`,
      okText: "Übernehmen",
      cancelText: "Abbrechen",
      async onOk() {
        const { error } = await supabase.rpc("rpc_po_set_status", {
          p_po_id: id,
          p_next: next,
          p_dol_planned: null,
        });
        if (error) {
          message.error(error.message);
          form.setFieldsValue({ status: current ?? prevPoStatus ?? "ordered" });
          return Promise.reject();
        }
        setPrevPoStatus(next);
        form.setFieldsValue({ status: next });
        message.success("Status aktualisiert");
        return Promise.resolve();
      },
      onCancel() {
        form.setFieldsValue({ status: current ?? prevPoStatus ?? "ordered" });
      },
    });
  };

  // --------- Hilfs-Komponente: DOL (Einzel-Edit in Tabelle) ---------
  const DolCell: React.FC<{ row: PosNormal | PosSpecial }> = ({ row }) => {
    const value = (row as any).dol_actual_at as string | null | undefined;

    return (
      <Space.Compact className="w-full">
        <DatePicker
          className="w-full"
          value={toDate(value ?? null) as any}
          onChange={async (d) => {
            const { error } = await supabase.rpc("rpc_po_set_dol_actual", {
              p_item_id: row.id,
              p_dol_actual: fromDate(d ?? null),
            });
            if (error) return message.error(error.message);
            await refreshPositions();
            message.success("DOL aktualisiert");
          }}
        />
        {/* Verzögerung berechnen und anzeigen */}
        {(row as any).dol_actual_at &&
          (row as any).dol_planned_at &&
          dayjs((row as any).dol_actual_at).isAfter(dayjs((row as any).dol_planned_at)) && (
            <Typography.Text type="danger">
              {dayjs((row as any).dol_actual_at).diff(dayjs((row as any).dol_planned_at), "day")} Tage verzögert
            </Typography.Text>
          )}
      </Space.Compact>
    );
  };

  // -------- Batch-Menü (Status-Updates) --------
  const batchMenu = (kind: "normal" | "special") => {
    const ids = kind === "normal" ? selectedNormalKeys : selectedSpecialKeys;




    const setBatchStatus = async (next: ItemStatus) => {
      if (!ids.length) {
        message.info("Bitte Positionen auswählen.");
        return;
      }

      if (isBeforeConfirmed) {
        message.info("Positionsstatus können erst ab Bestätigung geändert werden.");
        return { items: [] };
      }

      if (next === "cancelled") {
          Modal.confirm({
            title: "Ausgewählte Positionen stornieren?",
            content: "Achtung: Dieser Schritt kann nicht rückgängig gemacht werden.",
            okText: "Ja, stornieren",
            okButtonProps: { danger: true },
            cancelText: "Abbrechen",
            async onOk() {
              await doBatch();
            },
          });
          return;
        }
        await doBatch();

        async function doBatch() {
          const { data, error } = await supabase.rpc("rpc_po_bulk_item_status", {
            p_po_id: id,
            p_item_ids: ids as string[],
            p_next: next,
          });
          if (error) {
            message.error(error.message);
            return;
          }
          await refreshPositions();
          if (kind === "normal") setSelectedNormalKeys([]);
          else setSelectedSpecialKeys([]);
          const fails = (data?.fail as any[]) || [];
          if (fails.length) {
            message.warning(`${ids.length - fails.length} Position(en) aktualisiert, ${fails.length} mit Fehlern.`);
          } else {
            message.success(`${ids.length} Position(en) auf "${ITEM_STATUS_META[next].label}" gesetzt`);
          }
        }

      const { data, error } = await supabase.rpc("rpc_po_bulk_item_status", {
        p_po_id: id,
        p_item_ids: ids as string[],
        p_next: next,
      });

      if (error) {
        message.error(error.message);
        return;
      }

      await refreshPositions();
      if (kind === "normal") setSelectedNormalKeys([]);
      else setSelectedSpecialKeys([]);

      // Kleine Auswertung: falls es Fehlschläge gibt
      const fails = (data?.fail as any[]) || [];
      if (fails.length) {
        message.warning(`${ids.length - fails.length} Position(en) aktualisiert, ${fails.length} mit Fehlern.`);
      } else {
        message.success(`${ids.length} Position(en) auf "${ITEM_STATUS_META[next].label}" gesetzt`);
      }
    };

    const statusChoices = (Object.keys(ITEM_STATUS_META) as ItemStatus[])
      .filter((k) => k !== "draft")
      .map((k) => ({
        key: `status_${k}`,
        label: ITEM_STATUS_META[k].label,
        onClick: () => setBatchStatus(k),
      }));

    return { items: statusChoices };
  };

  const s = form.getFieldValue("status") as Po["status"] | undefined;
  // -------- UI: Statusabhängige Sperren --------
  const isConfirmedOrBeyond = (() => {
    return !!s && ["confirmed", "partially_in_production", "in_production", "partially_delivered", "delivered"].includes(s);
  })();

  const isBeforeConfirmed = !!s && (s === "draft" || s === "ordered");

  

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
          editingId === r.id
            ? typeof editBuf.qty_ordered === "number"
              ? editBuf.qty_ordered
              : 0
            : (r.qty_ordered as number);
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
  title: "Versand anteilig",
  width: 140,
  render: (_: any, r: PosNormal) => {
    const ship = Number((r as any).shipping_costs_proportional ?? 0);
    return <Text>{formatEUR(ship)}</Text>;
  },
},
{
  // Optional: Anschaffungskosten pro Position (Summe + anteiliger Versand)
  title: "Anschaffung (netto)",
  width: 160,
  render: (_: any, r: PosNormal) => {
    const qty = Number(r.qty_ordered ?? 0);
    const unit = Number(r.unit_price_net ?? 0);
    const line = qty * unit;
    const ship = Number((r as any).shipping_costs_proportional ?? 0);
    const acq = line + ship;
    return (
      <Tooltip title={`Zeile: ${formatEUR(line)} + Versand: ${formatEUR(ship)}`}>
        <Text strong>{formatEUR(acq)}</Text>
      </Tooltip>
    );
  },
},

    {
      title: "Verladung erwartet (DoL)",
      width: 240,
      render: (_: any, r: PosNormal) => <DolCell row={r} />,
    },
    {
      title: "Status",
      width: 160,
      render: (_: any, r: PosNormal) => {
        const s = (r.po_item_status as ItemStatus) || effectiveItemStatus(r);
        const meta = ITEM_STATUS_META[s];
        const confirmAndUpdateStatus = async (next: ItemStatus) => {
          if (next === "cancelled") {
            Modal.confirm({
              title: "Position stornieren?",
              content: "Achtung: Dieser Schritt kann nicht rückgängig gemacht werden.",
              okText: "Ja, stornieren",
              okButtonProps: { danger: true },
              cancelText: "Abbrechen",
              async onOk() {
                const { error } = await supabase.rpc("rpc_po_item_set_status", {
                  p_item_id: r.id,
                  p_next: next,
                });
                if (error) return message.error(error.message);
                await refreshPositions();
                message.success("Position storniert");
              },
            });
            return;
          }

          const { error } = await supabase.rpc("rpc_po_item_set_status", {
            p_item_id: r.id,
            p_next: next,
          });
          if (error) return message.error(error.message);
          await refreshPositions();
          message.success("Status aktualisiert");
        };


        return (
          <Dropdown
            trigger={["click"]}
            disabled={isBeforeConfirmed} // NEU: vor Bestätigung gesperrt
            menu={{
              items: (Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((k) => ({
                key: k,
                label: ITEM_STATUS_META[k].label,
                onClick: () => confirmAndUpdateStatus(k), // siehe unten
              })),
            }}
          >
            <Tag color={meta.color} style={{ cursor: isBeforeConfirmed ? "not-allowed" : "pointer" }}>
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
            <Button size="small" onClick={() => startEdit(r)} disabled={isConfirmedOrBeyond}>
              <EditOutlined />
            </Button>
            <Button
              danger
              size="small"
              disabled={isConfirmedOrBeyond}
              onClick={async () => {
                const { error } = await supabase
                  .from("app_purchase_orders_positions_normal")
                  .delete()
                  .eq("id", r.id);
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
      width: 220,
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
        const effectivePrice =
          typeof r.unit_price_net === "number" ? r.unit_price_net : base?.net_purchase_price ?? 0;
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
              setEditBufSpecial((s) => ({
                ...s,
                unit_price_net: v === null || v === undefined ? null : Number(v),
              }))
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
  title: "Versand anteilig",
  width: 140,
  render: (_: any, r: PosNormal) => {
    const ship = Number((r as any).shipping_costs_proportional ?? 0);
    return <Text>{formatEUR(ship)}</Text>;
  },
},
{
  // Optional: Anschaffungskosten pro Position (Summe + anteiliger Versand)
  title: "Anschaffung (netto)",
  width: 160,
  render: (_: any, r: PosNormal) => {
    const qty = Number(r.qty_ordered ?? 0);
    const unit = Number(r.unit_price_net ?? 0);
    const line = qty * unit;
    const ship = Number((r as any).shipping_costs_proportional ?? 0);
    const acq = line + ship;
    return (
      <Tooltip title={`Zeile: ${formatEUR(line)} + Versand: ${formatEUR(ship)}`}>
        <Text strong>{formatEUR(acq)}</Text>
      </Tooltip>
    );
  },
},

    {
      title: "Verladung erwartet (DoL)",
      width: 240,
      render: (_: any, r: PosSpecial) => <DolCell row={r} />,
    },
    {
      title: "Status",
      width: 160,
      render: (_: any, r: PosSpecial) => {
        const s = (r.po_item_status as ItemStatus) || effectiveItemStatus(r);
        const meta = ITEM_STATUS_META[s];
        const confirmAndUpdateStatus = async (next: ItemStatus) => {
          if (next === "cancelled") {
            Modal.confirm({
              title: "Position stornieren?",
              content: "Achtung: Dieser Schritt kann nicht rückgängig gemacht werden.",
              okText: "Ja, stornieren",
              okButtonProps: { danger: true },
              cancelText: "Abbrechen",
              async onOk() {
                const { error } = await supabase.rpc("rpc_po_item_set_status", {
                  p_item_id: r.id,
                  p_next: next,
                });
                if (error) return message.error(error.message);
                await refreshPositions();
                message.success("Position storniert");
              },
            });
            return;
          }

          const { error } = await supabase.rpc("rpc_po_item_set_status", {
            p_item_id: r.id,
            p_next: next,
          });
          if (error) return message.error(error.message);
          await refreshPositions();
          message.success("Status aktualisiert");
        };


        return (
      <Dropdown
        trigger={["click"]}
        disabled={isBeforeConfirmed} // NEU: vor Bestätigung gesperrt
        menu={{
          items: (Object.keys(ITEM_STATUS_META) as ItemStatus[]).map((k) => ({
            key: k,
            label: ITEM_STATUS_META[k].label,
            onClick: () => confirmAndUpdateStatus(k), // siehe unten
          })),
        }}
      >
  <Tag color={meta.color} style={{ cursor: isBeforeConfirmed ? "not-allowed" : "pointer" }}>
    {meta.icon} {meta.label}
  </Tag>
</Dropdown>

        );
      },
    },
    {
      title: "Dokumente",
      width: 140,
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
              <Button
                size="small"
                type="default"
                icon={<FileTextOutlined />}
                href={r.external_file_url as string}
                target="_blank"
              />
            </Tooltip>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "AB-Ref",
      width: 160,
      render: (_: any, r: PosSpecial) =>
        cellEllipsis(r.order_confirmation_ref ?? "—", r.order_confirmation_ref ?? "—"),
    },
    {
      title: "Aktionen",
      width: 120,
      fixed: "right" as const,
      render: (_: any, r: PosSpecial) =>
        editingSpecialId === r.id ? (
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Button type="primary" size="small" block onClick={() => saveEditSpecial(r)} disabled={isConfirmedOrBeyond}>
              Speichern
            </Button>
            <Button size="small" block onClick={cancelEditSpecial}>
              Abbrechen
            </Button>
          </Space>
        ) : (
          <Space size="small">
            <Button size="small" onClick={() => startEditSpecial(r)} disabled={isConfirmedOrBeyond}>
              <EditOutlined />
            </Button>
            <Button
              danger
              size="small"
              disabled={isConfirmedOrBeyond}
              onClick={async () => {
                const { error } = await supabase
                  .from("app_purchase_orders_positions_special")
                  .delete()
                  .eq("id", r.id);
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

  // ----- Inline-Edit (Normal)
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
    setEditBuf({});
  };
  const saveEdit = async (row: PosNormal) => {
    const qty = typeof editBuf.qty_ordered === "number" ? editBuf.qty_ordered : 0;
    const price =
      typeof editBuf.unit_price_net === "number" || editBuf.unit_price_net === null
        ? editBuf.unit_price_net
        : 0;

    const payload: Partial<PosNormal> = {
      qty_ordered: qty,
      unit_price_net: (price as number) ?? 0.0,
      internal_notes: (editBuf.internal_notes ?? "") === "" ? null : editBuf.internal_notes ?? null,
    };

    const { error } = await supabase
      .from("app_purchase_orders_positions_normal")
      .update(payload)
      .eq("id", row.id);

    if (error) {
      message.error(`${error.message} (Fehlerdetails für Dev)`);
      return;
    }

    await refreshPositions();
    message.success("Position aktualisiert");
    cancelEdit();
  };

  // ----- Inline-Edit (Special)
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
    };

    const { error } = await supabase
      .from("app_purchase_orders_positions_special")
      .update(payload)
      .eq("id", row.id);

    if (error) {
      message.error(`${error.message} (Fehlerdetails für Dev)`);
      return;
    }

    await refreshPositions();
    message.success("Sonder-Position aktualisiert");
    cancelEditSpecial();
  };

  return (
    <App>
      <div className="p-4">
        <Row justify="space-between" align="middle" className="mb-3">
          <Col>
            <h2 className="text-xl font-semibold">Bestellung bearbeiten</h2>
          </Col>
          <Col>
            <Button onClick={() => router.push("/einkauf/bestellungen")}>zur Übersicht</Button>
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

                    {/* --- Prozess-Schritte (statt DatePickers) --- */}
                    <Row className="mb-3">
                      <Col span={24}>
                        <Steps
                          current={statusToStepIndex(form.getFieldValue("status"))}
                          items={[
                            { title: "Entwurf" },
                            { title: "Bestellt" },
                            { title: "Bestätigt" },
                            { title: "Geliefert" },
                          ]}
                        />
                        {form.getFieldValue("status") === "cancelled" && (
                          <div style={{ marginTop: 8 }}>
                            <Tag color="red">Storniert</Tag>
                          </div>
                        )}
                      </Col>
                    </Row>
                    <Divider />
                    {/* --- Kopfzeile --- */}
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

                              const current = form.getFieldValue("separate_invoice_for_shipping_cost");
                              if (current === undefined || current === null) {
                                const supDefault = (s as any)?.separate_invoice_for_shipping_cost;
                                if (typeof supDefault === "boolean") {
                                  form.setFieldsValue({ separate_invoice_for_shipping_cost: supDefault });
                                }
                              }
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
                          <Select options={STATUS_OPTIONS as any} onChange={handlePoStatusChange} />
                        </Form.Item>
                      </Col>
                    </Row>


                    {/* --- Rechnungsdaten / Versandkosten / Notizen (eine Reihe nach oben geschoben) --- */}
                    <Row gutter={12}>
                      <Col xs={24} md={6}>
                        <Form.Item label="Rechnungsnr." name="invoice_number">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Rechnungsdatum" name="invoice_date">
                          <DatePicker className="w-full" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label="Versandkosten (netto)" name="shipping_cost_net">
                          <InputNumber className="w-full" min={0} step={0.01} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          label="Versandkosten separat abrechnen?"
                          name="separate_invoice_for_shipping_cost"
                          valuePropName="checked"
                        >
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={12}>
                      <Col xs={24} md={24}>
                        <Form.Item label="Anmerkungen" name="notes">
                          <Input.TextArea rows={3} />
                        </Form.Item>
                      </Col>
                    </Row>
                    
                    {/* --- Fuß: Speichern / Zurück --- */}
                    <div style={{ marginTop: 16 }} />
                    <Row justify="end">
                      <Space>
                        <Button onClick={() => router.back()}>Zurück</Button>
                        <Button type="primary" loading={saving} onClick={onSave}>
                          Speichern
                        </Button>
                      </Space>
                    </Row>
                    <Divider />

                    {/* --- Auswertung --- */}
                    <Row gutter={[12, 12]}>
                      {/* Linke Spalte: Beträge & Aufschlüsselung */}
                      <Col>
                        <Card size="small" title="Rechnungs-/Kostenübersicht">
                          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 6 }}>
                            <Col>
                              <Row>
                                <Text>Summe Positionen</Text>
                              </Row>
                              <Row>
                              <Text>
                                + Versandkosten <Text type="secondary">(auf Rechnung)</Text>
                              </Text>
                              </Row>
                              <Row>
                              <Divider style={{ margin: "8px 0" }} />

                              <Text strong>Rechnungssumme</Text>
                              </Row>
                              <Row>
                              <Text>
                                + Anschaffungsnebenkosten{" "}
                                <Text type="secondary">(Versandkosten bei separater Rechnung)</Text>
                              </Text>
                              </Row>
                              <Row>
                              <Divider style={{ margin: "8px 0" }} />

                              <Text strong>Anschaffungskosten</Text>
                              </Row>
                            </Col>
                            <Col>
                              <Row>
                                <Text strong>{formatEUR(sumPositions)}</Text>
                              </Row>
                              <Row>
                              <Text strong>{formatEUR(shippingOnInvoice)}</Text>
                              </Row>
                              <Row>
                              <Divider style={{ margin: "8px 0" }} />
                              <Text strong>{formatEUR(invoiceSum)}</Text>
                              </Row>
                              <Row>
                              <Text strong>{formatEUR(ancillaryCosts)}</Text>
                              </Row>
                              <Row>
                              <Divider style={{ margin: "8px 0" }} />
                              <Text strong>{formatEUR(acquisitionCost)}</Text>
                              </Row>
                            </Col>
                          </div>
                        </Card>

                        <Card size="small" title="Fortschritt">
                          <Row gutter={[16, 16]} justify="start">
                            <Col>
                              <div style={{ textAlign: "center" }}>
                                <Progress
                                  type="circle"
                                  percent={deliveredPercent}
                                  status={deliveredActiveTotal === totalActivePositions && totalActivePositions > 0 ? "success" : "active"}
                                />
                                <div style={{ marginTop: 8 }}>
                                  <Text>
                                    Geliefert:&nbsp;
                                    <strong>
                                      {deliveredActiveTotal}/{totalActivePositions}
                                    </strong>
                                  </Text>
                                </div>
                              </div>
                            </Col>

                            <Col>
                                <div style={{ textAlign: "center" }}>
                                <Progress
                                  type="circle"
                                  percent={sketchPercent}
                                  status={sketchConfirmed === sketchRequired ? "success" : "active"}
                                />
                                <div style={{ marginTop: 8 }}>
                                  <Text>
                                    Skizzen bestätigt:&nbsp;
                                    <strong>
                                      {sketchConfirmed}/{sketchRequired}
                                    </strong>
                                  </Text>
                                </div>
                              </div>

                            </Col>
                          </Row>

                          {(pausedTotal > 0 || cancelledTotal > 0) && (
                            <div style={{ marginTop: 12 }}>
                              <Alert
                                type="info"
                                showIcon
                                message={
                                  <span>
                                    <Text strong>Hinweis:</Text>&nbsp;Pausierte/Stornierte Positionen werden in den Fortschrittsanzeigen
                                    <Text strong> nicht</Text> berücksichtigt.
                                  </span>
                                }
                                description={
                                  <Space size="small" wrap>
                                    {pausedTotal > 0 && <Tag>{pausedTotal}× pausiert</Tag>}
                                    {cancelledTotal > 0 && <Tag color="red">{cancelledTotal}× storniert</Tag>}
                                  </Space>
                                }
                              />
                            </div>
                          )}
                        </Card>

                      </Col>

                      {/* Verspätungs-Hinweis */}
                      {hasDelay && (
                        <Col span={24}>
                          <Alert
                            type="warning"
                            message={`Verspätung: ${delayDays} Tage (geplant: ${dolPlanned!.format(
                              "DD.MM.YYYY",
                            )}, tatsächlich: ${dolActual!.format("DD.MM.YYYY")})`}
                            showIcon
                          />
                        </Col>
                      )}
                    </Row>
                  </Form>
                </Card>
              )

            },
            {
              key: "pos",
              label: "Positionen",
              children: (
                <div>
                  {/* Normale Positionen */}
                  <Card
                    title={<Space><span>Normale Positionen</span></Space>}
                    className="mb-4"
                    extra={
                      <Space>
                        <Dropdown menu={batchMenu("normal")} trigger={["click"]}>
                          <Button size="small">Batch</Button>
                        </Dropdown>
                        <Button onClick={() => setOpenNormal(true)} disabled={isConfirmedOrBeyond}>
                          + Hinzufügen
                        </Button>
                      </Space>
                    }
                  >
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={posNormal as any}
                      pagination={{
                        current: pageNormal,
                        pageSize,
                        total: posNormal.length,
                        showSizeChanger: false,
                        onChange: (p) => setPageNormal(p),
                      }}
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
                        <Button onClick={() => setOpenSpecial(true)} disabled={isConfirmedOrBeyond}>
                          + Hinzufügen
                        </Button>
                      </Space>
                    }
                  >
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={posSpecial as any}
                      pagination={{
                        current: pageSpecial,
                        pageSize,
                        total: posSpecial.length,
                        showSizeChanger: false,
                        onChange: (p) => setPageSpecial(p),
                      }}
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
          onOk={async () => {
            try {
              const v = await formNormal.validateFields();
              const { error } = await supabase.rpc("rpc_po_add_item_normal", {
                p_po_id: id,
                p_product_id: v.billbee_product_id!,
                p_qty: v.qty_ordered ?? 1,
                p_unit_price: v.unit_price_net ?? 0,
                p_notes: v.internal_notes ?? null,
              });
              if (error) throw error;
              await refreshPositions();
              setOpenNormal(false);
              setSelectedFullNormal(null);
              formNormal.resetFields();
              message.success("Position hinzugefügt");
            } catch (e: any) {
              message.error(e?.message ?? "Fehler beim Hinzufügen.");
            }
          }}
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
          onOk={async () => {
            try {
              const v = await formSpecial.validateFields();
              if (!v.base_model_billbee_product_id) {
                return message.error("Bitte ein Grundmodell auswählen.");
              }

              const { error } = await supabase.rpc("rpc_po_add_item_special", {
                p_po_id: id,
                p_sb_product_id: v.billbee_product_id!,
                p_base_model_id: v.base_model_billbee_product_id!,
                p_qty: v.qty_ordered ?? 1,
                p_unit_price: v.unit_price_net ?? null,
                p_supplier_sku: v.supplier_sku ?? null,
                p_details_override: v.details_override ?? null,
                p_order_confirmation_ref: v.order_confirmation_ref ?? null,
                p_external_file_url: v.external_file_url ?? null,
                p_sketch_needed: v.sketch_needed ?? true,
              });
              if (error) throw error;

              await refreshPositions();
              setOpenSpecial(false);
              setSelectedFullSpecial(null);
              setSelectedBaseModel(null);
              formSpecial.resetFields();
              message.success("Sonder-Position hinzugefügt");
            } catch (e: any) {
              message.error(e?.message ?? "Fehler beim Hinzufügen.");
            }
          }}
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

            <Form.Item label="Grundmodell wählen">
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
            <Form.Item name="base_model_billbee_product_id" hidden>
              <InputNumber />
            </Form.Item>

            {/* Überschreibbare Felder */}
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="Menge" name="qty_ordered" initialValue={1} rules={[{ required: true }]}>
                  <InputNumber className="w-full" min={0.001} step={0.001} />
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
                <Form.Item label="Ext. SKU (Override)" name="supplier_sku">
                  <Input placeholder="leer = Grundmodell-Ext. SKU verwenden" />
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
