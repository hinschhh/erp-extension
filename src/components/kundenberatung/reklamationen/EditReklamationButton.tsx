"use client";

import { MenuOutlined } from "@ant-design/icons";
import { useModalForm } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Checkbox, Form, Input, Modal, Select, Switch } from "antd";

type Complaints = Tables<"app_complaints">;


export default function EditReklamationButton<Complaints>({id}: {id: string}) {
    const { formProps: editFormProps, modalProps: editModalProps, show: showEditModal } = useModalForm({
        resource: "app_complaints",
        action: "edit",
        redirect: false,
    });
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
                    <Form.Item
                        label="Betroffene Bestellung"
                        name="order_id"
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        label="Betroffenes Produkt"
                        name="product"
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        label="Titel"
                        name="title"
                    >
                    </Form.Item>
                    <Form.Item
                        label="Extern?"
                        name="external"
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        label="Verantwortung"
                        name="responsibility"
                    >
                        <Select />
                    </Form.Item>                    
                    <Form.Item
                        label="Wobei ist der Fehler aufgetreten?"
                        name="error_occurred"
                    >
                        <Select />
                    </Form.Item>
                    <Form.Item
                        label="Beschreibung"
                        name="description"
                    >
                        <Input.TextArea rows={4} />
                    </Form.Item>
                    <Form.Item label="Lösungswege" name="resolution_paths">
                        <Checkbox.Group>
                            <Checkbox value="refund">Erstattung</Checkbox>
                            <Checkbox value="repair_set">Reparatur-Set</Checkbox>
                            <Checkbox value="exchange">Fliegender Wechsel</Checkbox>
                            <Checkbox value="repair_by_land_und_liebe">Reparatur bei uns</Checkbox>
                            <Checkbox value="return">Rücksendung</Checkbox>
                            <Checkbox value="other">Sonstiges</Checkbox>
                        </Checkbox.Group>
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
}