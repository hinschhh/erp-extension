"use client";

import { Create } from "@refinedev/antd";
import { Form, Input } from "antd";

export default function EinkaufsBestellungenAnlegen() {

return (
    <Create title="Einkauf - Bestellung anlegen">
        <Form>
            <Form.Item>
                <Input placeholder="Bestellnummer" />
            </Form.Item>
        </Form>
    </Create>
);

}