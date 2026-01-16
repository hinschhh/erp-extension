"use client";

import { Button, message, Tooltip } from "antd";
import { useInvalidate, useOne } from "@refinedev/core";
import { CheckCircleOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { Tables } from "@/types/supabase";

type FnIsPostAndDispatchResult = {
  ok: boolean;
  inbound_id: string;
  outbox_id: number;
  items_count: number;
  payload: unknown;
};
type InboundShipment = Tables<"app_inbound_shipments">;

function isResult(x: unknown): x is FnIsPostAndDispatchResult {
  return (
    typeof x === "object" &&
    x !== null &&
    "ok" in x &&
    "outbox_id" in x &&
    "items_count" in x
  );
}

export default function InboundPostAndDispatchButton({
  inboundShipmentId,
}: { inboundShipmentId: string }) {
  const invalidate = useInvalidate();
  const supabase = supabaseBrowserClient;

  const { data, isLoading } = useOne<InboundShipment>({
    resource: "app_inbound_shipments",
    id: inboundShipmentId,
  });


  const handleClick = async () => {
    const hide = message.loading("Wareneingang wird gebucht & Outbox erstellt…", 0);
    try {
      const { data, error } = await supabase.rpc("fn_is_post_and_dispatch", {
        p_inbound_id: inboundShipmentId,
      } as any);

      if (error) throw error;

      // jsonb -> Json (unknown) -> unser Typ
      const result = data as unknown;

      if (!isResult(result)) {
        // Falls das Schema mal anders zurückkommt – defensiv bleiben
        message.warning("RPC ausgeführt, aber Antwortformat unerwartet.");
      } else {
        message.success(
          `Gebucht. Outbox-ID: ${result.outbox_id} | Items: ${result.items_count}`,
        );
      }

      // Relevante Ressourcen invalidieren
      invalidate({ resource: "app_inbound_shipments", invalidates: ["list", "detail"] });
      invalidate({ resource: "app_inbound_shipment_items", invalidates: ["list"] });
    } catch (e: any) {
      console.error(e);
      message.error(e?.message ?? "Fehler beim Posten des Wareneingangs");
    } finally {
      hide();
    }
  };
  if (data?.data?.status === "posted") {
    return (
      <Tooltip title="Bestände bereits gebucht">
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleClick} disabled>
          Gebucht
        </Button>
      </Tooltip>
    );
  }
      return (
      <Tooltip title="Wareneingang buchen und Bestände an Billbee melden">
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleClick}>
          Wareneingang buchen
        </Button>
      </Tooltip>
    );
}
