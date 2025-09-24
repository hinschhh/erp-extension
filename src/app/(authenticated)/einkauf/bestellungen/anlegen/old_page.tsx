"use client";

import React from "react";
import { Create, useSelect } from "@refinedev/antd";
import { useCreate, useCreateMany, useOne } from "@refinedev/core";
import {
  Form,
  Input,
  DatePicker,
  Button,
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Space,
  InputNumber,
  Select,
  Tag,
  Divider,
  Tooltip,
  message,
} from "antd";
import dayjs from "dayjs";

type ItemKind = "normal" | "special_order";

type NormalItem = {
  key: string;
  billbee_product_id?: number | null;
  item_name: string;
  supplier_sku?: string;
  details_override?: string;
  qty_ordered: number;
  unit_price_net: number;
};

type SpecialItem = {
  key: string;
  billbee_product_id?: number | null;
  base_model_billbee_product_id?: number | null;
  item_name: string;
  supplier_sku?: string;
  details_override?: string;
  customer_confirmation_ref?: string;
  external_plan_url?: string;
  qty_ordered: number;
  unit_price_net: number;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Entwurf" },
  { value: "ordered", label: "Bestellt" },
  { value: "in_production", label: "In Produktion" },
  { value: "shipped", label: "Versandt" },
  { value: "partially_received", label: "Teilweise erhalten" },
  { value: "received", label: "Erhalten" },
  { value: "closed", label: "Abgeschlossen" },
  { value: "canceled", label: "Storniert" },
];

export default function PurchaseOrderCreatePage() {
  const [form] = Form.useForm();
  const [normalItems, setNormalItems] = React.useState<NormalItem[]>([]);
  const [specialItems, setSpecialItems] = React.useState<SpecialItem[]>([]);

  // Lieferant
  const supplier_id = Form.useWatch("supplier_id", form);

  // Lieferanten-Select
  const { selectProps: supplierSelect } = useSelect({
    resource: "rpt_suppliers_minimal",
    optionLabel: (item: any) => item.name,
    optionValue: (item: any) => item.id,
    onSearch: (value) => [{ field: "name", operator: "contains", value }],
    filters: [{ field: "active", operator: "eq", value: true }],
    pagination: { current: 1, pageSize: 50 },
    sorters: [{ field: "name", order: "asc" }],
  });

  // Produkte pro Lieferant (nur SKU anzeigen)
  const { selectProps: productSelectNormal, queryResult: qrNormal } = useSelect({
    resource: "rpt_supplier_products_for_po",
    optionLabel: (item: any) => item.sku ?? item.name, // nur SKU
    optionValue: (item: any) => item.billbee_product_id,
    onSearch: (value) => [{ field: "sku", operator: "contains", value }],
    filters: supplier_id ? [{ field: "supplier_id", operator: "eq", value: supplier_id }] : [],
    pagination: { current: 1, pageSize: 50 },
    sorters: [{ field: "sku", order: "asc" }],
    queryOptions: { enabled: !!supplier_id },
  });

  const { selectProps: productSelectSpecial, queryResult: qrSpecial } = useSelect({
    resource: "rpt_supplier_products_for_po",
    optionLabel: (item: any) => item.sku ?? item.name,
    optionValue: (item: any) => item.billbee_product_id,
    onSearch: (value) => [{ field: "sku", operator: "contains", value }],
    filters: supplier_id ? [{ field: "supplier_id", operator: "eq", value: supplier_id }] : [],
    pagination: { current: 1, pageSize: 50 },
    sorters: [{ field: "sku", order: "asc" }],
    queryOptions: { enabled: !!supplier_id },
  });

  // separates Select + Cache fürs GRUNDMODELL (auch supplier-gefiltert)
  const { selectProps: baseModelSelect, queryResult: qrBase } = useSelect({
    resource: "rpt_supplier_products_for_po",
    optionLabel: (item: any) => item.sku ?? item.name,
    optionValue: (item: any) => item.billbee_product_id,
    onSearch: (value) => [{ field: "sku", operator: "contains", value }],
    filters: supplier_id ? [{ field: "supplier_id", operator: "eq", value: supplier_id }] : [],
    pagination: { current: 1, pageSize: 50 },
    sorters: [{ field: "sku", order: "asc" }],
    queryOptions: { enabled: !!supplier_id },
  });

  // Meta Map (aus allen 3 Queries aggregiert)
  const productMeta = React.useMemo(() => {
    const rows = [
      ...(qrNormal?.data?.data ?? []),
      ...(qrSpecial?.data?.data ?? []),
      ...(qrBase?.data?.data ?? []),
    ];
    const map = new Map<
      number,
      {
        sku?: string | null;
        name: string;
        kind: ItemKind; // aus Kategorien: normal/special_order
        externalSkuDefault?: string | null; // external_sku
        purchaseDetailsDefault?: string | null; // purchase_details
        supplierPriceNet?: number | null; // net_purchase_price
      }
    >();
    rows.forEach((p: any) => {
      map.set(p.billbee_product_id, {
        sku: p.sku,
        name: p.name,
        kind: (p.item_kind as ItemKind) ?? "normal",
        externalSkuDefault: p.external_sku ?? null,
        purchaseDetailsDefault: p.purchase_details ?? null,
        supplierPriceNet: p.net_purchase_price ?? null,
      });
    });
    return map;
  }, [qrNormal?.data?.data, qrSpecial?.data?.data, qrBase?.data?.data]);

  // Lieferanten-Profil (ETA etc.)
  const supplierProfile = useOne<any>({
    resource: "rpt_supplier_profile",
    id: supplier_id,
    queryOptions: { enabled: !!supplier_id },
  });

  // Summen & ETA
  const sumNormal = React.useMemo(
    () => normalItems.reduce((s, i) => s + (i.qty_ordered || 0) * (i.unit_price_net || 0), 0),
    [normalItems],
  );
  const sumSpecial = React.useMemo(
    () => specialItems.reduce((s, i) => s + (i.qty_ordered || 0) * (i.unit_price_net || 0), 0),
    [specialItems],
  );
  const amountItems = sumNormal + sumSpecial;

  const ordered_at = Form.useWatch("ordered_at", form);
  const defaultLead = supplierProfile?.data?.data?.default_leadtime_days ?? 0;
  const eta = React.useMemo(() => {
    const d = ordered_at ? dayjs(ordered_at) : dayjs();
    return d.add(defaultLead || 0, "day").format("DD.MM.YYYY");
  }, [ordered_at, defaultLead]);

  // Helpers: add/patch/remove
  const addNormal = () =>
    supplier_id
      ? (setNormalItems((prev) => [
          ...prev,
          { key: crypto.randomUUID(), item_name: "Pos.", qty_ordered: 1, unit_price_net: 0 },
        ]),
        (productSelectNormal as any)?.onSearch?.(""))
      : message.warning("Bitte zuerst den Lieferanten wählen.");

  const addSpecial = () =>
    supplier_id
      ? (setSpecialItems((prev) => [
          ...prev,
          { key: crypto.randomUUID(), item_name: "SB-Pos.", qty_ordered: 1, unit_price_net: 0 },
        ]),
        (productSelectSpecial as any)?.onSearch?.(""))
      : message.warning("Bitte zuerst den Lieferanten wählen.");

  const patchNormal = (key: string, v: Partial<NormalItem>) =>
    setNormalItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...v } : i)));
  const patchSpecial = (key: string, v: Partial<SpecialItem>) =>
    setSpecialItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...v } : i)));

  const removeNormal = (key: string) => setNormalItems((prev) => prev.filter((i) => i.key !== key));
  const removeSpecial = (key: string) => setSpecialItems((prev) => prev.filter((i) => i.key !== key));

  // Vorlage vom Grundmodell übernehmen
  const applyBaseTemplate = (rowKey: string, force = false) => {
    setSpecialItems((prev) => {
      const idx = prev.findIndex((r) => r.key === rowKey);
      if (idx < 0) return prev;
      const row = prev[idx];
      if (!row.base_model_billbee_product_id) return prev;
      const base = productMeta.get(row.base_model_billbee_product_id);
      if (!base) return prev;

      const next: SpecialItem = { ...row };
      if (force || !next.details_override || next.details_override.trim() === "") {
        next.details_override = base.purchaseDetailsDefault ?? next.details_override;
      }
      if (force || !next.supplier_sku || next.supplier_sku.trim() === "") {
        next.supplier_sku = base.externalSkuDefault ?? next.supplier_sku;
      }
      const cp = [...prev];
      cp[idx] = next;
      return cp;
    });
  };

  // Save – Auto-Notifications aus, wir zeigen genau EINE Erfolgsmeldung
  const { mutateAsync: createOrder } = useCreate({
    successNotification: false as const,
    errorNotification: false as const,
  });
  const { mutateAsync: createMany } = useCreateMany({
    successNotification: false as const,
    errorNotification: false as const,
  });

  const onFinish = async (values: any) => {
    if (!supplier_id) {
      message.error("Bitte zuerst einen Lieferanten wählen.");
      return;
    }
    const fmt = (d: any) => (d ? dayjs(d).format("YYYY-MM-DD") : null);

    const orderPayload = {
      supplier_id,
      ordered_at: fmt(values.ordered_at),
      status: values.status,
      notes: values.notes ?? null,
    };

    try {
      const created = await createOrder({
        resource: "app_purchase_orders",
        values: orderPayload,
        meta: { select: "id" },
      });
      const newId = (created as any)?.data?.id ?? (created as any)?.id;
      if (!newId) return;

      if (normalItems.length > 0) {
        await createMany({
          resource: "app_purchase_orders_positions_normal",
          values: normalItems.map((i) => ({
            order_id: newId,
            billbee_product_id: i.billbee_product_id ?? null,
            item_name: i.item_name,
            supplier_sku: i.supplier_sku ?? null,
            details_override: i.details_override ?? null,
            qty_ordered: i.qty_ordered,
            unit_price_net: i.unit_price_net,
          })),
        });
      }

      if (specialItems.length > 0) {
        await createMany({
          resource: "app_purchase_orders_positions_special",
          values: specialItems.map((i) => ({
            order_id: newId,
            billbee_product_id: i.billbee_product_id ?? null,
            base_model_billbee_product_id: i.base_model_billbee_product_id ?? null,
            item_name: i.item_name,
            supplier_sku: i.supplier_sku ?? null,
            details_override: i.details_override ?? null,
            customer_confirmation_ref: i.customer_confirmation_ref ?? null,
            external_plan_url: i.external_plan_url ?? null,
            qty_ordered: i.qty_ordered,
            unit_price_net: i.unit_price_net,
          })),
        });
      }

      message.success("Bestellung erfolgreich angelegt.");
      location.assign(`/einkauf/bestellungen/bearbeiten/${newId}`);
    } catch {
      message.error("Anlegen fehlgeschlagen. Bitte erneut versuchen.");
    }
  };

  // Supplier-Wechsel: Autocomplete-Listen auf volle Supplier-Liste zurücksetzen
  React.useEffect(() => {
    (productSelectNormal as any)?.onSearch?.("");
    (productSelectSpecial as any)?.onSearch?.("");
    (baseModelSelect as any)?.onSearch?.("");
  }, [supplier_id]);

  // Preisfeld mit Delta (gegen Lieferantenpreis, falls vorhanden)
  const PriceWithDelta: React.FC<{
    value: number;
    refPrice?: number | null;
    onChange: (val?: number | null) => void;
  }> = ({ value, refPrice, onChange }) => {
    const num = (n: number) =>
      new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
    const delta = refPrice != null ? value - refPrice : null;
    const pct = refPrice && refPrice !== 0 ? (delta! / refPrice) * 100 : null;

    return (
      <Space.Compact style={{ width: "100%" }}>
        <InputNumber
          min={0}
          value={value}
          onChange={(val) => onChange(typeof val === "number" ? val : null)}
          style={{ width: "100%" }}
        />
        {refPrice != null && (
          <Tag color={delta! > 0 ? "red" : delta! < 0 ? "green" : "blue"} style={{ marginLeft: 8 }}>
            {delta! > 0 ? "+" : delta! < 0 ? "−" : "±"}
            {num(Math.abs(delta!))}
            {pct != null && (
              <>
                {" "}
                ({delta! > 0 ? "+" : delta! < 0 ? "−" : "±"}
                {Math.abs(pct).toFixed(1)}%)
              </>
            )}
          </Tag>
        )}
      </Space.Compact>
    );
  };

  // Spalten
  const skuRendererNormal = (_: any, r: NormalItem) => (
    <Select
      {...productSelectNormal}
      showSearch
      filterOption={false}
      allowClear
      placeholder="SKU wählen"
      style={{ width: "100%" }}
      value={r.billbee_product_id as any}
      disabled={!supplier_id}
      dropdownMatchSelectWidth={false}
      onChange={(val) => {
        let id: number | null = null;
        if (typeof val === "object" && val !== null && "value" in val) id = Number((val as any).value);
        else if (typeof val === "string" || typeof val === "number") id = Number(val);
        const meta = id ? productMeta.get(id) : undefined;
        patchNormal(r.key, {
          billbee_product_id: id,
          item_name: meta?.name ?? r.item_name,
          supplier_sku:
            r.supplier_sku && r.supplier_sku.length > 0
              ? r.supplier_sku
              : meta?.externalSkuDefault ?? r.supplier_sku,
          details_override:
            r.details_override && r.details_override.length > 0
              ? r.details_override
              : meta?.purchaseDetailsDefault ?? r.details_override,
          unit_price_net:
            typeof r.unit_price_net === "number" && r.unit_price_net > 0
              ? r.unit_price_net
              : meta?.supplierPriceNet ?? 0,
        });
      }}
    />
  );

  const skuRendererSpecial = (_: any, r: SpecialItem) => (
    <Select
      {...productSelectSpecial}
      showSearch
      filterOption={false}
      allowClear
      placeholder="SKU wählen"
      style={{ width: "100%" }}
      value={r.billbee_product_id as any}
      disabled={!supplier_id}
      dropdownMatchSelectWidth={false}
      onChange={(val) => {
        let id: number | null = null;
        if (typeof val === "object" && val !== null && "value" in val) id = Number((val as any).value);
        else if (typeof val === "string" || typeof val === "number") id = Number(val);
        const meta = id ? productMeta.get(id) : undefined;
        patchSpecial(r.key, {
          billbee_product_id: id,
          item_name: meta?.name ?? r.item_name,
          supplier_sku:
            r.supplier_sku && r.supplier_sku.length > 0
              ? r.supplier_sku
              : meta?.externalSkuDefault ?? r.supplier_sku,
          details_override:
            r.details_override && r.details_override.length > 0
              ? r.details_override
              : meta?.purchaseDetailsDefault ?? r.details_override,
          unit_price_net:
            typeof r.unit_price_net === "number" && r.unit_price_net > 0
              ? r.unit_price_net
              : meta?.supplierPriceNet ?? 0,
        });
      }}
    />
  );

  const baseModelRenderer = (_: any, r: SpecialItem) => (
    <Space.Compact style={{ width: "100%" }}>
      <Select
        key={`base-${r.key}`}
        {...baseModelSelect}
        showSearch
        filterOption={false}
        allowClear
        placeholder="Grundmodell SKU"
        style={{ width: "100%" }}
        value={r.base_model_billbee_product_id as any}
        disabled={!supplier_id}
        dropdownMatchSelectWidth={false}
        onChange={(val) => {
          let id: number | null = null;
          if (typeof val === "object" && val !== null && "value" in val) id = Number((val as any).value);
          else if (typeof val === "string" || typeof val === "number") id = Number(val);
          patchSpecial(r.key, { base_model_billbee_product_id: id });
          setTimeout(() => applyBaseTemplate(r.key, false), 0);
        }}
      />
      <Tooltip title="Vorlage aus Grundmodell (Details & ext. SKU) übernehmen">
        <Button size="small" onClick={() => applyBaseTemplate(r.key, true)}>
          Vorlage übernehmen
        </Button>
      </Tooltip>
    </Space.Compact>
  );

  const columnsNormal: any[] = [
    { title: "Interne SKU", dataIndex: "billbee_product_id", width: 180, render: skuRendererNormal },
    {
      title: "Externe Art.-Nr.",
      width: 160,
      render: (_: any, r: NormalItem) => (
        <Input value={r.supplier_sku} onChange={(e) => patchNormal(r.key, { supplier_sku: e.target.value })} />
      ),
    },
    {
      title: "Bestelldetails",
      width: 300,
      render: (_: any, r: NormalItem) => (
        <Input.TextArea
          value={r.details_override}
          onChange={(e) => patchNormal(r.key, { details_override: e.target.value })}
          autoSize={{ minRows: 1, maxRows: 3 }}
        />
      ),
    },
    {
      title: "Menge",
      dataIndex: "qty_ordered",
      width: 100,
      render: (v: number, r: NormalItem) => (
        <InputNumber
          min={0}
          value={v}
          onChange={(val) => patchNormal(r.key, { qty_ordered: Number(val ?? 0) })}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "EK (netto)",
      width: 180,
      render: (_: any, r: NormalItem) => {
        const ref = r.billbee_product_id ? productMeta.get(r.billbee_product_id!)?.supplierPriceNet : undefined;
        return (
          <PriceWithDelta
            value={r.unit_price_net}
            refPrice={ref}
            onChange={(val) => patchNormal(r.key, { unit_price_net: Number(val ?? 0) })}
          />
        );
      },
    },
    {
      title: "Gesamt",
      width: 120,
      fixed: "right" as const,
      render: (_: any, r: NormalItem) =>
        new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
          (r.qty_ordered || 0) * (r.unit_price_net || 0),
        ),
    },
    {
      title: "",
      width: 80,
      fixed: "right" as const,
      render: (_: any, r: NormalItem) => (
        <Button danger size="small" onClick={() => removeNormal(r.key)}>
          Löschen
        </Button>
      ),
    },
  ];

  const columnsSpecial: any[] = [
    { title: "Interne SKU", dataIndex: "billbee_product_id", width: 180, render: skuRendererSpecial },
    { title: "Grundmodell", dataIndex: "base_model_billbee_product_id", width: 220, render: baseModelRenderer },
    {
      title: "Externe Art.-Nr.",
      width: 160,
      render: (_: any, r: SpecialItem) => (
        <Input value={r.supplier_sku} onChange={(e) => patchSpecial(r.key, { supplier_sku: e.target.value })} />
      ),
    },
    {
      title: "Bestelldetails",
      width: 260,
      render: (_: any, r: SpecialItem) => (
        <Input.TextArea
          value={r.details_override}
          onChange={(e) => patchSpecial(r.key, { details_override: e.target.value })}
          autoSize={{ minRows: 1, maxRows: 3 }}
        />
      ),
    },
    {
      title: "AB-Nr.",
      width: 140,
      render: (_: any, r: SpecialItem) => (
        <Input
          value={r.customer_confirmation_ref}
          onChange={(e) => patchSpecial(r.key, { customer_confirmation_ref: e.target.value })}
        />
      ),
    },
    {
      title: "Skizzen-Link",
      width: 200,
      render: (_: any, r: SpecialItem) => (
        <Input
          value={r.external_plan_url}
          onChange={(e) => patchSpecial(r.key, { external_plan_url: e.target.value })}
          placeholder="https://…"
        />
      ),
    },
    {
      title: "Menge",
      dataIndex: "qty_ordered",
      width: 100,
      render: (v: number, r: SpecialItem) => (
        <InputNumber
          min={0}
          value={v}
          onChange={(val) => patchSpecial(r.key, { qty_ordered: Number(val ?? 0) })}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "EK (netto)",
      width: 180,
      render: (_: any, r: SpecialItem) => {
        const ref = r.billbee_product_id ? productMeta.get(r.billbee_product_id!)?.supplierPriceNet : undefined;
        return (
          <PriceWithDelta
            value={r.unit_price_net}
            refPrice={ref}
            onChange={(val) => patchSpecial(r.key, { unit_price_net: Number(val ?? 0) })}
          />
        );
      },
    },
    {
      title: "Gesamt",
      width: 120,
      fixed: "right" as const,
      render: (_: any, r: SpecialItem) =>
        new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
          (r.qty_ordered || 0) * (r.unit_price_net || 0),
        ),
    },
    {
      title: "",
      width: 80,
      fixed: "right" as const,
      render: (_: any, r: SpecialItem) => (
        <Button danger size="small" onClick={() => removeSpecial(r.key)}>
          Löschen
        </Button>
      ),
    },
  ];

  return (
    <Create
      title="Neue Bestellung (Nummer wird automatisch vergeben)"
      breadcrumb={false}
      footerButtons={<Button type="primary" onClick={() => form.submit()}>Anlegen</Button>}
    >
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: "draft", ordered_at: dayjs() }}>
        {/* Kopf */}
        <Card size="small" bodyStyle={{ paddingBottom: 8, paddingLeft: 16, paddingRight: 16 }} style={{ marginBottom: 16 }}>
          <Row gutter={[12, 12]}>
            <Col xs={24} lg={14}>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item label="Lieferant" name="supplier_id" rules={[{ required: true }]}>
                    <Select {...supplierSelect} showSearch filterOption={false} allowClear placeholder="Lieferant wählen" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Bestelldatum" name="ordered_at" rules={[{ required: true }]}>
                    <DatePicker style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Initialer Status" name="status" rules={[{ required: true }]}>
                    <Select options={STATUS_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Notizen" name="notes">
                    <Input.TextArea rows={1} placeholder="optional" />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
            <Col xs={24} lg={10}>
              <Row gutter={12}>
                <Col span={24}>
                  <Card size="small" title="Lieferant">
                    <div style={{ lineHeight: 1.6 }}>
                      <div><strong>Name:</strong> {supplierProfile.data?.data?.name ?? "—"}</div>
                      <div><strong>Zahlart:</strong> {supplierProfile.data?.data?.default_payment_method ?? "—"}</div>
                      <div><strong>Bestellart:</strong> {supplierProfile.data?.data?.default_order_channel ?? "—"}</div>
                      <Divider style={{ margin: "8px 0" }} />
                      <div><strong>Kontakt:</strong> {supplierProfile.data?.data?.default_contact_name ?? "—"}</div>
                      <div><strong>E-Mail:</strong> {supplierProfile.data?.data?.default_contact_email ?? "—"}</div>
                      <div><strong>Telefon:</strong> {supplierProfile.data?.data?.default_contact_phone ?? "—"}</div>
                    </div>
                  </Card>
                </Col>
                <Col span={24}>
                  <Card size="small" style={{ marginTop: 12 }}>
                    <Row gutter={12}>
                      <Col span={12}><Statistic title="Bestellsumme (netto)" value={amountItems} precision={2} suffix="€" /></Col>
                      <Col span={12}><Statistic title="Vorauss. Lieferung" value={eta} /></Col>
                    </Row>
                    <div style={{ color: "#888", marginTop: 8, fontSize: 12 }}>
                      ETA = Bestelldatum + Standard-Lieferzeit des Lieferanten
                    </div>
                  </Card>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        {/* Normale Positionen */}
        <Card
          size="small"
          title={
            <Space>
              <span>Normale Positionen</span>
              <Button size="small" type="dashed" onClick={addNormal} disabled={!supplier_id}>
                + Position
              </Button>
            </Space>
          }
          bodyStyle={{ padding: 0 }}
          style={{ marginBottom: 16 }}
        >
          <Table
            size="small"
            dataSource={normalItems}
            rowKey="key"
            columns={columnsNormal}
            pagination={false}
            scroll={{ x: "max-content" }}
          />
        </Card>

        {/* Sonderbestellungen */}
        <Card
          size="small"
          title={
            <Space>
              <span>Sonderbestellungen</span>
              <Tag color="orange">On Demand</Tag>
              <Button size="small" type="dashed" onClick={addSpecial} disabled={!supplier_id}>
                + SB-Position
              </Button>
            </Space>
          }
          bodyStyle={{ padding: 0 }}
        >
          <Table
            size="small"
            dataSource={specialItems}
            rowKey="key"
            columns={columnsSpecial}
            pagination={false}
            scroll={{ x: "max-content" }}
          />
        </Card>
      </Form>
    </Create>
  );
}
