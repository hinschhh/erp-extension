"use client";

import { Button, message, Tooltip } from "antd";
import { useInvalidate } from "@refinedev/core";
import { CheckCircleOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@/utils/supabase/client";

type FnIsPostAndDispatchResult = {
  ok: boolean;
  inbound_id: string;
  outbox_id: number;
  items_count: number;
  payload: unknown;
};

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

  const handleClick = async () => {
    const hide = message.loading("Wareneingang wird gebucht & Outbox erstellt…", 0);
    try {
      const { data, error } = await supabase.rpc("fn_is_post_and_dispatch", {
        p_inbound_id: inboundShipmentId,
      });

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
      invalidate({ resource: "app_purchase_orders_positions_normal_view", invalidates: ["list"] });
      invalidate({ resource: "app_purchase_orders_positions_special_view", invalidates: ["list"] });
    } catch (e: any) {
      console.error(e);
      message.error(e?.message ?? "Fehler beim Posten des Wareneingangs");
    } finally {
      hide();
    }
  };

  return (
    <Tooltip title="Wareneingang buchen und Bestände an Billbee melden">
      <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleClick}>
        Wareneingang buchen
      </Button>
    </Tooltip>
  );
}
