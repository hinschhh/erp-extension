// App Router – serverseitiger Proxy zu Billbee
// Bewahrt API-Key & Basic Auth vor dem Browser (CORS + Sicherheit)
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { sku, newQuantity, reason, forceSend, autosubtractReservedAmount } =
      await req.json();

    if (!sku || newQuantity == null) {
      return NextResponse.json(
        { error: "sku und newQuantity sind erforderlich" },
        { status: 400 },
      );
    }

    const apiKey = process.env.BILLBEE_API_KEY;
    const username = process.env.BILLBEE_LOGIN;
    const apiPassword = process.env.BILLBEE_PASSWORD;

    if (!apiKey || !username || !apiPassword) {
      return NextResponse.json(
        { error: "Billbee-Credentials fehlen (Env)" },
        { status: 500 },
      );
    }

    const auth = Buffer.from(`${username}:${apiPassword}`).toString("base64");

    const payload = {
      Sku: sku,                                   // wir adressieren per SKU
      NewQuantity: Number(newQuantity),           // absoluter verfügbarer Bestand
      ForceSendStockToShops: !!forceSend,         // optional: Push an Shops erzwingen
      AutosubtractReservedAmount:
        !!autosubtractReservedAmount,             // wir senden bereits 'verfügbar'
      Reason: reason ?? "Update via Inventur UI",
      // Alternativfelder (nicht genutzt): BillbeeId, StockId, DeltaQuantity (ignored)
    };

    const res = await fetch("https://api.billbee.io/api/v1/products/updatestock", {
      method: "POST",
      headers: {
        "X-Billbee-Api-Key": apiKey,
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      return new NextResponse(text || "Billbee Fehler", { status: res.status });
    }

    return new NextResponse(text, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
