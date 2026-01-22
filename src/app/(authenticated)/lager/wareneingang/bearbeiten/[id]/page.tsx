"use client";

import { Edit, useForm, useSelect, ListButton, RefreshButton, SaveButton, ShowButton } from "@refinedev/antd";
import { useCustomMutation, useInvalidate, useNotification, useUpdate } from "@refinedev/core";
import { Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, Upload, Modal, Card, Space } from "antd";
import { UploadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Tables } from "@/types/supabase";
import InboundItems from "@components/lager/wareneingang/bearbeiten/InboundItemList";
import SelectStateIS from "@components/common/selects/state_is";
import dayjs from "dayjs";
import InboundPostAndDispatchButton from "@components/common/buttons/post_is";
import { ISStatusTag } from "@components/common/tags/states/is";

type InboundShipment = Tables<"app_inbound_shipments">;
type PO = Tables<"app_purchase_orders">;
type Suppliers = Tables<"app_suppliers">;

// Typ für die Dateifelder
type FileFieldName = "delivery_note_file_url" | "invoice_file_url" | "shipping_cost_invoice_file_url";

export default function InboundShipmentEditPage() {
  const params = useParams() as { id: string };
  const recordId = params?.id;
  const recordIdStr = recordId?.toString();

  const [uploadingDeliveryNote, setUploadingDeliveryNote] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [uploadingShippingCostInvoice, setUploadingShippingCostInvoice] = useState(false);
  const [deletingFile, setDeletingFile] = useState<FileFieldName | null>(null);

  const invalidate = useInvalidate();
  const { open } = useNotification();

  const { formProps, saveButtonProps, form, queryResult } = useForm<InboundShipment>({
    resource: "app_inbound_shipments",
    id: recordId,
    redirect: false,
  });

  const record = queryResult?.data?.data;

  // SharePoint Upload/Delete über useCustomMutation
  const { mutate: uploadSharepoint } = useCustomMutation();
  const { mutate: deleteSharepoint } = useCustomMutation();

  // DB Update über Refine (nicht direkt Supabase-Client)
  const { mutate: updateFieldMutate } = useUpdate<InboundShipment>();

  const refreshRecord = useCallback(() => {
    if (!recordIdStr) return;

    invalidate({
      resource: "app_inbound_shipments",
      invalidates: ["detail"],
      id: recordIdStr,
    });

    queryResult?.refetch?.();
  }, [invalidate, recordIdStr, queryResult]);

  const updateField = useCallback(
    (fieldName: keyof InboundShipment, value: unknown) => {
      if (!recordIdStr) return;

      updateFieldMutate(
        {
          resource: "app_inbound_shipments",
          id: recordIdStr,
          values: { [fieldName]: value } as Partial<InboundShipment>,
          successNotification: false,
          errorNotification: false,
        },
        {
          onSuccess: () => {
            form?.setFieldValue(fieldName as string, value);
            refreshRecord();
          },
          onError: (e) => {
            open?.({
              type: "error",
              message: "Speichern fehlgeschlagen",
              description: e?.message ?? "Unbekannter Fehler",
            });
          },
        },
      );
    },
    [form, open, recordIdStr, refreshRecord, updateFieldMutate],
  );

  // URLs aus record (truth) mit fallback auf Form
  const deliveryNoteUrl = useMemo(() => {
    return record?.delivery_note_file_url ?? form?.getFieldValue("delivery_note_file_url") ?? null;
  }, [record?.delivery_note_file_url, form]);

  const invoiceUrl = useMemo(() => {
    return record?.invoice_file_url ?? form?.getFieldValue("invoice_file_url") ?? null;
  }, [record?.invoice_file_url, form]);

  const shippingCostInvoiceUrl = useMemo(() => {
    return record?.shipping_cost_invoice_file_url ?? form?.getFieldValue("shipping_cost_invoice_file_url") ?? null;
  }, [record?.shipping_cost_invoice_file_url, form]);

  const buildFolder = useCallback(() => {
    const inboundNumber = form?.getFieldValue("inbound_number") ?? record?.inbound_number ?? "temp";
    return {
      subfolder: `Wareneingang/${inboundNumber}`,
      basePath: "00 Web-App/Lager",
    };
  }, [form, record?.inbound_number]);

  // Generische Upload-Funktion
  const handleUpload = useCallback(
    (file: File, fieldName: FileFieldName, prefix: string, setLoading: (loading: boolean) => void) => {
      setLoading(true);
      const { subfolder, basePath } = buildFolder();

      const fd = new FormData();
      fd.append("file", file);
      fd.append("subfolder", subfolder);
      fd.append("prefix", prefix);
      fd.append("basePath", basePath);

      uploadSharepoint(
        {
          url: "/api/sharepoint/upload",
          method: "post",
          values: fd,
          successNotification: false,
          errorNotification: false,
        },
        {
          onSuccess: ({ data }) => {
            const fileUrl = data?.fileUrl as string | undefined;

            if (!fileUrl) {
              open?.({
                type: "error",
                message: "Upload fehlgeschlagen",
                description: "Keine fileUrl aus der API erhalten.",
              });
              setLoading(false);
              return;
            }

            updateField(fieldName, fileUrl);
            open?.({
              type: "success",
              message: `${prefix} erfolgreich hochgeladen`,
            });
            setLoading(false);
          },
          onError: (e) => {
            open?.({
              type: "error",
              message: "Upload fehlgeschlagen",
              description: e?.message ?? "Unbekannter Fehler",
            });
            setLoading(false);
          },
        },
      );

      return false; // Verhindert AntD Auto-Upload
    },
    [buildFolder, open, updateField, uploadSharepoint],
  );

  // Generische Delete-Funktion
  const handleDelete = useCallback(
    (fieldName: FileFieldName, fileUrl: string | null) => {
      if (!fileUrl) return;

      Modal.confirm({
        title: "Datei löschen",
        content: "Möchten Sie diese Datei wirklich löschen? Danach können Sie eine neue Datei hochladen.",
        okText: "Löschen",
        okType: "danger",
        cancelText: "Abbrechen",
        onOk: () => {
          setDeletingFile(fieldName);

          deleteSharepoint(
            {
              url: "/api/sharepoint/delete",
              method: "delete",
              values: {
                fileUrl: fileUrl,
              },
              successNotification: false,
              errorNotification: false,
            },
            {
              onSuccess: () => {
                updateField(fieldName, null);
                open?.({ type: "success", message: "Datei gelöscht" });
                setDeletingFile(null);
              },
              onError: (e) => {
                open?.({
                  type: "error",
                  message: "Löschen fehlgeschlagen",
                  description: e?.message ?? "Unbekannter Fehler",
                });
                setDeletingFile(null);
              },
            },
          );
        },
      });
    },
    [deleteSharepoint, updateField, open],
  );

  const { selectProps: selectPropsSupplier } = useSelect<Suppliers>({
    resource: "app_suppliers",
    optionLabel: "id",
    optionValue: "id",
  });

  const { selectProps: selectPropsPO } = useSelect<PO>({
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
    <Edit
      title="Wareneingang bearbeiten"
      headerProps={{
        title: `Lager - Wareneingang ${record?.inbound_number ?? "--"} bearbeiten`,
        subTitle: (
          <Space>
            {record?.fk_bb_supplier} <ISStatusTag status={record?.status ?? "planned"} />
          </Space>
        ),
      }}
      headerButtons={
        <>
          <InboundPostAndDispatchButton inboundShipmentId={recordIdStr as string} />
          <ShowButton hideText recordItemId={recordIdStr as string} />
          <ListButton hideText />
          <RefreshButton hideText />
        </>
      }
      contentProps={{
        style: { background: "none", padding: "0px" },
      }}
      footerButtons={<SaveButton hidden />}
      saveButtonProps={saveButtonProps}
    >
      <Row gutter={[16, 16]} style={{ padding: 0, margin: 0 }}>
        {/* Desktop: Items links (order 1), Formular rechts (order 2) */}
        {/* Mobile: Formular oben (order -1), Items unten (order 1) */}
        <Col xs={24} lg={6} style={{ order: 2 }} className="mobile-order-first">
          <Card actions={[<SaveButton key="save" {...saveButtonProps} style={{ float: "right", marginRight: 24 }} />]}>
            <Form {...formProps} layout="vertical">
              <Form.Item name="inbound_number" label="Wareneingangsnummer" hidden>
                <Input placeholder="wird automatisch vergeben" disabled />
              </Form.Item>
              <Form.Item name="status" label="Status" required hidden>
                <SelectStateIS disabled={form.getFieldValue("status") === "posted"} />
              </Form.Item>
              <Form.Item name="fk_bb_supplier" label="Lieferant" required hidden>
                <Select {...selectPropsSupplier} />
              </Form.Item>
              <Form.Item name="note" label="Anmerkung">
                <Input.TextArea placeholder="Anmerkung hinterlegen" rows={4} />
              </Form.Item>
              <Form.Item
                name="delivered_at"
                label="Lieferdatum"
                getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
                required
              >
                <DatePicker style={{ width: "100%" }} placeholder="Datum wählen..." format="DD.MM.YYYY" />
              </Form.Item>

              {/* Lieferschein */}
              <Form.Item name="delivery_note_number" label="Lieferscheinnummer" required>
                <Input placeholder="Lieferscheinnummer eingeben" />
              </Form.Item>
              <div style={{ marginBottom: 24, textAlign: "left" }}>
                <label style={{ display: "block", marginBottom: 8 }}>Lieferschein</label>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload
                    beforeUpload={(file) => handleUpload(file as File, "delivery_note_file_url", "Lieferschein", setUploadingDeliveryNote)}
                    showUploadList={false}
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={Boolean(deliveryNoteUrl) || uploadingDeliveryNote || deletingFile === "delivery_note_file_url"}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      loading={uploadingDeliveryNote}
                      disabled={Boolean(deliveryNoteUrl) || deletingFile === "delivery_note_file_url"}
                      size="small"
                    >
                      {deliveryNoteUrl ? "Bereits hochgeladen" : "Datei hochladen"}
                    </Button>
                  </Upload>
                  {deliveryNoteUrl && (
                    <Space>
                      <a href={deliveryNoteUrl} target="_blank" rel="noopener noreferrer">
                        <EyeOutlined style={{ marginRight: 6 }} />
                        Datei öffnen
                      </a>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete("delivery_note_file_url", deliveryNoteUrl)}
                        loading={deletingFile === "delivery_note_file_url"}
                        style={{ padding: 0, height: "auto" }}
                      >
                        Löschen
                      </Button>
                    </Space>
                  )}
                </Space>
                <Form.Item name="delivery_note_file_url" hidden>
                  <Input />
                </Form.Item>
              </div>

              {/* Rechnung */}
              <Form.Item name="invoice_number" label="Rechnungsnummer" required>
                <Input placeholder="Rechnungsnummer eingeben" />
              </Form.Item>
              <div style={{ marginBottom: 24, textAlign: "left" }}>
                <label style={{ display: "block", marginBottom: 8 }}>Rechnung</label>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload
                    beforeUpload={(file) => handleUpload(file as File, "invoice_file_url", "Rechnung", setUploadingInvoice)}
                    showUploadList={false}
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={Boolean(invoiceUrl) || uploadingInvoice || deletingFile === "invoice_file_url"}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      loading={uploadingInvoice}
                      disabled={Boolean(invoiceUrl) || deletingFile === "invoice_file_url"}
                      size="small"
                    >
                      {invoiceUrl ? "Bereits hochgeladen" : "Datei hochladen"}
                    </Button>
                  </Upload>
                  {invoiceUrl && (
                    <Space>
                      <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                        <EyeOutlined style={{ marginRight: 6 }} />
                        Datei öffnen
                      </a>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete("invoice_file_url", invoiceUrl)}
                        loading={deletingFile === "invoice_file_url"}
                        style={{ padding: 0, height: "auto" }}
                      >
                        Löschen
                      </Button>
                    </Space>
                  )}
                </Space>
                <Form.Item name="invoice_file_url" hidden>
                  <Input />
                </Form.Item>
              </div>

              {/* Separate Lieferkosten */}
              <Form.Item name="shipping_cost_invoice_number" label="Rechnungsnummer (Lieferkosten)">
                <Input placeholder="Rechnungsnummer eingeben" style={{ width: "100%" }} />
              </Form.Item>
              <Form.Item name="shipping_cost" label="Lieferkosten">
                <InputNumber placeholder="Betrag" addonAfter="€" step={0.01} style={{ width: "100%" }} />
              </Form.Item>
              <div style={{ marginBottom: 24, textAlign: "left" }}>
                <label style={{ display: "block", marginBottom: 8 }}>Lieferkostenrechnung</label>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload
                    beforeUpload={(file) => handleUpload(file as File, "shipping_cost_invoice_file_url", "Lieferkosten", setUploadingShippingCostInvoice)}
                    showUploadList={false}
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={Boolean(shippingCostInvoiceUrl) || uploadingShippingCostInvoice || deletingFile === "shipping_cost_invoice_file_url"}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      loading={uploadingShippingCostInvoice}
                      disabled={Boolean(shippingCostInvoiceUrl) || deletingFile === "shipping_cost_invoice_file_url"}
                      size="small"
                    >
                      {shippingCostInvoiceUrl ? "Bereits hochgeladen" : "Datei hochladen"}
                    </Button>
                  </Upload>
                  {shippingCostInvoiceUrl && (
                    <Space>
                      <a href={shippingCostInvoiceUrl} target="_blank" rel="noopener noreferrer">
                        <EyeOutlined style={{ marginRight: 6 }} />
                        Datei öffnen
                      </a>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete("shipping_cost_invoice_file_url", shippingCostInvoiceUrl)}
                        loading={deletingFile === "shipping_cost_invoice_file_url"}
                        style={{ padding: 0, height: "auto" }}
                      >
                        Löschen
                      </Button>
                    </Space>
                  )}
                </Space>
                <Form.Item name="shipping_cost_invoice_file_url" hidden>
                  <Input />
                </Form.Item>
              </div>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={18} style={{ order: 1 }} className="mobile-order-second">
          <InboundItems
            inboundShipmentId={recordIdStr as string}
            inboundShipmentStatus={record?.status as "planned" | "delivered" | "posted"}
            inboundShipmentSupplier={record?.fk_bb_supplier as string}
          />
        </Col>
      </Row>

      {/* CSS für Mobile-Reihenfolge */}
      <style jsx global>{`
        @media (max-width: 991px) {
          .mobile-order-first {
            order: -1 !important;
          }
          .mobile-order-second {
            order: 1 !important;
          }
        }
      `}</style>
    </Edit>
  );
}