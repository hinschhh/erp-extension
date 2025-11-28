// src/components/einkauf/bestellungen/positionen/special.tsx
"use client";
import { useEditableTable, useSelect, EditButton, SaveButton, TextField, NumberField, DateField, useModal, DeleteButton} from "@refinedev/antd";
import { Form, Table, Button, Space, Input, DatePicker, Tooltip, Modal, Card, Select, Cascader, Typography } from "antd";
import { CloseOutlined, FileTextOutlined } from "@ant-design/icons";
import { Tables } from "@/types/supabase";
import { PoItemStatusTag } from "@components/common/tags/states/po_item";
import SelectStatePoItem from "@components/common/selects/state_po-item";
import dayjs from "dayjs"; 
import { formatCurrencyEUR, parseNumber } from "@/utils/formats";
import { PoItemStatus } from "@/types/status";
import ButtonEinkaufBestellpositionenSpezialHinzufuegen from "./modals/special";
import SketchConfirmButton from "@components/common/buttons/confirmSketchButton";
import { useOrderItemCascader } from "@components/common/selects/cascader_order_items";
import { text } from "stream/consumers";

 type PoItemSpecial = Omit<Tables<"app_purchase_orders_positions_special_view">, "id"> & { id: string };
 type Produkte = Tables<"app_products">;
 type OrderBase = Tables<"app_orders_with_customers_view">;
 type Order = Omit<OrderBase, "id"> & { id: number };

export default function EinkaufBestellpositionenSpecialBearbeiten({orderId, supplier, status}: {orderId: string, supplier: string, status: string}) {
     const {
        formProps,
        isEditing,
        setId,
        saveButtonProps: saveButtonPropsEditableTableSpecial,
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
      const handleFinish: typeof formProps.onFinish = (values: any) => {
        const path = values.order_item_cascader;

        if (Array.isArray(path) && path.length === 2) {
          const [orderId, orderItemId] = path;

          values.fk_app_orders_id = orderId;
          values.fk_app_order_items_id = orderItemId;
        } else {
          // Wenn nichts gewählt wurde, optional FK auf null setzen
          values.fk_app_orders_id = null;
          values.fk_app_order_items_id = null;
        }

        // Technisches UI-Feld rauswerfen (muss nicht in der DB landen)
        delete values.order_item_cascader;

        return formProps.onFinish?.(values);
      };

    
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

      const { options, loading } = useOrderItemCascader();

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
        onFinish={handleFinish}
    >

        <Table
            id="table-po-items-special"
            {...tableProps}
            scroll={{ x: "100%" }}
            tableLayout="fixed"
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
            <Table.Column title="SKU" dataIndex={["base_modell", "bb_sku"]} fixed="left" width={150} ellipsis={true} />
            <Table.Column title="Status" dataIndex="po_item_status" width={150} ellipsis={false} 
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
            <Table.Column title="DoL geplant" dataIndex="dol_expected_at" width={150} ellipsis={true} 
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
            <Table.Column title="Externe SKU" dataIndex="supplier_sku" width={150} ellipsis={true} 
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
            <Table.Column title="Details" dataIndex="details_override" width={250} ellipsis={true} 
                render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <Form.Item 
                            name="details_override" 
                            style={{ margin: 0 }}
                        >
                            <Input.TextArea rows={4}/>
                        </Form.Item>
                        );
                    }
                    return <Typography.Paragraph style={{ whiteSpace: "normal", }} ellipsis={{ rows: 4, tooltip: value }}>{value}</Typography.Paragraph>;
                }}
            />
            <Table.Column title="Skizze benötigt?" dataIndex="sketch_needed" hidden/>
            <Table.Column title="Skizze" dataIndex="sketch_confirmed_at" width={200} ellipsis={true}
             render={(_, record) => {
                return(
                    <SketchConfirmButton
                        itemId={record.id as string}
                    />
                )    

             }} 
            />
            <Table.Column title="Menge" dataIndex="qty_ordered" ellipsis={true} 
                width={100}
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
            <Table.Column title="Preis" dataIndex="unit_price_net" width={100} ellipsis={true} 
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
            <Table.Column title="Gesamt" dataIndex="total_price_net" ellipsis={true} 
            width={100}
            render={(_, record: PoItemSpecial) => {
                const total = (record.unit_price_net ?? 0) * (record.qty_ordered ?? 0);
                return formatCurrencyEUR(total);
            }}/>
            <Table.Column title="Versand anteilig" dataIndex="shipping_costs_proportional" ellipsis={true} 
            width={100}
                render={(_, record: PoItemSpecial) => {
                    return formatCurrencyEUR(record.shipping_costs_proportional ?? 0);
                }}
            />
            <Table.Column title="Referenz" dataIndex="order_item_cascader"
                width={200}
                render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <>
                        <Form.Item 
                            name="order_item_cascader" 
                            style={{ margin: 0 }}
                             getValueProps={() => {
                                if (
                                  !record.fk_app_orders_id ||
                                  !record.fk_app_order_items_id
                                ) {
                                  return {};
                                }
                                return {
                                  value: [
                                    record.fk_app_orders_id,
                                    record.fk_app_order_items_id,
                                  ],
                                };
                              }}
                        >
                             <Cascader 
                              options={options} 
                              loading={loading}
                              showSearch
                              allowClear
                              placeholder="Bestellung → Position"
                              />
                        </Form.Item>
                        <Form.Item name="fk_app_orders_id" hidden />
                        <Form.Item name="fk_app_order_items_id" hidden />
                        </>
                        );
                    }
                    if (!record.bb_order_number && !record.customer_name) {
                      return "—";
                    }
                    return <Typography.Paragraph style={{ whiteSpace: "normal", }} ellipsis={{ rows: 4, tooltip: `${record.bb_order_number ?? ""} - (${record.customer_name ?? ""})` }}>{`${record.bb_order_number ?? ""} - (${record.customer_name ?? ""})`}</Typography.Paragraph>;
                }}
            />
            <Table.Column dataIndex="fk_app_order_items_id" hidden
              render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <Form.Item 
                            name="fk_app_order_items_id" 
                        />
                        );
                    }}}
            />
            <Table.Column dataIndex="fk_app_orders_id" hidden
              render={(value, record: PoItemSpecial) => {
                    if (isEditing(record.id)) {
                      return (
                        <Form.Item 
                            name="fk_app_orders_id" 
                        />
                        );
                    }}}
            />

            <Table.Column title="Dokumente" dataIndex="external_file_url" ellipsis={true} 
                width={150}
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
            <Table.Column title="Anmerkungen" dataIndex="internal_notes" ellipsis={true} 
            fixed="right"
                          width={200}
                          render={(value: string | null | undefined, record: PoItemSpecial) => {
                            if (isEditing(record.id)) {
                              return (
                                <Form.Item
                                  name="internal_notes"
                                  style={{ margin: 0 }}
                                >
                                  <Input.TextArea rows={5} />
                                </Form.Item>
                              );
                            }
                            return <Typography.Paragraph style={{ whiteSpace: "normal", }} ellipsis={{ rows: 4, tooltip: value }}>{value ?? "—"}</Typography.Paragraph>;
                          }}
            />
            <Table.Column title="Aktionen" dataIndex="" width={100} ellipsis={true} fixed="right"
                render={(_, record: PoItemSpecial) => {
                if (isEditing(record.id)) {
                  return (
                    <Space>
                      <SaveButton
                        {...saveButtonPropsEditableTableSpecial}
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