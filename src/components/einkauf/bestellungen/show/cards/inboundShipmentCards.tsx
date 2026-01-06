"use client";

import { Card, List, Space, Typography } from "antd";
import Link from "next/link";


export default function InboundShipmentsCard({ inboundShipments }: { inboundShipments: any[] }) {
    return (
        <Card title="Zugehörige Wareneingänge" style={{ marginTop: 8 , padding: 0}}>
            <List
                dataSource={inboundShipments}
                renderItem={item => (
                    <List.Item>
                        <Space direction="vertical" size={0}>
                            <Typography.Text><Link href={`/lager/wareneingang/bearbeiten/${item.id}`}><strong> {item.inbound_number ?? "--"}</strong></Link></Typography.Text>
                            <Typography.Text type="secondary" style={{fontSize:"80%"}}>Rechnung: <Link href={`${item.invoice_file_url}`}>{item.invoice_number ?? "--"}</Link> | Lieferschein: <Link href={`${item.delivery_note_file_url}`}>{item.delivery_note_number ?? "--"}</Link></Typography.Text>
                       </Space>
                    </List.Item>
                )}
                style={{ marginTop: 0 }}
            />
        </Card>
    );
}