"use client";

import { Edit, useForm, useSelect, ListButton, RefreshButton } from "@refinedev/antd";
import { useCustomMutation, useInvalidate } from "@refinedev/core";
import { Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, TreeSelect, Upload, Modal } from "antd";
import type { UploadProps } from "antd";
import { LoginOutlined, UploadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useState } from "react";
import {Tables } from "@/types/supabase";
import InboundItemList from "@components/lager/wareneingang/bearbeiten/InboundItemList";
import InboundItems from "@components/lager/wareneingang/bearbeiten/InboundItemList";
import SelectStateIS from "@components/common/selects/state_is";
import dayjs from "dayjs";
import InboundPostAndDispatchButton from "@components/common/buttons/post_is";

type InboundShipment = Tables<"app_inbound_shipments">;
type PO = Tables<"app_purchase_orders">;
type POItemsNormal = Tables<"app_purchase_orders_positions_normal">;
type POItemsSpecial = Tables<"app_purchase_orders_positions_special">;
type Suppliers = Tables<"app_suppliers">;

export default function InboundShipmentCreatePage() {
  const [uploadingDeliveryNote, setUploadingDeliveryNote] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const { formProps, saveButtonProps, form, queryResult } = useForm<InboundShipment>({
    resource: "app_inbound_shipments",
    redirect: false,
  });

  const invalidate = useInvalidate();

  const { mutate: uploadFile } = useCustomMutation();
  const { mutate: deleteFile } = useCustomMutation();

  const handleUpload = async (file: File, fieldName: string, prefix: string, setLoading: (loading: boolean) => void) => {
    setLoading(true);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subfolder", `Lager/Wareneingang/${formProps?.initialValues?.inbound_number || "temp"}`);
    formData.append("prefix", prefix);

    uploadFile(
      {
        url: "/api/sharepoint/upload",
        method: "post",
        values: formData,
        successNotification: (data) => ({
          message: `${file.name} erfolgreich hochgeladen`,
          type: "success",
        }),
        errorNotification: (error) => ({
          message: "Upload fehlgeschlagen",
          description: error?.message || "Unbekannter Fehler",
          type: "error",
        }),
      },
      {
        onSuccess: async (data) => {
          // Update form field with file URL
          form?.setFieldValue(fieldName, data.data.fileUrl);
          
          // Update database via Supabase
          const recordId = formProps?.initialValues?.id;
          if (recordId) {
            const { supabaseBrowserClient } = await import("@/utils/supabase/client");
            
            await supabaseBrowserClient
              .from("app_inbound_shipments")
              .update({ [fieldName]: data.data.fileUrl })
              .eq("id", recordId);
            
            // Invalidate cache to refresh data
            invalidate({
              resource: "app_inbound_shipments",
              invalidates: ["detail"],
              id: recordId,
            });
          }
          setLoading(false);
        },
        onError: () => {
          setLoading(false);
        },
      }
    );
    
    return false; // Prevent default upload behavior
  };

  const handleDelete = async (fieldName: string, fileName: string) => {
    Modal.confirm({
      title: 'Datei löschen',
      content: 'Möchten Sie diese Datei wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      okText: 'Löschen',
      okType: 'danger',
      cancelText: 'Abbrechen',
      onOk: async () => {
        const recordId = formProps?.initialValues?.id;
        const subfolder = `Lager/Wareneingang/${formProps?.initialValues?.inbound_number || ""}`;
        
        deleteFile(
          {
            url: "/api/sharepoint/delete",
            method: "delete",
            values: { fileName, subfolder },
            successNotification: {
              message: "Datei erfolgreich gelöscht",
              type: "success",
            },
            errorNotification: {
              message: "Löschen fehlgeschlagen",
              type: "error",
            },
          },
          {
            onSuccess: async () => {
              // Update database
              if (recordId) {
                const { supabaseBrowserClient } = await import("@/utils/supabase/client");
                
                await supabaseBrowserClient
                  .from("app_inbound_shipments")
                  .update({ [fieldName]: null })
                  .eq("id", recordId);
                
                // Update form and invalidate cache
                form?.setFieldValue(fieldName, null);
                invalidate({
                  resource: "app_inbound_shipments",
                  invalidates: ["detail"],
                  id: recordId,
                });
              }
            },
          }
        );
      },
    });
  };

  const {selectProps: selectPropsPOItemNormal} = useSelect<POItemsNormal>({
    resource: "app_purchase_orders_positions_normal",
    optionLabel: "id",
    optionValue: "id",
  });

    const {selectProps: selectPropsSupplier} = useSelect<Suppliers>({
    resource: "app_suppliers",
    optionLabel: "id",
    optionValue: "id",
  });

    const {selectProps: selectPropsPO} = useSelect<PO>({
      resource: "app_purchase_orders",
      optionLabel: (item) => `${item.order_number} - (${item.supplier} - ${item.invoice_number})`,
      optionValue: "id",
      filters: [{
        field: "status",
        operator: "in",
        value: ["partially_in_production", "in_production", "partially_delivered"],
      }],
    });

  return (
    <>
    <Edit title="Wareneingang bearbeiten"
      headerButtons={
        <>
          <ListButton hideText />
          <RefreshButton hideText />
          <InboundPostAndDispatchButton inboundShipmentId={formProps?.initialValues?.id as string} />
        </> 
      }
    saveButtonProps={saveButtonProps} 
    >
      <Form {...formProps} layout="vertical">
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item name="inbound_number" label="Wareneingangsnummer">
              <Input placeholder="wird automatisch vergeben" disabled/>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="delivered_at" label="Wareneingangsdatum" getValueProps={(v) => ({ value: v ? dayjs(v) : null })} required>
              <DatePicker style={{ width: "100%" }} placeholder="Datum wählen..." format="DD.MM.YYYY"/>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="status" label="Status" required>
              <SelectStateIS />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item name="fk_bb_supplier" label="Lieferant" required>
              <Select {...selectPropsSupplier} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="delivery_note_number" label="Lieferscheinnummer" required>
              <Input placeholder="Lieferscheinnummer eingeben" />
            </Form.Item>
          </Col>
          <Col span={4}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Lieferschein hochladen</label>
              <Upload
                beforeUpload={(file) => handleUpload(file, "delivery_note_file_url", "Lieferschein", setUploadingDeliveryNote)}
                showUploadList={false}
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={!!formProps?.initialValues?.delivery_note_file_url}
              >
                <Button 
                  icon={<UploadOutlined />} 
                  loading={uploadingDeliveryNote}
                  disabled={!!formProps?.initialValues?.delivery_note_file_url}
                >
                  {formProps?.initialValues?.delivery_note_file_url ? "Bereits hochgeladen" : "Klicken zum Hochladen"}
                </Button>
              </Upload>
              {formProps?.initialValues?.delivery_note_file_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={formProps.initialValues.delivery_note_file_url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 16 }}>
                    <EyeOutlined style={{ marginRight: 4 }} />
                    Datei öffnen
                  </a>
                  <Button 
                    type="link"
                    size="small" 
                    danger 
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      const url = formProps.initialValues?.delivery_note_file_url || "";
                      const fileName = url.split("/").pop() || "";
                      handleDelete("delivery_note_file_url", decodeURIComponent(fileName));
                    }}
                    style={{ padding: 0, height: "auto" }}
                  >
                    Löschen
                  </Button>
                </div>
              )}
              <Form.Item name="delivery_note_file_url" hidden>
                <Input />
              </Form.Item>
            </div>
          </Col>
          <Col span={8}>
          <Form.Item name="shipping_cost_separate" label="Lieferkosten separate Rechnung">
            <InputNumber placeholder="Betrag" addonAfter="€" step={0.01} />
          </Form.Item>
        </Col>
          <Col span={8}>
            <Form.Item name="invoice_number" label="Rechnungsnummer" required>
              <Input placeholder="Rechnungsnummer eingeben" />
            </Form.Item>
          </Col>
          <Col span={4}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Rechnung hochladen</label>
              <Upload
                beforeUpload={(file) => handleUpload(file, "invoice_file_url", "Rechnung", setUploadingInvoice)}
                showUploadList={false}
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={!!formProps?.initialValues?.invoice_file_url}
              >
                <Button 
                  icon={<UploadOutlined />} 
                  loading={uploadingInvoice}
                  disabled={!!formProps?.initialValues?.invoice_file_url}
                >
                  {formProps?.initialValues?.invoice_file_url ? "Bereits hochgeladen" : "Klicken zum Hochladen"}
                </Button>
              </Upload>
              {formProps?.initialValues?.invoice_file_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={formProps.initialValues.invoice_file_url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 16 }}>
                    <EyeOutlined style={{ marginRight: 4 }} />
                    Datei öffnen
                  </a>
                  <Button 
                    type="link"
                    size="small" 
                    danger 
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      const url = formProps.initialValues?.invoice_file_url || "";
                      const fileName = url.split("/").pop() || "";
                      handleDelete("invoice_file_url", decodeURIComponent(fileName));
                    }}
                    style={{ padding: 0, height: "auto" }}
                  >
                    Löschen
                  </Button>
                </div>
              )}
              <Form.Item name="invoice_file_url" hidden>
                <Input />
              </Form.Item>
            </div>
          </Col>
          
          
        </Row>
            <Form.Item name="note" label="Notiz">
              <Input.TextArea placeholder="Notiz eingeben" rows={4} />
            </Form.Item>
      </Form>
      
    </Edit>
    <InboundItems inboundShipmentId={formProps?.initialValues?.id as string} inboundShipmentStatus={formProps?.initialValues?.status as "planned" | "delivered" | "posted"} inboundShipmentSupplier={formProps?.initialValues?.fk_bb_supplier as string} />
    </>
  );
}