"use client";

import { PlusOutlined } from "@ant-design/icons";
import { useModalForm } from "@refinedev/antd";
import { useModal } from "@refinedev/core";
import { Button, Form, Input, Modal, Select } from "antd";

export default function AddReklamationButton({ onAddClick, id }: { onAddClick?: (args: { id: string }) => void, id: string }) {

    const {formProps: createFormProps, modalProps: createModalProps, show: createModalShow} = useModalForm({
        resource: "app_complaints",
        action: "create",
        redirect: false,
    });

    

    return (
        <>
            <Button 
                size="small" 
                shape="circle"
                icon={<PlusOutlined />}
                onClick={() => { createModalShow() }}
            />
            <Modal {...createModalProps} title="Reklamation hinzufügen" >
                <Form {...createFormProps} layout="vertical"> 
                    <Form.Item
                        label="Betroffene Bestellung"
                        name="order_id"
                        initialValue={id}
                    >
                        <Select />
                    </Form.Item>
                    <Form.Item
                        label="Betroffenes Produkt"
                        name="product"
                        initialValue={id}
                    >
                        <Select />
                    </Form.Item>

                    <Form.Item
                        label="Titel"
                        name="title"
                    >
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}