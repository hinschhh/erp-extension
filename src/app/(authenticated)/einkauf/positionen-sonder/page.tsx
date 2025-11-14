"use client";

import { useEditableTable, useSelect, List, DeleteButton, EditButton, SaveButton } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Form, Select, Space, Table } from "antd";
import { PoItemStatusTag } from "@components/common/tags/states/po_item";
import { CloseOutlined } from "@ant-design/icons";

type NormalOrderPosition = Tables<"app_purchase_orders_positions_normal">;
type OrderBase = Tables<"app_orders_with_customers_view">;
type Order = Omit<OrderBase, "id"> & { id: number };


export default function EinkaufsPositionenSonderÜbersicht<NormalOrderPosition>() {
    const {formProps, tableProps, saveButtonProps, cancelButtonProps, editButtonProps, setId, isEditing } = useEditableTable({
        resource: "app_purchase_orders_positions_normal",
        meta: { select: "*, app_products(bb_sku, bb_category1, bb_category2, bb_category3, production_required)" },
        pagination: { pageSize: 50},
        filters: {permanent: [{field: "po_item_status", operator: "ne", value: "delivered"}], mode: "server" },
        sorters: { mode: "server" },
    });

    const {selectProps} = useSelect<Order>({
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
    <List>
        <Form {...formProps}>
            <Table {...tableProps}
            scroll={{ x: 1400 }}
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
            })}>
                <Table.Column dataIndex="id" title="ID" hidden/>
                <Table.Column dataIndex={["app_products", "bb_sku"]} title="SB" width={200} />
                <Table.Column dataIndex={["app_products", "production_required"]} title="Produktion erforderlich" width={200} />
                <Table.Column dataIndex="po_item_status" title="Status" width={200}/>
                <Table.Column dataIndex="internal_notes" title="Anmerkungen" width={200} sorter/>
                <Table.Column dataIndex="fk_app_orders_id" title="Bestellreferenz" width={200} sorter 
                render={(_, record) => {
                    if (isEditing(record.id)) {
                        return (
                            <Form.Item
                                name="fk_app_orders_id"
                                style={{ margin: 0 }}
                            >
                                <Select {...selectProps} />
                            </Form.Item>
                        );
                    }
                    return <div>{record.fk_app_orders_id}</div>;
                }}
                />
                            <Table.Column
              title="Aktionen"
              dataIndex="actions"
              fixed="right"
              width={90}
              render={(_, record) => {
                if (isEditing(record.id as string)) {
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
                        {...editButtonProps(record.id as string)}
                        hideText
                        size="small"
                    />
                    <DeleteButton
                        hideText
                        size="small"
                        resource="app_purchase_orders_positions_normal"
                        recordItemId={record.id as string}
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

    </List>
)}