"use client";

import { Badge, Space, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useDroppable, UseDroppableArguments } from "@dnd-kit/core";
import { TextField } from "@refinedev/antd";
import AddReklamationButton from "./AddReklamationButton";

type Props = {
    id: string,
    title: string,
    description?: React.ReactNode,
    count: number, 
    data?: UseDroppableArguments['data'],
    onAddClick?: (args: {id: string}) => void,

}

export default function StageSpalte({children, id, title, description, count, data, onAddClick}: React.PropsWithChildren<Props>) {

    const {isOver, setNodeRef, active } = useDroppable({id, data});


    return (
        <div
            ref={setNodeRef}
            style={{
                display: "flex",
                flexDirection: "column",
                padding: "0 8px",
                flex: 1,
                minWidth: 0,
                alignSelf: "flex-start",
            }}
        >
            <div
                style={{
                    padding: '12px',
                    minHeight: '64px',
                }}
            >
                <Space style={{width: '100%', justifyContent: 'space-between'}} >
                    <Space>
                        <TextField
                            value={title}
                            strong
                            style={{
                                textTransform: "uppercase",
                                wordBreak: "break-word",
                            }}
                       />
                        {!! count && <Badge count={count} color="cyan" />}
                    </Space>
                    <AddReklamationButton onAddClick={onAddClick} id={id} />

                </Space>
                {description}
            </div>
            <div
                style={{
                    flex: 1,
                    overflowY: active ? 'unset' : 'auto',
                    border: '2px dashed transparent',
                    borderColor: isOver ? '#000040' : 'transparent',
                    borderRadius: '4px',
                }}
            >
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {children}
                </div>
            </div>
        </div>

    );
}