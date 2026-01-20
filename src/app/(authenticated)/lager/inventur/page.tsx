"use client";

import { Space, Card, Table, Form, Input, Button, Alert, App as AntdApp, Progress } from "antd";
import { List } from "@refinedev/antd";
import React, { useState, useEffect } from "react";

import { Database } from "@/types/supabase";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { CheckOutlined, EditOutlined } from "@ant-design/icons";

type InventorySession =
  Database["public"]["Tables"]["app_inventory_sessions"]["Row"];

interface SessionWithProgress extends InventorySession {
  countable_products: number;
  counted_products: number;
}

export default function InventarPage() {
  const { message } = AntdApp.useApp();
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<InventorySession | null>(null);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progressData, setProgressData] = useState<Record<number, { countable: number; counted: number }>>({});

  // Lade Sessions
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoading(true);
      const { data, error } = await supabaseBrowserClient
        .from("app_inventory_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fehler beim Laden der Sessions:", error);
        message.error("Fehler beim Laden der Inventuren");
      } else {
        setSessions(data || []);
      }
      setIsLoading(false);
    };

    loadSessions();

    // Live-Updates
    const channel = supabaseBrowserClient
      .channel("inventory_sessions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_inventory_sessions" },
        () => {
          loadSessions();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [message]);

  // Berechne Fortschritt für jede Session
  useEffect(() => {
    if (sessions.length === 0) return;

    const loadProgress = async () => {
      const progressMap: Record<number, { countable: number; counted: number }> = {};
      
      for (const session of sessions) {
        // Zähle relevante Snapshots (Produkte mit Bestand im letzten Jahr oder aktuellem Bestand <> 0)
        const { data: snapshots, error: snapshotError } = await supabaseBrowserClient
          .from("app_inventory_snapshots")
          .select("fk_products, bb_stock_current")
          .eq("session_id", session.id);

        if (snapshotError || !snapshots) {
          console.error("Fehler beim Laden der Snapshots:", snapshotError);
          continue;
        }

        if (snapshots.length === 0) {
          progressMap[session.id] = { countable: 0, counted: 0 };
          continue;
        }

        const productIds = snapshots.map(s => s.fk_products);
        
        // Filtere Produkte: nur die mit Bewegung im letzten Jahr oder aktuellem Bestand
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        // Prüfe welche Produkte im letzten Jahr in Bestellungen vorkamen
        const { data: normalPositions } = await supabaseBrowserClient
          .from("app_purchase_orders_positions_normal")
          .select("billbee_product_id")
          .in("billbee_product_id", productIds)
          .gte("created_at", oneYearAgo.toISOString());

        const { data: specialPositions } = await supabaseBrowserClient
          .from("app_purchase_orders_positions_special")
          .select("billbee_product_id")
          .in("billbee_product_id", productIds)
          .gte("created_at", oneYearAgo.toISOString());

        const productsWithActivity = new Set([
          ...(normalPositions?.map(p => p.billbee_product_id) || []),
          ...(specialPositions?.map(p => p.billbee_product_id) || [])
        ]);

        // Füge Produkte mit aktuellem Bestand <> 0 hinzu
        snapshots
          .filter(s => s.bb_stock_current !== 0)
          .forEach(s => productsWithActivity.add(s.fk_products));

        const countableProducts = productsWithActivity.size;

        // Zähle gezählte Produkte (nur die relevanten)
        const { data: counts } = await supabaseBrowserClient
          .from("app_inventory_counts")
          .select("fk_products")
          .eq("session_id", session.id);

        const countedRelevantProducts = new Set(
          counts?.filter(c => productsWithActivity.has(c.fk_products))
                 .map(c => c.fk_products) || []
        );

        progressMap[session.id] = {
          countable: countableProducts,
          counted: countedRelevantProducts.size
        };
      }

      setProgressData(progressMap);
    };

    loadProgress();
  }, [sessions]);

  // Kombiniere Session-Daten mit Fortschritt
  const sessionsWithProgress: SessionWithProgress[] = sessions.map((session: InventorySession) => ({
    ...session,
    countable_products: progressData[session.id]?.countable || 0,
    counted_products: progressData[session.id]?.counted || 0
  }));

  const handleStart = async (values: { name: string; note?: string }) => {
    const name = values?.name?.trim();
    if (!name) {
      message.error("Bitte einen Namen fuer die Inventur angeben.");
      return;
    }

    try {
      setStarting(true);
      const { data, error } = await (supabaseBrowserClient as any).rpc(
        "rpc_app_inventory_session_start",
        {
          p_name: name,
          p_note: values?.note ?? null,
        }
      );
      if (error) {
        throw error;
      }
      setSession(data as InventorySession);
      message.success("Inventur gestartet und Snapshot erstellt.");
    } catch (err: any) {
      const msg = err?.message ?? "Inventur konnte nicht gestartet werden.";
      message.error(msg);
    } finally {
      setStarting(false);
    }
  };

  return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card title="Inventur starten" bordered>
          <Form layout="vertical" onFinish={handleStart}>
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: "Name der Inventur fehlt." }]}
            >
              <Input placeholder="z. B. Jahresinventur 2025" />
            </Form.Item>
            <Form.Item label="Notiz" name="note">
              <Input.TextArea rows={2} placeholder="Optional: Beschreibung/Notiz" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={starting}>
                Inventur starten & Snapshot erzeugen
              </Button>
            </Form.Item>
          </Form>
          {session ? (
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message={`Inventur "${session.name}" gestartet`}
              description={`Status: ${session.status}, Snapshot: ${session.snapshot_taken_at ?? "-"}`}
            />
          ) : null}
        </Card>

        <List title="Vergangene Inventuren">
          <Table 
            dataSource={sessionsWithProgress} 
            rowKey="id"
            loading={isLoading}
          >
            <Table.Column title="Bezeichnung" dataIndex="name" sorter />
            <Table.Column title="Status" dataIndex="status" sorter />
            <Table.Column title="Anmerkungen" dataIndex="note" sorter />
            <Table.Column title="Fortschritt" dataIndex="countable_products" 
              render={(_, record: SessionWithProgress) => {
                const percent = record.countable_products > 0 
                  ? Math.round((record.counted_products / record.countable_products) * 100)
                  : 0;
                return <Progress percent={percent} />;
              }}
            />
            <Table.Column title="Aktionen" key="actions" render={(_, record: SessionWithProgress) => (
              <Space>
                <Button href={`/lager/inventur/zaehlen/${record.id}`} icon={<EditOutlined />}>Zählen</Button>
                <Button href={`/lager/inventur/pruefen/${record.id}`} icon={<CheckOutlined />}>Differenzen prüfen</Button>
              </Space>
            )} />
          </Table>
        </List>
      </Space>
  );
}
