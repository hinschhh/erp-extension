// src/components/einkauf/bestellungen/positionen/normal.tsx
"use client";

import {
  useSelect,
  useEditableTable,
  DateField,
  EditButton,
  DeleteButton,
  SaveButton,
  NumberField,
  TextField,
} from "@refinedev/antd";
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
  Cascader,
} from "antd";
import { CloseOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Tables } from "@/types/supabase";
import { PoItemStatusTag } from "@components/common/tags/states/po_item";
import SelectStatePoItem from "@components/common/selects/state_po-item";
import ButtonEinkaufBestellpositionenNormalHinzufuegen from "@components/einkauf/bestellungen/positionen/modals/normal";

import { formatCurrencyEUR, parseNumber } from "@/utils/formats";
import { useOrderItemCascader } from "@components/common/selects/cascader_order_items";

type PoItemNormal = Omit<Tables<"app_purchase_orders_positions_normal_view">, "id"> & {
  id: string;
};
type Produkte = Tables<"app_products">;

export default function EinkaufBestellpositionenNormalBearbeiten({
  orderId,
  supplier,
  status,
}: {
  orderId: string;
  supplier: string;
  status: string;
}) {
  const {
    formProps: formPropsEditableTableNormal,
    isEditing,
    setId: setIdEditableTableNormal,
    saveButtonProps: saveButtonPropsEditableTableNormal,
    cancelButtonProps: cancelButtonPropsEditableTableNormal,
    editButtonProps: editButtonPropsEditableTableNormal,
    tableProps: editableTablePropsNormal,
  } = useEditableTable<PoItemNormal>({
    resource: "app_purchase_orders_positions_normal_view",
    filters: {
      permanent: orderId ? [{ field: "order_id", operator: "eq", value: orderId }] : [],
    },
    pagination: { pageSize: 50 },
    meta: {
      select: "*, app_products(bb_sku, supplier_sku, purchase_details)",
    },
  });
      const handleFinish: typeof formPropsEditableTableNormal.onFinish = (values: any) => {
  console.log("RAW values from Form:", values);

  const path = values.order_item_cascader;

  let fk_app_orders_id = null;
  let fk_app_order_items_id = null;

  if (Array.isArray(path) && path.length === 2) {
    const [orderIdFromCascader, orderItemIdFromCascader] = path;
    fk_app_orders_id = orderIdFromCascader;
    fk_app_order_items_id = orderItemIdFromCascader;
  }

  // UI-Feld explizit *herausziehen* und wegwerfen
  const { order_item_cascader, ...rest } = values ?? {};

  const payload = {
    ...rest,
    fk_app_orders_id,
    fk_app_order_items_id,
  };

  console.log("CLEAN payload to Refine:", payload);

  return formPropsEditableTableNormal.onFinish?.(payload);
};

  const { selectProps: selectPropsProducts } = useSelect<Produkte>({
    resource: "app_products",
    optionLabel: "bb_sku",
    optionValue: "id",
    sorters: [{ field: "bb_sku", order: "asc" }],
    filters: [
      {
        field: "fk_bb_supplier",
        operator: "eq",
        value: supplier,
      },
    ],
  });

  const { options: orderItemOptions, loading: orderItemLoading } = useOrderItemCascader();

  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3>Positionen - Normal</h3>
        <ButtonEinkaufBestellpositionenNormalHinzufuegen
          orderId={orderId as string}
          supplier={supplier as string}
          status={status as string}
        />
      </div>
      <Form
        title="Bestellpositionen - Normale Artikel"
        resource="app_purchase_orders_positions_normal"
        id="form-po-items-normal"
        {...formPropsEditableTableNormal}
        onFinish={handleFinish}
      >
        <Table
          id="editable-table-normal"
          {...editableTablePropsNormal}
          scroll={{ x: "100%" }}
          tableLayout="fixed"
          rowKey="id"
          rowSelection={{ type: "checkbox" }}
          onRow={(record) => ({
            onClick: (event: any) => {
              if (event.target.nodeName === "TD") {
                setIdEditableTableNormal && setIdEditableTableNormal(record.id);
              }
              console.log("Row clicked:", supplier);
            },
          })}
        >
          {/* Produkt */}
          <Table.Column<PoItemNormal>
            title="SKU"
            dataIndex={["app_products", "bb_sku"]}
            fixed="left"
            width={100}
            ellipsis
            render={(value, record: any) => {
              if (isEditing(record.id)) {
                return (
                  <Form.Item name="billbee_product_id" style={{ margin: 0 }}>
                    <Select {...selectPropsProducts} />
                  </Form.Item>
                );
              }
              return value ?? "—";
            }}
          />

          {/* Status */}
          <Table.Column
            title="Status"
            width={150}
            ellipsis
            render={(_, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <Form.Item name="po_item_status" style={{ margin: 0 }}>
                    <SelectStatePoItem />
                  </Form.Item>
                );
              }
              return <PoItemStatusTag status={record.po_item_status as string} />;
            }}
          />

          {/* DoL geplant */}
          <Table.Column
            title="DoL geplant"
            dataIndex="dol_planned_at"
            width={150}
            ellipsis
            render={(value, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <Form.Item
                    name="dol_planned_at"
                    getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
                    style={{ margin: 0 }}
                  >
                    <DatePicker
                      type="date"
                      placeholder="Datum wählen..."
                      format="DD.MM.YYYY"
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                );
              }
              return <DateField value={dayjs(value)} />;
            }}
          />

          {/* Externe SKU */}
          <Table.Column
            title="Externe SKU"
            dataIndex={["app_products", "supplier_sku"]}
            width={150}
            ellipsis
          />

          {/* Details */}
          <Table.Column
            title="Details"
            dataIndex={["app_products", "purchase_details"]}
            width={250}
            ellipsis
            render={(value: string) => {
              return (
                <Typography.Paragraph
                  style={{ whiteSpace: "normal" }}
                  ellipsis={{ rows: 4, tooltip: value }}
                >
                  {value ?? "—"}
                </Typography.Paragraph>
              );
            }}
          />

          {/* Menge */}
          <Table.Column
            title="Menge"
            dataIndex="qty_ordered"
            width={100}
            ellipsis
            render={(value, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <Form.Item name="qty_ordered" normalize={parseNumber} style={{ margin: 0 }}>
                    <Input type="number" />
                  </Form.Item>
                );
              }
              return (
                <>
                  <NumberField value={value} />
                  <div style={{ fontSize: "0.75rem", color: "#888" }}>
                    geliefert: {record.qty_received ?? 0}
                  </div>
                </>
              );
            }}
          />

          {/* Einzel Netto */}
          <Table.Column
            title="Einzel Netto"
            dataIndex="unit_price_net"
            width={100}
            ellipsis
            render={(value: number, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <Form.Item name="unit_price_net" style={{ margin: 0 }}>
                    <Input type="number" step={0.01} />
                  </Form.Item>
                );
              }
              return formatCurrencyEUR(value);
            }}
          />

          {/* Gesamt Netto */}
          <Table.Column
            title="Gesamt Netto"
            width={100}
            ellipsis
            render={(_, record: PoItemNormal) => {
              const total = (record.unit_price_net ?? 0) * (record.qty_ordered ?? 0);
              return formatCurrencyEUR(total);
            }}
          />

          {/* Versandkosten anteilig */}
          <Table.Column
            title="Versandkosten (anteilig)"
            width={100}
            ellipsis
            render={(_, record: PoItemNormal) => {
              return formatCurrencyEUR(record.shipping_costs_proportional ?? 0);
            }}
          />

          {/* Anschaffungskosten gesamt */}
          <Table.Column
            title="Anschaffungskosten gesamt"
            width={100}
            ellipsis
            render={(_, record: PoItemNormal) => {
              const total =
                (record.unit_price_net ?? 0) * (record.qty_ordered ?? 0) +
                (record.shipping_costs_proportional ?? 0);
              return formatCurrencyEUR(total);
            }}
          />

          {/* Bestellreferenz mit Cascader */}
          <Table.Column
            title="Bestellreferenz"
            dataIndex="order_item_cascader"
            width={200}
            ellipsis
            render={(value, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <>
                    <Form.Item
                      name="order_item_cascader"
                      style={{ margin: 0 }}
                      getValueProps={() => {
                        if (!record.fk_app_orders_id || !record.fk_app_order_items_id) {
                          return {};
                        }
                        return {
                          value: [record.fk_app_orders_id, record.fk_app_order_items_id],
                        };
                      }}
                    >
                      <Cascader
                        options={orderItemOptions}
                        loading={orderItemLoading}
                        showSearch
                        allowClear
                        placeholder="Bestellung → Position"
                      />
                    </Form.Item>
                    {/* Hidden FKs, damit sie im Form-Model existieren */}
                    <Form.Item name="fk_app_orders_id" hidden />
                    <Form.Item name="fk_app_order_items_id" hidden />
                  </>
                );
              }

              if (!record.bb_order_number && !record.customer_name) {
                return "—";
              }

              return (
                <TextField
                  value={`${record.bb_order_number ?? ""} - (${
                    record.customer_name ?? ""
                  })`}
                />
              );
            }}
          />

          {/* Optional: zusätzliche "hidden" Columns für FKs (wie in special.tsx) */}
          <Table.Column
            dataIndex="fk_app_order_items_id"
            hidden
            render={(value, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return <Form.Item name="fk_app_order_items_id" />;
              }
              return null;
            }}
          />
          <Table.Column
            dataIndex="fk_app_orders_id"
            hidden
            render={(value, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return <Form.Item name="fk_app_orders_id" />;
              }
              return null;
            }}
          />

          {/* Notizen */}
          <Table.Column
            title="Anmerkungen"
            dataIndex="internal_notes"
            fixed="right"
            width={200}
            ellipsis
            render={(value: string | null | undefined, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <Form.Item name="internal_notes" style={{ margin: 0 }}>
                    <Input.TextArea rows={5} />
                  </Form.Item>
                );
              }
              return value ?? "—";
            }}
          />

          {/* Aktionen */}
          <Table.Column
            title="Aktionen"
            dataIndex="actions"
            fixed="right"
            width={90}
            ellipsis
            render={(_, record: PoItemNormal) => {
              if (isEditing(record.id as string)) {
                return (
                  <Space>
                    <SaveButton
                      {...saveButtonPropsEditableTableNormal}
                      hideText
                      size="small"
                    />
                    <Button {...cancelButtonPropsEditableTableNormal} size="small">
                      <CloseOutlined />
                    </Button>
                  </Space>
                );
              }
              return (
                <Space>
                  <EditButton
                    {...editButtonPropsEditableTableNormal(record.id as string)}
                    hideText
                    size="small"
                  />
                  <DeleteButton
                    hideText
                    size="small"
                    resource="app_purchase_orders_positions_normal"
                    recordItemId={record.id as string}
                    mutationMode="pessimistic"
                    confirmTitle="Position wirklich löschen?"
                    confirmOkText="Löschen"
                    confirmCancelText="Abbrechen"
                    onError={(err) => console.error("Delete error:", err)}
                    disabled={
                      !(
                        record.po_item_status === "draft" ||
                        record.po_item_status === "ordered"
                      )
                    }
                  />
                </Space>
              );
            }}
          />
        </Table>
      </Form>
    </Card>
  );
}
