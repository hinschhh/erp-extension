// src/app/(authenticated)/einkauf/bestellungen/anlegen/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Switch, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import type { Tables, TablesInsert } from "@/types/supabase";
import { supabaseBrowserClient } from "@/utils/supabase/client";

const { Text } = Typography;

// -------- DB-Typen --------
type Po = Tables<"app_purchase_orders">;
type PoInsert = TablesInsert<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;

const toDate = (d?: string | null) => (d ? dayjs(d) : undefined);
const fromDate = (d?: Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);

// -------- UI-Status-Optionen (nur relevante für Anlegen) --------
const STATUS_OPTIONS = [
  { value: "draft", label: "Entwurf" },
  { value: "ordered", label: "Bestellt" },
  // Folge-Status sind beim Anlegen gesperrt und erst im Bearbeiten-Flow sinnvoll
  { value: "confirmed", label: "Bestätigt", disabled: true },
  { value: "in_production", label: "In Produktion", disabled: true },
  { value: "partially_in_production", label: "Teilw. in Produktion", disabled: true },
  { value: "partially_delivered", label: "Teilw. geliefert", disabled: true },
  { value: "delivered", label: "Geliefert", disabled: true },
  { value: "cancelled", label: "Storniert" },
] as const;

export default function BestellungAnlegenPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowserClient, []);
  const { message } = App.useApp();

  const [form] = Form.useForm<Po>();
  const [saving, setSaving] = React.useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = React.useState(true);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);

  // Lieferanten laden
  React.useEffect(() => {
    (async () => {
      setLoadingSuppliers(true);
      const { data, error } = await supabase.from("app_suppliers").select("*").order("name", { ascending: true });
      if (error) {
        message.error(`Lieferanten konnten nicht geladen werden: ${error.message}`);
        setLoadingSuppliers(false);
        return;
      }
      setSuppliers(data || []);
      setLoadingSuppliers(false);
    })();
  }, [supabase, message]);

  // Speichern → Insert + Redirect auf Bearbeiten
  const onCreate = async () => {
    try {
      const v = await form.validateFields();

      setSaving(true);

      const payload: PoInsert = {
        supplier_id: v.supplier_id!,
        status: (v.status as Po["status"]) ?? "draft",
        invoice_number: v.invoice_number ?? null,
        invoice_date: fromDate(v.invoice_date as any),
        shipping_cost_net: typeof v.shipping_cost_net === "number" ? v.shipping_cost_net : 0,
        // bool | null, je nach Schema
        separate_invoice_for_shipping_cost:
          typeof v.separate_invoice_for_shipping_cost === "boolean" ? v.separate_invoice_for_shipping_cost : undefined,
        notes: v.notes ?? null,
        order_number: v.order_number ?? null, // Added order_number to match the required type
        // created_at wird per Trigger/Default in der DB gesetzt (wie von dir vorgesehen)
      };

      const { data, error } = await supabase
        .from("app_purchase_orders")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      const newId = data?.id as string;

      message.success("Bestellung angelegt");
      router.push(`/einkauf/bestellungen/bearbeiten/${newId}`);
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <App>
      <div className="p-4">
        <Row justify="space-between" align="middle" className="mb-3">
          <Col>
            <h2 className="text-xl font-semibold">Bestellung anlegen</h2>
          </Col>
          <Col>
            <Button onClick={() => router.push("/einkauf/bestellungen")}>zur Übersicht</Button>
          </Col>
        </Row>

        <Card>
          <Form form={form} layout="vertical" initialValues={{ status: "draft" }}>
            {/* Kopf */}
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Lieferant"
                  name="supplier_id"
                  rules={[{ required: true, message: "Pflichtfeld" }]}
                >
                  <Select
                    showSearch
                    loading={loadingSuppliers}
                    optionFilterProp="label"
                    placeholder="Lieferant wählen"
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    onChange={(val: string) => {
                      // Falls Lieferant einen Default für separate Versandrechnung hat, anwenden (optional)
                      const s = suppliers.find((x) => x.id === val);
                      const supDefault = (s as any)?.separate_invoice_for_shipping_cost;
                      const current = form.getFieldValue("separate_invoice_for_shipping_cost");
                      if (current === undefined || current === null) {
                        if (typeof supDefault === "boolean") {
                          form.setFieldsValue({ separate_invoice_for_shipping_cost: supDefault });
                        }
                      }
                    }}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item
                  label="Status"
                  name="status"
                  rules={[{ required: true, message: "Pflichtfeld" }]}
                  tooltip="Beim Anlegen meist »Entwurf« oder »Bestellt«."
                >
                  <Select options={STATUS_OPTIONS as any} />
                </Form.Item>
              </Col>
            </Row>

            {/* Rechnungsdaten / Versand / Notizen */}
            <Row gutter={12}>
              <Col xs={24} md={6}>
                <Form.Item label="Rechnungsnr." name="invoice_number">
                  <Input placeholder="Optional" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Rechnungsdatum" name="invoice_date">
                  <DatePicker className="w-full" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="Versandkosten (netto)" name="shipping_cost_net">
                  <InputNumber className="w-full" min={0} step={0.01} placeholder="0,00" />
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

            <Row>
              <Col span={24}>
                <Form.Item label="Anmerkungen" name="notes">
                  <Input.TextArea rows={3} placeholder="Interne Hinweise (optional)" />
                </Form.Item>
              </Col>
            </Row>

            {/* Footer */}
            <Row justify="end">
              <Space>
                <Button onClick={() => router.back()}>Abbrechen</Button>
                <Button type="primary" loading={saving} onClick={onCreate}>
                  Anlegen
                </Button>
              </Space>
            </Row>
          </Form>

          <Row className="mt-4">
            <Col span={24}>
              <Text type="secondary">
                Nach dem Anlegen wirst du zur Bearbeitungsseite weitergeleitet, um Positionen hinzuzufügen.
              </Text>
            </Col>
          </Row>
        </Card>
      </div>
    </App>
  );
}
