"use client";

import { MenuOutlined, SendOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useModalForm, useSelect } from "@refinedev/antd";
import { useOne, useCreate, useList, useInvalidate, useDelete, useUpdate } from "@refinedev/core";
import { Tables } from "@/types/supabase";
import { Button, Cascader, Checkbox, Descriptions, Divider, Form, Input, Modal, Popconfirm, Select, Space, Switch, Timeline, Tooltip, Typography } from "antd";
import { useOrderItemCascader } from "@components/common/selects/cascader_order_items";
import { useState, useEffect } from "react";
import dayjs from "dayjs";

type Complaints = Tables<"app_complaints">;
type ComplaintStages = Tables<"app_complaints_stages">;
type ComplaintTimeline = Tables<"app_complaint_timeline">;


export default function EditReklamationButton<Complaints>({id}: {id: string}) {
    const { formProps: editFormProps, modalProps: editModalProps, show: showEditModal, formLoading, queryResult } = useModalForm({
        resource: "app_complaints",
        action: "edit",
        redirect: false,
        meta: {
            select: "*, fk_app_orders_id, fk_app_order_items_id"
        }
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
        optionLabel: "label",
        optionValue: "id",
    });

    // Bereits verknüpfte Order/Item IDs für Cascader
    const existingOrderIds = queryResult?.data?.data?.fk_app_orders_id 
        ? [queryResult.data.data.fk_app_orders_id] 
        : [];
    
    const existingItemIds = queryResult?.data?.data?.fk_app_order_items_id
        ? [queryResult.data.data.fk_app_order_items_id]
        : [];

    const { options, loading } = useOrderItemCascader(
        existingOrderIds,
        existingItemIds,
        [
            { field: "bb_ShippedAt", operator: "ne", value: null },
        ]
    );
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [selectedOrderItemId, setSelectedOrderItemId] = useState<number | null>(null);
    const [timelineMessage, setTimelineMessage] = useState<string>("");
    const [isSolution, setIsSolution] = useState<boolean>(false);
    const [editingTimelineId, setEditingTimelineId] = useState<number | null>(null);
    const [editingMessage, setEditingMessage] = useState<string>("");
    const [editingIsSolution, setEditingIsSolution] = useState<boolean>(false);

    const invalidate = useInvalidate();

    // Fetch timeline entries for this complaint
    const { data: timelineData, refetch: refetchTimeline } = useList<ComplaintTimeline>({
        resource: "app_complaint_timeline",
        filters: [
            { field: "fk_complaint", operator: "eq", value: id }
        ],
        sorters: [
            { field: "created_at", order: "desc" }
        ],
        queryOptions: {
            enabled: !!id,
        },
        meta: {
            select: "*, created_by!inner(full_name, username)"
        }
    });

    // Create mutation for timeline entries
    const { mutate: createTimelineEntry, isLoading: isCreatingTimeline } = useCreate();
    const { mutate: deleteTimelineEntry } = useDelete();
    const { mutate: updateTimelineEntry, isLoading: isUpdatingTimeline } = useUpdate();

    // Load initial values from complaint when editing
    useEffect(() => {
        if (queryResult?.data?.data) {
            const complaint = queryResult.data.data;
            if (complaint.fk_app_orders_id) {
                setSelectedOrderId(complaint.fk_app_orders_id);
            }
            if (complaint.fk_app_order_items_id) {
                setSelectedOrderItemId(complaint.fk_app_order_items_id);
            }
        }
    }, [queryResult?.data?.data]);

    // Fetch order details when an order/item is selected
    const { data: orderData, isFetching: isLoadingOrder } = useOne({
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
    const { data: orderItemData, isFetching: isLoadingOrderItem } = useOne({
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
            editFormProps.form?.setFieldValue("fk_app_orders_id", value[0]);
            editFormProps.form?.setFieldValue("fk_app_order_items_id", value[1]);
        } else {
            setSelectedOrderId(null);
            setSelectedOrderItemId(null);
            editFormProps.form?.setFieldValue("fk_app_orders_id", null);
            editFormProps.form?.setFieldValue("fk_app_order_items_id", null);
        }
    };

    const handleAddTimelineEntry = () => {
        if (!timelineMessage.trim()) return;

        createTimelineEntry({
            resource: "app_complaint_timeline",
            values: {
                fk_complaint: id,
                message: timelineMessage,
                is_solution: isSolution,
            },
        }, {
            onSuccess: () => {
                setTimelineMessage("");
                setIsSolution(false);
                refetchTimeline();
                invalidate({
                    resource: "app_complaint_timeline",
                    invalidates: ["list"],
                });
            }
        });
    };

    const handleDeleteTimelineEntry = (entryId: number) => {
        deleteTimelineEntry({
            resource: "app_complaint_timeline",
            id: entryId,
        }, {
            onSuccess: () => {
                refetchTimeline();
                invalidate({
                    resource: "app_complaint_timeline",
                    invalidates: ["list"],
                });
            }
        });
    };

    const handleEditTimelineEntry = (entry: any) => {
        setEditingTimelineId(entry.id);
        setEditingMessage(entry.message || "");
        setEditingIsSolution(entry.is_solution || false);
    };

    const handleSaveEdit = () => {
        if (!editingTimelineId || !editingMessage.trim()) return;

        updateTimelineEntry({
            resource: "app_complaint_timeline",
            id: editingTimelineId,
            values: {
                message: editingMessage,
                is_solution: editingIsSolution,
            },
        }, {
            onSuccess: () => {
                setEditingTimelineId(null);
                setEditingMessage("");
                setEditingIsSolution(false);
                refetchTimeline();
                invalidate({
                    resource: "app_complaint_timeline",
                    invalidates: ["list"],
                });
            }
        });
    };

    const handleCancelEdit = () => {
        setEditingTimelineId(null);
        setEditingMessage("");
        setEditingIsSolution(false);
    };

    const order = orderData?.data;
    const orderItem = orderItemData?.data;

    return (
        <>
            <Button 
                size="small" 
                shape="circle" 
                onClick={() => showEditModal(id)} 
                icon={<MenuOutlined />} 
            />
            <Modal 
                title="Reklamation bearbeiten" 
                {...editModalProps} >
                <Form 
                    {...editFormProps} 
                    layout="vertical" 
                    key="id"
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
                            const orderId = editFormProps.form?.getFieldValue("fk_app_orders_id");
                            const orderItemId = editFormProps.form?.getFieldValue("fk_app_order_items_id");
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
                    >
                        <Input.TextArea rows={4} />
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
                        <Input.TextArea rows={3} />
                    </Form.Item>

                    <Divider>Timeline</Divider>

                    {/* Timeline Eingabe */}
                    <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
                        <Input.TextArea
                            placeholder="Neuer Timeline-Eintrag..."
                            value={timelineMessage}
                            onChange={(e) => setTimelineMessage(e.target.value)}
                            rows={2}
                            style={{ flex: 1 }}
                            onPressEnter={(e) => {
                                if (e.shiftKey) return; // Allow Shift+Enter for new line
                                e.preventDefault();
                                handleAddTimelineEntry();
                            }}
                        />
                    </Space.Compact>
                    
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Checkbox 
                            checked={isSolution}
                            onChange={(e) => setIsSolution(e.target.checked)}
                        >
                            Als Lösung markieren
                        </Checkbox>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={handleAddTimelineEntry}
                            loading={isCreatingTimeline}
                            disabled={!timelineMessage.trim()}
                        >
                            Hinzufügen
                        </Button>
                    </Space>

                    {/* Timeline Darstellung */}
                    {timelineData && timelineData.data && timelineData.data.length > 0 && (
                        <Timeline
                            style={{ marginTop: 24 }}
                            items={timelineData.data.map((entry: any) => ({
                                color: entry.is_solution ? 'green' : 'blue',
                                children: (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <Typography.Text strong>
                                                    {entry.created_by?.full_name || entry.created_by?.username || 'Unbekannt'}
                                                </Typography.Text>
                                                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: '0.9em' }}>
                                                    {dayjs(entry.created_at).format('DD.MM.YYYY HH:mm')}
                                                </Typography.Text>
                                                {entry.is_solution && (
                                                    <Typography.Text type="success" style={{ marginLeft: 8 }}>
                                                        • Lösung
                                                    </Typography.Text>
                                                )}
                                            </div>
                                            <Space size="small">
                                                <Tooltip title="Bearbeiten">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<EditOutlined />}
                                                        onClick={() => handleEditTimelineEntry(entry)}
                                                    />
                                                </Tooltip>
                                                <Popconfirm
                                                    title="Eintrag löschen?"
                                                    description="Möchten Sie diesen Timeline-Eintrag wirklich löschen?"
                                                    onConfirm={() => handleDeleteTimelineEntry(entry.id)}
                                                    okText="Ja"
                                                    cancelText="Nein"
                                                >
                                                    <Tooltip title="Löschen">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            icon={<DeleteOutlined />}
                                                        />
                                                    </Tooltip>
                                                </Popconfirm>
                                            </Space>
                                        </div>
                                        {editingTimelineId === entry.id ? (
                                            <div style={{ marginTop: 8 }}>
                                                <Input.TextArea
                                                    value={editingMessage}
                                                    onChange={(e) => setEditingMessage(e.target.value)}
                                                    rows={2}
                                                    style={{ marginBottom: 8 }}
                                                />
                                                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                                    <Checkbox
                                                        checked={editingIsSolution}
                                                        onChange={(e) => setEditingIsSolution(e.target.checked)}
                                                    >
                                                        Als Lösung markieren
                                                    </Checkbox>
                                                    <Space>
                                                        <Button size="small" onClick={handleCancelEdit}>
                                                            Abbrechen
                                                        </Button>
                                                        <Button
                                                            type="primary"
                                                            size="small"
                                                            onClick={handleSaveEdit}
                                                            loading={isUpdatingTimeline}
                                                            disabled={!editingMessage.trim()}
                                                        >
                                                            Speichern
                                                        </Button>
                                                    </Space>
                                                </Space>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: 4 }}>
                                                <Typography.Text>{entry.message}</Typography.Text>
                                            </div>
                                        )}
                                    </div>
                                )
                            }))}
                        />
                    )}
                </Form>
            </Modal>
        </>
    );
}