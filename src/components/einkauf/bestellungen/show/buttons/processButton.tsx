"use client";

import { useModalForm } from "@refinedev/antd";
import { Button, DatePicker, Form, Input, Modal, Tooltip, Upload } from "antd";
import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, SendOutlined, UploadOutlined } from "@ant-design/icons";
import { PurchaseOrder } from "@app/(authenticated)/einkauf/bestellungen/[id]/page";
import { useCustomMutation, useNotification, useUpdateMany, useUpdate } from "@refinedev/core";
import { useState } from "react";
import type { UploadFile } from "antd/es/upload/interface";
import dayjs from "dayjs";

export default function ProcessButton({order}: {order?: PurchaseOrder}) {
  const itemsNormal = order?.app_purchase_orders_positions_normal;
  const idsItemsNormal = itemsNormal?.map((item) => item.id) || [];
  const itemsSpecial = order?.app_purchase_orders_positions_special;
  const idsItemsSpecial = itemsSpecial?.map((item) => item.id) || [];

  const [confirmationFileList, setConfirmationFileList] = useState<UploadFile[]>([]);

  const { open } = useNotification();
  const { mutate: uploadSharepoint, isPending: isUploading } = useCustomMutation();

  const buildOrderFolder = () => {
    const orderNumber = order?.order_number ?? "PO-Unbekannt";
    return {
      subfolder: `Bestellungen/${orderNumber}`,
      basePath: "00 Web-App/Einkauf",
    };
  };

  const { mutate: mutateOrder, isPending: isUpdatingOrder } = useUpdate({
    resource: "app_purchase_orders",
    id: order?.id,
    successNotification: false,
  });

  const { mutate: mutateNormal, isPending: isLoadingNormal } = useUpdateMany({
    resource: "app_purchase_orders_positions_normal",
    ids: idsItemsNormal,
    successNotification: false,
  });

  const { mutate: mutateSpecial, isPending: isLoadingSpecial } = useUpdateMany({
    resource: "app_purchase_orders_positions_special",
    ids: idsItemsSpecial,
    successNotification: false,
  });

  const handleSubmitOrder = () => {
    mutateOrder({ id: order?.id as string, values: { status: "ordered", ordered_at: new Date().toISOString() } });
    mutateNormal({ ids: idsItemsNormal, values: { po_item_status: "ordered" } });
    mutateSpecial({ ids: idsItemsSpecial, values: { po_item_status: "ordered" } });
  };

  const handleConfirmOrder = () => {
    mutateOrder({ id: order?.id as string, values: { status: "confirmed", confirmed_at: new Date().toISOString() } });
    mutateNormal({ ids: idsItemsNormal, values: { po_item_status: "confirmed", confirmed_at: new Date().toISOString(), dol_planned_at: editConfirmationFormProps?.initialValues?.dol_planned_at } });
    mutateSpecial({ ids: idsItemsSpecial, values: { po_item_status: "confirmed", confirmed_at: new Date().toISOString(), dol_planned_at: editConfirmationFormProps?.initialValues?.dol_planned_at } });
  };

  const {
    modalProps: editConfirmationModalProps,
    formProps: editConfirmationFormProps,
    show: editConfirmationModalShow,
  } = useModalForm({
    resource: "app_purchase_orders",
    action: "edit",
    warnWhenUnsavedChanges: true,
    redirect: false,
  });

  const onFinishConfirmation = async (values: any) => {
    // 1) Datei holen
    const fileObj = confirmationFileList?.[0]?.originFileObj as File | undefined;

    // Wenn Datei Pflicht sein soll:
    if (!fileObj && !editConfirmationFormProps?.initialValues?.confirmation_file_url) {
      open?.({ type: "error", message: "Bitte Auftragsbestätigung auswählen." });
      return;
    }

    // 2) Wenn neue Datei gewählt wurde: Upload
    const uploadIfNeeded = () =>
      new Promise<string>((resolve, reject) => {
        if (!fileObj) {
          // keine neue Datei -> vorhandenen Link nutzen
          resolve(values.confirmation_file_url ?? editConfirmationFormProps?.initialValues?.confirmation_file_url);
          return;
        }

        const { subfolder, basePath } = buildOrderFolder();

        const fd = new FormData();
        fd.append("file", fileObj);
        fd.append("subfolder", subfolder);
        fd.append("prefix", "Auftragsbestaetigung");
        fd.append("basePath", basePath);

        uploadSharepoint(
          { url: "/api/sharepoint/upload", method: "post", values: fd, successNotification: false, errorNotification: false },
          {
            onSuccess: ({ data }) => resolve(data.fileUrl),
            onError: (e: any) => reject(e),
          },
        );
      });

    try {
      const fileUrl = await uploadIfNeeded();

      // 3) URL ins Form/values setzen
      editConfirmationFormProps.form?.setFieldsValue({ confirmation_file_url: fileUrl });
      values.confirmation_file_url = fileUrl;

      console.log("Werte zum Speichern der Bestellung:", values);
      // 4) Order speichern (wichtig!)
      await editConfirmationFormProps.onFinish?.(values);

      // 5) Danach Positionsstatus bestätigen
      handleConfirmOrder();

      open?.({ type: "success", message: "Bestellung bestätigt." });
      editConfirmationModalProps.onCancel?.(undefined as any);
    } catch (e: any) {
      open?.({
        type: "error",
        message: "Fehler",
        description: e?.message ?? "Upload oder Speichern fehlgeschlagen.",
      });
    }
  };

  return (order?.status === "draft") ? (
    <Button type="primary" onClick={() => handleSubmitOrder()} icon={<SendOutlined />} loading={isLoadingNormal || isLoadingSpecial}>Bestellung übermitteln</Button>
  ) : (order?.status === "ordered") ? (
    <>
      <Button type="primary" onClick={() => editConfirmationModalShow(order?.id as string)} icon={<CheckCircleOutlined />}>Bestellung bestätigen</Button>
      <Modal {...editConfirmationModalProps} title="Bestellung bestätigen" width={600} okText="Bestätigen" cancelText="Abbrechen" >
        <Form {...editConfirmationFormProps} layout="vertical" onFinish={onFinishConfirmation}>
          <Form.Item label="Möchten Sie die Bestellung wirklich bestätigen?" required>
            <div style={{ marginBottom: 24, textAlign: "left" }}>
                <label style={{ display: "block", marginBottom: 8 }}>Auftragsbestätigung hochladen</label>
                  <Upload
                    beforeUpload={() => false}
                    fileList={confirmationFileList}
                    onChange={({fileList}) => setConfirmationFileList(fileList)}
                    maxCount={1}
                    showUploadList={true}
                    accept=".pdf,.jpg,.jpeg,.png"
                    disabled={!!editConfirmationFormProps?.initialValues?.confirmation_file_url}
                  >
                    <Button 
                      icon={<UploadOutlined />} 
                      loading={isUploading}
                      disabled={!!editConfirmationFormProps?.initialValues?.confirmation_file_url}
                      size="small"
                    >
                      {"Klicken zum Hochladen"}
                    </Button>
                  </Upload>
                  <Form.Item name="confirmation_file_url" hidden required>
                    <Input />
                  </Form.Item>
                </div>          
          </Form.Item>
        <Form.Item label="Auftragsbestätigungsnummer" name="confirmation_number" rules={[{ required: true, message: "Bitte Auftragsbestätigungsnummer eingeben." }]}>
            <Input/>
        </Form.Item>
        <Form.Item label="DOL geplant" name="dol_planned_at" rules={[{ required: true, message: "Bitte geplantes DOL-Datum eingeben." }]}>
            <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
        </Form.Item>
        </Form>
      </Modal>
    </>
  ) : <Tooltip title={`Bereits am ${dayjs(
          order?.confirmed_at
        ).format("DD.MM.YYYY")} bestätigt`}><Button disabled>keine Sammelaktion verfügbar</Button></Tooltip>;
}