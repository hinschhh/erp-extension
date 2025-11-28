"use client";

import { useOrderItemCascader } from "@components/common/selects/cascader_order_items";
import { useEditableTable } from "@refinedev/antd";
import { Cascader, Form, Space, Table, Typography, Button } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import { SaveButton, EditButton, DeleteButton } from "@refinedev/antd";// Adjust the path to the correct location of your type definition

export default function Page() {

    const { options, loading } = useOrderItemCascader();

    const { tableProps, formProps, isEditing, saveButtonProps, editButtonProps, cancelButtonProps } = useEditableTable({
        resource: "app_purchase_orders_positions_special_view",
        pagination: { pageSize: 50 },
        sorters: { initial: [{ field: "created_at", order: "desc" }] },
        meta: {
          select: "*, base_modell:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(bb_sku, supplier_sku, purchase_details), special_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(bb_sku)",
        },
      });

    return <Table {...tableProps}>
            <Form {...formProps}>
                <Table.Column dataIndex="supplier_sku" title="Supplier SKU"/>
                <Table.Column dataIndex="details_override" title="Bestelldetails"/>
                <Table.Column dataIndex="base_model" title="Grundmodell"/>
                <Table.Column dataIndex="order_item_cascader" title="Referenz"
                   render={(value, record) => {
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
                          render={(value, record) => {
                                if (isEditing(record.id)) {
                                  return (
                                    <Form.Item 
                                        name="fk_app_order_items_id" 
                                    />
                                    );
                                }}}
                        />
                        <Table.Column dataIndex="fk_app_orders_id" hidden
                          render={(value, record) => {
                                if (isEditing(record.id)) {
                                  return (
                                    <Form.Item 
                                        name="fk_app_orders_id" 
                                    />
                                    );
                                }}}
                        />
            <Table.Column title="Aktionen" dataIndex="" width={100} ellipsis={true} fixed="right"
                render={(_, record) => {
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
                        confirmTitle="Position wirklich löschen?"
                        confirmOkText="Löschen"
                        confirmCancelText="Abbrechen"
                        disabled={!(record.po_item_status === "draft" || record.po_item_status === "ordered")}
                    />
                  </Space>
                );
              }}/>
            
            
            </Form>
            </Table>;
} 