"use client";

import React, { useMemo, useState } from "react";
import { Button, Progress, Typography, Space, Card } from "antd";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const { Text } = Typography;

const supabase: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// --- Helpers ----------------------------------------------------------------

async function countRows(table: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { head: true, count: "estimated" });
  if (error) {
    console.warn(`[countRows] ${table}:`, error.message);
    return null;
  }
  return count ?? null;
}

type BatchPayload = {
  processed?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

async function runBatchesWithProgress(
  fnName: string,
  limit: number,
  onBatch: (deltaProcessed: number, payload: BatchPayload) => void
) {
  let cursor: string | null = null;
  let lastCursor: string | null = null;

  for (let i = 0; i < 10_000; i++) {
    const { data, error } = await supabase.functions.invoke<BatchPayload>(
      fnName,
      { body: { limit, cursor } }
    );
    if (error) throw new Error(`[${fnName}] ${error.message}`);

    const delta = typeof data?.processed === "number" ? data.processed : 0;
    onBatch(delta, data ?? {});

    const next = (data?.nextCursor ?? null) as string | null;
    if (!next) break;

    if (lastCursor && next === lastCursor) {
      console.warn(`[${fnName}] nextCursor wiederholt sich (${next}) → Abbruch`);
      break;
    }
    lastCursor = next;
    cursor = next;
  }
}

// --- Component ---------------------------------------------------------------

export const SyncAllButton: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [stage, setStage] = useState<string>("Bereit");
  const [percent, setPercent] = useState<number>(0);
  const [details, setDetails] = useState<string>("");

  const [unitsDone, setUnitsDone] = useState(0);
  const [unitsTotal, setUnitsTotal] = useState<number | null>(null);

  const limitPerBatch = 100;

  const updateProgress = (done: number, total: number | null) => {
    if (!total || total <= 0) {
      const soft = Math.min(90, Math.round((done % 100) + done / 10));
      setPercent(soft);
      return;
    }
    const p = Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
    setPercent(p);
  };

  const handleSyncAll = async () => {
    if (running) return;
    setHasStarted(true);
    setRunning(true);
    setStage("Zähle Datensätze …");
    setDetails("Initialisiere Fortschritt …");
    setPercent(0);
    setUnitsDone(0);
    setUnitsTotal(null);

    try {
      const [componentsCount, bomCount] = await Promise.all([
        countRows("components"),
        countRows("bom_recipes"),
      ]);
      const fixedSteps = 2; // sync-stock + sync-bom-sum-to-components
      const total = (componentsCount ?? 0) + (bomCount ?? 0) + fixedSteps;
      setUnitsTotal(total > 0 ? total : null);

      // 1) Bestand
      setStage("1/4: Verfügbare Bestände abrufen (sync-stock)");
      setDetails("Hole aktuellen Bestand …");
      {
        const { error } = await supabase.functions.invoke("sync-stock");
        if (error) throw new Error(`[sync-stock] ${error.message}`);
        setUnitsDone((u) => {
          const nu = u + 1;
          updateProgress(nu, total || null);
          return nu;
        });
      }

      // 2) components batched
      setStage("2/4: Reservierte Bestände der Komponenten (sync-reservedamount)");
      setDetails(`Synchronisiere components in Batches à ${limitPerBatch} …`);
      await runBatchesWithProgress(
        "sync-reservedamount",
        limitPerBatch,
        (deltaProcessed) => {
          setUnitsDone((u) => {
            const nu = u + deltaProcessed;
            updateProgress(nu, total || null);
            setDetails(`Batch verarbeitet: +${deltaProcessed}`);
            return nu;
          });
        }
      );

      // 3) bom_recipes batched
      setStage("3/4: Reservierte Bestände in Stücklisten (sync-reservedamount-bom)");
      setDetails(`Synchronisiere bom_recipes in Batches à ${limitPerBatch} …`);
      await runBatchesWithProgress(
        "sync-reservedamount-bom",
        limitPerBatch,
        (deltaProcessed) => {
          setUnitsDone((u) => {
            const nu = u + deltaProcessed;
            updateProgress(nu, total || null);
            setDetails(`Batch verarbeitet: +${deltaProcessed}`);
            return nu;
          });
        }
      );

      // 4) Aggregation
      setStage("4/4: Summen auf Komponenten (Aggregation)");
      setDetails("Schreibe BOM-Summen in Komponenten …");
      {
        const { error } = await supabase.functions.invoke(
          "sync-bom-sum-to-components"
        );
        if (error)
          throw new Error(`[sync-bom-sum-to-components] ${error.message}`);
        setUnitsDone((u) => {
          const nu = u + 1;
          updateProgress(nu, total || null);
          return nu;
        });
      }

      setStage("Fertig ✅");
      setDetails("Alle Schritte erfolgreich abgeschlossen.");
      setPercent(100);
    } catch (err: any) {
      console.error(err);
      setStage("Fehler ❌");
      setDetails(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  };

  const progressExtra = useMemo(() => {
    if (!hasStarted) return "";
    const t = unitsTotal ?? undefined;
    const d = unitsDone;
    return t
      ? `${d.toLocaleString()} / ${t.toLocaleString()} Einheiten`
      : `${d.toLocaleString()} Einheiten`;
  }, [hasStarted, unitsDone, unitsTotal]);

  return (
    // Wrapper sorgt dafür, dass die gesamte Card rechtsbündig steht
    <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
      <Card
        size="small"
        bordered={false}
        style={{
          maxWidth: 520,
          background: "transparent",
          boxShadow: "none",
        }}
      >
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          {/* Button bleibt blau (primary) */}
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <Button
              type="primary"
              onClick={handleSyncAll}
              loading={running}
            >
              {running ? "Synchronisiere …" : "Bestände synchronisieren"}
            </Button>
          </div>

          {/* Fortschritt & Details erst nach Klick sichtbar, danach dauerhaft */}
          {hasStarted && (
            <>
              <div>
                <Text strong>{stage}</Text>
                <br />
                <Text type="secondary">{details}</Text>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <Progress
                    percent={percent}
                    status={
                      running ? "active" : percent === 100 ? "success" : "normal"
                    }
                  />
                </div>
              </div>

              <Text type="secondary">{progressExtra}</Text>
            </>
          )}
        </Space>
      </Card>
    </div>
  );
};
