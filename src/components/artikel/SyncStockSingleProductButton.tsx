"use client";

import { Button, App } from "antd";
import { useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * SyncStockSingleProductButton
 * --------------------------------
 * Ruft die Edge Function /quick-api per GET auf
 * und refresht die Seite/Liste nach Erfolg.
 *
 * Props:
 *  - billbeeProductId: number (Pflicht)
 *  - onSynced?: () => void (optional; z.B. Tabelle lokal refetchen)
 */
export default function SyncStockSingleProductButton({
  billbeeProductId,
  onSynced,
}: {
  billbeeProductId: number;
  onSynced?: () => void;
}) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSync = async () => {
    if (!billbeeProductId) {
      message.error("Keine Billbee-Produkt-ID übergeben.");
      return;
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      message.error("Supabase-Umgebungsvariablen fehlen.");
      return;
    }

    setLoading(true);
    try {
      const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/quick-api?id=${encodeURIComponent(
        String(billbeeProductId),
      )}`;

      const res = await fetch(fnUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        },
      });

      const data = await res.json().catch(() => null as unknown as { ok?: boolean; error?: string });

      if (!res.ok || !data) {
        throw new Error(data?.error || `HTTP ${res.status} beim Abruf.`);
      }

      if (data.ok) {
        message.success(`Synchronisiert: ${billbeeProductId} (Stock + Reserved aktualisiert)`);

        // (1) Optionaler Callback (z.B. Tabelle refetchen)
        onSynced?.();

        // (2) URL "bumpen" → Next/SWR/Refine ziehen neu
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.set("r", Date.now().toString());
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });

        // (3) Server Components/Route neu evaluieren
        router.refresh();
      } else {
        message.warning(`Teilweise erfolgreich: ${billbeeProductId}`);
      }
    } catch (e: any) {
      message.error(e?.message || "Sync fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button icon={<ReloadOutlined />} type="primary" loading={loading} onClick={handleSync}>
      Lagerbestand abrufen
    </Button>
  );
}
