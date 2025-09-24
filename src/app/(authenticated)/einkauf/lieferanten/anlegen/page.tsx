"use client";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber, Switch } from "antd";

export default function SupplierCreatePage() {
  const { formProps, saveButtonProps } = useForm({
    resource: "app_suppliers",
    redirect: false,
    onMutationSuccess: (_d,_v,ctx)=> {
      const id = (ctx as any)?.data?.id ?? (ctx as any)?.data?.data?.id ?? "";
      location.assign(`/einkauf/lieferanten/bearbeiten/${id}`);
    },
  });

  return (
    <Create title="Lieferant anlegen" saveButtonProps={saveButtonProps}>
      <Form layout="vertical" {...formProps} initialValues={{ default_currency:"EUR", active:true }}>
        <Form.Item label="Name" name="name" rules={[{required:true}]}><Input/></Form.Item>
        <Form.Item label="Kürzel" name="short_code"><Input maxLength={10}/></Form.Item>
        <Form.Item label="E-Mail" name="email"><Input type="email"/></Form.Item>
        <Form.Item label="Telefon" name="phone"><Input/></Form.Item>
        <Form.Item label="Standard-Währung" name="default_currency"><Input/></Form.Item>
        <Form.Item label="Zahlungsziel (Tage)" name="payment_terms_days"><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
        <Form.Item label="Standard-Lieferzeit (Tage)" name="default_leadtime_days"><InputNumber min={0} style={{width:"100%"}}/></Form.Item>
        <Form.Item label="Aktiv" name="active" valuePropName="checked"><Switch/></Form.Item>
      </Form>
    </Create>
  );
}
