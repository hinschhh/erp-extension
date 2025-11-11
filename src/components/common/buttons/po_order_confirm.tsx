"use client";

import React, { useState } from "react";
import { Button, Checkbox, DatePicker, Form, message, Modal, Tooltip, Upload } from "antd";
import type { UploadFile, RcFile } from "antd/es/upload/interface";
import { useOne, useInvalidate } from "@refinedev/core";
import dayjs, { Dayjs } from "dayjs";
import {
  CheckCircleOutlined,
  SendOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import { Tables } from "@/types/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useModalForm } from "@refinedev/antd";
import { useInitialValue } from "@dnd-kit/core/dist/hooks/utilities";

type PurchaseOrder = Tables<"app_purchase_orders">;
type Props = { orderId: string; onSuccess?: () => void };

export default function OrderStatusActionButton({ orderId, onSuccess }: Props) {
  const supabase = supabaseBrowserClient;
  const invalidate = useInvalidate();

  const [submitting, setSubmitting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile<RcFile>[]>([]);

  const { data, isLoading, refetch } = useOne<PurchaseOrder>({
    resource: "app_purchase_orders",
    id: orderId,
    meta: { select: "id,status,proforma_confirmed_at,supplier" },
  });

  const status = data?.data?.status;
  const confirmedAt = data?.data?.proforma_confirmed_at;
  const supplier = data?.data?.supplier; // für Metadaten beim Upload

  /** Speichert DoL und setzt Status über RPC. Upload wird vor dem RPC erledigt. */
  const runAction = async (
  nextStatus: "ordered" | "confirmed",
  opts?: { dolPlannedAt?: Dayjs | null; invoiceFile?: File | null; isPaid?: boolean;}
) => {
  try {
    setSubmitting(true);

    // 1) Optional: Datei nach Dropbox hochladen (vor Statuswechsel)
    if (opts?.invoiceFile) {
      const fd = new FormData();
      fd.append("file", opts.invoiceFile as Blob);

      fd.append("orderId", orderId);
      if (supplier) {
        fd.append("supplier", String(supplier));
      }
      fd.append("context", "purchase_order_invoice");

      if (typeof opts.isPaid === "boolean") {
        fd.append("is_paid", String(opts.isPaid)); // "true" / "false"
      }

      const res = await fetch("/api/n8n/invoice_upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text();
        message.error(
          `Upload fehlgeschlagen: ${txt || res.statusText || "Unbekannter Fehler"}`
        );
        return; // kein Statuswechsel, wenn Upload nicht klappt
      }

      const json = await res.json().catch(() => ({}));
      if (json?.targetPath) {
        message.success(`Rechnung in Dropbox gespeichert: ${json.targetPath}`);
      }
    }

      // 2) DoL nur bei confirmed mitschicken
    const dolForRpc =
      nextStatus === "confirmed" && opts?.dolPlannedAt
        ? dayjs(opts.dolPlannedAt).format("YYYY-MM-DD")
        : undefined;

    // Optionaler Guard – kannst du lassen, weil das Form es eigentlich schon abfängt
    if (nextStatus === "confirmed" && !dolForRpc) {
      message.error("Bitte ein erwartetes DoL angeben.");
      return;
    }

    // Payload so bauen, dass p_dol_planned_at nur existiert, wenn wir einen Wert haben
    const payload: {
      p_order_id: string;
      p_status: "ordered" | "confirmed";
      p_dol_planned_at?: string;
    } = {
      p_order_id: orderId,
      p_status: nextStatus,
      ...(dolForRpc ? { p_dol_planned_at: dolForRpc } : {}),
    };

    console.log("Calling RPC rpc_po_items_set_status_for_order", payload);

    const { data, error } = await supabase.rpc(
      "rpc_po_items_set_status_for_order",
      payload as any
    );

    console.log("RPC result", { data, error });

    if (error) {
      message.error(error.message || "Aktion fehlgeschlagen");
      return;
    }

    message.success(
      nextStatus === "ordered"
        ? "Bestellung übermittelt."
        : "Bestellung bestätigt."
    );

    // 4) Re-Read + Cache invalidieren
    await refetch();

    await Promise.all([
      invalidate({
        resource: "app_purchase_orders",
        id: orderId,
        invalidates: ["detail", "list", "many"],
      }),
      invalidate({
        resource: "app_purchase_orders_positions_normal",
        invalidates: ["list", "many"],
      }),
      invalidate({
        resource: "app_purchase_orders_positions_special",
        invalidates: ["list", "many"],
      }),
    ]);

    onSuccess?.();
  } finally {
    setSubmitting(false);
  }
};


  const {
    formProps: formPropsSubmitOrder,
    modalProps: modalPropsSubmitOrder,
    show: showModalSubmitOrder,
  } = useModalForm<PurchaseOrder>({
    action: "edit",
    resource: "app_purchase_orders",
    id: orderId,
    redirect: false,
  });

  /** AntD Upload Normalizer für Form.Item */
  const normFile = (e: any) => {
    if (Array.isArray(e)) return e;
    return e?.fileList;
  };

  /** beforeUpload: Upload NICHT automatisch, sondern Datei im State halten */
  const beforeUpload: any = (file: RcFile) => {
    setFileList([
      {
        uid: String(Date.now()),
        name: file.name,
        status: "done",
        originFileObj: file,
      },
    ]);
    return false; // verhindert Auto-Upload durch AntD
  };

  /** Form-Submit: DoL + Datei an runAction übergeben */
  const handleFinish = async (values: any) => {
    const dolPlannedAt: Dayjs | null = values?.dol_planned_at ?? null;
    const file = fileList[0]?.originFileObj as File | undefined;

    const isPaid: boolean = !!values?.is_paid;

    await runAction("confirmed", {
      dolPlannedAt,
      invoiceFile: file ?? null,
      isPaid,
    });

    // Modal schließen, Liste zurücksetzen
    setFileList([]);
    modalPropsSubmitOrder?.onCancel?.({} as any);
  };

  if (isLoading) {
    return <Button loading>Loading...</Button>;
  }

  if (status === "draft") {
    return (
      <Tooltip title="Bestellung übermitteln">
        <Button
          icon={<SendOutlined />}
          loading={submitting}
          onClick={() => runAction("ordered")}
        >
          Bestellung übermitteln
        </Button>
      </Tooltip>
    );
  }

  if (status === "ordered") {
    return (
      <>
        <Tooltip title="Bestellung bestätigen (neu)">
          <Button
            icon={<CheckCircleOutlined />}
            loading={submitting}
            onClick={() => showModalSubmitOrder()}
          >
            Bestellung bestätigen (neu)
          </Button>
        </Tooltip>

        <Modal
          {...modalPropsSubmitOrder}
          title="Bestellung bestätigen"
          destroyOnClose
          okButtonProps={{ style: { display: "none" } }} // wir nutzen den Form-Button
        >
          <Form
            {...formPropsSubmitOrder}
            layout="vertical"
            initialValues={{
            // Alle bisherigen Initialwerte von refine übernehmen
            ...formPropsSubmitOrder.initialValues,
            // Und DANN unseren Standard setzen, falls noch nichts da ist
            dol_planned_at:
              formPropsSubmitOrder.initialValues?.dol_planned_at ??
              dayjs().add(7, "day"),
          }}
            onFinish={handleFinish}
          >
            <p>
              Möchten Sie diese Bestellung wirklich bestätigen? Dies kann nicht
              rückgängig gemacht werden.
            </p>

            <Form.Item
              label="Erwartetes DoL"
              name="dol_planned_at"
              rules={[{ required: true, message: "Bitte DoL setzen" }]}
            >
              <DatePicker format={"DD.MM.YYYY"} placeholder="Datum wählen..." />
            </Form.Item>

            <Form.Item
              label="Rechnung hochladen"
              name="invoice_upload"
              valuePropName="fileList"
              getValueFromEvent={normFile}
            >
              <Upload.Dragger
                multiple={false}
                fileList={fileList}
                beforeUpload={beforeUpload}
                onRemove={() => setFileList([])}
                maxCount={1}
                showUploadList
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">
                  Rechnung hierher ziehen oder klicken
                </p>
                <p className="ant-upload-hint">
                  Eine Datei (PDF, Bild, etc.).
                </p>
              </Upload.Dragger>
            </Form.Item>
            <Form.Item name="is_paid" valuePropName="checked">
              <Checkbox>
                Bestellung ist bezahlt!
              </Checkbox>
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={submitting}
                block
              >
                Bestätigung speichern
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  return (
    <Tooltip
      title={`Keine Sammelaktion verfügbar. Bestellung bereits bestätigt am ${dayjs(
        confirmedAt
      ).format("DD.MM.YYYY")}`}
    >
      <Button icon={<CheckCircleOutlined />} disabled>
        Bestellung bestätigt
      </Button>
    </Tooltip>
  );
}
