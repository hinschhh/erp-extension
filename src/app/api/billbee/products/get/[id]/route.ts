// src/app/api/billbee/products/get/[id]/route.ts
import { NextResponse } from "next/server";

const BILLBEE_BASE = process.env.NEXT_PUBLIC_BILLBEE_API_URL ?? "https://api.billbee.io/api/v1";
const BILLBEE_API_KEY = process.env.BILLBEE_API_KEY!;
const BILLBEE_USER = process.env.BILLBEE_USERNAME!;
const BILLBEE_PASSWORD = process.env.BILLBEE_API_PASSWORD!;

const authHeader = "Basic " + Buffer.from(`${BILLBEE_USER}:${BILLBEE_PASSWORD}`).toString("base64");

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      "X-Billbee-Api-Key": BILLBEE_API_KEY,
      Authorization: authHeader,
      Accept: "application/json",
      "User-Agent": "Land-und-Liebe/Produktbild-Fetch (Next.js)",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let body: any;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

type ImageData = { Url?: string; ThumbUrl?: string; Id?: number; IsDefault?: boolean; Position?: number };

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const productId = Number(params.id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ imageUrl: undefined, error: "Invalid product id" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const imageIdParam = searchParams.get("imageId");
    const imageId = imageIdParam ? Number(imageIdParam) : undefined;

    // 1) Falls imageId bekannt: direkt Einzelbild
    if (Number.isFinite(imageId!)) {
      const one = await fetchJson(`${BILLBEE_BASE}/products/${productId}/images/${imageId}`);
      if (one.ok) {
        const d: ImageData = one.body?.Data ?? {};
        return NextResponse.json(
          { imageUrl: d.Url ?? undefined, thumbUrl: d.ThumbUrl ?? undefined, imageId: d.Id ?? imageId },
          { status: 200 },
        );
      }
    }

    // 2) Liste holen und Default/erstes nehmen
    const list = await fetchJson(`${BILLBEE_BASE}/products/${productId}/images`);
    if (list.ok) {
      const arr: ImageData[] = Array.isArray(list.body?.Data) ? list.body.Data
        : Array.isArray(list.body) ? list.body : [];
      const chosen = arr.find((x) => x?.IsDefault) ?? arr[0];
      return NextResponse.json(
        {
          imageUrl: chosen?.Url ?? undefined,
          thumbUrl: chosen?.ThumbUrl ?? undefined,
          imageId: chosen?.Id ?? undefined,
          // optional debug: usedProductId: productId,
        },
        { status: 200 },
      );
    }

    const status = list.status || 500;
    const msg = (typeof list.body === "string" ? list.body : list.body?.ErrorMessage) || "Billbee request failed";
    return NextResponse.json({ imageUrl: undefined, error: msg }, { status });
  } catch (err) {
    return NextResponse.json(
      { imageUrl: undefined, error: (err as Error)?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
