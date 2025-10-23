"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  List,
  Popconfirm,
  Progress,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  ShopOutlined,
  NumberOutlined,
  DollarOutlined,
} from "@ant-design/icons";

import { supabaseBrowserClient } from "@/utils/supabase/client";
import type { Tables } from "@/types/supabase";

const { Text } = Typography;

/* -------------------- DB-Typen -------------------- */
type Po = Tables<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;

type ItemStatus =
  | "draft"
  | "ordered"
  | "confirmed"
  | "in_production"
  | "delivered"
  | "paused"
  | "cancelled";

const statusColor = (status: Po["status"]) =>
  status === "draft"
    ? "default"
    : status === "ordered"
    ? "processing"
    : status === "confirmed"
    ? "cyan"
    : status === "in_production"
    ? "blue"
    : status === "partially_delivered"
    ? "purple"
    : status === "delivered"
    ? "success"
    : "error";

const formatEUR = (v: number) =>
  Number(v ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/* -------------------- Statusableitung (Fallback) -------------------- */
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
const effectiveItemStatus = (r: any): ItemStatus =>
  (r?.po_item_status as ItemStatus) ?? deriveItemStatusFromDates(r);

/* -------------------- ViewModel Zeile -------------------- */
type VmRow = {
  id: string;
  bestellnummer: string;
  rechnung?: { nr?: string; datum?: string };
  lieferant: string;
  summe_inkl_shipping: { total: number; shipping: number; positions: number };
  status: Po["status"];
  fortschritt: {
    sketches: { confirmed: number; required: number; percent: number };
    delivered: { done: number; totalActive: number; percent: number };
    note?: { paused: number; cancelled: number };
  };
};

/* -------------------- Items-Preview (nur Basistabellen) -------------------- */
const ItemsPreview: React.FC<{ orderId: string }> = ({ orderId }) => {
  const supabase = useMemo(() => supabaseBrowserClient, []);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<
    Array<{
      id: string;
      kind: "normal" | "special";
      qty_ordered: number;
      unit_price_net: number | null;
      shipping_costs_proportional: number | null;
      po_item_status: ItemStatus | null;
      proforma_confirmed_at?: string | null;
      sketch_confirmed_at?: string | null;
      sketch_needed?: boolean | null;
      dol_planned_at?: string | null;
      dol_actual_at?: string | null;
      goods_received_at?: string | null;
      billbee_product_id: number;
      base_model_billbee_product_id?: number | null;
      supplier_sku?: string | null;
      details_override?: string | null;
      // leichte Anreicherung aus ref_billbee_products_mirror (keine rpt_!)
      _sku?: string | null;
      _extSku?: string | null;
      _name?: string | null;
      _baseSku?: string | null;
      _purchaseDetails?: string | null;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);

    // 1) Positionsdaten schlank selektieren
    const [{ data: n }, { data: s }] = await Promise.all([
      supabase
        .from("app_purchase_orders_positions_normal")
        .select(
          "id, order_id, billbee_product_id, qty_ordered, unit_price_net, shipping_costs_proportional, po_item_status, proforma_confirmed_at, dol_planned_at, dol_actual_at, goods_received_at",
        )
        .eq("order_id", orderId),
      supabase
        .from("app_purchase_orders_positions_special")
        .select(
          "id, order_id, billbee_product_id, base_model_billbee_product_id, supplier_sku, details_override, qty_ordered, unit_price_net, shipping_costs_proportional, po_item_status, proforma_confirmed_at, sketch_confirmed_at, sketch_needed, dol_planned_at, dol_actual_at, goods_received_at",
        )
        .eq("order_id", orderId),
    ]);

    const normals =
      (n ?? []).map((r: any) => ({
        id: r.id as string,
        kind: "normal" as const,
        qty_ordered: Number(r.qty_ordered ?? 0),
        unit_price_net: r.unit_price_net as number | null,
        shipping_costs_proportional: Number(r.shipping_costs_proportional ?? 0),
        po_item_status: (r.po_item_status as ItemStatus | null) ?? null,
        proforma_confirmed_at: r.proforma_confirmed_at,
        dol_planned_at: r.dol_planned_at,
        dol_actual_at: r.dol_actual_at,
        goods_received_at: r.goods_received_at,
        billbee_product_id: Number(r.billbee_product_id),
      })) ?? [];

    const specials =
      (s ?? []).map((r: any) => ({
        id: r.id as string,
        kind: "special" as const,
        qty_ordered: Number(r.qty_ordered ?? 0),
        unit_price_net: r.unit_price_net as number | null,
        shipping_costs_proportional: Number(r.shipping_costs_proportional ?? 0),
        po_item_status: (r.po_item_status as ItemStatus | null) ?? null,
        proforma_confirmed_at: r.proforma_confirmed_at,
        sketch_confirmed_at: r.sketch_confirmed_at,
        sketch_needed: !!r.sketch_needed,
        dol_planned_at: r.dol_planned_at,
        dol_actual_at: r.dol_actual_at,
        goods_received_at: r.goods_received_at,
        billbee_product_id: Number(r.billbee_product_id),
        base_model_billbee_product_id: r.base_model_billbee_product_id
          ? Number(r.base_model_billbee_product_id)
          : null,
        supplier_sku: r.supplier_sku ?? null,
        details_override: r.details_override ?? null,
      })) ?? [];

    // 2) Schlanke Produktanreicherung (keine rpt_ – nur das Nötigste)
    const productIds = Array.from(
      new Set<number>([
        ...normals.map((x) => x.billbee_product_id),
        ...specials.map((x) => x.billbee_product_id),
        ...specials.flatMap((x) => (x.base_model_billbee_product_id ? [x.base_model_billbee_product_id] : [])),
      ]),
    );

    let byId = new Map<
      number,
      { id: number; sku: string | null; external_sku: string | null; name: string | null; purchase_details: string | null }
    >();

    if (productIds.length) {
      const { data: products } = await supabase
        .from("ref_billbee_products_mirror")
        .select("billbee_product_id, sku, external_sku, name, purchase_details")
        .in("billbee_product_id", productIds);

      (products ?? []).forEach((p: any) =>
        byId.set(Number(p.billbee_product_id), {
          id: Number(p.billbee_product_id),
          sku: p.sku ?? null,
          external_sku: p.external_sku ?? null,
          name: p.name ?? null,
          purchase_details: p.purchase_details ?? null,
        }),
      );
    }

    const enrich = (row: any) => {
      const prod = byId.get(row.billbee_product_id);
      const base = row.base_model_billbee_product_id ? byId.get(row.base_model_billbee_product_id) : undefined;
      return {
        ...row,
        _sku: prod?.sku ?? null,
        _extSku: (row.kind === "special" ? row.supplier_sku : undefined) ?? prod?.external_sku ?? null,
        _name: prod?.name ?? (row.kind === "special" ? "Sonderbestellung" : null),
        _baseSku: base?.sku ?? null,
        _purchaseDetails:
          (row.kind === "special" ? row.details_override : undefined) ?? prod?.purchase_details ?? null,
      };
    };

    setRows([...normals.map(enrich), ...specials.map(enrich)]);
    setLoading(false);
  }, [orderId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card size="small" loading={loading}>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: "Artikel",
            render: (_: any, r) => (
              <Space direction="vertical" size={0}>
                <Space>
                  <FileTextOutlined />
                  <Text strong>{r._name ?? "—"}</Text>
                  <Tag>{r.kind}</Tag>
                </Space>
                <Text type="secondary">
                  SKU: {r.kind === "special" && r._baseSku ? `${r._baseSku} → ` : ""}
                  {r._sku ?? "—"} {r._extSku ? `| Ext: ${r._extSku}` : ""}
                </Text>
              </Space>
            ),
          },
          { title: "Menge", width: 110, dataIndex: "qty_ordered" },
          {
            title: "EK Netto",
            width: 140,
            render: (_: any, r) =>
              typeof r.unit_price_net === "number" ? r.unit_price_net.toFixed(2) : "—",
          },
          {
            title: "Versand anteilig",
            width: 150,
            render: (_: any, r) => formatEUR(Number(r.shipping_costs_proportional ?? 0)),
          },
          {
            title: "Anschaffung (netto)",
            width: 170,
            render: (_: any, r) => {
              const line = Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0);
              const ship = Number(r.shipping_costs_proportional ?? 0);
              const sum = line + ship;
              return (
                <Tooltip title={`Zeile: ${formatEUR(line)} + Versand: ${formatEUR(ship)}`}>
                  <Text strong>{formatEUR(sum)}</Text>
                </Tooltip>
              );
            },
          },
          {
            title: "DoL",
            width: 160,
            render: (_: any, r) => {
              const planned = r.dol_planned_at ? dayjs(r.dol_planned_at).format("DD.MM.YYYY") : "—";
              const actual = r.dol_actual_at ? dayjs(r.dol_actual_at).format("DD.MM.YYYY") : "—";
              const delayed =
                r.dol_actual_at && r.dol_planned_at
                  ? Math.max(0, dayjs(r.dol_actual_at).diff(dayjs(r.dol_planned_at), "day"))
                  : 0;
              return (
                <Space direction="vertical" size={0}>
                  <Text>geplant: {planned}</Text>
                  <Text>tatsächlich: {actual}</Text>
                  {delayed > 0 && <Text type="danger">{delayed} Tage verzögert</Text>}
                </Space>
              );
            },
          },
          {
            title: "Status",
            width: 160,
            render: (_: any, r) => {
              const s = effectiveItemStatus(r);
              return (
                <Tag
                  color={
                    s === "draft"
                      ? "default"
                      : s === "ordered"
                      ? "blue"
                      : s === "confirmed"
                      ? "geekblue"
                      : s === "in_production"
                      ? "processing"
                      : s === "delivered"
                      ? "success"
                      : s === "paused"
                      ? "default"
                      : "red"
                  }
                >
                  {s}
                </Tag>
              );
            },
          },
        ]}
      />
    </Card>
  );
};

/* -------------------- Hauptseite (nur Basistabellen/Projektion) -------------------- */
const Page: React.FC = () => {
  const { message } = App.useApp();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowserClient, []);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<VmRow[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<
    Array<{ supplier_id: string; name: string; sum: number }>
  >([]);
  const [openReceivables, setOpenReceivables] = useState<number>(0);
  const [openSketches, setOpenSketches] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);

    // 1) Bestellungen – nur benötigte Spalten
    const { data: poData, error: poErr } = await supabase
      .from("app_purchase_orders")
      .select(
        "id, order_number, supplier_id, status, invoice_number, invoice_date, shipping_cost_net, created_at, ordered_at, separate_invoice_for_shipping_cost",
      )
      .order("created_at", { ascending: false });

    if (poErr) {
      setLoading(false);
      return message.error("Fehler beim Laden der Bestellungen");
    }

    const orders =
      (poData ?? []) as Array<
        Pick<
          Po,
          | "id"
          | "order_number"
          | "supplier_id"
          | "status"
          | "invoice_number"
          | "invoice_date"
          | "shipping_cost_net"
          | "created_at"
          | "ordered_at"
          | "separate_invoice_for_shipping_cost"
        >
      >;

    const orderIds = orders.map((o) => o.id);
    const supplierIds = Array.from(new Set(orders.map((o) => o.supplier_id)));

    // 2) Lieferanten – nur id + name
    const supplierMap = new Map<string, string>();
    if (supplierIds.length) {
      const { data: sup } = await supabase
        .from("app_suppliers")
        .select("id, name")
        .in("id", supplierIds);
      (sup ?? []).forEach((s: any) => supplierMap.set(s.id as string, s.name ?? "—"));
    }

    // 3) Positionen – nur benötigte Spalten
    const [{ data: n }, { data: s }] = await Promise.all([
      supabase
        .from("app_purchase_orders_positions_normal")
        .select(
          "order_id, qty_ordered, unit_price_net, shipping_costs_proportional, po_item_status, proforma_confirmed_at, dol_planned_at, dol_actual_at, goods_received_at",
        )
        .in("order_id", orderIds),
      supabase
        .from("app_purchase_orders_positions_special")
        .select(
          "order_id, qty_ordered, unit_price_net, shipping_costs_proportional, po_item_status, proforma_confirmed_at, sketch_confirmed_at, sketch_needed, dol_planned_at, dol_actual_at, goods_received_at",
        )
        .in("order_id", orderIds),
    ]);

    // 4) Client-seitige Aggregation (einfach & stabil)
    type Agg = {
      sumPositions: number;
      paused: number;
      cancelled: number;
      totalActive: number;
      deliveredActive: number;
      sketchRequired: number;
      sketchConfirmed: number;
    };
    const agg = new Map<string, Agg>();
    const ensure = (poId: string) => {
      if (!agg.has(poId))
        agg.set(poId, {
          sumPositions: 0,
          paused: 0,
          cancelled: 0,
          totalActive: 0,
          deliveredActive: 0,
          sketchRequired: 0,
          sketchConfirmed: 0,
        });
      return agg.get(poId)!;
    };

    // Normal
    (n ?? []).forEach((r: any) => {
      const a = ensure(r.order_id as string);
      const line = Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0);
      a.sumPositions += line;
      const st = effectiveItemStatus(r);
      if (st === "paused") a.paused += 1;
      if (st === "cancelled") a.cancelled += 1;
      if (st !== "paused" && st !== "cancelled") {
        a.totalActive += 1;
        if (st === "delivered") a.deliveredActive += 1;
      }
    });

    // Special
    (s ?? []).forEach((r: any) => {
      const a = ensure(r.order_id as string);
      const line = Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0);
      a.sumPositions += line;

      const st = effectiveItemStatus(r);
      if (st === "paused") a.paused += 1;
      if (st === "cancelled") a.cancelled += 1;

      const needsSketch = !!r.sketch_needed;
      if (needsSketch) a.sketchRequired += 1;
      if (needsSketch && r.sketch_confirmed_at) a.sketchConfirmed += 1;

      if (st !== "paused" && st !== "cancelled") {
        a.totalActive += 1;
        if (st === "delivered") a.deliveredActive += 1;
      }
    });

    // 5) Tabelle mappen (nur Anzeige)
    const list: VmRow[] = orders.map((o) => {
      const a = agg.get(o.id) ?? {
        sumPositions: 0,
        paused: 0,
        cancelled: 0,
        totalActive: 0,
        deliveredActive: 0,
        sketchRequired: 0,
        sketchConfirmed: 0,
      };
      const shipping = Number(o.shipping_cost_net ?? 0);
      const deliveredPercent = a.totalActive ? Math.round((a.deliveredActive / a.totalActive) * 100) : 0;
      const sketchPercent = a.sketchRequired ? Math.round((a.sketchConfirmed / a.sketchRequired) * 100) : 0;

      return {
        id: o.id,
        bestellnummer: o.order_number ?? "—",
        rechnung: {
          nr: o.invoice_number ?? undefined,
          datum: o.invoice_date ? dayjs(o.invoice_date).format("DD.MM.YYYY") : undefined,
        },
        lieferant: supplierMap.get(o.supplier_id as string) ?? "—",
        summe_inkl_shipping: {
          total: a.sumPositions + shipping,
          positions: a.sumPositions,
          shipping,
        },
        status: o.status as Po["status"],
        fortschritt: {
          sketches: { confirmed: a.sketchConfirmed, required: a.sketchRequired, percent: sketchPercent },
          delivered: { done: a.deliveredActive, totalActive: a.totalActive, percent: deliveredPercent },
          note: { paused: a.paused, cancelled: a.cancelled },
        },
      };
    });

    setRows(list);

    // 6) Kennzahlen (ohne Views, minimalinvasiv)
    const yearStart = dayjs().startOf("year");
    const yearEnd = dayjs().endOf("year");

    // 6a) TOP-3 Lieferanten (aktuelles Jahr)
    const isInYear = (po: (typeof orders)[number]) => {
      const d = po.ordered_at ?? po.created_at;
      if (!d) return false;
      const ds = dayjs(d);
      return ds.isAfter(yearStart.subtract(1, "day")) && ds.isBefore(yearEnd.add(1, "day"));
    };
    const totalsBySupplier = new Map<string, number>();
    orders.forEach((o) => {
      if (!isInYear(o)) return;
      const a = agg.get(o.id);
      if (!a) return;
      const shipping = Number(o.shipping_cost_net ?? 0);
      const sum = (a.sumPositions ?? 0) + shipping;
      totalsBySupplier.set(o.supplier_id as string, (totalsBySupplier.get(o.supplier_id as string) ?? 0) + sum);
    });
    const topList = Array.from(totalsBySupplier.entries())
      .map(([supplier_id, sum]) => ({ supplier_id, sum, name: supplierMap.get(supplier_id) ?? "—" }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 3);
    setTopSuppliers(topList);

    // 6b) Offene Außenstände (aktive Positionen)
    const includeForReceivable = (st: ItemStatus) =>
      st !== "draft" && st !== "delivered" && st !== "cancelled";
    let receivables = 0;
    (n ?? []).forEach((r: any) => {
      const st = effectiveItemStatus(r);
      if (!includeForReceivable(st)) return;
      const line = Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0);
      const ship = Number(r.shipping_costs_proportional ?? 0);
      receivables += line + ship;
    });
    (s ?? []).forEach((r: any) => {
      const st = effectiveItemStatus(r);
      if (!includeForReceivable(st)) return;
      const line = Number(r.qty_ordered ?? 0) * Number(r.unit_price_net ?? 0);
      const ship = Number(r.shipping_costs_proportional ?? 0);
      receivables += line + ship;
    });
    setOpenReceivables(receivables);

    // 6c) Offene Skizzen
    let openSketch = 0;
    (s ?? []).forEach((r: any) => {
      const st = effectiveItemStatus(r);
      const active = st !== "cancelled";
      if (active && r.sketch_needed && !r.sketch_confirmed_at) openSketch += 1;
    });
    setOpenSketches(openSketch);

    setLoading(false);
  }, [message, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    setLoading(true);
    const { error } = await supabase.from("app_purchase_orders").delete().eq("id", id);
    setLoading(false);
    if (error) {
      return message.error("Löschen fehlgeschlagen");
    }
    message.success("Bestellung gelöscht");
    load();
  };

  /* -------------------- Spalten -------------------- */
  const columns: ColumnsType<VmRow> = useMemo(
    () => [
      {
        title: "Bestellnummer",
        dataIndex: "bestellnummer",
        key: "bestellnummer",
        width: 160,
        render: (v: string) => (
          <Space>
            <NumberOutlined />
            <Text strong>{v}</Text>
          </Space>
        ),
        sorter: (a, b) => a.bestellnummer.localeCompare(b.bestellnummer),
        defaultSortOrder: "descend",
      },
      {
        title: "Rechnung",
        dataIndex: "rechnung",
        key: "rechnung",
        width: 220,
        render: (val) => (
          <Space direction="vertical" size={0}>
            <Space size="small">
              <FileTextOutlined />
              <Text>{val?.nr ?? "—"}</Text>
            </Space>
            <Text type="secondary">{val?.datum ?? ""}</Text>
          </Space>
        ),
      },
      {
        title: "Lieferant",
        dataIndex: "lieferant",
        key: "lieferant",
        render: (v: string) => (
          <Space>
            <ShopOutlined />
            <span>{v}</span>
          </Space>
        ),
      },
      {
        title: "Bestellsumme + Versand",
        dataIndex: "summe_inkl_shipping",
        key: "summe",
        width: 260,
        render: (val) => (
          <Space direction="vertical" size={0}>
            <Space>
              <DollarOutlined />
              <Text strong>{formatEUR(val.total)}</Text>
            </Space>
            <Text type="secondary">
              Positionen: {formatEUR(val.positions)} · Versand: {formatEUR(val.shipping)}
            </Text>
          </Space>
        ),
        sorter: (a, b) => a.summe_inkl_shipping.total - b.summe_inkl_shipping.total,
      },
      {
        title: "Artikelvorschau",
        key: "artikelvorschau",
        width: 200,
        render: (_, r) => (
          <Descriptions
            size="small"
            column={1}
            colon={false}
            items={[
              { key: "skReq", label: "Skizzen benötigt", children: r.fortschritt.sketches.required },
              { key: "skOk", label: "Skizzen bestätigt", children: r.fortschritt.sketches.confirmed },
              { key: "act", label: "Aktive Pos.", children: r.fortschritt.delivered.totalActive },
            ]}
          />
        ),
        responsive: ["lg"],
      },
      {
        title: "Status",
        dataIndex: "status",
        key: "status",
        width: 160,
        render: (s: Po["status"]) => <Tag color={statusColor(s)}>{String(s)}</Tag>,
        filters: [
          { text: "draft", value: "draft" },
          { text: "ordered", value: "ordered" },
          { text: "confirmed", value: "confirmed" },
          { text: "in_production", value: "in_production" },
          { text: "shipped", value: "shipped" },
          { text: "completed", value: "completed" },
          { text: "cancelled", value: "cancelled" },
        ],
        onFilter: (value, record) => record.status === value,
      },
      {
        title: "Fortschritt",
        key: "fortschritt",
        width: 320,
        render: (_, r) => (
          <Space direction="vertical" size={6} style={{ minWidth: 300 }}>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 8 }}>
              <Text style={{ width: 110 }}>Skizzen</Text>
              <Progress
                percent={r.fortschritt.sketches.percent}
                size="small"
                status={
                  r.fortschritt.sketches.required > 0 &&
                  r.fortschritt.sketches.confirmed === r.fortschritt.sketches.required
                    ? "success"
                    : "active"
                }
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 8 }}>
              <Text style={{ width: 110 }}>Geliefert</Text>
              <Progress
                percent={r.fortschritt.delivered.percent}
                size="small"
                status={
                  r.fortschritt.delivered.totalActive > 0 &&
                  r.fortschritt.delivered.done === r.fortschritt.delivered.totalActive
                    ? "success"
                    : "active"
                }
              />
            </div>
            {(r.fortschritt.note?.paused || r.fortschritt.note?.cancelled) && (
              <Space size="small" wrap>
                {r.fortschritt.note?.paused ? <Tag>{r.fortschritt.note.paused}× pausiert</Tag> : null}
                {r.fortschritt.note?.cancelled ? <Tag color="red">{r.fortschritt.note.cancelled}× storniert</Tag> : null}
              </Space>
            )}
          </Space>
        ),
      },
      {
        title: "",
        key: "actions",
        fixed: "right",
        width: 100,
        render: (_, r) => (
          <Space>
            <Button
              icon={<EditOutlined />}
              onClick={() => router.push(`/einkauf/bestellungen/bearbeiten/${r.id}`)}
            />
            <Popconfirm
              title="Bestellung löschen?"
              okText="Löschen"
              cancelText="Abbrechen"
              onConfirm={() => handleDelete(r.id)}
            >
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [router],
  );

  return (
    <App>
      <Card title="Bestellungen" bordered={false}>
        {/* Übersichtskarten – gleich hoch */}
        <Row gutter={[12, 12]} align="stretch" className="mb-4">
          <Col xs={24} md={8}>
            <Card size="small" title={`TOP-3 Lieferanten ${dayjs().year()}`} style={{ height: "100%" }}>
              <List
                size="small"
                dataSource={topSuppliers}
                locale={{ emptyText: "Keine Daten" }}
                renderItem={(it, idx) => (
                  <List.Item>
                    <Space style={{ width: "100%", justifyContent: "space-between" }}>
                      <Space>
                        <Tag>{idx + 1}</Tag>
                        <Text>{it.name}</Text>
                      </Space>
                      <Text strong>{formatEUR(it.sum)}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title="Offene Außenstände" style={{ height: "100%" }}>
              <Text style={{ fontSize: 22, fontWeight: 600 }}>{formatEUR(openReceivables)}</Text>
              <div>
                <Text type="secondary">
                  Summe aller Positionen (inkl. anteiligem Versand), deren Status nicht „draft“, „delivered“ oder „cancelled“ ist.
                </Text>
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title="Offene Skizzen" style={{ height: "100%" }}>
              <Text style={{ fontSize: 22, fontWeight: 600 }}>{openSketches}</Text>
              <div>
                <Text type="secondary">Sonder-Positionen mit Skizze benötigt, noch unbestätigt</Text>
              </div>
            </Card>
          </Col>
        </Row>

        <Divider />

        <Col style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="primary" onClick={() => router.push("/einkauf/bestellungen/anlegen")}>
            Bestellung anlegen
          </Button>
        </Col>

        <Divider />

        <Table<VmRow>
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 1250 }}
          expandable={{
            expandedRowRender: (record) => <ItemsPreview orderId={record.id} />,
          }}
          pagination={{ pageSize: 20, showSizeChanger: true }}
        />
      </Card>
    </App>
  );
};

export default Page;
