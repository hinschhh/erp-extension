// src/app/(authenticated)/artikel/[id]/page.tsx
"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import Image from "next/image";
import { Card, Descriptions, Typography, Divider, Table, Tag, Row, Col, Space, Button } from "antd";
import { useShow, useList } from "@refinedev/core";
import type { Tables } from "@/types/supabase";
import type { HttpError } from "@refinedev/core";
import { supabaseBrowserClient } from "@/utils/supabase/client";

type ProductRow = Tables<"rpt_products_full">;
type ProductRowStrict = Omit<ProductRow, "id"> & { id: number };
type ComponentWithQty = ProductRowStrict & { qty: number };
type ParentWithQty = ProductRowStrict & { qty: number };
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

const currency = (v: number | null | undefined) =>
  v != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v)) : "—";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

const toStrict = (rows?: ProductRow[] | null): ProductRowStrict[] =>
  (rows ?? [])
    .filter((r): r is ProductRow => !!r && r.id != null)
    .map((r) => ({ ...(r as ProductRow), id: Number(r.id) }));

// Kleines Zellen-Component für Bilder (holt imageUrl via SWR JSON-Endpoint)
const UsedInImageCell: React.FC<{ id: number; alt?: string; size?: number }> = ({ id, alt, size = 48 }) => {
  const { data } = useSWR<{ imageUrl?: string }>(`/api/billbee/products/get/${id}`, fetcher);
  if (!data?.imageUrl) return <>—</>;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={data.imageUrl}
      alt={alt ?? "Bild"}
      width={size}
      height={size}
      style={{ objectFit: "cover", borderRadius: 6 }}
    />
  );
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

export default function ArtikelShowPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const idNum = Number(id);
  const hasNumericId = Number.isFinite(idNum);

  const { queryResult } = useShow<ProductRow[], HttpError>({
    resource: "rpt_products_full",
    id,
  });

  // Lagerdaten laden (aus deiner View)
  const { data, isLoading, isError, error } = useList<InvRow>({
    resource: "rpt_products_inventory_purchasing",
    filters: [{ field: "billbee_product_id", operator: "eq", value: idNum }],
    pagination: { mode: "off" },
    meta: { select: "*" },
  });

  const p = queryResult?.data?.data as ProductRow | undefined;
  const pStrict: ProductRowStrict | undefined = p && p.id != null ? { ...(p as ProductRow), id: Number(p.id) } : undefined;

  const { data: imgData } = useSWR<{ imageUrl?: string }>(
    hasNumericId ? `/api/billbee/products/get/${idNum}` : null,
    fetcher,
  );
  const imageUrl = imgData?.imageUrl;

  // BOM-Zuordnung inkl. quantity …
  const { data: bomListRes } = useList<Tables<"bom_recipes">, HttpError>({
    resource: "bom_recipes",
    filters: hasNumericId ? [{ field: "billbee_bom_id", operator: "eq", value: idNum }] : [],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !!pStrict?.is_bom && hasNumericId },
  });

  const componentIds = (bomListRes?.data ?? [])
    .map((r) => Number(r.billbee_component_id))
    .filter((n) => Number.isFinite(n));

  const qtyById = React.useMemo(() => {
    const m = new Map<number, number>();
    (bomListRes?.data ?? []).forEach((r) => {
      const cid = Number(r.billbee_component_id);
      const q = Number(r.quantity ?? 1);
      if (Number.isFinite(cid)) m.set(cid, Number.isFinite(q) && q > 0 ? q : 1);
    });
    return m;
  }, [bomListRes?.data]);

  const compIdsArray = componentIds;
  const { data: compRes } = useList<ProductRow[], HttpError>({
    resource: "rpt_products_full",
    filters: compIdsArray.length ? [{ field: "id", operator: "in", value: compIdsArray }] : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: !!pStrict?.is_bom && compIdsArray.length > 0 },
  });

  const components: ComponentWithQty[] = toStrict(compRes?.data as ProductRow[] | undefined).map((c) => ({
    ...c,
    qty: qtyById.get(c.id) ?? 1,
  }));

  const ekBOM = components.reduce((s, c) => s + (c.qty * Number(c.net_purchase_price ?? 0)), 0);
  const ekNetto = pStrict?.is_bom ? ekBOM : Number(pStrict?.net_purchase_price ?? 0);

  // --- Bild-Box dynamisch …
  const leftRef = React.useRef<HTMLDivElement | null>(null);
  const [imgBoxSize, setImgBoxSize] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const updateSize = () => {
      const h = leftRef.current?.offsetHeight ?? 0;
      if (h > 0) {
        const maxSide = Math.min(h, 420);
        setImgBoxSize(maxSide);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [pStrict, imageUrl, components.length]);

  // ---------- „Verwendet in …“ ----------
  const { data: usedInRecipeRes } = useList<Tables<"bom_recipes">, HttpError>({
    resource: "bom_recipes",
    filters: hasNumericId ? [{ field: "billbee_component_id", operator: "eq", value: idNum }] : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: hasNumericId && !!pStrict && !pStrict.is_bom },
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

  const { data: parentRes } = useList<ProductRow[], HttpError>({
    resource: "rpt_products_full",
    filters: parentIds.length ? [{ field: "id", operator: "in", value: parentIds }] : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: hasNumericId && !!pStrict && !pStrict.is_bom && parentIds.length > 0 },
  });

  const usedIn: ParentWithQty[] = toStrict(parentRes?.data as ProductRow[] | undefined).map((b) => ({
    ...b,
    qty: qtyByParentId.get(b.id) ?? 1,
  }));

  // ======= Lager-Datensatz =======
  const inv = data?.data?.[0];

  // ======= NEU: Einkaufsbestellungen (Positionen) =======
  const [poItems, setPoItems] = React.useState<PoItemRow[]>([]);
  const [poItemsLoading, setPoItemsLoading] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      if (!hasNumericId || !pStrict) return;
      setPoItemsLoading(true);
      const supabase = supabaseBrowserClient;

      // 1) Relevante Positionen holen
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
        setPoItems([]);
        setPoItemsLoading(false);
        return;
      }

      // 2) Bestellung + Lieferant auflösen
      const { data: poList } = await supabase
        .from("app_purchase_orders")
        .select("id, order_number, supplier_id")
        .in("id", orderIds);

      const supplierIds = Array.from(new Set((poList ?? []).map((p) => p.supplier_id)));
      const supplierMap = new Map<string, string>();
      if (supplierIds.length) {
        const { data: sup } = await supabase.from("app_suppliers").select("id, name").in("id", supplierIds);
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
        internal_sku: pStrict.sku ?? "—",
        qty: c.qty,
        unit_price_net: c.unit_price_net,
        kind: c.kind,
      }));

      setPoItems(rows);
      setPoItemsLoading(false);
    };

    load();
  }, [hasNumericId, idNum, pStrict]);

  return (
    <Card title={`Artikel anzeigen: ${pStrict?.sku ?? "—"}`}
      extra={
        pStrict?.id ? (
          <Link href={`/artikel/bearbeiten/${pStrict.id}`} prefetch>
            <Button>Bearbeiten</Button>
          </Link>
        ) : null
      }>
      {/* Allgemein */}
      <Row gutter={16} align="top" wrap>
        <Col xs={24} md={16}>
          <div ref={leftRef}>
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }} title="Allgemein">
              <Descriptions.Item label="SKU">{pStrict?.sku ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Kategorien">
                {[pStrict?.category1, pStrict?.category2, pStrict?.category3].filter(Boolean).join(" / ") || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <span style={{ display: "inline-flex", gap: 8 }}>
                  {pStrict?.is_active ? <Tag color="green">aktiv</Tag> : <Tag>inaktiv</Tag>}
                  {pStrict?.is_bom ? <Tag color="blue">BOM</Tag> : <Tag>Komponente</Tag>}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Zeitstempel (dezent)">
                <span style={{ color: "#999" }}>
                  Mirror angelegt: {pStrict?.product_created_at ?? "—"} · Extension aktualisiert:{" "}
                  {pStrict?.ext_updated_at ?? "—"}
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
                <img
                  src={imageUrl}
                  alt={pStrict?.name ?? "Produktbild"}
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
        <Descriptions.Item label="Hersteller">{pStrict?.manufacturer ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="EK (netto)">{currency(ekNetto)}</Descriptions.Item>
        {!pStrict?.is_bom && (
          <>
            <Descriptions.Item label="Externe Art.-Nr.">{pStrict?.external_sku ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Kaufdetails">
              <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                {pStrict?.purchase_details ?? "—"}
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
          title={`Lagerbestand ${inv.updated_at}`}
          bordered
          column={1}
          size="small"
          extra={<Tag>{inv.inventory_category ?? "—"}</Tag>}
          labelStyle={{ width: 260 }}
        >
          <Descriptions.Item label="Freier Lagerbestand">{inv.stock_free}</Descriptions.Item>
          <Descriptions.Item label="Reserviert (direkt)">{inv.stock_reserved_direct}</Descriptions.Item>
          <Descriptions.Item label="Reserviert (BOM)">{inv.stock_reserved_bom}</Descriptions.Item>
          <Descriptions.Item label="Nicht verfügbar">{inv.stock_unavailable}</Descriptions.Item>
          <Descriptions.Item label="Physischer Bestand">
            <b>{inv.stock_physical}</b>
          </Descriptions.Item>
          <Descriptions.Item label="Nachbestellt (Platzhalter)">{inv.stock_on_order}</Descriptions.Item>

          <Descriptions.Item label="Zählbestand">{inv.counted_qty}</Descriptions.Item>
          <Descriptions.Item label="Zähldatum">{inv.counted_at ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Inventarwert">{currency(Number(inv.inventory_value as any))}</Descriptions.Item>
        </Descriptions>
      )}

      {/* Verwendet in … */}
      {!pStrict?.is_bom && (
        <>
          <Divider />
          <Card title={`Verwendet in … ${usedIn?.length ? `(${usedIn.length})` : ""}`}>
            <Table<ParentWithQty>
              rowKey={(r) => String(r.id)}
              dataSource={usedIn}
              pagination={false}
              size="small"
              columns={[
                {
                  title: "Bild",
                  dataIndex: "id",
                  width: 72,
                  render: (_: any, r) => <UsedInImageCell id={r.id} alt={r.name ?? r.sku ?? "Bild"} />,
                },
                {
                  title: "SKU",
                  dataIndex: "sku",
                  width: 160,
                  render: (_: any, r) => <Link href={`/artikel/anzeigen/${r.id}`}>{r.sku ?? "—"}</Link>,
                },
                { title: "Name", dataIndex: "name", ellipsis: true },
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

      {/* BOM-Komponenten */}
      {pStrict?.is_bom && (
        <>
          <Divider />
          <Card title="BOM – Komponenten">
            <Table<ComponentWithQty>
              rowKey={(r) => String(r.id)}
              dataSource={components}
              pagination={false}
              size="small"
              columns={[
                { title: "SKU", dataIndex: "sku", width: 160 },
                { title: "Name", dataIndex: "name", ellipsis: true },
                { title: "Hersteller", dataIndex: "manufacturer", width: 160 },
                {
                  title: "Menge",
                  dataIndex: "qty",
                  width: 100,
                  render: (v: number) => v ?? 1,
                },
                {
                  title: "EK (netto) je",
                  dataIndex: "net_purchase_price",
                  width: 140,
                  render: (v: number | null) => currency(v),
                },
                {
                  title: "EK (netto) gesamt",
                  key: "row_total",
                  width: 160,
                  render: (_: any, r) => currency((r.qty ?? 1) * Number(r.net_purchase_price ?? 0)),
                },
                { title: "Externe Art.-Nr.", dataIndex: "external_sku", width: 180, ellipsis: true },
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

      {/* ======= NEU: Einkaufsbestellungen ======= */}
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
    </Card>
  );
}
