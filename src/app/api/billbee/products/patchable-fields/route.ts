import { NextResponse } from "next/server";

const BILLBEE_BASE = "https://app.billbee.io/api/v1";

function authHeaders() {
  const key = process.env.BILLBEE_API_KEY!;
  const user = process.env.BILLBEE_USERNAME!;
  const pass = process.env.BILLBEE_API_PASSWORD!;
  const basic = Buffer.from(`${user}:${pass}`).toString("base64");
  return {
    "X-Billbee-Api-Key": key,
    Authorization: `Basic ${basic}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function GET() {
  try {
    const url = new URL(`${BILLBEE_BASE}/products/PatchableFields`);

    const res = await fetch(url.toString(), {
      headers: authHeaders(),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Billbee Error: ${res.status} - ${await res.text()}` },
        { status: res.status }
      );
    }

    const json = await res.json();
    const firstOrder = json?.Data?? null;

    return NextResponse.json(firstOrder ?? {});
    
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
