"use client";

import { DragOverlay, useDraggable, UseDraggableArguments } from "@dnd-kit/core";
import { Tables } from "@/types/supabase";

type complaints = Tables<"app_complaints">;

interface ReklamationenProps {
    id: string;
    data: UseDraggableArguments['data'];
}

const Reklamation = ({ children, id, data }: React.PropsWithChildren<ReklamationenProps>) => {
    const {attributes, listeners, setNodeRef, isDragging, transform, active} = useDraggable({
        id,
        data,
    });

    return (
        <div style={{ position: 'relative' }}>
            <div
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                style={{
                    opacity: active ? (active.id === id ? 0.5 : 1) : 1,
                    borderRadius: '8px',
                    position: 'relative',
                    cursor: 'grab',
                }}
            >
                {active?.id === id && (
                    <DragOverlay zIndex={1000}>
                        <div
                            style={{
                                borderRadius: '8px',
                                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                                cursor: 'grabbing',
                            }}
                        >
                            {children}
                        </div>
                    </DragOverlay>
                )}
                {children}
            </div>
        </div>
    );
}

export default Reklamation;