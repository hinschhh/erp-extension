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
import type { Tables } from "@/types/supabase";
import type { HttpError } from "@refinedev/core";
import { supabaseBrowserClient } from "@/utils/supabase/client";

const EXT_TABLE = "ref_billbee_product_extension";
const EXT_CONFLICT_KEY = "billbee_product_id";

type ProductRow = Tables<"rpt_products_full">;
type ProductRowStrict = Omit<ProductRow, "id"> & { id: number };
type ComponentWithQty = ProductRowStrict & { qty: number };
type ParentWithQty = ProductRowStrict & { qty: number };

const currency = (v: number | null | undefined) =>
  v != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v)) : "—";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

const toStrict = (rows?: ProductRow[] | null): ProductRowStrict[] =>
  (rows ?? [])
    .filter((r): r is ProductRow => !!r && r.id != null)
    .map((r) => ({ ...(r as ProductRow), id: Number(r.id) }));

const UsedInImageCell: React.FC<{ id: number; alt?: string; size?: number }> = ({ id, alt, size = 48 }) => {
  const { data } = useSWR<{ imageUrl?: string }>(`/api/billbee/products/get/${id}`, fetcher);
  if (!data?.imageUrl) return <>—</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={data.imageUrl}
      alt={alt ?? "Bild"}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: 6 }}
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

export default function ArtikelEditPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const idNum = Number(id);
  const hasNumericId = Number.isFinite(idNum);
  const router = useRouter();
  const { open: notify } = useNotification();
  const [saving, setSaving] = React.useState(false);

  const { queryResult } = useShow<ProductRow[], HttpError>({ resource: "rpt_products_full", id });
  const p = queryResult?.data?.data as ProductRow | undefined;
  const pStrict: ProductRowStrict | undefined =
    p && p.id != null ? ({ ...(p as ProductRow), id: Number(p.id) } as ProductRowStrict) : undefined;

  const { data: imgData } = useSWR<{ imageUrl?: string }>(
    hasNumericId ? `/api/billbee/products/get/${idNum}` : null,
    fetcher,
  );
  const imageUrl = imgData?.imageUrl;

  // Komponenten (falls BOM)
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

  const { data: compRes } = useList<ProductRow[], HttpError>({
    resource: "rpt_products_full",
    filters: componentIds.length ? [{ field: "id", operator: "in", value: componentIds }] : [],
    pagination: { pageSize: 500 },
    queryOptions: { enabled: !!pStrict?.is_bom && componentIds.length > 0 },
  });

  const components: ComponentWithQty[] = toStrict(compRes?.data as ProductRow[] | undefined).map((c) => ({
    ...c,
    qty: qtyById.get(c.id) ?? 1,
  }));

  const ekBOM = components.reduce((s, c) => s + c.qty * Number(c.net_purchase_price ?? 0), 0);
  const ekNetto = pStrict?.is_bom ? ekBOM : Number(pStrict?.net_purchase_price ?? 0);

  // Verwendet in …
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

  // Bild-Box
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
  }, [pStrict, imageUrl, components.length]);

  // ------- FORM (nur Extension-Felder) -------
  const [form] = Form.useForm();
  const editableKeys = React.useMemo(
    () => (pStrict?.is_bom ? [] : (["external_sku", "purchase_details"] as const)),
    [pStrict?.is_bom],
  );
  type EditableShape = { external_sku: string; purchase_details: string };

  const initialRef = React.useRef<EditableShape | null>(null);
  React.useEffect(() => {
    if (!pStrict) return;
    const init: EditableShape = {
      external_sku: pStrict.external_sku ?? "",
      purchase_details: pStrict.purchase_details ?? "",
    };
    initialRef.current = init;
    form.setFieldsValue(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pStrict?.id]);

  const wExternalSku = Form.useWatch("external_sku", form);
  const wPurchaseDetails = Form.useWatch("purchase_details", form);
  const normalize = (v: any) => (v ?? "").toString();
  const currentVals: EditableShape = {
    external_sku: normalize(wExternalSku),
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
    router.push(`/artikel/anzeigen/${pStrict?.id}`);
  };

  const handleSaveClick = async () => {
    if (!isDirty || saving || !pStrict) return;
    const go = await confirmSave();
    if (!go) return;
    form.submit();
  };

  const onFinish = async (values: { external_sku?: string; purchase_details?: string }) => {
    if (!hasNumericId) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        [EXT_CONFLICT_KEY]: idNum,
        external_sku: values.external_sku ?? null,
        purchase_details: values.purchase_details ?? null,
      };

      const { error } = await supabaseBrowserClient
        .from(EXT_TABLE)
        .upsert(payload, { onConflict: EXT_CONFLICT_KEY });

      if (error) throw error;

      initialRef.current = {
        external_sku: values.external_sku ?? "",
        purchase_details: values.purchase_details ?? "",
      };

      notify?.({
        type: "success",
        message: "Gespeichert",
        description: "Extension-Daten wurden aktualisiert.",
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

  const getBillbeeArticleId = (raw?: number | string | null) => {
    const s = String(raw ?? "").replace(/\D/g, "");
    if (!s) return null;
    const last8 = s.slice(-8);
    const n = parseInt(last8, 10);
    return Number.isFinite(n) ? String(n) : null;
  };

  const buttonClick = (target: "list" | "billbee") => {
    if (target === "list") {
      router.push("/artikel");
      return;
    }
    const bbId = getBillbeeArticleId(pStrict?.id);
    if (bbId) {
      window.open(`https://app.billbee.io/app_v2/article/${bbId}?copy=false`, "_blank", "noopener,noreferrer");
    }
  };

  // ======= Einkaufsbestellungen (Positionen) – stabilisiert =======
  const [poItems, setPoItems] = React.useState<PoItemRow[]>([]);
  const [poItemsLoading, setPoItemsLoading] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!hasNumericId || !pStrict?.sku) {
        if (mounted) setPoItems([]);
        return;
      }
      setPoItemsLoading(true);
      try {
        const supabase = supabaseBrowserClient;

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

        if (mounted) setPoItems(rows);
      } finally {
        if (mounted) setPoItemsLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
    // ⚠️ Nur stabile Dependencies – verhindert Endlos-Schleife
  }, [idNum, pStrict?.sku, hasNumericId]);

  return (
    <Card
      title={`Artikel bearbeiten: ${pStrict?.sku ?? "—"}`}
      extra={
        <Space>
          <Button onClick={() => buttonClick("list")}>Übersicht</Button>
          <Button onClick={() => buttonClick("billbee")}>Billbee</Button>
          {pStrict?.id && <Button onClick={handleCancelClick}>Abbrechen</Button>}
          <Button type="primary" onClick={handleSaveClick} disabled={!isDirty || saving || !pStrict} loading={saving}>
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
              <div style={{ position: "relative", width: imgBoxSize ?? 320, height: imgBoxSize ?? 320, maxWidth: "100%" }}>
                <Image
                  src={imageUrl}
                  alt={pStrict?.name ?? "Produktbild"}
                  fill
                  style={{ objectFit: "cover", borderRadius: 8 }}
                />
              </div>
            ) : (
              "—"
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Einkauf – gleiche Struktur */}
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Descriptions column={1} bordered size="small" labelStyle={{ width: 260 }} title="Einkauf">
          <Descriptions.Item label="Hersteller">{pStrict?.manufacturer ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="EK (netto)">{currency(ekNetto)}</Descriptions.Item>
          {!pStrict?.is_bom && (
            <>
              <Descriptions.Item label="Externe Art.-Nr.">
                <Form.Item name="external_sku" style={{ margin: 0 }}>
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
                { title: "Menge", dataIndex: "qty", width: 100, render: (v: number) => v ?? 1 },
              ]}
              locale={{ emptyText: "Keine Zuordnungen gefunden." }}
            />
          </Card>
        </>
      )}

      {/* BOM – Komponenten */}
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
                { title: "Menge", dataIndex: "qty", width: 100, render: (v: number) => v ?? 1 },
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
      {!pStrict?.is_bom && (
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
