"use client";

import { Edit, useForm, useSelect, ListButton, RefreshButton } from "@refinedev/antd";
import { Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, TreeSelect, Upload, message, Modal } from "antd";
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

  const handleUpload = async (file: File, fieldName: string, prefix: string, setLoading: (loading: boolean) => void) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subfolder", `Lager/Wareneingang/${formProps?.initialValues?.inbound_number || "temp"}`);
      formData.append("prefix", prefix);

      console.log("Uploading file:", file.name, "to /api/sharepoint/upload");

      const response = await fetch("/api/sharepoint/upload", {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        console.log("Response content-type:", contentType);
        
        let errorData;
        if (contentType?.includes("application/json")) {
          errorData = await response.json();
        } else {
          const text = await response.text();
          console.error("Response text:", text);
          errorData = { error: text || "Upload fehlgeschlagen" };
        }
        
        console.error("Upload error details:", errorData);
        throw new Error(errorData.error || "Upload fehlgeschlagen");
      }

      const result = await response.json();
      
      // Update form field with file URL
      form?.setFieldValue(fieldName, result.fileUrl);
      
      // Update database
      const recordId = formProps?.initialValues?.id;
      if (recordId) {
        try {
          const { supabaseBrowserClient } = await import("@/utils/supabase/client");
          
          const { error: dbError } = await supabaseBrowserClient
            .from("app_inbound_shipments")
            .update({ [fieldName]: result.fileUrl })
            .eq("id", recordId);
          
          if (dbError) {
            console.error("Database update error:", dbError);
            message.warning("Datei hochgeladen, aber DB-Update fehlgeschlagen");
          } else {
            message.success(`${file.name} erfolgreich hochgeladen und gespeichert`);
            // Reload data to update UI
            queryResult?.refetch();
          }
        } catch (dbError) {
          console.error("Database update error:", dbError);
          message.warning("Datei hochgeladen, aber DB-Update fehlgeschlagen");
        }
      } else {
        message.success(`${file.name} erfolgreich hochgeladen`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      message.error("Fehler beim Hochladen der Datei");
    } finally {
      setLoading(false);
    }
    
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
        try {
          const recordId = formProps?.initialValues?.id;
          const subfolder = `Lager/Wareneingang/${formProps?.initialValues?.inbound_number || ""}`;
          
          // Delete from SharePoint
          const response = await fetch("/api/sharepoint/delete", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fileName, subfolder }),
          });

          if (!response.ok) {
            throw new Error("Löschen fehlgeschlagen");
          }

          // Update database
          if (recordId) {
            const { supabaseBrowserClient } = await import("@/utils/supabase/client");
            
            const { error: dbError } = await supabaseBrowserClient
              .from("app_inbound_shipments")
              .update({ [fieldName]: null })
              .eq("id", recordId);
            
            if (dbError) {
              console.error("Database update error:", dbError);
              message.warning("Datei gelöscht, aber DB-Update fehlgeschlagen");
            } else {
              message.success("Datei erfolgreich gelöscht");
              form?.setFieldValue(fieldName, null);
              queryResult?.refetch();
            }
          }
        } catch (error) {
          console.error("Delete error:", error);
          message.error("Fehler beim Löschen der Datei");
        }
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
            <Form.Item name="arrived_at" label="Wareneingangsdatum" getValueProps={(v) => ({ value: v ? dayjs(v) : null })} required>
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