"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Tabs,
  Card,
  Row,
  Col,
  Space,
  Typography,
  App,
  Table,
  Tooltip,
  Drawer,
  Popconfirm,
  Divider,
  Tag,
} from "antd";
import {
  SaveOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ContactsOutlined,
  PlusOutlined,
  EditOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { Edit, useForm, useTable } from "@refinedev/antd";
import { useDelete, HttpError } from "@refinedev/core";
import Link from "next/link";
import type { Tables } from "@/types/supabase";

const { Text } = Typography;

type Supplier = Tables<"app_suppliers">;
type SupplierContact = Tables<"app_supplier_contacts">;
type PurchaseOrder = Tables<"app_purchase_orders">;

export default function SupplierEditPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) ?? null; // <-- ID aus der Route
  const { message } = App.useApp();

  // Eine (!) Form für alle Tabs
  const { formProps, saveButtonProps, queryResult } = useForm<Supplier, HttpError, Supplier>({
    resource: "app_suppliers",
    action: "edit",
    id: id ?? undefined,                                      // <-- ID explizit setzen
    redirect: false,
    queryOptions: { enabled: Boolean(id) },                   // <-- erst starten, wenn ID da
    onMutationSuccess: () => message.success("Lieferant gespeichert"),
  });

  const record = queryResult?.data?.data;
  const isLoading = queryResult?.isLoading || queryResult?.isFetching;

  // Initialwerte aus DB setzen (einmal nach Load)
  useEffect(() => {
    if (record && formProps?.form) {
      formProps.form.setFieldsValue({ ...record });
    }
    // wir wollen nur reagieren, wenn ein neues Record geladen wurde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const supplierId = record?.id ?? id ?? null;

  // Löschen
  const { mutate: deleteOne, isLoading: deleting } = useDelete();

  // Kontakte-Drawer (Form)
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);

  const openCreateContact = () => {
    setEditingContact(null);
    setContactOpen(true);
  };
  const openEditContact = (c: SupplierContact) => {
    setEditingContact(c);
    setContactOpen(true);
  };

  return (
    <Edit
      isLoading={isLoading}
      saveButtonProps={saveButtonProps}
      headerButtons={() => (
        <Space>
          <Tooltip title="Zurück">
            <Button icon={<RollbackOutlined />} onClick={() => router.back()} />
          </Tooltip>
          <Tooltip title="Speichern">
            <Button type="primary" icon={<SaveOutlined />} {...saveButtonProps} />
          </Tooltip>
          <Tooltip title="Löschen">
            <Popconfirm
              title="Diesen Lieferanten löschen?"
              okText="Löschen"
              cancelText="Abbrechen"
              okButtonProps={{ danger: true, loading: deleting }}
              onConfirm={() =>
                supplierId &&
                deleteOne(
                  { resource: "app_suppliers", id: supplierId },
                  {
                    onSuccess: () => {
                      message.success("Lieferant gelöscht");
                      router.push("/lieferanten");
                    },
                    onError: (e) => message.error(e?.message ?? "Löschen fehlgeschlagen"),
                  },
                )
              }
            >
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      )}
    >
      {/* Fallback-Initialwerte; echte Werte kommen via setFieldsValue */}
      <Form {...formProps} layout="vertical" initialValues={{ active: true, default_currency: "EUR" }}>
        <Tabs
          defaultActiveKey="stammdaten"
          items={[
            {
              key: "stammdaten",
              label: "Stammdaten",
              children: (
                <Card bordered>
                  <Row gutter={[16, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Name" name="name" rules={[{ required: true, message: "Pflichtfeld" }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item label="Kürzel" name="short_code">
                        <Input />
                      </Form.Item>
                      <Form.Item label="E-Mail" name="email" rules={[{ type: "email", message: "Ungültige E-Mail" }]}>
                        <Input />
                      </Form.Item>
                      <Form.Item label="Telefon" name="phone">
                        <Input />
                      </Form.Item>
                      <Form.Item label="Website" name="website">
                        <Input />
                      </Form.Item>
                      <Form.Item label="Notizen" name="notes">
                        <Input.TextArea rows={4} />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item label="USt-ID" name="vat_number">
                        <Input />
                      </Form.Item>
                      <Form.Item label="Steuer-Land" name="tax_country">
                        <Input placeholder="z. B. DE" />
                      </Form.Item>
                      <Form.Item label="Aktiv" name="active" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                      <Form.Item label="Erstellt am" name="created_at">
                        <Input disabled />
                      </Form.Item>
                      <Form.Item label="Aktualisiert am" name="updated_at">
                        <Input disabled />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider orientation="left">Adresse</Divider>
                  <Row gutter={[16, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Adresse Zeile 1" name="address_line1">
                        <Input />
                      </Form.Item>
                      <Form.Item label="Adresse Zeile 2" name="address_line2">
                        <Input />
                      </Form.Item>
                      <Form.Item label="PLZ" name="postal_code">
                        <Input />
                      </Form.Item>
                      <Form.Item label="Ort" name="city">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Bundesland/Region" name="state_region">
                        <Input />
                      </Form.Item>
                      <Form.Item label="Land" name="country">
                        <Input placeholder="z. B. Deutschland" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              ),
            },
            {
              key: "einstellungen",
              label: "Einstellungen",
              children: (
                <Card bordered>
                  <Row gutter={[16, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Standard-Währung" name="default_currency">
                        <Input placeholder="z. B. EUR" />
                      </Form.Item>
                      <Form.Item label="Zahlungsziel (Tage)" name="payment_terms_days">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                      <Form.Item label="Standard-Incoterm" name="default_incoterm">
                        <Input placeholder="z. B. EXW, DAP, FOB" />
                      </Form.Item>
                      <Form.Item label="Standard-Leadtime (Tage)" name="default_leadtime_days">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form.Item label="Standard-Bestellkanal" name="default_order_channel">
                        <Input placeholder="z. B. email, portal, api" />
                      </Form.Item>
                      <Form.Item label="Standard-Zahlungsmethode" name="default_payment_method">
                        <Input placeholder="z. B. Überweisung, Kreditkarte" />
                      </Form.Item>
                      <Form.Item
                        label="Separate Rechnung für Versandkosten"
                        name="separate_invoice_for_shipping_cost"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              ),
            },
            {
              key: "kontakte",
              label: "Kontakte",
              children: (
                <Card
                  bordered
                  title={
                    <Space>
                      <ContactsOutlined />
                      <span>Kontakte verwalten</span>
                    </Space>
                  }
                  extra={
                    <Tooltip title="Kontakt hinzufügen">
                      <Button type="primary" icon={<PlusOutlined />} onClick={openCreateContact} disabled={!supplierId} />
                    </Tooltip>
                  }
                >
                  <ContactsTable supplierId={supplierId} onEdit={openEditContact} />
                  <ContactFormDrawer
                    open={contactOpen}
                    onClose={() => setContactOpen(false)}
                    supplierId={supplierId}
                    contact={editingContact}
                  />
                </Card>
              ),
            },
            {
              key: "bestellungen",
              label: "Bestellungen",
              children: (
                <Card bordered>
                  <SupplierOrdersTable supplierId={supplierId} />
                </Card>
              ),
            },
          ]}
        />
      </Form>
    </Edit>
  );
}

/* ------------------------- Kontakte: Tabelle + Drawer ------------------------- */

function ContactsTable({
  supplierId,
  onEdit,
}: {
  supplierId: string | null;
  onEdit: (c: SupplierContact) => void;
}) {
  const { tableProps } = useTable<SupplierContact>({
    resource: "app_supplier_contacts",
    filters: supplierId ? { initial: [{ field: "supplier_id", operator: "eq", value: supplierId }] } : {},
    pagination: { current: 1, pageSize: 10 },
    syncWithLocation: false,
    queryOptions: { enabled: Boolean(supplierId) }, // <-- nur laden, wenn ID da
  });

  return (
    <Table<SupplierContact> {...tableProps} rowKey="id" size="small">
      <Table.Column<SupplierContact> dataIndex="contact_name" title="Name" />
      <Table.Column<SupplierContact> dataIndex="role_title" title="Rolle/Funktion" />
      <Table.Column<SupplierContact>
        dataIndex="email"
        title="E-Mail"
        render={(v?: string) => (v ? <a href={`mailto:${v}`}>{v}</a> : <Text type="secondary">—</Text>)}
      />
      <Table.Column<SupplierContact>
        dataIndex="phone"
        title="Telefon"
        render={(v?: string) => (v ? <a href={`tel:${v}`}>{v}</a> : <Text type="secondary">—</Text>)}
      />
      <Table.Column<SupplierContact>
        dataIndex="is_default"
        title="Standard"
        width={110}
        render={(v: boolean) => (v ? <span>✅</span> : <span>—</span>)}
      />
      <Table.Column<SupplierContact>
        title=""
        width={80}
        render={(_, record) => (
          <Tooltip title="Kontakt bearbeiten">
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
          </Tooltip>
        )}
      />
    </Table>
  );
}

function ContactFormDrawer({
  open,
  onClose,
  supplierId,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string | null;
  contact: SupplierContact | null;
}) {
  const isEdit = Boolean(contact?.id);
  const { message } = App.useApp();

  const { formProps, saveButtonProps, onFinish } = useForm<SupplierContact, HttpError, SupplierContact>({
    resource: "app_supplier_contacts",
    action: isEdit ? "edit" : "create",
    id: isEdit ? contact!.id : undefined,
    redirect: false,
    onMutationSuccess() {
      message.success(isEdit ? "Kontakt aktualisiert" : "Kontakt angelegt");
      onClose();
    },
  });

  const initialValues = useMemo(() => {
    if (isEdit) return contact!;
    return supplierId ? ({ supplier_id: supplierId, is_default: false } as Partial<SupplierContact>) : {};
  }, [supplierId, isEdit, contact]);

  useEffect(() => {
    if (initialValues && formProps.form) formProps.form.setFieldsValue(initialValues);
  }, [initialValues, formProps.form]);

  return (
    <Drawer
      title={isEdit ? "Kontakt bearbeiten" : "Kontakt anlegen"}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose} icon={<RollbackOutlined />} />
          <Button type="primary" icon={<SaveOutlined />} {...saveButtonProps} />
        </Space>
      }
    >
      <Form
        {...formProps}
        layout="vertical"
        initialValues={initialValues}
        onFinish={async (values) => {
          if (!isEdit && !values.supplier_id) {
            return message.error("Supplier-ID fehlt");
          }
          await onFinish?.(values as any);
        }}
      >
        <Form.Item name="supplier_id" hidden rules={[{ required: true, message: "Supplier-ID fehlt" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Name" name="contact_name" rules={[{ required: true, message: "Pflichtfeld" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Rolle/Funktion" name="role_title">
          <Input />
        </Form.Item>
        <Form.Item label="E-Mail" name="email" rules={[{ type: "email", message: "Ungültige E-Mail" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Telefon" name="phone">
          <Input />
        </Form.Item>
        <Form.Item label="Standardkontakt" name="is_default" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="Notizen" name="notes">
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

/* ------------------------- Bestellungen des Lieferanten ------------------------- */

function SupplierOrdersTable({ supplierId }: { supplierId: string | null }) {
  const { tableProps } = useTable<PurchaseOrder>({
    resource: "app_purchase_orders",
    filters: supplierId ? { initial: [{ field: "supplier_id", operator: "eq", value: supplierId }] } : {},
    pagination: { current: 1, pageSize: 10 },
    syncWithLocation: false,
    queryOptions: { enabled: Boolean(supplierId) }, // <-- nur laden, wenn ID da
    sorters: { initial: [{ field: "created_at", order: "desc" }] as any },
  });

  return (
    <Table<PurchaseOrder> {...tableProps} rowKey="id" size="small">
      <Table.Column<PurchaseOrder> dataIndex="order_number" title="Bestellnr." />
      <Table.Column<PurchaseOrder>
        dataIndex="status"
        title="Status"
        render={(v: string) => <Tag>{v}</Tag>}
      />
      <Table.Column<PurchaseOrder>
        dataIndex="created_at"
        title="Erstellt"
        render={(v?: string) => (v ? new Date(v).toLocaleString() : "—")}
      />
      <Table.Column<PurchaseOrder>
        dataIndex="updated_at"
        title="Aktualisiert"
        render={(v?: string) => (v ? new Date(v).toLocaleString() : "—")}
      />
      <Table.Column<PurchaseOrder>
        title=""
        width={80}
        render={(_, record) => (
          <Tooltip title="Bestellung bearbeiten">
            <Link href={`/einkauf/bestellungen/bearbeiten/${record.id}`}>
              <Button size="small" icon={<FileTextOutlined />} />
            </Link>
          </Tooltip>
        )}
      />
    </Table>
  );
}
