 //src/components/einkauf/bestellungen/positionen/normal.tsx
 "use client";
 
 import {
   useSelect,
   useEditableTable,
   DateField,
   EditButton,
   DeleteButton,
   SaveButton,
   NumberField,
 } from "@refinedev/antd";
 import { Button, Card, DatePicker, Form, Input, Select, Space, Table } from "antd";
 import { CloseOutlined } from "@ant-design/icons";
 
 import { Tables } from "@/types/supabase";
 import { PoItemStatusTag } from "@components/common/tags/states/po_item";
 import SelectStatePoItem from "@components/common/selects/state_po-item";
 import ButtonEinkaufBestellpositionenNormalHinzufuegen from "@components/einkauf/bestellungen/positionen/modals/normal";
 
 import { formatCurrencyEUR, parseNumber } from "@/utils/formats";
 
 type PoItemNormal = Tables<"app_purchase_orders_positions_normal">;
 type Produkte = Tables<"app_products">;

 export default function EinkaufBestellpositionenNormalBearbeiten({orderId, supplier, status}: {orderId: string, supplier: string, status: string}) {
  const {
    formProps: formPropsEditableTableNormal,
    isEditing: isEditingEditableTableNormal,
    setId: setIdEditableTableNormal,
    saveButtonProps: saveButtonPropsEditableTableNormal,
    cancelButtonProps: cancelButtonPropsEditableTableNormal,
    editButtonProps: editButtonPropsEditableTableNormal,
    tableProps: editableTablePropsNormal,
  } = useEditableTable<PoItemNormal>({
    resource: "app_purchase_orders_positions_normal",
    filters: {
      permanent: orderId ? [{ field: "order_id", operator: "eq", value: orderId }] : [],
    },
    meta: {
      select: "*, app_products(bb_sku, supplier_sku, purchase_details)",
    },
  });

      const { selectProps } = useSelect<Produkte>({
          resource: "app_products",
          optionLabel: "bb_sku",
          optionValue: "id",
          sorters: [{ field: "bb_sku", order: "asc" }],
          filters: [{
              field: "fk_bb_supplier",
              operator: "eq",
              value: supplier,
          }],

  });


  return (
    <Card style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3>Positionen - Normal</h3>
        <ButtonEinkaufBestellpositionenNormalHinzufuegen orderId={orderId as string} supplier={supplier as string} status={status as string} />
    </div>
<Form
          title="Bestellpositionen - Normale Artikel"
          id="form-po-items-normal"
          {...formPropsEditableTableNormal}
        >
          <Table
            id="editable-table-normal"
            scroll={{ x: 1400 }}
            tableLayout="fixed"
            {...editableTablePropsNormal}
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
              width={180}
              render={(value, record: any) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Form.Item
                      name="billbee_product_id"
                      style={{ margin: 0 }}
                    >
                          <Select {...selectProps} />

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
              render={(_, record: PoItemNormal) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Form.Item
                      name="po_item_status"
                      style={{ margin: 0 }}
                    >
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
              render={(value, record: PoItemNormal) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Form.Item
                      name="dol_planned_at"
                      style={{ margin: 0 }}
                    >
                      <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
                    </Form.Item>
                  );
                }
                return <DateField value={value} />;
              }}
            />

            {/* Externe SKU */}
            <Table.Column
              title="Externe SKU"
              dataIndex={["app_products", "supplier_sku"]}
              width={150}
            />

            {/* Details */}
            <Table.Column
              title="Details"
              dataIndex={["app_products", "purchase_details"]}
              width={600}
            />

            {/* Menge */}
            <Table.Column
              title="Menge"
              dataIndex="qty_ordered"
              width={120}
              render={(value, record: PoItemNormal) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Form.Item
                      name="qty_ordered"
                      normalize={parseNumber}
                      style={{ margin: 0 }}
                    >
                      <Input type="number" />
                    </Form.Item>
                  );
                }
                return <NumberField value={value} />;
              }}
            />

            {/* Einzel Netto */}
            <Table.Column
              title="Einzel Netto"
              dataIndex="unit_price_net"
              width={150}
              render={(value: number, record: PoItemNormal) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Form.Item
                      name="unit_price_net"
                      normalize={parseNumber}
                      style={{ margin: 0 }}
                    >
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
              width={160}
              render={(_, record: PoItemNormal) => {
                const total = (record.unit_price_net ?? 0) * (record.qty_ordered ?? 0);
                return formatCurrencyEUR(total);
              }}
            />

            {/* Versandkosten anteilig */}
            <Table.Column
              title="Versandkosten (anteilig)"
              width={180}
              render={(_, record: PoItemNormal) => {
                return formatCurrencyEUR(record.shipping_costs_proportional ?? 0);
              }}
            />

            {/* Anschaffungskosten gesamt */}
            <Table.Column
              title="Anschaffungskosten gesamt"
              width={200}
              render={(_, record: PoItemNormal) => {
                const total =
                  (record.unit_price_net ?? 0) * (record.qty_ordered ?? 0) +
                  (record.shipping_costs_proportional ?? 0);
                return formatCurrencyEUR(total);
              }}
            />

            {/* Notizen */}
            <Table.Column
              title="Anmerkungen"
              dataIndex="internal_notes"
              fixed="right"
              width={400}
              render={(value: string | null | undefined, record: PoItemNormal) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Form.Item
                      name="internal_notes"
                      style={{ margin: 0 }}
                    >
                      <Input.TextArea rows={1} />
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
              render={(_, record: PoItemNormal) => {
                if (isEditingEditableTableNormal(record.id)) {
                  return (
                    <Space>
                      <SaveButton
                        {...saveButtonPropsEditableTableNormal}
                        hideText
                        size="small"
                      />
                      <Button {...cancelButtonPropsEditableTableNormal} size="small" >
                        <CloseOutlined />
                      </Button>
                    </Space>
                  );
                }
                return (
                    <Space>
                    <EditButton
                        {...editButtonPropsEditableTableNormal(record.id)}
                        hideText
                        size="small"
                    />
                    <DeleteButton
                        hideText
                        size="small"
                        resource="app_purchase_orders_positions_normal"
                        recordItemId={record.id}
                        mutationMode="pessimistic"          // sofort löschen (kein Undo)
                        confirmTitle="Position wirklich löschen?"
                        confirmOkText="Löschen"
                        confirmCancelText="Abbrechen"
                        onError={(err) => console.error("Delete error:", err)}
                        disabled={!(record.po_item_status === "draft" || record.po_item_status === "ordered")}
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