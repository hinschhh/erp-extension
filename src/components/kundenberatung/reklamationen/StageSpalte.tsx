"use client";

import { Badge, Space, Button } from "antd";
import { PlusOutlined, CaretDownOutlined, CaretRightOutlined } from "@ant-design/icons";
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
    isCollapsed?: boolean,
    isCompletedStage?: boolean,
    onToggleCollapse?: () => void,
}

export default function StageSpalte({children, id, title, description, count, data, onAddClick, isCollapsed, isCompletedStage, onToggleCollapse}: React.PropsWithChildren<Props>) {

    const {isOver, setNodeRef, active } = useDroppable({id, data});


    return (
        <div
            ref={setNodeRef}
            style={{
                display: "flex",
                flexDirection: "column",
                padding: "0 8px",
                flex: isCollapsed ? "0 0 auto" : 1,
                minWidth: isCollapsed ? "200px" : 0,
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
                    <Space 
                        style={{ cursor: isCompletedStage ? 'pointer' : 'default' }}
                        onClick={isCompletedStage ? onToggleCollapse : undefined}
                    >
                        {isCompletedStage && (
                            <Button 
                                type="text" 
                                size="small" 
                                icon={isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
                                style={{ padding: 0, minWidth: 'auto' }}
                            />
                        )}
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
                    {!isCollapsed && <AddReklamationButton onAddClickAction={onAddClick} id={id} />}

                </Space>
                {!isCollapsed && description}
            </div>
            {!isCollapsed && (
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
            )}
        </div>

    );
}