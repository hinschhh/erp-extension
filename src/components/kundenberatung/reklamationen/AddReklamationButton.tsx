/*"use client";

import { PlusOutlined } from "@ant-design/icons";
import { useSelect, useModalForm } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Form, Input, Modal, Select } from "antd";

type OrderBase = Tables<"app_orders_with_customers_view">;
type Order = Omit<OrderBase, "id"> & { id: number };

type OrderItem = Tables<"app_order_items">;

export default function AddReklamationButton({
    onAddClick,
    id,
}: {
    onAddClick?: (args: { id: number }) => void;
    id: number;
}) {
    const {
        formProps: createFormProps,
        modalProps: createModalProps,
        show: createModalShow,
    } = useModalForm({
        resource: "app_complaints",
        action: "create",
        redirect: false,
    });

    const { selectProps: selectOrder } = useSelect<Order>({
        resource: "app_orders_with_customers_view",
        meta: {
            select: `
                id,
                bb_OrderNumber,
                customer_name,
                search_blob
            `,
        },
        sorters: [{ field: "bb_CreatedAt", order: "desc" }],
        optionLabel: (item) =>
            `Bestellung #${item.bb_OrderNumber} - ${item.customer_name || "Kunde unbekannt"}`,
        optionValue: "id",
        onSearch: (value: string) => [

            {
                field: "search_blob",
                operator: "contains",
                value,
            },
        ],
    });

    const orderId: number | undefined = Form.useWatch("order_id", createFormProps.form);

    

    const { selectProps: selectOrderItem } = useSelect<OrderItem>({
        resource: "app_order_items",
        optionValue: "id",
        sorters: [{ field: "bb_SKU", order: "asc" }],
        filters: [
            {
                field: "order_id",
                operator: "eq",
                value: orderId,
            },
        ],
        pagination: { current: 1, pageSize: 1000 },
        debounce: 300,
        defaultValueQueryOptions: {
            enabled: true,
        },
        queryOptions: {
            enabled: orderId !== undefined,
        },
    });

    return (
        <>
            <Button
                size="small"
                shape="circle"
                icon={<PlusOutlined />}
                onClick={() => {
                    createModalShow();
                }}
            />
            <Modal {...createModalProps} title="Reklamation hinzufügen">
                <Form
                    {...createFormProps}
                    layout="vertical"
                    initialValues={{
                        order_id: id,
                    }}
                >
                    <Form.Item label="Betroffene Bestellung" name="order_id">
                        <Select {...selectOrder} />
                    </Form.Item>

                    <Form.Item label="Betroffene Position" name="product">
                        <Select {...selectOrderItem} />
                    </Form.Item>

                    <Form.Item label="Titel" name="title">
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}*/
