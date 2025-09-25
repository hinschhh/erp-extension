// src/app/(authenticated)/einkauf/bestellungen/anlegen/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import type { Tables, TablesInsert } from "@/types/supabase";
import {
  Form,
  Input,
  DatePicker,
  Select,
  InputNumber,
  Button,
  Card,
  Row,
  Col,
  App,
} from "antd";
import dayjs, { Dayjs } from "dayjs";

type Po = Tables<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;
type PoInsert = TablesInsert<"app_purchase_orders">;

const STATUS_OPTIONS = [
  { value: "draft", label: "Entwurf" },
  { value: "ordered", label: "Bestellt" },
];

const fromDate = (d?: Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);

export default function BestellungAnlegenPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowserClient, []);
  const { message } = App.useApp();

  const [form] = Form.useForm<Po>();
  const [saving, setSaving] = React.useState(false);
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("app_suppliers")
        .select("*")
        .order("name", { ascending: true });
      if (error) message.error(error.message);
      setSuppliers(data || []);
      setLoading(false);
    })();
  }, [supabase, message]);

  const onCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const insert: PoInsert = {
        // order_number wird vom Trigger gesetzt (trg_po_set_order_number)
        supplier_id: values.supplier_id!,
        status: (values.status as any) || ("ordered" as any),
        ordered_at: fromDate(values.ordered_at as any)!,
        proforma_confirmed_at: fromDate(values.proforma_confirmed_at as any),
        sketch_confirmed_at: fromDate(values.sketch_confirmed_at as any),
        dol_planned_at: fromDate(values.dol_planned_at as any),
        dol_actual_at: fromDate(values.dol_actual_at as any),
        goods_received_at: fromDate(values.goods_received_at as any),
        invoice_number: values.invoice_number ?? null,
        invoice_date: fromDate(values.invoice_date as any),
        shipping_cost_net: values.shipping_cost_net ?? 0,
        notes: values.notes ?? null,
      } as any;

      const { data, error } = await supabase
        .from("app_purchase_orders")
        .insert(insert)
        .select("id")
        .single();

      if (error) throw error;
      message.success("Bestellung angelegt");
      // Weiter zur Bearbeitungsseite (Show kommt später)
      router.push(`/einkauf/bestellungen/bearbeiten/${data!.id}`);
    } catch (e: any) {
      if (e?.message) message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <Row justify="space-between" align="middle" className="mb-3">
        <Col>
          <h2 className="text-xl font-semibold">Bestellung anlegen</h2>
        </Col>
        <Col>
          <Button type="primary" loading={saving} onClick={onCreate}>
            Anlegen
          </Button>
        </Col>
      </Row>

      <Card loading={loading}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: "draft", ordered_at: dayjs() }}
        >
          <Row gutter={12}>
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
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="Status"
                name="status"
                rules={[{ required: true, message: "Pflichtfeld" }]}
              >
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="Bestellt am"
                name="ordered_at"
                rules={[{ required: true }]}
              >
                <DatePicker className="w-full" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
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
            <Col xs={24} md={6}>
              <Form.Item label="Lieferung erfolgt" name="dol_actual_at">
                <DatePicker className="w-full" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
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
            <Col xs={24} md={6}>
              <Form.Item label="Versandkosten (netto)" name="shipping_cost_net">
                <InputNumber className="w-full" min={0} step={0.01} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={24}>
              <Form.Item label="Notizen" name="notes">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>
    </div>
  );
}
