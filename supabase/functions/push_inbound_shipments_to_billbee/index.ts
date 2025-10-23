// supabase/functions/billbee_inbound_worker/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type OutboxRow = {
  id: number;
  topic: string;
  payload: any;
  status: string;
  retry_count: number;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BILLBEE_BASE = "https://api.billbee.io/api/v1";

const BILLBEE_API_KEY = Deno.env.get("BILLBEE_API_KEY")!;
const BILLBEE_USER = Deno.env.get("BILLBEE_USER")!;
const BILLBEE_API_PASSWORD = Deno.env.get("BILLBEE_API_PASSWORD")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

// -------- Billbee API helpers ----------
function billbeeHeaders() {
  return {
    "X-Billbee-Api-Key": BILLBEE_API_KEY,
    Authorization: "Basic " + btoa(`${BILLBEE_USER}:${BILLBEE_API_PASSWORD}`),
    "Content-Type": "application/json",
  };
}

async function billbeeGetProduct(id: number | string, lookupBy: "id" | "sku" | "ean" = "id") {
  const url = `${BILLBEE_BASE}/products/${encodeURIComponent(String(id))}?lookupBy=${lookupBy}`;
  const res = await fetch(url, { method: "GET", headers: billbeeHeaders() });
  if (!res.ok) throw new Error(`Billbee GET product ${id} failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // Bitte ggf. an echte Feldnamen anpassen:
  // Hier erwarte ich ein Feld "StockCurrent" (oder ähnlich) im Response.
  const current = data?.StockCurrent ?? data?.Stock ?? data?.Data?.Stock ?? 0;
  return Number(current) || 0;
}

// Payload-Builder: bei Bedarf Feldnamen hier justieren!
function buildUpdatePayloadSingle(productId: number, newStock: number) {
  // Z. B. { ProductId, Amount } oder { ProductId, Stock }
  return { ProductId: productId, Amount: newStock };
}

function buildUpdatePayloadMultiple(items: Array<{ productId: number; newStock: number }>) {
  // Z. B. { Products: [ { ProductId, Amount }, ... ] }
  return { Products: items.map((i) => ({ ProductId: i.productId, Amount: i.newStock })) };
}

async function billbeeUpdateStockSingle(productId: number, newStock: number) {
  const url = `${BILLBEE_BASE}/products/updatestock`;
  const body = buildUpdatePayloadSingle(productId, newStock);
  const res = await fetch(url, { method: "POST", headers: billbeeHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Billbee updatestock failed: ${res.status} ${await res.text()}`);
}

async function billbeeUpdateStockMultiple(items: Array<{ productId: number; newStock: number }>) {
  const url = `${BILLBEE_BASE}/products/updatestockmultiple`;
  const body = buildUpdatePayloadMultiple(items);
  const res = await fetch(url, { method: "POST", headers: billbeeHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Billbee updatestockmultiple failed: ${res.status} ${await res.text()}`);
}

// -------- Outbox processing ----------
async function loadPending(limit = 100): Promise<OutboxRow[]> {
  const { data, error } = await sb
    .from("integration_outbox")
    .select("*")
    .eq("topic", "billbee.stock.inbound")
    .in("status", ["pending", "error"])
    .lte("available_at", new Date().toISOString())
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function lockPending(id: number): Promise<OutboxRow | null> {
  const { data, error } = await sb
    .from("integration_outbox")
    .update({ status: "processing" })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

async function done(id: number) {
  await sb.from("integration_outbox").update({ status: "done", error: null }).eq("id", id);
}

async function fail(id: number, err: unknown) {
  const msg = String(err);
  const backoffMin = 5;
  await sb
    .from("integration_outbox")
    .update({
      status: "error",
      error: msg,
      retry_count: sb.rpc ? undefined : undefined, // optional: eigene Zählung
      available_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
    })
    .eq("id", id);
}

// Einzel-Event: GET current → new = current + delta → POST update
async function processOutboxId(id: number) {
  const { data: row, error } = await sb.from("integration_outbox").select("*").eq("id", id).maybeSingle<OutboxRow>();
  if (error) throw error;
  if (!row || row.status === "done") return;

  const locked = await lockPending(id);
  if (!locked) return; // schon in Arbeit/erledigt

  const p = locked.payload || {};
  const productId: number = Number(p.billbee_product_id);
  const delta: number = Number(p.quantity_delta);

  if (!Number.isFinite(productId) || !Number.isFinite(delta)) {
    await fail(id, "Invalid payload (billbee_product_id or quantity_delta)");
    return;
  }

  try {
    const current = await billbeeGetProduct(productId, "id");
    const next = current + delta;
    await billbeeUpdateStockSingle(productId, next);
    await done(id);
  } catch (e) {
    await fail(id, e);
    throw e;
  }
}

// Batch: gruppiert nach Produkt, summiert deltas, macht GET+POST (multi wenn sinnvoll)
async function processSweep() {
  const rows = await loadPending(200);
  if (!rows.length) return;

  // Lock einzeln, damit parallele Worker nicht doppelt verarbeiten
  const toWork: OutboxRow[] = [];
  for (const r of rows) {
    const l = await lockPending(r.id);
    if (l) toWork.push(l);
  }
  if (!toWork.length) return;

  // Gruppieren: productId -> Gesamt-Delta & betroffene Row-IDs
  const groups = new Map<number, { delta: number; rowIds: number[] }>();
  for (const r of toWork) {
    const pid = Number(r.payload?.billbee_product_id);
    const d = Number(r.payload?.quantity_delta) || 0;
    if (!Number.isFinite(pid) || d === 0) {
      await done(r.id); // nichts zu tun
      continue;
    }
    const g = groups.get(pid) ?? { delta: 0, rowIds: [] };
    g.delta += d;
    g.rowIds.push(r.id);
    groups.set(pid, g);
  }

  // Für jedes Produkt: current holen, new = current + delta
  const updates: Array<{ productId: number; newStock: number; rowIds: number[] }> = [];
  for (const [pid, g] of groups) {
    const current = await billbeeGetProduct(pid, "id");
    updates.push({ productId: pid, newStock: current + g.delta, rowIds: g.rowIds });
  }

  try {
    if (updates.length === 1) {
      const u = updates[0];
      await billbeeUpdateStockSingle(u.productId, u.newStock);
      for (const id of u.rowIds) await done(id);
    } else if (updates.length > 1) {
      await billbeeUpdateStockMultiple(updates.map((u) => ({ productId: u.productId, newStock: u.newStock })));
      for (const u of updates) for (const id of u.rowIds) await done(id);
    }
  } catch (e) {
    for (const u of updates) for (const id of u.rowIds) await fail(id, e);
    throw e;
  }
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const outboxId = Number(body.outbox_id);
    const sweep = Boolean(body.sweep);

    if (Number.isFinite(outboxId)) {
      await processOutboxId(outboxId);
      return new Response("ok", { status: 200 });
    }
    if (sweep) {
      await processSweep();
      return new Response("sweep ok", { status: 200 });
    }
    // fallback: kleiner sweep
    await processSweep();
    return new Response("auto-sweep ok", { status: 200 });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});
