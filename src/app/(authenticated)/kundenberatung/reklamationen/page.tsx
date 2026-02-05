"use client";

import * as React from "react";
import { List } from "@refinedev/antd";
import { useList, useUpdate } from "@refinedev/core";
import { KanbanBoardContainer, KanbanBoard } from "@components/kundenberatung/reklamationen/KanbanBoardContainer";
import  StageSpalte from "@components/kundenberatung/reklamationen/StageSpalte";
import  Reklamation from "@components/kundenberatung/reklamationen/Reklamation";
import { Tables } from "@/types/supabase";
import ReklamationCard from "@components/kundenberatung/reklamationen/ReklamationCard";
import { DragEndEvent } from "@dnd-kit/core";

type Complaints = Tables<"app_complaints">;
type Stages = Tables<"app_complaints_stages">;

type OrderSummary = Pick<Tables<"app_orders">, "bb_OrderNumber"> & {
  app_customers?: Pick<Tables<"app_customers">, "bb_Name"> | null;
};

type OrderItemSummary = Pick<Tables<"app_order_items">, "id"> & {
  app_products?: Pick<Tables<"app_products">, "bb_name" | "bb_sku"> | null;
  app_orders?: OrderSummary | null;
};

type ComplaintsWithRelations = Complaints & {
  app_order_items?: OrderItemSummary | null;
  app_orders?: OrderSummary | null;
};

type StagesWithComplaints = Stages & {
    complaints: Complaints[];
};


export default function PageComplaints() {
  const { data: stages, isLoading: isLoadingStages } = useList<Stages>({
    resource: "app_complaints_stages",
    sorters: [{ field: "id", order: "asc" }],
  });

  const { data: complaints, isLoading: isLoadingComplaints } = useList<Complaints>({ 
    resource: "app_complaints",
    pagination: { pageSize: 100 },
    meta: {
      select:
        "*, app_order_items(id, app_products(bb_name, bb_sku), app_orders(bb_OrderNumber, app_customers(bb_Name))), app_orders(bb_OrderNumber, app_customers(bb_Name))",
    },
    queryOptions: {
        enabled: !isLoadingStages,
    },
  });

  const { mutate: updateComplaintStage } = useUpdate<Complaints>();

  const complaintsStages = React.useMemo(() => {
    if (!complaints?.data || !stages?.data) {
        return {
          unassignedStage: [],
          stages: [],
        };
    }
    
    const unassignedStage = complaints.data.filter((complaint) => complaint.stage === null);

    const grouped: StagesWithComplaints[] = stages.data.map((stage) => ({
        ...stage,
        complaints: complaints.data.filter((complaint) => complaint.stage?.toString() === stage.id),
    }));

    return { unassignedStage, columns: grouped };
  
  }, [stages, complaints])

  const handleAddCard = (params: { stageId: string }) => {
    console.log("Add card to stage:", params.stageId);
  }

  const handleOnDragEnd = (event: DragEndEvent) => {
    let stageId = event.over?.id as undefined | string | null;
    const complaintId = event.active.id as string;
    const complaintStageId = event.active.data.current?.stageId as string | null;
    if(complaintStageId === stageId) return;

    if(stageId === "unassigned") {
        stageId = null;
    }

    updateComplaintStage({
      resource: "app_complaints",
      id: complaintId,
      values: {
        stage: stageId,
      },
      successNotification: false,
      mutationMode: "optimistic",
  })

  }
  return (
    <List title="Übersicht - Reklamationen">
      <KanbanBoardContainer>
        <KanbanBoard
          onDragEnd={handleOnDragEnd}
        >
          {complaintsStages.columns?.map((column) => (
            <StageSpalte
              key={column.id}
              id={column.id.toString()}
              title={column.name as string}
              count={column.complaints.length || 0}
              onAddClick={() => handleAddCard({ stageId: column.id })}
            >
              {column.complaints.map((complaint) => {
                const complaintWithRelations = complaint as ComplaintsWithRelations;
                return (
                <Reklamation
                  key={complaint.id}
                  id={complaint.id.toString()}
                  data={{ ...complaint, stageId: column.id }}
                >
                  <ReklamationCard
                    id={String(complaint.id)}
                    orderNumber={
                      complaintWithRelations.app_order_items?.app_orders?.bb_OrderNumber ||
                      complaintWithRelations.app_orders?.bb_OrderNumber
                    }
                    customerName={
                      complaintWithRelations.app_order_items?.app_orders?.app_customers?.bb_Name ||
                      complaintWithRelations.app_orders?.app_customers?.bb_Name
                    }
                    productLabel={
                      complaintWithRelations.app_order_items?.app_products?.bb_name ||
                      complaintWithRelations.app_order_items?.app_products?.bb_sku
                    }
                    description={complaint.description}
                  />
                </Reklamation>
                );
              })}
            </StageSpalte>
          ))}
        </KanbanBoard>
      </KanbanBoardContainer>
    </List>
  );
}
