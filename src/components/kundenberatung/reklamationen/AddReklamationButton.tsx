"use client";

import { PlusOutlined } from "@ant-design/icons";
import { useSelect, useModalForm } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Cascader, Descriptions, Form, Input, Modal, Select, Switch, Typography } from "antd";
import { useOrderItemCascader } from "@components/common/selects/cascader_order_items";
import { useState } from "react";
import { useOne } from "@refinedev/core";
import dayjs from "dayjs";

type ComplaintStages = Tables<"app_complaints_stages">;

type Props = {
    onAddClickAction?: (args: { id: string }) => void;
    id: string;
};

export default function AddReklamationButton({ onAddClickAction, id }: Props) {
    const { formProps: createFormProps, modalProps: createModalProps, show: showCreateModal } = useModalForm({
        resource: "app_complaints",
        action: "create",
        redirect: false,
    });

    const { selectProps: selectOptions } = useSelect<ComplaintStages>({
        resource: "app_complaints_stages",
        optionLabel: "name",
        optionValue: "id",
    });

    const { selectProps: responsibilityOptions } = useSelect({
        resource: "app_complaint_responsibilities",
        sorters: [{ field: "label", order: "asc" }],
        optionLabel: "label",
        optionValue: "id",
    });

    const { selectProps: causeOptions } = useSelect({
        resource: "app_complaint_causes",
        sorters: [{ field: "label", order: "asc" }],
        optionLabel: "label",
        optionValue: "id",
    });

    const { options, loading } = useOrderItemCascader(
        [],
        [],
        [
            { field: "bb_ShippedAt", operator: "ne", value: null }
        ]
    );
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [selectedOrderItemId, setSelectedOrderItemId] = useState<number | null>(null);

    // Fetch order details when an order/item is selected
    const { data: orderData } = useOne({
        resource: "app_orders",
        id: selectedOrderId || "",
        queryOptions: {
            enabled: !!selectedOrderId,
        },
        meta: {
            select: "*, app_customers(bb_Name)"
        }
    });

    // Fetch order item details when selected
    const { data: orderItemData } = useOne({
        resource: "app_order_items",
        id: selectedOrderItemId || "",
        queryOptions: {
            enabled: !!selectedOrderItemId,
        },
        meta: {
            select: "*, app_products(bb_sku, bb_name), app_order_item_attributes(bb_Name, bb_Value)"
        }
    });

    const handleCascaderChange = (value: any) => {
        if (value && Array.isArray(value) && value.length === 2) {
            setSelectedOrderId(value[0]);
            setSelectedOrderItemId(value[1]);
            // Update the form fields
            createFormProps.form?.setFieldValue("fk_app_orders_id", value[0]);
            createFormProps.form?.setFieldValue("fk_app_order_items_id", value[1]);
        } else {
            setSelectedOrderId(null);
            setSelectedOrderItemId(null);
            createFormProps.form?.setFieldValue("fk_app_orders_id", null);
            createFormProps.form?.setFieldValue("fk_app_order_items_id", null);
        }
    };

    const handleOpenModal = () => {
        // Set the stage value to the current column id (either 'unassigned' or stage id)
        const stageValue = id === "unassigned" ? null : id;
        
        showCreateModal();
        
        // Set initial stage value after modal opens
        setTimeout(() => {
            createFormProps.form?.setFieldValue("stage", stageValue);
        }, 0);
    };

    const order = orderData?.data;
    const orderItem = orderItemData?.data;

    return (
        <>
            <Button
                type="primary"
                size="small"
                shape="circle"
                icon={<PlusOutlined />}
                onClick={handleOpenModal}
            />
            <Modal 
                title="Neue Reklamation erstellen" 
                {...createModalProps}
            >
                <Form 
                    {...createFormProps} 
                    layout="vertical"
                >
                    {/* Hidden fields to store the actual foreign keys */}
                    <Form.Item name="fk_app_orders_id" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item name="fk_app_order_items_id" hidden>
                        <Input />
                    </Form.Item>

                    <Form.Item
                        label="Betroffene Bestellung"
                        getValueProps={() => {
                            // Set the value for the Cascader based on the hidden fields
                            const orderId = createFormProps.form?.getFieldValue("fk_app_orders_id");
                            const orderItemId = createFormProps.form?.getFieldValue("fk_app_order_items_id");
                            if (orderId && orderItemId) {
                                return { value: [orderId, orderItemId] };
                            }
                            return {};
                        }}
                    >
                        <Cascader 
                            options={options} 
                            loading={loading}
                            onChange={handleCascaderChange}
                            placeholder="Bestellung und Position auswählen..."
                        />
                    </Form.Item>

                    {/* Display order and item details when selected */}
                    {(selectedOrderId || selectedOrderItemId) && (
                        <Descriptions 
                            bordered 
                            size="small" 
                            column={1}
                            style={{ marginBottom: 16 }}
                        >
                            {order && (
                                <>
                                    <Descriptions.Item label="Bestellnummer">
                                        {order.bb_OrderNumber || "—"}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Kundenname">
                                        {order.app_customers?.bb_Name || "—"}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Auslieferungsdatum / Warenausgang">
                                        {order.bb_InvoiceDate 
                                            ? dayjs(order.bb_InvoiceDate).format("DD.MM.YYYY")
                                            : order.bb_ShippedAt
                                            ? dayjs(order.bb_ShippedAt).format("DD.MM.YYYY")
                                            : "—"
                                        }
                                    </Descriptions.Item>
                                </>
                            )}
                            {orderItem && (
                                <>
                                    <Descriptions.Item label="Artikel">
                                        <div>
                                            <div>
                                                <strong>{orderItem.app_products?.bb_sku || "—"}</strong>
                                                {orderItem.app_products?.bb_name && (
                                                    <> – {orderItem.app_products.bb_name}</>
                                                )}
                                            </div>
                                            {orderItem.app_order_item_attributes && 
                                             orderItem.app_order_item_attributes.length > 0 && (
                                                <div style={{ marginTop: 4 }}>
                                                    <Typography.Text type="secondary" style={{ fontSize: "0.9em" }}>
                                                        {orderItem.app_order_item_attributes
                                                            .filter((attr: any) => 
                                                                attr.bb_Name === "Grundmodell" || 
                                                                attr.bb_Name === "Maße"
                                                            )
                                                            .map((attr: any) => `${attr.bb_Name}: ${attr.bb_Value}`)
                                                            .join(" · ")
                                                        }
                                                    </Typography.Text>
                                                </div>
                                            )}
                                        </div>
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Ausliefernde Spedition">
                                        <span>{orderItem.bb_ShippingProviderName || "—"}</span>                                     
                                    </Descriptions.Item>
                                </>
                            )}
                        </Descriptions>
                    )}

                    <Form.Item
                        label="Stage"
                        name="stage"
                    >
                        <Select {...selectOptions} />
                    </Form.Item>

                    <Form.Item
                        label="Beschreibung"
                        name="description"
                        rules={[{ required: true, message: "Bitte eine Beschreibung eingeben" }]}
                    >
                        <Input.TextArea rows={4} placeholder="Beschreiben Sie die Reklamation..." />
                    </Form.Item>

                    <Form.Item
                        label="Extern?"
                        name="is_external"
                    >
                        <Switch defaultValue={false} />
                    </Form.Item>

                    <Form.Item
                        label="Verantwortung"
                        name="fk_responsibility"
                    >
                        <Select {...responsibilityOptions} />
                    </Form.Item>

                    <Form.Item
                        label="Ursache - Wobei ist der Fehler aufgetreten?"
                        name="fk_cause"
                    >
                        <Select {...causeOptions} />
                    </Form.Item>

                    <Form.Item
                        label="Prozessverbesserungsidee"
                        name="improvement_idea"
                    >
                        <Input.TextArea rows={3} placeholder="Ideen zur Vermeidung künftiger Probleme..." />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}