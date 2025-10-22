// src/app/(authenticated)/artikel/[id]/page.tsx
"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import dayjs from "dayjs";
import { Card, Descriptions, Typography, Divider, Table, Tag, Row, Col, Space, Button } from "antd";
import { useShow, useList } from "@refinedev/core";
import type { Tables } from "@/types/supabase";
import type { HttpError } from "@refinedev/core";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import SyncStockSingleProductButton from "@components/artikel/SyncStockSingleProductButton";

/* ---------- Typen ---------- */
type AppProduct = Tables<"app_products">;

type InvRow = {
  billbee_product_id: number;
  sku: string | null;
  inventory_category: string | null;
  supplier: string | null;
  stock_free: number | string;
  stock_reserved_direct: number | string;
  stock_reserved_bom: number | string;
  stock_unavailable: number | string;
  stock_physical: number | string;
  stock_on_order: number | string;
  counted_qty: number | string;
  counted_at: string | null;
  unit_cost_net: number | string;
  inventory_value: number | string;
  updated_at: string;
};

type PoItemRow = {
  id: string;
  order_id: string;
  order_number: string;
  supplier_name: string;
  internal_sku: string;
  qty: number;
  unit_price_net: number | null;
  kind: "normal" | "special";
};

const currency = (v: number | null | undefined) =>
  v != null
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v))
    : "—";

/* ---------- Rate-limited Fetcher (für Billbee-Bilder/API) ---------- */
let queue: Array<() => void> = [];
let active = false;
let lastRun = 0;
const MIN_INTERVAL = 500;

async function processQueue() {
  if (active || queue.length === 0) return;
  const now = Date.now();
  const diff = now - lastRun;
  const wait = diff < MIN_INTERVAL ? MIN_INTERVAL - diff : 0;

  active = true;
  setTimeout(async () => {
    const job = queue.shift();
    if (!job) {
      active = false;
      return;
    }
    lastRun = Date.now();
    job();
    active = false;
    processQueue();
  }, wait);
}

const fetcher = (url: string): Promise<any> =>
  new Promise((resolve, reject) => {
    const task = async () => {
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After");
          const waitMs = (retryAfter ? parseInt(retryAfter, 10) : 1) * 1000;
          await new Promise((r) => setTimeout(r, waitMs));
          queue.push(task);
          processQueue();
          return;
        }
        if (!res.ok) return resolve(null);
        const data = await res.json();
        resolve(data);
      } catch (e) {
        reject(e);
      } finally {
        processQueue();
      }
    };
    queue.push(task);
    processQueue();
  });

/* ---------- Bild-Zelle (für Tabellen) ---------- */
const UsedInImageCell: React.FC<{ id: number; alt?: string; size?: number }> = ({
  id,
  alt,
  size = 48,
}) => {
  const { data } = useSWR<{ imageUrl?: string }>(`/api/billbee/products/get/${id}`, fetcher);
  if (!data?.imageUrl) return <>—</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.imageUrl}
      alt={alt ?? "Bild"}
      width={size}
      height={size}
      style={{ objectFit: "cover", borderRadius: 6 }}
    />
  );
};

export default function ArtikelShowPage({ params }: { params: { id: string } }) {
  // Route-ID ist der Billbee-Produkt-ID-Wert (= id)
  const idNum = Number(params.id);
  const hasNumericId = Number.isFinite(idNum);

  /* ---------- Produkt laden (app_products) ---------- */
  const { queryResult } = useShow<AppProduct, HttpError>({
    resource: "app_products",
    id: params.id, // dataProvider: primaryKey = "id"
    meta: { select: "*" },
  });

  const p = queryResult?.data?.data;

  /* ---------- Bild laden (über Billbee-Proxy) ---------- */
  const { data: imgData } = useSWR<{ imageUrl?: string }>(
    hasNumericId ? `/api/billbee/products/get/${idNum}` : null,
    fetcher,
  );
  const imageUrl = imgData?.imageUrl;

  /* ---------- Lagerdaten laden (bestehendes View) ---------- */
  const {
    data: invRes,
    isLoading,
    isError,
    error,
    refetch,
  } = useList<InvRow>({
    resource: "rpt_products_inventory_purchasing",
    filters: [{ field: "billbee_product_id", operator: "eq", value: idNum }],
    pagination: { mode: "off" },
    meta: { select: "*" },
  });
  const inv = invRes?.data?.[0];

  /* ---------- BOM: Komponenten ermitteln (wenn p.bb_is_bom) ---------- */
  const { data: bomListRes } = useList<Tables<"bom_recipes">, HttpError>({
    resource: "bom_recipes",
    filters: hasNumericId ? [{ field: "billbee_bom_id", operator: "eq", value: idNum }] : [],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !!p?.bb_is_bom && hasNumericId },
  });

  const componentIds = (bomListRes?.data ?? [])
    .map((r) => Number(r.billbee_component_id))
    .filter((n) => Number.isFinite(n));

  // Komponenten aus app_products über id holen
  const { data: compRes } = useList<AppProduct[], HttpError>({
    resource: "app_products",
    filters: componentIds.length
      ? [{ field: "id", operator: "in", value: componentIds }]
      : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: !!p?.bb_is_bom && componentIds.length > 0 },
  });

  const qtyByComponentId = React.useMemo(() => {
    const m = new Map<number, number>();
    (bomListRes?.data ?? []).forEach((r) => {
      const cid = Number(r.billbee_component_id);
      const q = Number(r.quantity ?? 1);
      if (Number.isFinite(cid)) m.set(cid, Number.isFinite(q) && q > 0 ? q : 1);
    });
    return m;
  }, [bomListRes?.data]);

  const components =
    (compRes?.data as AppProduct[] | undefined)?.map((c) => ({
      ...c,
      qty: qtyByComponentId.get(Number(c.id)) ?? 1,
    })) ?? [];

  const ekBOM = components.reduce(
    (sum, c) => sum + (c.qty ?? 1) * Number(c.bb_net_purchase_price ?? 0),
    0,
  );
  const ekNetto = p?.bb_is_bom ? ekBOM : Number(p?.bb_net_purchase_price ?? 0);

  /* ---------- „Verwendet in …“ (nur für Komponenten) ---------- */
  const { data: usedInRecipeRes } = useList<Tables<"bom_recipes">, HttpError>({
    resource: "bom_recipes",
    filters: hasNumericId ? [{ field: "billbee_component_id", operator: "eq", value: idNum }] : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: hasNumericId && !!p && !p.bb_is_bom },
  });

  const parentIds = (usedInRecipeRes?.data ?? [])
    .map((r) => Number(r.billbee_bom_id))
    .filter((n) => Number.isFinite(n));

  const qtyByParentId = React.useMemo(() => {
    const m = new Map<number, number>();
    (usedInRecipeRes?.data ?? []).forEach((r) => {
      const pid = Number(r.billbee_bom_id);
      const q = Number(r.quantity ?? 1);
      if (Number.isFinite(pid)) m.set(pid, Number.isFinite(q) && q > 0 ? q : 1);
    });
    return m;
  }, [usedInRecipeRes?.data]);

  // Eltern aus app_products holen
  const { data: parentRes } = useList<AppProduct[], HttpError>({
    resource: "app_products",
    filters: parentIds.length
      ? [{ field: "id", operator: "in", value: parentIds }]
      : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: hasNumericId && !!p && !p.bb_is_bom && parentIds.length > 0 },
  });

  const usedIn =
    (parentRes?.data as AppProduct[] | undefined)?.map((b) => ({
      ...b,
      qty: qtyByParentId.get(Number(b.id)) ?? 1,
    })) ?? [];

  /* ---------- Bild-Box dynamisch anpassen ---------- */
  const leftRef = React.useRef<HTMLDivElement | null>(null);
  const [imgBoxSize, setImgBoxSize] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const updateSize = () => {
      const h = leftRef.current?.offsetHeight ?? 0;
      if (h > 0) setImgBoxSize(Math.min(h, 420));
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [p, imageUrl, components.length]);

  /* ---------- Einkaufsbestellungen (nur wenn KEIN BOM) ---------- */
  const [poItems, setPoItems] = React.useState<PoItemRow[]>([]);
  const [poItemsLoading, setPoItemsLoading] = React.useState(false);

  const sku = p?.bb_sku ?? null;
  const isBom = !!p?.bb_is_bom;

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!hasNumericId || !sku || isBom) {
        if (mounted) {
          setPoItems([]);
          setPoItemsLoading(false);
        }
        return;
      }

      setPoItemsLoading(true);
      try {
        const supabase = supabaseBrowserClient;

        // 1) Positionen holen
        const [{ data: n }, { data: s }] = await Promise.all([
          supabase
            .from("app_purchase_orders_positions_normal")
            .select("id, order_id, billbee_product_id, qty_ordered, unit_price_net")
            .eq("billbee_product_id", idNum),
          supabase
            .from("app_purchase_orders_positions_special")
            .select("id, order_id, billbee_product_id, base_model_billbee_product_id, qty_ordered, unit_price_net")
            .or(`base_model_billbee_product_id.eq.${idNum},billbee_product_id.eq.${idNum}`),
        ]);

        const combined = [
          ...(n ?? []).map((r: any) => ({
            id: r.id as string,
            order_id: r.order_id as string,
            qty: Number(r.qty_ordered ?? 0),
            unit_price_net: typeof r.unit_price_net === "number" ? r.unit_price_net : null,
            kind: "normal" as const,
          })),
          ...(s ?? []).map((r: any) => ({
            id: r.id as string,
            order_id: r.order_id as string,
            qty: Number(r.qty_ordered ?? 0),
            unit_price_net: typeof r.unit_price_net === "number" ? r.unit_price_net : null,
            kind: "special" as const,
          })),
        ];

        const orderIds = Array.from(new Set(combined.map((x) => x.order_id)));
        if (!orderIds.length) {
          if (mounted) setPoItems([]);
          return;
        }

        // 2) Bestellungen & Lieferanten auflösen
        const { data: poList } = await supabase
          .from("app_purchase_orders")
          .select("id, order_number, supplier_id")
          .in("id", orderIds);

        const supplierIds = Array.from(new Set((poList ?? []).map((p) => p.supplier_id)));
        const supplierMap = new Map<string, string>();
        if (supplierIds.length) {
          const { data: sup } = await supabase
            .from("app_suppliers")
            .select("id, name")
            .in("id", supplierIds);
          (sup ?? []).forEach((s) => supplierMap.set(s.id as string, (s as any).name ?? "—"));
        }

        const poMap = new Map<string, { order_number: string; supplier_name: string }>();
        (poList ?? []).forEach((p) =>
          poMap.set(p.id as string, {
            order_number: (p as any).order_number ?? "—",
            supplier_name: supplierMap.get((p as any).supplier_id as string) ?? "—",
          }),
        );

        const rows: PoItemRow[] = combined.map((c) => ({
          id: c.id,
          order_id: c.order_id,
          order_number: poMap.get(c.order_id)?.order_number ?? "—",
          supplier_name: poMap.get(c.order_id)?.supplier_name ?? "—",
          internal_sku: sku ?? "—",
          qty: c.qty,
          unit_price_net: c.unit_price_net,
          kind: c.kind,
        }));

        if (mounted) setPoItems(rows);
      } finally {
        if (mounted) setPoItemsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [hasNumericId, idNum, sku, isBom]);

  return (
    <Card
      title={`Artikel anzeigen: ${p?.bb_sku ?? "—"}`}
      extra={
        p?.id ? (
          <Link href={`/artikel/bearbeiten/${p.id}`} prefetch>
            <Button>Bearbeiten</Button>
          </Link>
        ) : null
      }
    >
      {/* Allgemein */}
      <Row gutter={16} align="top" wrap>
        <Col xs={24} md={16}>
          <div ref={leftRef}>
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }} title="Allgemein">
              <Descriptions.Item label="SKU">{p?.bb_sku ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Kategorien">
                {[p?.bb_category1, p?.bb_category2, p?.bb_category3].filter(Boolean).join(" / ") || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <span style={{ display: "inline-flex", gap: 8 }}>
                  {p?.bb_is_active ? <Tag color="green">aktiv</Tag> : <Tag>inaktiv</Tag>}
                  {p?.bb_is_bom ? <Tag color="blue">BOM</Tag> : <Tag>Komponente</Tag>}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Zeitstempel (dezent)">
                <span style={{ color: "#999" }}>
                  Erstellt: {p?.created_at ? dayjs(p.created_at).format("DD.MM.YYYY HH:mm") : "—"}
                </span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            title="Bild"
            bodyStyle={{ display: "flex", justifyContent: "center" }}
            style={{ height: imgBoxSize ? imgBoxSize + 70 : "auto" }}
          >
            {imageUrl ? (
              <div
                style={{
                  position: "relative",
                  width: imgBoxSize ?? 320,
                  height: imgBoxSize ?? 320,
                  maxWidth: "100%",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={p?.bb_name ?? p?.bb_sku ?? "Produktbild"}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
              </div>
            ) : (
              "—"
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Einkauf */}
      <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }} title="Einkauf">
        <Descriptions.Item label="Lieferant">{p?.fk_bb_supplier ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="EK (netto)">{currency(ekNetto)}</Descriptions.Item>
        {!p?.bb_is_bom && (
          <>
            <Descriptions.Item label="Externe Art.-Nr.">
              {p?.supplier_sku ?? "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Kaufdetails">
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                {p?.purchase_details ?? "—"}
              </Typography.Paragraph>
            </Descriptions.Item>
          </>
        )}
      </Descriptions>

      <Divider />

      {/* Lagerbestand */}
      {!hasNumericId ? (
        <Typography.Text type="warning">Ungültige Artikel-ID für Lagerbestand.</Typography.Text>
      ) : isLoading ? (
        <Typography.Text>Lade Lagerdaten …</Typography.Text>
      ) : isError ? (
        <Typography.Text type="danger">Fehler beim Laden der Lagerdaten: {String(error)}</Typography.Text>
      ) : !inv ? (
        <Typography.Text>Kein Lagerdatensatz gefunden.</Typography.Text>
      ) : (
        <Descriptions
          title={
            <div>
              <div style={{ fontWeight: 600 }}>Lagerbestand</div>
              <div style={{ fontSize: 12, color: "#888" }}>
                Zuletzt aktualisiert:{" "}
                {inv.updated_at ? dayjs(inv.updated_at).format("DD.MM.YYYY HH:mm") : "—"}
              </div>
            </div>
          }
          bordered
          column={1}
          size="small"
          extra={
            <>
              <Tag>{inv.inventory_category ?? "—"}</Tag>
              <SyncStockSingleProductButton billbeeProductId={idNum} onSynced={() => refetch()} />
            </>
          }
          labelStyle={{ width: 260 }}
        >
          <Descriptions.Item label="Freier Lagerbestand">{inv.stock_free}</Descriptions.Item>
          <Descriptions.Item label="Reserviert (direkt)">{inv.stock_reserved_direct}</Descriptions.Item>
          <Descriptions.Item label="Reserviert (BOM)">{inv.stock_reserved_bom}</Descriptions.Item>
          <Descriptions.Item label="Nicht verfügbar">{inv.stock_unavailable}</Descriptions.Item>
          <Descriptions.Item label="Physischer Bestand">
            <b>{inv.stock_physical}</b>
          </Descriptions.Item>
          <Descriptions.Item label="Nachbestellt">{inv.stock_on_order}</Descriptions.Item>
          <Descriptions.Item label="Zählbestand">{inv.counted_qty}</Descriptions.Item>
          <Descriptions.Item label="Zähldatum">{inv.counted_at ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Inventarwert">
            {currency(Number(inv.inventory_value as any))}
          </Descriptions.Item>
        </Descriptions>
      )}

      {/* Verwendet in … (nur wenn aktuelle Position KEINE BOM ist) */}
      {!p?.bb_is_bom && (
        <>
          <Divider />
          <Card title={`Verwendet in … ${usedIn?.length ? `(${usedIn.length})` : ""}`}>
            <Table<AppProduct & { qty: number }>
              rowKey={(r) => String(r.id)}
              dataSource={usedIn}
              pagination={false}
              size="small"
              columns={[
                {
                  title: "Bild",
                  dataIndex: "id",
                  width: 72,
                  render: (_: any, r) => (
                    <UsedInImageCell id={Number(r.id)} alt={r.bb_name ?? r.bb_sku ?? "Bild"} />
                  ),
                },
                {
                  title: "SKU",
                  dataIndex: "bb_sku",
                  width: 160,
                  render: (_: any, r) => (
                    <Link href={`/artikel/anzeigen/${r.id}`}>{r.bb_sku ?? "—"}</Link>
                  ),
                },
                { title: "Name", dataIndex: "bb_name", ellipsis: true },
                {
                  title: "Menge",
                  dataIndex: "qty",
                  width: 100,
                  render: (v: number) => v ?? 1,
                },
                {
                  title: "Aktionen",
                  key: "actions",
                  fixed: "right",
                  width: 180,
                  render: (_: any, r) => (
                    <Space size="small" wrap>
                      <Link href={`/artikel/anzeigen/${r.id}`} prefetch>
                        <Button size="small">Anzeigen</Button>
                      </Link>
                      <Link href={`/artikel/bearbeiten/${r.id}`} prefetch>
                        <Button size="small" type="primary">
                          Bearbeiten
                        </Button>
                      </Link>
                    </Space>
                  ),
                },
              ]}
              locale={{ emptyText: "Keine Zuordnungen gefunden." }}
            />
          </Card>
        </>
      )}

      {/* BOM-Komponenten (nur wenn aktueller Artikel eine BOM ist) */}
      {p?.bb_is_bom && (
        <>
          <Divider />
          <Card title="BOM – Komponenten">
            <Table<AppProduct & { qty: number }>
              rowKey={(r) => String(r.id)}
              dataSource={components}
              pagination={false}
              size="small"
              columns={[
                { title: "SKU", dataIndex: "bb_sku", width: 160 },
                { title: "Name", dataIndex: "bb_name", ellipsis: true },
                { title: "Lieferant", dataIndex: "fk_bb_supplier", width: 160 },
                {
                  title: "Menge",
                  dataIndex: "qty",
                  width: 100,
                  render: (v: number) => v ?? 1,
                },
                {
                  title: "EK (netto) je",
                  dataIndex: "bb_net_purchase_price",
                  width: 140,
                  render: (v: number | null) => currency(v),
                },
                {
                  title: "EK (netto) gesamt",
                  key: "row_total",
                  width: 160,
                  render: (_: any, r) => currency((r.qty ?? 1) * Number(r.bb_net_purchase_price ?? 0)),
                },
                { title: "Externe Art.-Nr.", dataIndex: "supplier_sku", width: 180, ellipsis: true },
                {
                  title: "Kaufdetails",
                  dataIndex: "purchase_details",
                  render: (v: string | null) => (
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                      {v ?? "—"}
                    </Typography.Paragraph>
                  ),
                },
                {
                  title: "Aktionen",
                  key: "actions",
                  fixed: "right",
                  width: 180,
                  render: (_: any, r) => (
                    <Space size="small" wrap>
                      <Link href={`/artikel/anzeigen/${r.id}`} prefetch>
                        <Button size="small">Anzeigen</Button>
                      </Link>
                      <Link href={`/artikel/bearbeiten/${r.id}`} prefetch>
                        <Button size="small" type="primary">
                          Bearbeiten
                        </Button>
                      </Link>
                    </Space>
                  ),
                },
              ]}
              scroll={{ x: true }}
            />
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <strong>Summe Komponenten (EK netto):</strong> {currency(ekBOM)}
            </div>
          </Card>
        </>
      )}

      {/* Einkaufsbestellungen – nur anzeigen, wenn KEIN BOM */}
      {!p?.bb_is_bom && (
        <>
          <Divider />
          <Card title={`Einkaufsbestellungen ${poItems.length ? `(${poItems.length})` : ""}`}>
            <Table<PoItemRow>
              rowKey={(r) => r.id}
              dataSource={poItems}
              loading={poItemsLoading}
              size="small"
              columns={[
                {
                  title: "Bestellnummer",
                  dataIndex: "order_number",
                  width: 160,
                  render: (v: string, r) => (
                    <Link href={`/einkauf/bestellungen/bearbeiten/${r.order_id}`}>{v || "—"}</Link>
                  ),
                },
                { title: "Lieferant", dataIndex: "supplier_name", width: 220 },
                { title: "Interne SKU", dataIndex: "internal_sku", width: 160 },
                {
                  title: "Menge",
                  dataIndex: "qty",
                  width: 100,
                  render: (v: number) => v ?? 0,
                },
                {
                  title: "Preis (EK netto)",
                  dataIndex: "unit_price_net",
                  width: 160,
                  render: (v: number | null) => currency(v ?? null),
                },
                {
                  title: "Art",
                  dataIndex: "kind",
                  width: 110,
                  render: (k: PoItemRow["kind"]) => <Tag>{k}</Tag>,
                },
              ]}
              pagination={{ pageSize: 20 }}
              scroll={{ x: 900 }}
              locale={{ emptyText: "Keine Bestellpositionen gefunden." }}
            />
          </Card>
        </>
      )}
    </Card>
  );
}
