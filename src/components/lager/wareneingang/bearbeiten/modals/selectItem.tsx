"use client";

import { BarcodeOutlined } from "@ant-design/icons";
import { Button, Form, Modal } from "antd";
import { useModalForm } from "@refinedev/antd";

export default function SelectISItemModal() {
      const { formProps, modalProps, show } = useModalForm({
            action: "create",
            resource: "app_purchase_orders_positions_normal",
            redirect: false,
        });
  return (
    <>
        <Button disabled onClick={() => { show() }} icon={<BarcodeOutlined />}>Artikel wählen</Button>
        <Modal {...modalProps}>
            <Form {...formProps} layout="vertical">
                <p>Artikel auswählen Modal Inhalt</p>
            </Form>
        </Modal>
    </>
    );
}