// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file missing" }, { status: 400 });
    }

    // Optionale Metadaten, die du im n8n-Workflow nutzen kannst
    const orderId = String(formData.get("orderId") ?? "");
    const isPaid = formData.get("is_paid") ?? "";

    // Neues FormData für n8n aufbauen (kein BasePath nötig, ist dort fix)
    const forward = new FormData();
    forward.append("file", file, file.name);
    forward.append("orderId", orderId);
    forward.append("is_paid", isPaid);

    const webhookUrl = process.env.N8N_WEBHOOK_URL_INVOICE_TO_DROPBOX;
    const authHeader = process.env.N8N_WEBHOOK_HEADER_AUTH_VALUE;

    if (!webhookUrl || !authHeader) {
      return NextResponse.json(
        { error: "n8n webhook env vars missing" },
        { status: 500 }
      );
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      body: forward,
      headers: {
        "X-n8n-Webhook-Auth": authHeader,
      },
    });

    const data = await res
      .json()
      .catch(() => ({ rawText: "no JSON body from n8n" }));

    if (!res.ok) {
      return NextResponse.json(
        { error: "n8n failed", status: res.status, detail: data },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, ...data }, { status: 200 });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}
