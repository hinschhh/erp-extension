"use client";
import { Edit, useForm, NumberField, DateField } from "@refinedev/antd";
import { useList, useCreate, useUpdate, useDelete, useCreateMany } from "@refinedev/core";
import { Tabs, Form, Input, DatePicker, InputNumber, Table, Button, Space, Modal, Drawer, Tag } from "antd";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import dayjs from "dayjs";

type Pos = { id:string; order_id:string; item_name:string; supplier_sku?:string|null; item_type?:string|null; qty_ordered:number; qty_received:number; unit_price_net:number; row_total_net:number; status:string; delivered_at?:string|null; billbee_product_id?:number|null; };
type Payment = { id:string; order_id:string; paid_at:string; amount:number; method?:string|null; note?:string|null; };
type Po = { id:string; order_number:string; ordered_at:string; dol_planned_at?:string|null; amount_net_total:number; amount_paid:number; shipping_cost_net:number; status:string; notes?:string|null; };

export default function PurchaseOrderEditPage() {
  const { id } = useParams<{id:string}>();

  // Kopf
  const { formProps, saveButtonProps, query } = useForm<Po>({
    resource:"app_purchase_orders", id, redirect:false,
  });

  // Positionen
  const pList = useList<Pos>({ resource:"app_purchase_orders_positions", filters:[{field:"order_id",operator:"eq",value:id}], pagination:{pageSize:50}, sorters:[{field:"created_at",order:"asc"}] });
  const { mutate: createPos } = useCreate(); const { mutate: updatePos } = useUpdate(); const { mutate: deletePos } = useDelete(); const { mutate: createMany } = useCreateMany();

  // Zahlungen
  const payList = useList<Payment>({ resource:"app_purchase_order_payments", filters:[{field:"order_id",operator:"eq",value:id}], pagination:{pageSize:50} });
  const { mutate: createPay } = useCreate(); const { mutate: deletePay } = useDelete();

  // Position Add/Edit Modal
  const [posOpen,setPosOpen]=useState(false); const [editing,setEditing]=useState<Partial<Pos>|undefined>();
  const openNew = ()=>{ setEditing({ qty_ordered:1, unit_price_net:0, item_name:"Neue Position" } as any); setPosOpen(true); };
  const openEdit = (r:Pos)=>{ setEditing(r); setPosOpen(true); };

  // Date transform
  const onFinishHead = async (values:any) => {
    const fmt = (d:any)=> d ? dayjs(d).format("YYYY-MM-DD") : null;
    await formProps.onFinish?.({ ...values, dol_planned_at: fmt(values.dol_planned_at) });
  };

  // Payment Drawer
  const [payOpen,setPayOpen]=useState(false);

  const po = query?.data?.data;

  return (
    <Edit title={`Bestellung #${po?.order_number ?? ""}`} saveButtonProps={saveButtonProps}>
      <Tabs
        items={[
          {
            key:"overview", label:"Übersicht",
            children: (
              <Form layout="vertical" {...formProps} onFinish={onFinishHead}>
                <Form.Item label="Bestellnummer" name="order_number" rules={[{required:true}]}><Input/></Form.Item>
                <Form.Item label="SOLL DoL" name="dol_planned_at"><DatePicker style={{width:"100%"}}/></Form.Item>
                <Form.Item label="Versandkosten (netto)" name="shipping_cost_net"><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
                <Form.Item label="Notizen" name="notes"><Input.TextArea rows={3}/></Form.Item>

                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginTop:12}}>
                  <div><strong>Netto Gesamt</strong><div><NumberField value={po?.amount_net_total ?? 0} options={{style:"currency",currency:"EUR"}}/></div></div>
                  <div><strong>Bezahlt</strong><div><NumberField value={po?.amount_paid ?? 0} options={{style:"currency",currency:"EUR"}}/></div></div>
                  <div><strong>Status</strong><div><Tag>{po?.status}</Tag></div></div>
                </div>
              </Form>
            )
          },
          {
            key:"positions", label:"Positionen",
            children: (
              <>
                <Space style={{marginBottom:12}}>
                  <Button type="dashed" onClick={openNew}>+ Position</Button>
                  <Button onClick={()=>{
                    // Quick: alle offenen Positionen auf voll erhalten buchen (Demo)
                    Modal.confirm({ title:"Alle Positionen als vollständig erhalten buchen?", onOk: async ()=>{
                      // batch update: (einfach der Reihe nach)
                      const rows = pList.data?.data ?? [];
                      await Promise.all(rows.map((r:any)=> updatePos({resource:"app_purchase_orders_positions", id:r.id, values:{ qty_received:r.qty_ordered, delivered_at: dayjs().format("YYYY-MM-DD"), status:"received" }})));
                      pList.refetch();
                    }});
                  }}>Alles erhalten</Button>
                </Space>

                <Table
                  dataSource={pList.data?.data ?? []}
                  loading={pList.isLoading}
                  rowKey="id"
                  pagination={false}
                >
                  <Table.Column dataIndex="item_name" title="Bezeichnung"/>
                  <Table.Column dataIndex="supplier_sku" title="Hersteller-Nr."/>
                  <Table.Column dataIndex="item_type" title="Typ"/>
                  <Table.Column dataIndex="qty_ordered" title="Menge"/>
                  <Table.Column dataIndex="qty_received" title="Eingang"/>
                  <Table.Column dataIndex="unit_price_net" title="EK/Stk" render={(v:number)=> <NumberField value={v} options={{style:"currency",currency:"EUR"}}/> }/>
                  <Table.Column dataIndex="row_total_net" title="Summe" render={(v:number)=> <NumberField value={v} options={{style:"currency",currency:"EUR"}}/> }/>
                  <Table.Column dataIndex="delivered_at" title="Wareneingang" render={(v)=> v ? <DateField value={v} format="DD.MM.YYYY"/> : "—"} />
                  <Table.Column title="Aktionen" render={(_,r:Pos)=>(
                    <Space>
                      <Button size="small" onClick={()=>openEdit(r)}>Bearbeiten</Button>
                      <Button size="small" onClick={()=> updatePos({resource:"app_purchase_orders_positions", id:r.id, values:{ qty_received:r.qty_ordered, delivered_at:dayjs().format("YYYY-MM-DD"), status:"received" }}, { onSuccess:()=>pList.refetch() })}>Eingang voll</Button>
                      <Button size="small" danger onClick={()=> deletePos({resource:"app_purchase_orders_positions", id:r.id},{ onSuccess:()=>pList.refetch() })}>Löschen</Button>
                    </Space>
                  )}/>
                </Table>

                <Modal open={posOpen} onCancel={()=>setPosOpen(false)} title={editing?.id?"Position bearbeiten":"Position hinzufügen"}
                  onOk={()=>{ (document.getElementById("posFormSubmit") as HTMLButtonElement)?.click(); }}>
                  <Form id="posForm" layout="vertical" initialValues={editing}
                    onFinish={(values:any)=>{
                      if (editing?.id) {
                        updatePos({ resource:"app_purchase_orders_positions", id:editing.id, values }, { onSuccess:()=>{ setPosOpen(false); pList.refetch(); }});
                      } else {
                        createPos({ resource:"app_purchase_orders_positions", values:{...values, order_id:id} }, { onSuccess:()=>{ setPosOpen(false); pList.refetch(); }});
                      }
                    }}>
                    <Form.Item label="Bezeichnung" name="item_name" rules={[{required:true}]}><Input/></Form.Item>
                    <Form.Item label="Hersteller-Nr." name="supplier_sku"><Input/></Form.Item>
                    <Form.Item label="Typ" name="item_type"><Input/></Form.Item>
                    <Form.Item label="Menge" name="qty_ordered" initialValue={1}><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
                    <Form.Item label="EK/Stk (netto)" name="unit_price_net" initialValue={0}><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
                    <Button id="posFormSubmit" htmlType="submit" style={{display:"none"}}>submit</Button>
                  </Form>
                </Modal>
              </>
            )
          },
          {
            key:"payments", label:"Zahlungen",
            children: (
              <>
                <Button type="dashed" onClick={()=>setPayOpen(true)}>+ Zahlung</Button>
                <Table
                  dataSource={payList.data?.data ?? []}
                  loading={payList.isLoading}
                  rowKey="id"
                  style={{marginTop:12}}
                >
                  <Table.Column dataIndex="paid_at" title="Datum" render={(v)=> <DateField value={v} format="DD.MM.YYYY"/> }/>
                  <Table.Column dataIndex="amount" title="Betrag" render={(v:number)=> <NumberField value={v} options={{style:"currency",currency:"EUR"}}/> }/>
                  <Table.Column dataIndex="method" title="Methode"/>
                  <Table.Column dataIndex="note" title="Notiz"/>
                  <Table.Column title="Aktionen" render={(_,r:Payment)=> <Button danger size="small" onClick={()=> deletePay({resource:"app_purchase_order_payments", id:r.id}, { onSuccess:()=>payList.refetch() })}>Löschen</Button> }/>
                </Table>

                <Drawer open={payOpen} onClose={()=>setPayOpen(false)} width={360} title="Zahlung hinzufügen">
                  <Form layout="vertical" onFinish={(values:any)=>{
                    createPay({ resource:"app_purchase_order_payments", values:{...values, order_id:id} }, { onSuccess:()=>{ setPayOpen(false); payList.refetch(); }});
                  }}>
                    <Form.Item label="Datum" name="paid_at" rules={[{required:true}]}><DatePicker style={{width:"100%"}}/></Form.Item>
                    <Form.Item label="Betrag" name="amount" rules={[{required:true}]}><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
                    <Form.Item label="Methode" name="method"><Input/></Form.Item>
                    <Form.Item label="Notiz" name="note"><Input.TextArea rows={3}/></Form.Item>
                    <Button htmlType="submit" type="primary">Speichern</Button>
                  </Form>
                </Drawer>
              </>
            )
          }
        ]}
      />
    </Edit>
  );
}
