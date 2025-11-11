// src/components/common/buttons/SyncReferenceProductsButton.tsx
"use client";

import { useState } from "react";
import { Button, App } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

type Props = {
  /** Optional: Seite nach erfolgreichem Sync neu laden (Next App Router) */
  refreshAfter?: boolean;
  /** Optional: Button-Größe */
  size?: "small" | "middle" | "large";
  /** Optional: Custom-Label */
  label?: string;
  /** Optional: Falls du eine andere URL testen willst */
  functionUrl?: string;
};

export default function SyncReferenceProductsButton({
  refreshAfter = false,
  size = "middle",
  label = "Produktdaten von Billbee synchronisieren",
  functionUrl = "https://nqdhcsebxybveezqfnyl.supabase.co/functions/v1/sync_reference_products",
}: Props) {
  const { message } = App.useApp();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!anonKey) {
      message.error("Fehlende Umgebungsvariable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        // Optionaler Body – anpassbar, falls deine Function Parameter erwartet
        body: JSON.stringify({ trigger: "manual" }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      // Versuche JSON zu lesen; falls keins kommt, ist's auch ok
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // ignore non-JSON
      }

      message.success("Sync gestartet/ausgeführt.");
      if (refreshAfter) router.refresh();
      // Optional: data weiterreichen/loggen
      // console.log("Function result:", data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Unbekannter Fehler beim Aufruf.";
      message.error(`Sync fehlgeschlagen: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="default"
      icon={<ReloadOutlined />}
      loading={loading}
      onClick={handleClick}
      size={size}
    >
      {label}
    </Button>
  );
}
