// src/app/(authenticated)/einkauf/bestellungen/bearbeiten/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { useCustomMutation, useInvalidate, useNotification, useUpdate } from "@refinedev/core";
import { useForm, Edit, RefreshButton, ListButton, SaveButton, ShowButton } from "@refinedev/antd";

import { Button, Card, Checkbox, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Space, Tooltip, Upload, message } from "antd";
import { UploadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";

import dayjs from "dayjs";
import { Tables } from "@/types/supabase";
import SelectSupplier from "@components/common/selects/supplier";
import { parseNumber } from "@/utils/formats";
import EinkaufBestellpositionenNormalBearbeiten from "@components/einkauf/bestellungen/positionen/normal";
import EinkaufBestellpositionenSpecialBearbeiten from "@components/einkauf/bestellungen/positionen/special";
import { PoStatusTag } from "@components/common/tags/states/po";

type Po = Tables<"app_purchase_orders">;

export default function EinkaufsBestellungenBearbeiten() {
  const params = useParams() as { id: string };
  const orderId = params?.id;
  const orderIdStr = orderId?.toString();

  const invalidate = useInvalidate();
  const { open } = useNotification();

  const { formProps: formPropsHeader, saveButtonProps, queryResult } = useForm<Po>({
    resource: "app_purchase_orders",
    id: orderId,
    meta: {
      select: "*, supplier_rel:app_suppliers!app_purchase_orders_supplier_fkey(id)",
    },
    redirect: false,
  });

  // Datensatz aus dem Query (immer die beste Quelle für "aktuelle Wahrheit")
  const record = queryResult?.data?.data;
  const status = record?.status ?? "draft";

  const supplier = Form.useWatch("supplier", formPropsHeader.form);

  // Locks
  const costs = Number(record?.shipping_cost_net ?? 0);
  const isLocked = Boolean(record?.separate_invoice_for_shipping_cost) || costs > 0;

  // Form aktualisieren, wenn record neu geladen wurde
  useEffect(() => {
    if (record) {
      formPropsHeader.form?.setFieldsValue(record as any);
    }
  }, [record, formPropsHeader.form]);

  // -------- SharePoint: Upload/Delete über useCustomMutation --------
  const { mutate: uploadSharepoint, isPending: isUploadingConfirmation } = useCustomMutation();
  const { mutate: deleteSharepoint, isPending: isDeletingConfirmation } = useCustomMutation();

  // DB Update über Refine (nicht direkt Supabase-Client)
  const { mutate: updateOrderFieldMutate } = useUpdate<Po>();

  const refreshOrder = useCallback(() => {
    if (!orderIdStr) return;

    invalidate({
      resource: "app_purchase_orders",
      invalidates: ["detail"],
      id: orderIdStr,
    });

    queryResult?.refetch?.();
  }, [invalidate, orderIdStr, queryResult]);

  const updateOrderField = useCallback(
    (fieldName: keyof Po, value: any) => {
      if (!orderIdStr) return;

      updateOrderFieldMutate(
        {
          resource: "app_purchase_orders",
          id: orderIdStr,
          values: { [fieldName]: value } as any,
          successNotification: false,
          errorNotification: false,
        },
        {
          onSuccess: () => {
            // UI sofort aktualisieren
            formPropsHeader.form?.setFieldValue(fieldName as string, value);
            refreshOrder();
          },
          onError: (e: any) => {
            open?.({
              type: "error",
              message: "Speichern fehlgeschlagen",
              description: e?.message ?? "Unbekannter Fehler",
            });
          },
        },
      );
    },
    [formPropsHeader.form, open, orderIdStr, refreshOrder, updateOrderFieldMutate],
  );

  // Quelle für URL: record (truth) + fallback Form (für instant UI)
  const confirmationUrl = useMemo(() => {
    return (
      record?.confirmation_file_url ??
      formPropsHeader.form?.getFieldValue("confirmation_file_url") ??
      null
    );
  }, [record?.confirmation_file_url, formPropsHeader.form]);

  const buildOrderFolder = useCallback(() => {
    const orderNumber =
      formPropsHeader.form?.getFieldValue("order_number") ??
      record?.order_number ??
      "temp";

    // Passe das an deinen SharePoint-API Vertrag an:
    // - subfolder: relativ innerhalb basePath
    // - basePath: oberster Ordner
    return {
      subfolder: `Bestellungen/${orderNumber}`,
      basePath: "00 Web-App/Einkauf",
    };
  }, [formPropsHeader.form, record?.order_number]);

  const handleUploadConfirmation = useCallback(
    (file: File) => {
      const { subfolder, basePath } = buildOrderFolder();

      const fd = new FormData();
      fd.append("file", file);
      fd.append("subfolder", subfolder);
      fd.append("prefix", "Auftragsbestaetigung");
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
              return;
            }

            updateOrderField("confirmation_file_url", fileUrl);

            open?.({
              type: "success",
              message: "Auftragsbestätigung hochgeladen",
            });
          },
          onError: (e: any) => {
            open?.({
              type: "error",
              message: "Upload fehlgeschlagen",
              description: e?.message ?? "Unbekannter Fehler",
            });
          },
        },
      );

      // Wichtig: verhindert AntD Auto-Upload
      return false;
    },
    [buildOrderFolder, open, updateOrderField, uploadSharepoint],
  );

  const handleDeleteConfirmation = useCallback(() => {
    const url = confirmationUrl as string | null;
    if (!url) return;

    const { subfolder, basePath } = buildOrderFolder();
    const fileName = decodeURIComponent(url.split("/").pop() || "");

    Modal.confirm({
      title: "Datei löschen",
      content: "Möchten Sie diese Datei wirklich löschen? Danach können Sie eine neue Datei hochladen.",
      okText: "Löschen",
      okType: "danger",
      cancelText: "Abbrechen",
      onOk: () => {
        deleteSharepoint(
          {
            url: "/api/sharepoint/delete",
            method: "delete",
            values: {
              fileUrl: confirmationUrl,
            },
            successNotification: false,
            errorNotification: false,
          },
          {
            onSuccess: () => {
              updateOrderField("confirmation_file_url", null);
              open?.({ type: "success", message: "Datei gelöscht" });
            },
            onError: (e: any) => {
              open?.({
                type: "error",
                message: "Löschen fehlgeschlagen",
                description: e?.message ?? "Unbekannter Fehler",
              });
            },
          },
        );
      },
    });
  }, [confirmationUrl, buildOrderFolder, deleteSharepoint, updateOrderField, open]);

  return (
    <Edit
      title={`Einkauf - Bestellung ${record?.order_number} bearbeiten`}
      headerProps={{
        title: `Einkauf - Bestellung ${record?.order_number ?? "--"} bearbeiten`,
        subTitle: (
          <Space>
            {record?.supplier} <PoStatusTag status={record?.status ?? "--"} />
          </Space>
        ),
      }}
      contentProps={{
        style: { background: "none", padding: "0px" },
      }}
      headerButtons={
        <>
          <ShowButton resource="app_purchase_orders" hideText recordItemId={orderIdStr as string} />
          <ListButton hideText />
          <RefreshButton hideText />
        </>
      }
      footerButtons={<SaveButton hidden />}>
      <Row gutter={16} style={{ padding: 0, margin: 0 }}>
        <Col span={18} style={{ paddingRight: 8, margin: 0 }}>
          <EinkaufBestellpositionenNormalBearbeiten
            orderId={orderIdStr as string}
            supplier={supplier as string}
            status={status as string}
          />
          <EinkaufBestellpositionenSpecialBearbeiten
            orderId={orderIdStr as string}
            supplier={supplier as string}
            status={status as string}
          />
        </Col>

        <Col span={6} style={{ textAlign: "right" }}>
          <Card
            actions={[<SaveButton key="save" {...saveButtonProps} style={{ float: "right", marginRight: 24 }} />]}
          >
            <Form {...formPropsHeader} layout="vertical" id="edit-po-header-form">
              <Form.Item label="ID" name="id" hidden>
                <Input disabled />
              </Form.Item>

              <Form.Item
                label="Versandkosten netto"
                name="shipping_cost_net"
                normalize={parseNumber}
                style={{ marginBottom: 24, textAlign: "left" }}
              >
                <InputNumber type="number" disabled={isLocked} addonAfter="€" />
              </Form.Item>

              <Form.Item
                name="separate_invoice_for_shipping_cost"
                valuePropName="checked"
                style={{ marginBottom: 24, textAlign: "left" }}
              >
                <Checkbox
                  onChange={() => {
                    if (costs > 0) {
                      message.warning("Nicht änderbar: Es sind bereits Versandkosten gebucht.");
                      formPropsHeader.form?.setFieldValue(
                        "separate_invoice_for_shipping_cost",
                        record?.separate_invoice_for_shipping_cost ?? false,
                      );
                    }
                  }}
                >
                  Versandkosten separat abrechnen?
                </Checkbox>
              </Form.Item>

              <Form.Item label="Anmerkungen" name="notes">
                <Input.TextArea rows={5} />
              </Form.Item>

              <Form.Item
                label="Bestelldatum"
                name="ordered_at"
                getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
              >
                <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item label="Bestätigungsnummer" name="confirmation_number">
                <Input />
              </Form.Item>

              <Form.Item
                label="Bestätigungsdatum"
                name="confirmed_at"
                getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
              >
                <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
              </Form.Item>

              {/* ---------------- Datei: Ansehen / Löschen / Neu hochladen ---------------- */}
              <div style={{ marginBottom: 24, textAlign: "left" }}>
                <label style={{ display: "block", marginBottom: 8 }}>Auftragsbestätigung</label>

                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload
                    beforeUpload={(file) => handleUploadConfirmation(file as File)}
                    showUploadList={false}
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={Boolean(confirmationUrl) || isUploadingConfirmation || isDeletingConfirmation}
                  >
                    <Button
                      icon={<UploadOutlined />}
                      loading={isUploadingConfirmation}
                      disabled={Boolean(confirmationUrl) || isDeletingConfirmation}
                      size="small"
                    >
                      {confirmationUrl ? "Bereits hochgeladen" : "Datei hochladen"}
                    </Button>
                  </Upload>

                  {confirmationUrl && (
                    <Space>
                      <a href={confirmationUrl} target="_blank" rel="noopener noreferrer">
                        <EyeOutlined style={{ marginRight: 6 }} />
                        Datei öffnen
                      </a>

                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleDeleteConfirmation}
                        loading={isDeletingConfirmation}
                        style={{ padding: 0, height: "auto" }}
                      >
                        Löschen
                      </Button>
                    </Space>
                  )}
                </Space>

                {/* hidden field damit Form/DB konsistent bleibt */}
                <Form.Item name="confirmation_file_url" hidden>
                  <Input />
                </Form.Item>
              </div>

              <Form.Item
                label="DOL geplant"
                name="dol_planned_at"
                getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
              >
                <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
              </Form.Item>

            </Form>
          </Card>
        </Col>
      </Row>
    </Edit>
  );
}
