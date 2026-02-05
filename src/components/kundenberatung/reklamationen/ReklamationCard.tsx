"use client";
import { Card } from "antd";
import EditReklamationButton from "./EditReklamationButton";

type ProjectCardProps = {
    id: string;
    orderNumber?: string | null;
    customerName?: string | null;
    productLabel?: string | null;
    description?: string | null;
};

export default function ReklamationCard({
    id,
    orderNumber,
    customerName,
    productLabel,
    description,
}: ProjectCardProps) {
    const title = (
        <div style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
            <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "2px" }}>
                {customerName || "Unbekannter Kunde"}
            </div>
            <div style={{ fontSize: "12px", color: "#666", fontWeight: "normal" }}>
                {orderNumber ? `${orderNumber}` : "unbekannt"} • {productLabel || "Unbekanntes Produkt"}
            </div>
        </div>
    );

    return (
        <Card
            title={title}
            extra={<EditReklamationButton id={id} />}
            style={{
                border: "1px solid #eee",
                borderRadius: "4px",
                padding: "12px",
                backgroundColor: "#fff",
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            }}
        >
            <div style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
                {description || "Keine Beschreibung"}
            </div>
        </Card>
    );
}

