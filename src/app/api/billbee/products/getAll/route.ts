import { NextRequest, NextResponse } from "next/server";

// Billbee API Base URL
const BILLBEE_API_BASE = "https://api.billbee.io/api/v1/products";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Query-Parameter mit Defaults
    const page = searchParams.get("page") ?? "1";
    const pageSize = searchParams.get("pageSize") ?? "10";
    const minCreatedAt = searchParams.get("minCreatedAt");
    const minimumBillBeeArticleId = searchParams.get("minimumBillBeeArticleId");
    const maximumBillBeeArticleId = searchParams.get("maximumBillBeeArticleId");

    // Query-String dynamisch bauen
    const query = new URLSearchParams({
      page,
      pageSize,
    });

    if (minCreatedAt) query.append("minCreatedAt", minCreatedAt);
    if (minimumBillBeeArticleId) query.append("minimumBillBeeArticleId", minimumBillBeeArticleId);
    if (maximumBillBeeArticleId) query.append("maximumBillBeeArticleId", maximumBillBeeArticleId);

    // Request an Billbee API
    const response = await fetch(`${BILLBEE_API_BASE}?${query.toString()}`, {
      method: "GET",
      headers: {
        "X-Billbee-Api-Key": process.env.BILLBEE_API_KEY as string,
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.BILLBEE_USERNAME}:${process.env.BILLBEE_API_PASSWORD}`
          ).toString("base64"),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: true, status: response.status, message: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      ok: true,
      params: { page, pageSize, minCreatedAt, minimumBillBeeArticleId, maximumBillBeeArticleId },
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: true, message: error.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
