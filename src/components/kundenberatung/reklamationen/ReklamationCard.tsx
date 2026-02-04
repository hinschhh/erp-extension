"use client";
import { MenuOutlined } from "@ant-design/icons";
import { Button, Card, Tag } from "antd";
import EditReklamationButton from "./EditReklamationButton";

type ProjectCardProps = {
    id: string;
    title: string;
    dueDate?: string;
    users?: {
        id: string;
        name: string;
        avatarUrl?: string;
    }[] | undefined;

};

export default function ReklamationCard({ id, title, dueDate, users }: ProjectCardProps) {
    return (
        <Card
            title={<div style={{ wordBreak: "break-word", whiteSpace: "normal" }}>{title}</div>}
            extra={<EditReklamationButton id={id}/>}
            style={{
                border: '1px solid #eee',
                borderRadius: '4px',
                padding: '12px',
                backgroundColor: '#fff',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            }}
            />
    );
}

