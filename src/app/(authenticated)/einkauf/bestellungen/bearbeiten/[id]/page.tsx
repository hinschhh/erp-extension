"use client"

import { useParams } from "next/navigation";
import { useMany, useOne, useSelect } from "@refinedev/core";
import { useForm, useEditableTable, Edit, DateField, RefreshButton, ListButton, EditButton, SaveButton, NumberField } from "@refinedev/antd";
import { Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Table, Tag } from "antd";
import { Tables } from "@/types/supabase";
import { useMemo } from "react";
import { statusMap, PoItemStatusTag } from "@components/common/tags/states/po_item";
import { PoStatusTag } from "@components/common/tags/states/po";
import { CloseOutlined, CompressOutlined } from "@ant-design/icons";

type Po = Tables<"app_purchase_orders">;
type PoItemNormal = Tables<"app_purchase_orders_positions_normal">;
type PoItemSpecial = Tables<"app_purchase_orders_positions_special">;

type Supplier = Tables<"app_suppliers">;
type Product = Tables<"app_products">;

export default function EinkaufsBestellungenBearbeiten() {

const params = useParams() as { id: string };
const orderId = params?.id;

const saveButtonProps = {
    hideText: true,
    type: "primary" as const,
    onClick: () => {
        console.log("Änderungen gespeichert");
    }
};

const  {formProps}  = useForm<Po>({
    resource: "app_purchase_orders",
    id: orderId,
    meta: {
        select: "*, app_suppliers(name)",
    }
});

const {
    formProps: formPropsEditableTableNormal,
    isEditing: isEditingEditableTableNormal,
    setId: setIdEditableTableNormal,
    saveButtonProps: saveButtonPropsEditableTableNormal,
    cancelButtonProps: cancelButtonPropsEditableTableNormal,
    editButtonProps: editButtonPropsEditableTableNormal, 
    tableProps: editableTablePropsNormal,
    filters: editableTableFiltersNormal 
} = useEditableTable<PoItemNormal>({
    resource: "app_purchase_orders_positions_normal",
    filters: {
        permanent: [
            { field: "order_id", operator: "eq", value: formProps.initialValues?.id?.toString() || "" }
        ]
    },
    meta: {
        select: "*, app_products(bb_sku)",
    },
    queryOptions: {
        enabled: !!formProps.initialValues?.fk_bb_supplier,
    },
});

const {
    formProps: formPropsEditableTableSpecial,
    isEditing: isEditingEditableTableSpecial,
    setId: setIdEditableTableSpecial,
    saveButtonProps: saveButtonPropsEditableTableSpecial,
    cancelButtonProps: cancelButtonPropsEditableTableSpecial,
    editButtonProps: editButtonPropsEditableTableSpecial, 
    tableProps: editableTablePropsSpecial,
    filters: editableTableFiltersSpecial 
} = useEditableTable<PoItemSpecial>({
    resource: "app_purchase_orders_positions_special",
    filters: {
        permanent: [
            { field: "order_id", operator: "eq", value: formProps.initialValues?.id?.toString() || "" }
        ]
    },
});

const supplierName = useOne<Supplier>({
    resource: "app_suppliers",
    id: formProps.initialValues?.id,
    queryOptions: {
        enabled: !!formProps.initialValues?.id,
    },
});

// Produktdetails für normale Artikel abrufen
const productIds = Array.from(
  new Set(
    (editableTablePropsNormal?.dataSource ?? [])
      .map((r) => r.billbee_product_id)
      .filter((v): v is number => v !== null && v !== undefined),
  ),
);


const { data: productsRes, isLoading: productsLoading } = useMany<Product>({
  resource: "app_products",
  ids: productIds,
  meta: {
    idColumnName: "id",                 // <<< wichtig
    select: "id,supplier_sku,purchase_details",
  },
  queryOptions: { enabled: productIds.length > 0 },
});

const productsById = useMemo(() => {
  const m = new Map<number | string, Product>();
  productsRes?.data?.forEach((p: any) => m.set(p.billbee_product_id, p));
  return m;
}, [productsRes?.data]);

const statusOptions = Object.entries(statusMap ?? {}).map(([value, cfg]) => ({
  value,
  label: (
    <>
      <span style={{ marginRight: 6 }}>{cfg.icon}</span>
      {cfg.label}
    </>
  ),
}));

const selectProducts = useSelect<Product>({
    resource: "app_products",
    optionLabel: "bb_sku",
    optionValue: "id",
    filters: [
        { field: "fk_bb_supplier",
          operator: "eq",
          value: formProps.initialValues?.fk_bb_supplier?.toString() || "",
        },
    ]
});


return (
    <Edit
        title="Einkauf - Bestellung bearbeiten" 
        headerButtons={<><ListButton hideText={true} /><RefreshButton hideText={true} /></>}
        saveButtonProps={saveButtonProps}
    >
        <Form {...formProps} layout="vertical" id="edit-po-header-form">
            <Row gutter={24}>
            <Col span={8}> 
            <Form.Item
                label="ID"
                name="id"
               hidden
            >
                <Input disabled />
            </Form.Item> 
            <Form.Item 
                label="Bestellnummer" 
                name="order_number"
                rules={[
                    {
                    required: true,
                    message: "Bestellnummer fehlt noch",
                    },
                ]}
            >
                <Input disabled />
            </Form.Item>
            <Form.Item label="Bestelldatum" name="ordered_at">
                <Input disabled />
            </Form.Item>
            <Form.Item label="Hersteller">
                <Input disabled value={supplierName.data?.data?.id} />
            </Form.Item>
            <div style={{ paddingTop: 8 }}>
                <PoStatusTag status={formProps.initialValues?.status || "draft"} />
            </div>
            </Col>
            <Col span={8}>
            <Form.Item label="Rechnungsnummer" name="invoice_number">
                <Input />
            </Form.Item>
            <Form.Item label="Rechnungsdatum" name="invoice_date">
                <Input type="date" />
            </Form.Item>
            <Form.Item label="Versandkosten netto" name="shipping_cost_net">
                <Input type="number" />
            </Form.Item>
            <Form.Item name="separate_invoice_for_shipping_cost">
                <Checkbox checked={true}>Versandkosten separat abrechnen?</Checkbox>
            </Form.Item>
            </Col>
            <Col span={8}>
            <Form.Item label="Notizen" name="notes">
                <Input.TextArea rows={4} />
            </Form.Item>
            </Col>
            </Row>
        </Form>
        <Card variant="outlined">
            <Form title="Bestellpositionen - Normale Artikel" id="form-po-items-normal">
                <h3>Bestellpositionen - Normale Artikel</h3>
                <Table 
                    {...editableTablePropsNormal} 
                    id="editable-table-normal" 
                    rowKey="id"
                    onRow={(record) => ({
                        onClick: (event: any) => {
                        if (event.target.nodeName === "TD") {
                            setIdEditableTableNormal && setIdEditableTableNormal(record.id);
                        }
                        },
                    })}>
                
                    <Table.Column
                        title="Produktname"
                        fixed="left"
                        render={(value, record: any) => {
                            if (isEditingEditableTableNormal(record.id)) {
                                    return (
                                        <Form.Item name="app_products(bb_sku)" initialValue={value} style={{ margin: 0 }}>
                                            <Select
                                                {...selectProducts}
                                                filterOption={(input, option) =>
                                                typeof option?.label === "string"
                                                    ? (option.label as string).toLowerCase().includes(input.toLowerCase())
                                                    : false
                                                }
                                            />
                                        </Form.Item>
                                    );
                                }
                            return record?.app_products?.bb_sku ?? "—";
                    }}
                    />
                    <Table.Column title="Status" dataIndex="po_item_status" 
                        render={(value, record: { id: string; po_item_status: string }) => {
                            if (isEditingEditableTableNormal(record.id)) {
                                    return (
                                        <Form.Item name="po_item_status" initialValue={value} style={{ margin: 0 }}>
                                            <Select
                                                options={statusOptions}
                                                optionLabelProp="label"
                                                filterOption={(input, option) =>
                                                typeof option?.label === "string"
                                                    ? (option.label as string).toLowerCase().includes(input.toLowerCase())
                                                    : false
                                                }
                                            />
                                        </Form.Item>
                                    );
                                }
                            return <PoItemStatusTag status={record.po_item_status} />;
                        }}
                    />
                    <Table.Column title="DoL geplant" dataIndex="dol_planned_at" 
                        render={(value, record) => {
                                if (isEditingEditableTableNormal(record.id)) {
                                    return (
                                        <Form.Item name="dol_planned_at" initialValue={value} style={{ margin: 0 }}>
                                            <Input type="date" />
                                        </Form.Item>
                                    );
                                }
                                return <DateField value={value} />;
                        }}
                    />
                   <Table.Column
                        title="Externe SKU"
                        dataIndex="billbee_product_id"
                        render={(_, record: { billbee_product_id: number | string }) => {
                            if (productsLoading) return "Lädt…";
                            return productsById.get(record.billbee_product_id)?.supplier_sku ?? "—";
                        }}
                    />

                    <Table.Column
                        title="Details"
                        dataIndex="billbee_product_id"
                        render={(_, record: { billbee_product_id: number | string }) => {
                            if (productsLoading) return "Lädt…";
                            return productsById.get(record.billbee_product_id)?.purchase_details ?? "—";
                        }}
                    />

                    <Table.Column
                        title="Menge" dataIndex="qty_ordered"
                        render={(value, record) => {
                            if (isEditingEditableTableNormal(record.id)) {
                                return (
                                   <Form.Item name="qty_ordered" initialValue={value} style={{ margin: 0 }}>
                                        <Input type="number" />
                                    </Form.Item>
                                );
                            }
                            return <NumberField value={value} />;
                        }}
                    />

                    <Table.Column title="Einzel Netto" dataIndex="unit_price_net"
                    render={(value, record) => {
                        if (isEditingEditableTableNormal(record.id)) {
                                return (
                                   <Form.Item name="unit_price_net" initialValue={value} style={{ margin: 0 }}>
                                        <Input type="number" step={0.01} />
                                    </Form.Item>
                                );
                            }
                        return Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(record.unit_price_net);
                    }} />
                    <Table.Column title="Gesamt Netto" 
                    render={(_, record) => {
                        return Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(record.unit_price_net * record.qty_ordered);
                    }}
                    />
                    <Table.Column title="Versandkosten (anteilig)" 
                    render={(_, record) => {
                        return Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(record.shipping_costs_proportional);
                    }}
                    />
                    <Table.Column title="Anschaffungskosten gesamt" 
                    render={(_, record) => {
                        return Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(record.unit_price_net * record.qty_ordered + record.shipping_costs_proportional);
                    }}
                    />
                    <Table.Column title="Anmerkungen" dataIndex="internal_notes" fixed="right" />
                    <Table.Column
                        title="Aktionen"
                        dataIndex="actions"
                        fixed="right"
                        render={(_, record) => {
                        if (isEditingEditableTableNormal(record.id)) {
                            return (
                            <Space>
                                <SaveButton {...saveButtonPropsEditableTableNormal} hideText size="small" />
                                <Button {...cancelButtonPropsEditableTableNormal} size="small">
                                    <CloseOutlined />
                                </Button>
                            </Space>
                            );
                        }
                        return (
                            <EditButton
                            {...editButtonPropsEditableTableNormal(record.id)}
                            hideText
                            size="small"
                            />
                        );
                        }}
                    />
                </Table>
            </Form>
            <Form id="form-po-items-special">
                <h3>Sonderbestellungen</h3>
                <Table {...editableTablePropsSpecial} id="editable-table-special" rowKey="id">
                        <Table.Column
                            title="Produktname" dataIndex="billbee_product_id"
                        />
                    <Table.Column
                        title="Aktionen"
                        dataIndex="actions"
                        render={(_, record) => {
                        if (isEditingEditableTableSpecial(record.id)) {
                            return (
                            <Space>
                                <SaveButton {...saveButtonPropsEditableTableSpecial} hideText size="small" />
                                <Button {...cancelButtonPropsEditableTableSpecial} size="small">
                                Cancel
                                </Button>
                            </Space>
                            );
                        }
                        return (
                            <EditButton
                            {...editButtonPropsEditableTableSpecial(record.id)}
                            hideText
                            size="small"
                            />
                        );
                        }}
                    />
                </Table>
            </Form>
        </Card>

    </Edit>
);

}