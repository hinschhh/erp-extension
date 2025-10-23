"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  Space,
  Button,
  Tag,
  Input,
  Select,
  Tooltip,
  Drawer,
  Form,
  App,
  Typography,
  Popconfirm,
  Switch
} from "antd";
import {
  EditOutlined,
  ContactsOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useTable, useForm } from "@refinedev/antd";
import { useDelete, HttpError } from "@refinedev/core";
import type { Tables } from "@/types/supabase";

const { Text } = Typography;

type Supplier = Tables<"app_suppliers">;
type SupplierContact = Tables<"app_supplier_contacts">;

export default function SupplierListPage() {
  const { tableProps, setFilters, setSorter } = useTable<Supplier, HttpError>({
    resource: "app_suppliers",
    pagination: { current: 1, pageSize: 20 },
    initialSorter: [{ field: "created_at", order: "desc" }],
    syncWithLocation: true,
  });

  // Suche/Filter – name (ilike), active (eq), country (eq)
  const [searchText, setSearchText] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string | undefined>(undefined);
  const [countryFilter, setCountryFilter] = useState<string | undefined>(undefined);

  const applyFilters = () => {
    setFilters(
      [
        { field: "name", operator: "contains", value: searchText || undefined },
        { field: "active", operator: "eq", value: activeFilter === undefined ? undefined : activeFilter === "true" },
        { field: "country", operator: "eq", value: countryFilter || undefined },
      ],
      "replace",
    );
  };

  // Kontakte-Drawer (Liste) + Kontakt-Form-Drawer (Create/Edit)
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactsSupplier, setContactsSupplier] = useState<Supplier | null>(null);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);

  const openContacts = (supplier: Supplier) => {
    setContactsSupplier(supplier);
    setContactsOpen(true);
  };

  const openCreateContact = () => {
    setEditingContact(null);
    setContactFormOpen(true);
  };

  const openEditContact = (c: SupplierContact) => {
    setEditingContact(c);
    setContactFormOpen(true);
  };

  const { mutate: deleteOne, isLoading: deleting } = useDelete();
  const { message } = App.useApp();

  return (
    <div className="space-y-4">
      <Space wrap style={{ width: "100%" }} align="start">
        <Input.Search
          placeholder="Nach Name/E-Mail/Telefon suchen…"
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={applyFilters}
          style={{ width: 320 }}
        />
        <Select
          placeholder="Aktiv-Filter"
          allowClear
          value={activeFilter}
          onChange={(v) => {
            setActiveFilter(v);
            setFilters(
              [
                { field: "name", operator: "contains", value: searchText || undefined },
                { field: "active", operator: "eq", value: v === undefined ? undefined : v === "true" },
                { field: "country", operator: "eq", value: countryFilter || undefined },
              ],
              "replace",
            );
          }}
          style={{ width: 160 }}
          options={[
            { label: "Nur aktive", value: "true" },
            { label: "Nur inaktive", value: "false" },
          ]}
        />
        <Input
          placeholder="Land (z. B. DE, AT, CZ …)"
          allowClear
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value || undefined)}
          onPressEnter={applyFilters}
          style={{ width: 180 }}
        />

        <Link href="/einkauf/lieferanten/anlegen">
          <Button type="primary" icon={<PlusOutlined />} />
        </Link>
      </Space>

      <Table<Supplier>
        {...tableProps}
        rowKey="id"
        onChange={(_, __, sorter) => {
          if (!Array.isArray(sorter)) {
            const single = sorter as any;
            const order = single.order as "ascend" | "descend" | undefined;
            const field = single.field as string | undefined;

          }
        }}
      >
        <Table.Column<Supplier>
          dataIndex="name"
          title="Name"
          render={(value: string, record) => (
            <Space direction="vertical" size={0}>
              <Link href={`/einkauf/lieferanten/bearbeiten/${record.id}`}>{value}</Link>
              {record.short_code ? <Text type="secondary">Kürzel: {record.short_code}</Text> : null}
            </Space>
          )}
        />
        <Table.Column<Supplier>
          dataIndex="email"
          title="E-Mail"
          render={(v?: string) => (v ? <a href={`mailto:${v}`}>{v}</a> : <Text type="secondary">—</Text>)}
        />
        <Table.Column<Supplier>
          dataIndex="phone"
          title="Telefon"
          render={(v?: string) => (v ? <a href={`tel:${v}`}>{v}</a> : <Text type="secondary">—</Text>)}
        />
        <Table.Column<Supplier>
          dataIndex="website"
          title="Website"
          render={(v?: string) =>
            v ? (
              <a href={v.startsWith("http") ? v : `https://${v}`} target="_blank" rel="noreferrer">
                {v}
              </a>
            ) : (
              <Text type="secondary">—</Text>
            )
          }
        />
        <Table.Column<Supplier>
          title="Adresse"
          render={(_, r) => {
            const line = [r.address_line1, r.address_line2].filter(Boolean).join(", ");
            const city = [r.postal_code, r.city].filter(Boolean).join(" ");
            const country = [r.state_region, r.country].filter(Boolean).join(", ");
            const summary = [line, city, country].filter(Boolean).join(" • ");
            return summary ? <Text>{summary}</Text> : <Text type="secondary">—</Text>;
          }}
        />
        <Table.Column<Supplier> dataIndex="default_currency" title="Währung" width={100} />
        <Table.Column<Supplier>
          dataIndex="payment_terms_days"
          title="Zahlungsziel"
          render={(v: number) => <>{v} Tage</>}
          width={120}
        />
        <Table.Column<Supplier>
          dataIndex="default_incoterm"
          title="Incoterm"
          width={120}
          render={(v?: string) => v || <Text type="secondary">—</Text>}
        />
        <Table.Column<Supplier>
          dataIndex="default_leadtime_days"
          title="Leadtime"
          render={(v: number) => <>{v} Tage</>}
          width={110}
        />
        <Table.Column<Supplier>
          dataIndex="vat_number"
          title="USt-ID"
          render={(v?: string) => v || <Text type="secondary">—</Text>}
          width={160}
        />
        <Table.Column<Supplier>
          dataIndex="tax_country"
          title="Steuer-Land"
          render={(v?: string) => v || <Text type="secondary">—</Text>}
          width={120}
        />
        <Table.Column<Supplier>
          dataIndex="active"
          title="Status"
          width={100}
          render={(v: boolean) => (v ? <Tag color="green">aktiv</Tag> : <Tag>inaktiv</Tag>)}
        />
        <Table.Column<Supplier>
          title=""
          fixed="right"
          width={140}
          render={(_, record) => (
            <Space>
              <Tooltip title="Bearbeiten">
                <Link href={`/einkauf/lieferanten/bearbeiten/${record.id}`}>
                  <Button size="small" icon={<EditOutlined />} />
                </Link>
              </Tooltip>

              <Tooltip title="Kontakte verwalten">
                <Button
                  size="small"
                  icon={<ContactsOutlined />}
                  onClick={() => openContacts(record)}
                />
              </Tooltip>

              <Tooltip title="Löschen">
                <Popconfirm
                  title="Diesen Lieferanten löschen?"
                  okText="Löschen"
                  cancelText="Abbrechen"
                  okButtonProps={{ danger: true, loading: deleting }}
                  onConfirm={() =>
                    deleteOne(
                      { resource: "app_suppliers", id: record.id },
                      {
                        onSuccess: () => message.success("Lieferant gelöscht"),
                        onError: (e) => message.error(e?.message ?? "Löschen fehlgeschlagen"),
                      },
                    )
                  }
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Tooltip>
            </Space>
          )}
        />
      </Table>

      {/* Kontakte-Manager */}
      <ContactsDrawer
        open={contactsOpen}
        supplier={contactsSupplier}
        onClose={() => setContactsOpen(false)}
        onCreateContact={openCreateContact}
        onEditContact={openEditContact}
      />

      {/* Kontakt-Formular */}
      <ContactFormDrawer
        open={contactFormOpen}
        onClose={() => setContactFormOpen(false)}
        supplierId={contactsSupplier?.id ?? null}
        contact={editingContact}
      />
    </div>
  );
}

/** Drawer: zeigt alle Kontakte des Lieferanten + Button zum Anlegen */
function ContactsDrawer({
  open,
  supplier,
  onClose,
  onCreateContact,
  onEditContact,
}: {
  open: boolean;
  supplier: Supplier | null;
  onClose: () => void;
  onCreateContact: () => void;
  onEditContact: (c: SupplierContact) => void;
}) {
  return (
    <Drawer
      title={supplier ? `Kontakte – ${supplier.id}` : "Kontakte"}
      open={open}
      onClose={onClose}
      width={720}
      destroyOnClose
      extra={
        <Space>
          <Tooltip title="Kontakt hinzufügen">
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateContact} />
          </Tooltip>
        </Space>
      }
    >
      {supplier ? (
        <ContactsEmbeddedTable supplierId={supplier.id} onEdit={onEditContact} />
      ) : (
        <Text type="secondary">Kein Lieferant ausgewählt.</Text>
      )}
    </Drawer>
  );
}

/** Eingebettete Kontakte-Tabelle (nur lesen + Edit-Icon) */
function ContactsEmbeddedTable({
  supplierId,
  onEdit,
}: {
  supplierId: string;
  onEdit: (c: SupplierContact) => void;
}) {
  const { tableProps } = useTable<SupplierContact>({
    resource: "app_supplier_contacts",
    filters: { initial: [{ field: "supplier_id", operator: "eq", value: supplierId }] },
    pagination: { current: 1, pageSize: 10 },
    syncWithLocation: false,
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
        render={(v: boolean) => (v ? <Tag color="green">Standard</Tag> : <Tag>—</Tag>)}
      />
      <Table.Column<SupplierContact>
        title=""
        width={80}
        render={(_, record) => (
          <Space>
            <Tooltip title="Bearbeiten">
              <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
            </Tooltip>
          </Space>
        )}
      />
    </Table>
  );
}

/** Drawer für Kontakt anlegen/bearbeiten (useForm) */
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

  const { formProps, saveButtonProps, onFinish } = useForm<
    SupplierContact,
    HttpError,
    SupplierContact
  >({
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

  return (
    <Drawer
      title={isEdit ? "Kontakt bearbeiten" : "Kontakt anlegen"}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="primary" {...saveButtonProps} />
        </Space>
      }
    >
      <Form
        {...formProps}
        layout="vertical"
        initialValues={initialValues}
        onFinish={async (values) => {
          if (!isEdit && !values.fk_bb_supplier) {
            return message.error("Supplier-ID fehlt");
          }
          await onFinish?.(values as any);
        }}
      >
        <Form.Item name="fk_bb_supplier" hidden rules={[{ required: true, message: "Supplier-ID fehlt" }]}>
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
