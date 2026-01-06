"use client";

import { formatCurrencyEUR } from "@utils/formats";
import { Card, List, Space, Typography } from "antd";


export default function InventoryCategoriesCard({ sumInventoryCategories }: { sumInventoryCategories: number[] }) {
    return (
        <Card title="Inventurkategorien (€ Summen)" style={{ marginTop: 8 }}>
            <Space direction="vertical">
                <Space direction="vertical" size={0}>
                    <Typography.Text><strong>Möbel:</strong> {(sumInventoryCategories[0] === 0 ? "--" : formatCurrencyEUR(sumInventoryCategories[0]))}</Typography.Text>
                    <Typography.Text type="secondary" style={{fontSize: "80%"}}>Konten: DE-3400 | EU-3425 </Typography.Text>
                </Space>
                <Space direction="vertical" size={0}>
                    <Typography.Text><strong>Handelswaren:</strong> {(sumInventoryCategories[1] === 0 ? "--" : formatCurrencyEUR(sumInventoryCategories[1]))}</Typography.Text>
                    <Typography.Text type="secondary" style={{fontSize: "80%"}}>Konten: DE-3401 | EU-3426 </Typography.Text>
                </Space>
                <Space direction="vertical" size={0}>
                    <Typography.Text><strong>Bauteile:</strong> {(sumInventoryCategories[2] === 0 ? "--" : formatCurrencyEUR(sumInventoryCategories[2]))}</Typography.Text>
                    <Typography.Text type="secondary" style={{fontSize: "80%"}}>Konten: DE-3402 | EU-3427 </Typography.Text>
                </Space>
                <Space direction="vertical" size={0}>
                    <Typography.Text><strong>Naturstein:</strong> {(sumInventoryCategories[3] === 0 ? "--" : formatCurrencyEUR(sumInventoryCategories[3]))}</Typography.Text>
                    <Typography.Text type="secondary" style={{fontSize: "80%"}}>Konten: DE-3403 | EU-3428 </Typography.Text>
                </Space>
            </Space>
        </Card>
    );
}