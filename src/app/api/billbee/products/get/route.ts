import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const lookupBy = searchParams.get("lookupBy") || "id";

    if (!id) {
        return NextResponse.json({ error: "Missing 'id' parameter" }, { status: 400 });
    }

    const apiKey = process.env.BILLBEE_API_KEY;
    const username = process.env.BILLBEE_LOGIN;
    const password = process.env.BILLBEE_PASSWORD;

    if (!apiKey || !username || !password) {
        return NextResponse.json(
            { error: "Billbee API credentials are not set in environment variables" },
            { status: 500 }
        );
    }

    const url = `https://api.billbee.io/api/v1/products/${encodeURIComponent(
        id
    )}?lookupBy=${encodeURIComponent(lookupBy)}`;

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "X-Billbee-Api-Key": apiKey,
            Authorization: "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
}
