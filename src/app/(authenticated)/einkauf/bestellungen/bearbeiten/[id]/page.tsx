// src/app/(authenticated)/einkauf/bestellungen/bearbeiten/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useCustomMutation, useInvalidate } from "@refinedev/core";
import {
  useForm,
  Edit,
  RefreshButton,
  ListButton,
} from "@refinedev/antd";
import { Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, Row, Tabs, TabsProps, Upload, Modal, message } from "antd";
import type { UploadProps } from "antd";
import { UploadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import { Tables } from "@/types/supabase";
import { PoStatusTag } from "@components/common/tags/states/po";
import SelectSupplier from "@components/common/selects/supplier";

import { parseNumber } from "@/utils/formats";
import EinkaufBestellpositionenNormalBearbeiten from "@components/einkauf/bestellungen/positionen/normal";
import EinkaufBestellpositionenSpecialBearbeiten from "@components/einkauf/bestellungen/positionen/special";
import OrderStatusActionButton from "@components/common/buttons/po_order_confirm";
import { useCallback, useEffect, useState } from "react";
import ZugehoerigeWareneingänge from "@components/einkauf/bestellungen/listInboundShipments";

type Po = Tables<"app_purchase_orders">;

export default function EinkaufsBestellungenBearbeiten() {
  const params = useParams() as { id: string };
  const orderId = params?.id;

  const [uploadingConfirmation, setUploadingConfirmation] = useState(false);

  const { formProps: formPropsHeader, saveButtonProps, queryResult } = useForm<Po>({
    resource: "app_purchase_orders",
    id: orderId,
    meta: {
      select: "*, supplier_rel:app_suppliers!app_purchase_orders_supplier_fkey(id)",
    },
    redirect: false,
  });

  const invalidate = useInvalidate();

  const { mutate: uploadFile } = useCustomMutation();
  const { mutate: deleteFile } = useCustomMutation();

  const handleUpload = async (file: File, fieldName: string, prefix: string, setLoading: (loading: boolean) => void) => {
    setLoading(true);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subfolder", `Einkauf/Bestellungen/${formPropsHeader?.initialValues?.order_number || "temp"}`);
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
          formPropsHeader.form?.setFieldValue(fieldName, data.data.fileUrl);
          
          // Update database via Supabase
          const recordId = formPropsHeader?.initialValues?.id;
          if (recordId) {
            const { supabaseBrowserClient } = await import("@/utils/supabase/client");
            
            await supabaseBrowserClient
              .from("app_purchase_orders")
              .update({ [fieldName]: data.data.fileUrl })
              .eq("id", recordId);
            
            // Invalidate cache to refresh data
            invalidate({
              resource: "app_purchase_orders",
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
    
    return false;
  };

  const handleDelete = async (fieldName: string, fileName: string) => {
    Modal.confirm({
      title: 'Datei löschen',
      content: 'Möchten Sie diese Datei wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',
      okText: 'Löschen',
      okType: 'danger',
      cancelText: 'Abbrechen',
      onOk: async () => {
        const recordId = formPropsHeader?.initialValues?.id;
        const subfolder = `Einkauf/Bestellungen/${formPropsHeader?.initialValues?.order_number || ""}`;
        
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
                  .from("app_purchase_orders")
                  .update({ [fieldName]: null })
                  .eq("id", recordId);
                
                // Update form and invalidate cache
                formPropsHeader.form?.setFieldValue(fieldName, null);
                invalidate({
                  resource: "app_purchase_orders",
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

  const orderIdStr = orderId?.toString();
  const supplier = Form.useWatch("supplier", formPropsHeader.form);



    // + NEU: Status direkt aus dem geladenen Datensatz
  const record = queryResult?.data?.data;
  const status = record?.status ?? "draft";
  const costs = Number(record?.shipping_cost_net ?? 0);
  const isLocked = Boolean(record?.separate_invoice_for_shipping_cost) || costs > 0;

  // + NEU: Form-Werte aktualisieren, wenn record neu geladen wurde
  useEffect(() => {
    if (record) {
      formPropsHeader.form?.setFieldsValue(record);
    }
  }, [record, formPropsHeader.form]);

  const handleActionSuccess = useCallback(() => {
  // refetch kann bei refine optional sein → doppelt absichern
  queryResult?.refetch?.();
}, [queryResult])

const items: TabsProps['items'] =[
  {
    key: '1',
    label: `Positionen`,
    children: <>
                <EinkaufBestellpositionenNormalBearbeiten orderId={orderIdStr as string} supplier={supplier as string} status={status as string} />
                <EinkaufBestellpositionenSpecialBearbeiten orderId={orderIdStr as string} supplier={supplier as string} status={status as string}/>
            </>,
  },
  {
    key: '2',
    label: `Wareneingänge`,
    children: <ZugehoerigeWareneingänge orderId={orderIdStr as string} />
  }
]

  return (
    <>
    <Edit
      title="Einkauf - Bestellung bearbeiten"
      headerButtons={
        <>
          <ListButton hideText />
          <RefreshButton hideText />
          <OrderStatusActionButton orderId={orderId} onSuccess={handleActionSuccess} />
        </> 
      }
      saveButtonProps={saveButtonProps} 
    >
      <Form {...formPropsHeader} layout="vertical" id="edit-po-header-form">
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item label="ID" name="id" hidden>
              <Input disabled />
            </Form.Item>

            <Form.Item
              label="Bestellnummer"
              name="order_number"
              rules={[{ required: true, message: "Bestellnummer fehlt noch" }]}
            >
              <Input disabled />
            </Form.Item>

            <Form.Item label="Bestelldatum" name="ordered_at">
              <Input disabled />
            </Form.Item>

            <Form.Item label="Hersteller" name="supplier">
              <SelectSupplier disabled />
            </Form.Item>

            <div style={{ paddingTop: 8 }}>
              <PoStatusTag status={status || "draft"} />
            </div>
          </Col>

          <Col span={8}>
            <Form.Item label="Externe Bestellnummer" name="confirmation_number">
              <Input />
            </Form.Item>

            <Form.Item label="Bestätigungsdatum" getValueProps={(v) => ({ value: v ? dayjs(v) : null })} name="confirmation_date">
              <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Auftragsbestätigung hochladen</label>
              <Upload
                beforeUpload={(file) => handleUpload(file, "confirmation_file_url", "Auftragsbestaetigung", setUploadingConfirmation)}
                showUploadList={false}
                accept=".pdf,.jpg,.jpeg,.png"
                disabled={!!formPropsHeader?.initialValues?.confirmation_file_url}
              >
                <Button 
                  icon={<UploadOutlined />} 
                  loading={uploadingConfirmation}
                  disabled={!!formPropsHeader?.initialValues?.confirmation_file_url}
                  size="small"
                >
                  {formPropsHeader?.initialValues?.confirmation_file_url ? "Bereits hochgeladen" : "Klicken zum Hochladen"}
                </Button>
              </Upload>
              {formPropsHeader?.initialValues?.confirmation_file_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={formPropsHeader.initialValues.confirmation_file_url} target="_blank" rel="noopener noreferrer" style={{ marginRight: 16 }}>
                    <EyeOutlined style={{ marginRight: 4 }} />
                    Datei öffnen
                  </a>
                  <Button 
                    type="link"
                    size="small" 
                    danger 
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      const url = formPropsHeader.initialValues?.confirmation_file_url || "";
                      const fileName = url.split("/").pop() || "";
                      handleDelete("confirmation_file_url", decodeURIComponent(fileName));
                    }}
                    style={{ padding: 0, height: "auto" }}
                  >
                    Löschen
                  </Button>
                </div>
              )}
              <Form.Item name="confirmation_file_url" hidden>
                <Input />
              </Form.Item>
            </div>

             <Form.Item label="DOL planned" name="dol_planned">
              <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} disabled />
            </Form.Item>

            <Form.Item label="DOL Actual" getValueProps={(v) => ({ value: v ? dayjs(v) : null })} name="dol_actual">
              <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} disabled />
            </Form.Item>

            <Form.Item label="Rechnungsnummer" name="invoice_number">
              <Input />
            </Form.Item>

            <Form.Item label="Rechnungsdatum" getValueProps={(v) => ({ value: v ? dayjs(v) : null })} name="invoice_date">
              <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>
           
          </Col>

          <Col span={8}>
            <Form.Item label="Notizen" name="notes">
              <Input.TextArea rows={5} />
            </Form.Item>
              <Form.Item label="Anzahlungsrechnungen (mehrere mit Komma trennen)" >
            <Input />
            </Form.Item>
            
            <Form.Item
              label="Versandkosten netto"
              name="shipping_cost_net"
              normalize={parseNumber}
            >
              <InputNumber type="number" disabled={isLocked} addonAfter="€"/>
            </Form.Item>

            <Form.Item
              name="separate_invoice_for_shipping_cost"
              valuePropName="checked"
              
              
            >
              <Checkbox              
                onChange={(e) => {
                    if (costs > 0) {
                    message.warning(
                        "Nicht änderbar: Es sind bereits Versandkosten gebucht."
                    );
                    formPropsHeader.form?.setFieldValue(
                        "separate_invoice_for_shipping_cost",
                        record?.separate_invoice_for_shipping_cost ?? false
                    );
                    }
                }}>Versandkosten separat abrechnen?</Checkbox>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Edit>
    <Card style={{ marginTop: 16 }}>
      <Tabs items={items} />
    </Card>
    
    </>
  );
}
