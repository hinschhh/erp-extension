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

type StagesWithComplaints = Stages & {
    complaints: Complaints[];
};

export default function PageComplaints() {
    return null;
}

/*export default function PageComplaints() {
  const { data: stages, isLoading: isLoadingStages } = useList<Stages>({
    resource: "app_complaints_stages",
  });

  const { data: complaints, isLoading: isLoadingComplaints } = useList<Complaints>({ 
    resource: "app_complaints",
    pagination: { pageSize: 100 },
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
          <StageSpalte
            id="unassigned"
            title={"unassignedStages"}
            count={complaintsStages.unassignedStage?.length || 0}
            onAddClick={() => handleAddCard({ stageId: 'unassigned' })}
          >
            {complaintsStages.unassignedStage.map((complaint) => (
              <Reklamation
                key={complaint.id}
                id={complaint.id.toString()}
                data={{ ...complaint, stageId: 'unassigned' }}
              >
                <ReklamationCard
                  {...complaint}
                  id={complaint.id.toString()}
                  title={complaint.description || "Keine Beschreibung"}
                  dueDate={complaint.created_at}
                />
              </Reklamation>
            ))}
          </StageSpalte>
          {complaintsStages.columns?.map((column) => (
            <StageSpalte
              key={column.id}
              id={column.id.toString()}
              title={column.id}
              count={column.complaints.length || 0}
              onAddClick={() => handleAddCard({ stageId: column.id })}
            >
              {column.complaints.map((complaint) => (
                <Reklamation
                  key={complaint.id}
                  id={complaint.id.toString()}
                  data={{ ...complaint, stageId: column.id }}
                >
                  <ReklamationCard
                    id={String(complaint.id)}
                    title={complaint.description || "Keine Beschreibung"}
                  />
                </Reklamation>
              ))}
            </StageSpalte>
          ))}
        </KanbanBoard>
      </KanbanBoardContainer>
    </List>
  );
}*/
