"use client";

import React, { useMemo, useState } from "react";
import { Button, Tooltip, message } from "antd";
import { useOne, useInvalidate } from "@refinedev/core";
import dayjs from "dayjs";
import { CheckOutlined, FileDoneOutlined } from "@ant-design/icons";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { Tables } from "@/types/supabase";

type PoItemSpecial = Tables<"app_purchase_orders_positions_special">;

type Props = {
  /** ID der Special-Position (UUID) */
  itemId: string;
  /** Optional: Callback nach erfolgreicher Aktion (z. B. Tabelle neu laden) */
  onDone?: () => void;
};

export default function SketchConfirmButton({ itemId, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const supabase = supabaseBrowserClient;
  const invalidate = useInvalidate();

  // Position laden (Status + Skizzeninfos)
  const { data, isLoading, refetch } = useOne<PoItemSpecial>({
    resource: "app_purchase_orders_positions_special",
    id: itemId,
    meta: {
      select: "id, po_item_status, sketch_confirmed_at, sketch_needed",
    },
  });

  const sketchConfirmedAt = data?.data?.sketch_confirmed_at as string | null | undefined;
  const isConfirmed = !!sketchConfirmedAt;
  const isNeeded = data?.data?.sketch_needed as boolean | null | undefined;

  const label = useMemo(() => {
    if (isConfirmed && sketchConfirmedAt) {
      return `Bestätigt am: ${dayjs(sketchConfirmedAt).format("DD.MM.YYYY")}`;
    }
    return "Skizze bestätigen";
  }, [isConfirmed, sketchConfirmedAt]);

  const tooltip = isConfirmed
    ? "Skizze bereits bestätigt"
    : "Skizze bestätigen und Position in Produktion schieben";

  const handleClick = async () => {
    if (isConfirmed) return;

    try {
      setSubmitting(true);

      const { error } = await supabase.rpc("rpc_po_special_confirm_sketch", {
        p_item_id: itemId,
      });

      if (error) {
        message.error(error.message || "Aktion fehlgeschlagen");
        return;
      }

      message.success("Skizze bestätigt. Position ist jetzt in Produktion.");

      // Einzelposition neu laden
      await refetch();

      // Caches invalidieren: Positionen + ggf. Bestellung
      await Promise.all([
        invalidate({
          resource: "app_purchase_orders_positions_special",
          invalidates: ["list", "many", "detail"],
        }),
        invalidate({
          resource: "app_purchase_orders",
          invalidates: ["list", "many"],
        }),
      ]);

      onDone?.();
    } catch (e: any) {
      message.error(e?.message ?? "Unerwarteter Fehler");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Tooltip title={tooltip}>
      <Button
        icon={isConfirmed ? <FileDoneOutlined /> : <CheckOutlined />}
        type={isConfirmed ? "default" : "primary"}
        loading={isLoading || submitting}
        disabled={isConfirmed || !isNeeded}
        onClick={!isConfirmed ? handleClick : undefined}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
