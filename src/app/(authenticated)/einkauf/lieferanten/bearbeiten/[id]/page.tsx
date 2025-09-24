"use client";
import { Edit, useForm } from "@refinedev/antd";
import { useList, useCreate, useUpdate, useDelete } from "@refinedev/core";
import { Form, Input, InputNumber, Switch, Tabs, Table, Button, Drawer } from "antd";
import { useParams } from "next/navigation";
import { useState } from "react";

type Contact = { id:string; contact_name:string; role_title?:string|null; email?:string|null; phone?:string|null; is_default:boolean; };

export default function SupplierEditPage() {
  const { id } = useParams<{id:string}>();

  const { formProps, saveButtonProps } = useForm({
    resource: "app_suppliers", id, redirect:false,
  });

  // Kontakte
  const contacts = useList<Contact>({ resource:"app_supplier_contacts", filters:[{field:"supplier_id",operator:"eq",value:id}] });
  const { mutate: createContact } = useCreate(); const { mutate: updateContact } = useUpdate(); const { mutate: deleteContact } = useDelete();
  // Banken

  const [cOpen,setCOpen]=useState(false);
  const [editingContact,setEditingContact]=useState<Contact|undefined>();
  return (
    <Edit title="Lieferant bearbeiten" saveButtonProps={saveButtonProps}>
      <Tabs
        items={[
          {
            key:"base", label:"Stammdaten",
            children: (
              <Form layout="vertical" {...formProps}>
                <Form.Item label="Name" name="name" rules={[{required:true}]}><Input/></Form.Item>
                <Form.Item label="Kürzel" name="short_code"><Input maxLength={10}/></Form.Item>
                <Form.Item label="E-Mail" name="email"><Input type="email"/></Form.Item>
                <Form.Item label="Telefon" name="phone"><Input/></Form.Item>
                <Form.Item label="Standard-Währung" name="default_currency"><Input/></Form.Item>
                <Form.Item label="Zahlungsziel (Tage)" name="payment_terms_days"><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
                <Form.Item label="Standard-Lieferzeit (Tage)" name="default_leadtime_days"><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
                <Form.Item label="Aktiv" name="active" valuePropName="checked"><Switch/></Form.Item>
              </Form>
            )
          },
          {
            key:"contacts", label:"Kontakte",
            children: (
              <>
                <Button type="dashed" onClick={()=>{setEditingContact(undefined);setCOpen(true);}}>+ Kontakt</Button>
                <Table
                  rowKey="id"
                  dataSource={contacts.data?.data}
                  loading={contacts.isLoading}
                  style={{marginTop:12}}
                >
                  <Table.Column dataIndex="contact_name" title="Name"/>
                  <Table.Column dataIndex="role_title" title="Rolle"/>
                  <Table.Column dataIndex="email" title="E-Mail"/>
                  <Table.Column dataIndex="phone" title="Telefon"/>
                  <Table.Column dataIndex="is_default" title="Standard" render={(v:boolean)=> v?"Ja":"—"}/>
                  <Table.Column title="Aktionen" render={(_,r:Contact)=>
                    <>
                      <Button size="small" onClick={()=>{setEditingContact(r);setCOpen(true);}}>Bearbeiten</Button>
                      <Button size="small" danger style={{marginLeft:8}} onClick={()=>deleteContact({resource:"app_supplier_contacts",id:r.id},{onSuccess:()=>contacts.refetch()})}>Löschen</Button>
                    </>
                  }/>
                </Table>
                <Drawer open={cOpen} onClose={()=>setCOpen(false)} width={420} title={editingContact?"Kontakt bearbeiten":"Kontakt anlegen"}>
                  <Form layout="vertical"
                    onFinish={(values)=>{
                      if (editingContact) {
                        updateContact({ resource:"app_supplier_contacts", id:editingContact.id, values }, { onSuccess:()=>{setCOpen(false);contacts.refetch();} });
                      } else {
                        createContact({ resource:"app_supplier_contacts", values:{...values, supplier_id:id} }, { onSuccess:()=>{setCOpen(false);contacts.refetch();} });
                      }
                    }}
                    initialValues={editingContact}
                  >
                    <Form.Item label="Name" name="contact_name" rules={[{required:true}]}><Input/></Form.Item>
                    <Form.Item label="Rolle" name="role_title"><Input/></Form.Item>
                    <Form.Item label="E-Mail" name="email"><Input type="email"/></Form.Item>
                    <Form.Item label="Telefon" name="phone"><Input/></Form.Item>
                    <Form.Item label="Als Standard markieren" name="is_default" valuePropName="checked"><Switch/></Form.Item>
                    <Button htmlType="submit" type="primary">Speichern</Button>
                  </Form>
                </Drawer>
              </>
            )
          },
        ]}
      />
    </Edit>
  );
}
