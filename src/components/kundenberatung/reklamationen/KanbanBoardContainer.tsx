"use client";

import { DndContext, DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";




export function KanbanBoardContainer({children}: React.PropsWithChildren<{}>) {
    return (
        <div 
            style={{ 
                height: "calc(100vh - 64px)",
                width: "calc(100% + 64px)",
                display: "flex", 
                justifyContent: "column",
                gap: "16px", 
                padding: "16px", 
                }}
            >
            <div 
                style={{ 
                    minWidth: "16px", 
                    display: "flex", 
                    padding: "32px",
                    overflow: "scroll",
                }}
            >
                {children}
            </div>
        </div>
    );
}

type Props = {
    onDragEnd?: (event: DragEndEvent) => void;
}

export function KanbanBoard({children, onDragEnd}: React.PropsWithChildren<Props>) {
    const mouseSensor = useSensor(MouseSensor, {
        activationConstraint: {
            distance: 5,
        },
    });

    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: {
            delay: 250,
            tolerance: 5,
            distance: 5,
        },
    });

    const sensors = useSensors(mouseSensor, touchSensor);

    return (
        <DndContext onDragEnd={onDragEnd} sensors={sensors}>
            {children}
        </DndContext>
    );
}
