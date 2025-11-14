// src/components/einkauf/bestellungen/positionen/special.tsx
"use client";
import { useEditableTable, useSelect, EditButton, SaveButton, TextField, NumberField, DateField, useModal, DeleteButton} from "@refinedev/antd";
import { Form, Table, Button, Space, Input, DatePicker, Tooltip, Modal, Card, Select } from "antd";
import { CloseOutlined, FileTextOutlined } from "@ant-design/icons";
import { Tables } from "@/types/supabase";
import { PoItemStatusTag } from "@components/common/tags/states/po_item";
import SelectStatePoItem from "@components/common/selects/state_po-item";
import dayjs from "dayjs"; 
import { formatCurrencyEUR, parseNumber } from "@/utils/formats";
import { PoItemStatus } from "@/types/status";
import ButtonEinkaufBestellpositionenSpezialHinzufuegen from "./modals/special";
import SketchConfirmButton from "@components/common/buttons/confirmSketchButton";

 type PoItemSpecial = Omit<Tables<"app_purchase_orders_positions_special_view">, "id"> & { id: string };
 type Produkte = Tables<"app_products">;
 type OrderBase = Tables<"app_orders_with_customers_view">;
 type Order = Omit<OrderBase, "id"> & { id: number };

export default function EinkaufBestellpositionenSpecialBearbeiten({orderId, supplier, status}: {orderId: string, supplier: string, status: string}) {
     const {
        formProps,
        isEditing,
        setId,
        saveButtonProps,
        cancelButtonProps,
        editButtonProps,
        tableProps,
      } = useEditableTable<PoItemSpecial>({
        resource: "app_purchase_orders_positions_special_view",
        filters: {
          permanent: orderId ? [{ field: "order_id", operator: "eq", value: orderId }] : [],
        },
        pagination: { pageSize: 50 },
        meta: {
          select: "*, base_modell:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(bb_sku, supplier_sku, purchase_details), special_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(bb_sku)",
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

      const {selectProps: selectPropsOrders } = useSelect<Order>({
                resource: "app_orders_with_customers_view",
                optionLabel: (item) => `${item["bb_import_ab-nummer"]} - (${item.customer_name})`,
                optionValue: "id",
                onSearch: (value: string) => [
        
                    {
                        field: "search_blob",
                        operator: "contains",
                        value,
                    },
                ],
            })

  return (
    <Card style={{ marginTop: 24 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3>Positionen - Spezial</h3>
        <ButtonEinkaufBestellpositionenSpezialHinzufuegen orderId={orderId as string} supplier={supplier as string} status={status as string}/>
    </div>
    <Form 
        {...formProps}
        title="Bestellpositionen - Sonderbestellungen"
        id="form-po-items-special"
    >

        <Table
            id="table-po-items-special"
            scroll={{ x: 5000 }}
            tableLayout="fixed"
            {...tableProps} 
            rowKey="id"
            rowSelection={{ type: "checkbox" }}
            onRow={(record) => ({
              onClick: (event: any) => {
                if (event.target.nodeName === "TD") {
                  setId && setId(record.id);
                }
              },
            })}
            
        >
            <Table.Column title="SKU" dataIndex={["base_modell", "bb_sku"]} fixed="left" width={180}/>
            <Table.Column title="Status" dataIndex="po_item_status" width={150}
                render={(_, record: PoItemSpecial) => {
                                if (isEditing(record.id)) {
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
            <Table.Column title="DoL geplant" dataIndex="dol_expected_at" 
                          render={(value, record: PoItemSpecial) => {
                            if (isEditing(record.id)) {
                              return (
                                <Form.Item
                                  name="dol_planned_at"
                                  getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
                                  style={{ margin: 0 }}
                                >
                                  <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
                                </Form.Item>
                              );
                            }
                            return <DateField value={dayjs(value)} />;
                          }}/>
            <Table.Column title="Ext. SKU" dataIndex="supplier_sku" 
                render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <Form.Item 
                            name="supplier_sku" 
                            style={{ margin: 0 }}
                        >
                            <Input />
                        </Form.Item>
                        );
                    }
                    return <TextField value={value} />;
                }}
            />
            <Table.Column title="Details" dataIndex="details_override" width={600}
                render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <Form.Item 
                            name="details_override" 
                            style={{ margin: 0 }}
                        >
                            <Input.TextArea rows={1}/>
                        </Form.Item>
                        );
                    }
                    return <TextField value={value} />;
                }}
            />
            <Table.Column title="Skizze benötigt?" dataIndex="sketch_needed" hidden/>
            <Table.Column title="Skizze" dataIndex="sketch_confirmed_at" 
             render={(_, record) => {
                return(
                    <SketchConfirmButton
                        itemId={record.id as string}
                    />
                )    

             }} 
            />
            <Table.Column title="Menge" dataIndex="qty_ordered"
                width={120}
                render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
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
                    return <>
                        <NumberField value={value} />
                        <div style={{ fontSize: "0.75rem", color: "#888" }}>
                            geliefert: {record.qty_received ?? 0}
                        </div>
                    </>;
                }}
            />
            <Table.Column title="Preis" dataIndex="unit_price_net"              width={150}
                render={(value: number, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                        return (
                            <Form.Item
                                name="unit_price_net"
                                style={{ margin: 0 }}
                            >
                                <Input type="number" step={0.01} />
                            </Form.Item>
                            );
                        }
                    return formatCurrencyEUR(value);
                }}
            
            />
            <Table.Column title="Gesamt" dataIndex="total_price_net" 
            width={160}
            render={(_, record: PoItemSpecial) => {
                const total = (record.unit_price_net ?? 0) * (record.qty_ordered ?? 0);
                return formatCurrencyEUR(total);
            }}/>
            <Table.Column title="Versand anteilig" dataIndex="shipping_costs_proportional" 
            width={180}
                render={(_, record: PoItemSpecial) => {
                    return formatCurrencyEUR(record.shipping_costs_proportional ?? 0);
                }}
            />
            <Table.Column title="AB-Ref" dataIndex="fk_app_orders_id"
                width={200}
                render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <Form.Item 
                            name="fk_app_orders_id" 
                            style={{ margin: 0 }}
                        >
                            <Select  {...selectPropsOrders}/>
                        </Form.Item>
                        );
                    }
                    if (!record.bb_order_number && !record.customer_name) {
                      return "—";
                    }
                    return <TextField value={`${record.bb_order_number ?? ""} - (${record.customer_name ?? ""})`} />;
                }}
            />

            <Table.Column title="Dokumente" dataIndex="external_file_url"
                width={200}
                render={(value, record: PoItemSpecial) => {
                if (isEditing(record.id)) {
                    return (
                        <Form.Item
                            name="external_file_url"
                            style={{ margin: 0 }}
                        >
                            <Input />
                        </Form.Item>
                    );
                }
                if (value) {
                    return (
                        <Tooltip title="Externe Dokumente öffnen">
                            <Button size="small" type="default" href={value as string} target="_blank" icon={<FileTextOutlined />}/>
                        </Tooltip>
                    )
                }
                return <TextField value="keine Dokumente hinterlegt"/>;
            }}
            />
            <Table.Column title="Anmerkungen" dataIndex="internal_notes"
            fixed="right"
                          width={400}
                          render={(value: string | null | undefined, record: PoItemSpecial) => {
                            if (isEditing(record.id)) {
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
            <Table.Column title="Aktionen" dataIndex="" fixed="right"
                render={(_, record: PoItemSpecial) => {
                if (isEditing(record.id)) {
                  return (
                    <Space>
                      <SaveButton
                        {...saveButtonProps}
                        hideText
                        size="small"
                      />
                      <Button {...cancelButtonProps} size="small" >
                        <CloseOutlined />
                      </Button>
                    </Space>
                  );
                }
                return (
                  <Space>
                    <EditButton
                        {...editButtonProps(record.id)}
                        hideText
                        size="small"
                    />
                    <DeleteButton
                        hideText
                        size="small"
                        resource="app_purchase_orders_positions_special"
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
              }}/>
        </Table>
    </Form>
    <Modal>

    </Modal>
    </Card>
  );
}