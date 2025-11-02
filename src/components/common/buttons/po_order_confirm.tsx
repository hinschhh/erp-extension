"use client";

import React, { useState } from "react";
import { Button, message, Tooltip } from "antd";
import { useOne, useInvalidate } from "@refinedev/core";
import dayjs from "dayjs";
import { CheckCircleOutlined, SendOutlined } from "@ant-design/icons";
import { Tables } from "@/types/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";

type Po = Tables<"app_purchase_orders">;

type Props = { orderId: string ; onSuccess?: () => void };

export default function OrderStatusActionButton({ orderId, onSuccess }: Props) {
  const supabase = supabaseBrowserClient;
  const invalidate = useInvalidate();

  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch } = useOne<Po>({
    resource: "app_purchase_orders",
    id: orderId,
    meta: { select: "id,status,proforma_confirmed_at" },
  });

  const status = data?.data?.status;
  const confirmedAt = data?.data?.proforma_confirmed_at;

    const runAction = async (nextStatus: "ordered" | "confirmed") => {
    try {
      setSubmitting(true);
      const { error } = await supabase.rpc("rpc_po_items_set_status_for_order", {
        p_order_id: orderId,
        p_status: nextStatus,
      });

      if (error) {
        message.error(error.message || "Aktion fehlgeschlagen");
        return;
      }

      message.success(
        nextStatus === "ordered" ? "Bestellung übermittelt." : "Bestellung bestätigt."
      );

      // Lokales Re-Read für den Button
      await refetch();

      // Cache-Invalidation
      await Promise.all([
        invalidate({
          resource: "app_purchase_orders",
          id: orderId,
          invalidates: ["detail", "list", "many"],
        }),
        invalidate({
          resource: "app_purchase_orders_positions_normal",
          invalidates: ["list", "many"],
        }),
        invalidate({
          resource: "app_purchase_orders_positions_special",
          invalidates: ["list", "many"],
        }),
      ]);
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <Button loading>Loading...</Button>;
  }

  if (status === "draft") {
    return (
      <Tooltip title="Bestellung übermitteln">
        <Button
          icon={<SendOutlined />}
          loading={submitting}
          onClick={() => runAction("ordered")}
        >
          Bestellung übermitteln
        </Button>
      </Tooltip>
    );
  }

  if (status === "ordered") {
    return (
      <Tooltip title="Bestellung bestätigen">
        <Button
          icon={<CheckCircleOutlined />}
          loading={submitting}
          onClick={() => runAction("confirmed")}
        >
          Bestellung bestätigen
        </Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      title={`Keine Sammelaktion verfügbar. Bestellung bereits bestätigt am ${dayjs(
        confirmedAt
      ).format("DD.MM.YYYY")}`}
    >
      <Button icon={<CheckCircleOutlined />} disabled>
        Bestellung bestätigt
      </Button>
    </Tooltip>
  );
}
