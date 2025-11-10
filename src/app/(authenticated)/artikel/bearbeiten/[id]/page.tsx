// src/app/(authenticated)/artikel/bearbeiten/[id]/page.tsx
"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Card,
  Descriptions,
  Typography,
  Divider,
  Table,
  Tag,
  Row,
  Col,
  Space,
  Button,
  Form,
  Input,
  Modal,
} from "antd";
import { ExclamationCircleFilled } from "@ant-design/icons";
import { useShow, useList, useNotification } from "@refinedev/core";
import type { Database, Tables } from "@/types/supabase";
import type { HttpError } from "@refinedev/core";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { Data } from "@dnd-kit/core";
import App from "next/app";

/* ---------- Typen ---------- */
type AppProduct = Tables<"app_products">;
type AppProductsUpdate = Database["public"]["Tables"]["app_products"]["Update"];

type DebugAppProductsUpdate = AppProductsUpdate;


type PurchaseOrderLite = {
  id: string;
  order_number?: string | null;
  supplier: string | null;
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

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

/* Bildzelle für Tabellen */
const UsedInImageCell: React.FC<{ id: number; alt?: string; size?: number }> = ({
  id,
  alt,
  size = 48,
}) => {
  const { data } = useSWR<{ imageUrl?: string }>(`/api/billbee/products/get/${id}`, fetcher);
  if (!data?.imageUrl) return <>—</>;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={data.imageUrl}
      alt={alt ?? "Bild"}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: 6 }}
    />
  );
};

export default function ArtikelEditPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const idNum = Number(id);
  const hasNumericId = Number.isFinite(idNum);
  const router = useRouter();
  const { open: notify } = useNotification();
  const [saving, setSaving] = React.useState(false);

  /* ---------- Produkt laden (app_products) ---------- */
  const { queryResult } = useShow<AppProduct, HttpError>({
    resource: "app_products",
    id, // Primärschlüssel = id
    meta: { select: "*" },
  });
  const p = queryResult?.data?.data;

  /* ---------- Bild laden ---------- */
  const { data: imgData } = useSWR<{ imageUrl?: string }>(
    hasNumericId ? `/api/billbee/products/get/${idNum}` : null,
    fetcher,
  );
  const imageUrl = imgData?.imageUrl;

  /* ---------- BOM: Komponenten (wenn p.bb_is_bom) ---------- */
  const { data: bomListRes } = useList<Tables<"bom_recipes">, HttpError>({
    resource: "bom_recipes",
    filters: hasNumericId ? [{ field: "billbee_bom_id", operator: "eq", value: idNum }] : [],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !!p?.bb_is_bom && hasNumericId },
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

  const componentIds =
    (bomListRes?.data ?? [])
      .map((r) => Number(r.billbee_component_id))
      .filter((n) => Number.isFinite(n)) ?? [];

  const { data: compRes } = useList<AppProduct[], HttpError>({
    resource: "app_products",
    filters: componentIds.length
      ? [{ field: "id", operator: "in", value: componentIds }]
      : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: !!p?.bb_is_bom && componentIds.length > 0 },
  });

  const components =
    (compRes?.data as AppProduct[] | undefined)?.map((c) => ({
      ...c,
      qty: qtyByComponentId.get(Number(c.id)) ?? 1,
    })) ?? [];

  const ekBOM = components.reduce(
    (s, c) => s + (c.qty ?? 1) * Number(c.bb_net_purchase_price ?? 0),
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

  const qtyByParentId = React.useMemo(() => {
    const m = new Map<number, number>();
    (usedInRecipeRes?.data ?? []).forEach((r) => {
      const pid = Number(r.billbee_bom_id);
      const q = Number(r.quantity ?? 1);
      if (Number.isFinite(pid)) m.set(pid, Number.isFinite(q) && q > 0 ? q : 1);
    });
    return m;
  }, [usedInRecipeRes?.data]);

  const parentIds =
    (usedInRecipeRes?.data ?? [])
      .map((r) => Number(r.billbee_bom_id))
      .filter((n) => Number.isFinite(n)) ?? [];

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

  /* ---------- Bild-Box dynamisch ---------- */
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

  /* ---------- FORM (direkt auf app_products schreiben) ---------- */
  const [form] = Form.useForm();
  const editableKeys = React.useMemo(
    () => (p?.bb_is_bom ? [] : (["supplier_sku", "purchase_details"] as const)),
    [p?.bb_is_bom],
  );
  type EditableShape = { supplier_sku: string; purchase_details: string };

  const initialRef = React.useRef<EditableShape | null>(null);
  React.useEffect(() => {
    if (!p) return;
    const init: EditableShape = {
      supplier_sku: p.supplier_sku ?? "",
      purchase_details: p.purchase_details ?? "",
    };
    initialRef.current = init;
    form.setFieldsValue(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  const wExternalSku = Form.useWatch("supplier_sku", form);
  const wPurchaseDetails = Form.useWatch("purchase_details", form);
  const normalize = (v: any) => (v ?? "").toString();
  const currentVals: EditableShape = {
    supplier_sku: normalize(wExternalSku),
    purchase_details: normalize(wPurchaseDetails),
  };
  const isDirty =
    !!initialRef.current &&
    editableKeys.some((k) => normalize(initialRef.current![k]) !== currentVals[k]);

  const confirmSave = () =>
    new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: "Änderungen speichern?",
        icon: <ExclamationCircleFilled />,
        content: "Möchtest du die vorgenommenen Änderungen speichern?",
        okText: "Speichern",
        cancelText: "Abbrechen",
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const confirmDiscard = () =>
    new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: "Änderungen verwerfen?",
        icon: <ExclamationCircleFilled />,
        content: "Es liegen ungespeicherte Änderungen vor. Wirklich verwerfen?",
        okText: "Verwerfen",
        cancelText: "Zurück",
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const handleCancelClick = async () => {
    if (isDirty) {
      const go = await confirmDiscard();
      if (!go) return;
    }
    router.push(`/artikel/anzeigen/${p?.id}`);
  };

  const handleSaveClick = async () => {
    if (!isDirty || saving || !p) return;
    const go = await confirmSave();
    if (!go) return;
    form.submit();
  };

  const onFinish = async (values: { supplier_sku?: string; purchase_details?: string }) => {
    if (!hasNumericId) return;
    setSaving(true);
    try {
        const { error } = await (supabaseBrowserClient as any)
        .from("app_products")
        .update({
          supplier_sku: values.supplier_sku ?? null,
          purchase_details: values.purchase_details ?? null,
        })
        .eq("id", idNum);


      if (error) throw error;

      initialRef.current = {
        supplier_sku: values.supplier_sku ?? "",
        purchase_details: values.purchase_details ?? "",
      };

      notify?.({
        type: "success",
        message: "Gespeichert",
        description: "Artikel wurde aktualisiert.",
      });

      router.push(`/artikel/anzeigen/${idNum}`);
    } catch (e: any) {
      notify?.({
        type: "error",
        message: "Speichern fehlgeschlagen",
        description: e?.message ?? "Unbekannter Fehler",
      });
    } finally {
      setSaving(false);
    }
  };

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

        // 2) Bestellungen laden
          const { data: poListRaw, error: poError } = await supabase
            .from("app_purchase_orders")
            .select("id, order_number, supplier")
            .in("id", orderIds);

          if (poError) {
            throw poError;
          }

          // TS-sicheres Array
          const poList = (poListRaw ?? []) as PurchaseOrderLite[];

          // 3) Lieferanten-IDs sammeln (unique)
          const supplierIds = Array.from(
            new Set(
              poList
                .map((p) => p.supplier)
                .filter((id): id is string => !!id) // null/undefined rausfiltern
            )
          );

          // 4) Map von PO-ID → Bestellnummer + Lieferanten-ID (Name kommt später aus Supplier-Map)
          const poMap = new Map<string, { order_number: string; supplier: string | null }>();

          poList.forEach((p) => {
            poMap.set(p.id, {
              order_number: p.order_number ?? "—",
              supplier: p.supplier,
            });
          });

        const rows: PoItemRow[] = combined.map((c) => ({
          id: c.id,
          order_id: c.order_id,
          order_number: poMap.get(c.order_id)?.order_number ?? "—",
          supplier_name: poMap.get(c.order_id)?.supplier ?? "—",
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
      title={`Artikel bearbeiten: ${p?.bb_sku ?? "—"}`}
      extra={
        <Space>
          <Button onClick={() => router.push("/artikel")}>Übersicht</Button>
          {p?.id && <Button onClick={() => window.open(`https://app.billbee.io/app_v2/article/${p.id}?copy=false`, "_blank")}>Billbee</Button>}
          {p?.id && <Button onClick={handleCancelClick}>Abbrechen</Button>}
          <Button type="primary" onClick={handleSaveClick} disabled={!isDirty || saving || !p} loading={saving}>
            Speichern
          </Button>
        </Space>
      }
    >
      {/* Allgemein */}
      <Row gutter={16} align="top" wrap>
        <Col xs={24} md={16}>
          <div ref={leftRef}>
            <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }} title="Allgemein">
              <Descriptions.Item label="SKU">{p?.bb_sku ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Name">{p?.bb_name ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Kategorien">
                {[p?.bb_category1, p?.bb_category2, p?.bb_category3].filter(Boolean).join(" / ") || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <span style={{ display: "inline-flex", gap: 8 }}>
                  {p?.bb_is_active ? <Tag color="green">aktiv</Tag> : <Tag>inaktiv</Tag>}
                  {p?.bb_is_bom ? <Tag color="blue">BOM</Tag> : <Tag>Komponente</Tag>}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Erstellt am">
                <span style={{ color: "#999" }}>
                  {p?.created_at ? new Date(p.created_at).toLocaleString("de-DE") : "—"}
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
              <div style={{ position: "relative", width: imgBoxSize ?? 320, height: imgBoxSize ?? 320, maxWidth: "100%" }}>
                <Image src={imageUrl} alt={p?.bb_name ?? p?.bb_sku ?? "Produktbild"} fill style={{ objectFit: "cover", borderRadius: 8 }} />
              </div>
            ) : (
              "—"
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Einkauf – editierbar nur wenn KEIN BOM */}
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }} title="Einkauf">
          <Descriptions.Item label="Lieferant">{p?.fk_bb_supplier ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="EK (netto)">{currency(ekNetto)}</Descriptions.Item>
          {!p?.bb_is_bom && (
            <>
              <Descriptions.Item label="Externe Art.-Nr.">
                <Form.Item name="supplier_sku" style={{ margin: 0 }}>
                  <Input placeholder="Externe Art.-Nr." />
                </Form.Item>
              </Descriptions.Item>
              <Descriptions.Item label="Kaufdetails">
                <Form.Item name="purchase_details" style={{ margin: 0 }}>
                  <Input.TextArea placeholder="Kaufdetails" autoSize={{ minRows: 3 }} />
                </Form.Item>
              </Descriptions.Item>
            </>
          )}
        </Descriptions>
      </Form>

      {/* Verwendet in … (nur Komponente) */}
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
                  render: (_: any, r) => <Link href={`/artikel/anzeigen/${r.id}`}>{r.bb_sku ?? "—"}</Link>,
                },
                { title: "Name", dataIndex: "bb_name", ellipsis: true },
                { title: "Menge", dataIndex: "qty", width: 100, render: (v: number) => v ?? 1 },
              ]}
              locale={{ emptyText: "Keine Zuordnungen gefunden." }}
            />
          </Card>
        </>
      )}

      {/* BOM – Komponenten */}
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
                { title: "Menge", dataIndex: "qty", width: 100, render: (v: number) => v ?? 1 },
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
              ]}
              scroll={{ x: true }}
            />
            <div style={{ textAlign: "right", marginTop: 12 }}>
              <strong>Summe Komponenten (EK netto):</strong> {currency(ekBOM)}
            </div>
          </Card>
        </>
      )}

      {/* Einkaufsbestellungen – nur wenn KEIN BOM */}
      {!p?.bb_is_bom && (
        <>
          <Divider />
          <Card title={`Einkaufsbestellungen${poItems.length ? ` (${poItems.length})` : ""}`}>
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
                { title: "Menge", dataIndex: "qty", width: 100, render: (v: number) => v ?? 0 },
                {
                  title: "Preis (EK netto)",
                  dataIndex: "unit_price_net",
                  width: 160,
                  render: (v) => currency(v ?? null),
                },
                { title: "Art", dataIndex: "kind", width: 110, render: (k: PoItemRow["kind"]) => <Tag>{k}</Tag> },
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
