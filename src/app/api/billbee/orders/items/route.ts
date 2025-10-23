// src/app/api/billbee/orders/items/route.ts
import { NextRequest } from "next/server";

const BILLBEE_BASE = "https://api.billbee.io/api/v1";
const PAGE_SIZE = 250; // Max laut Doku

type BillbeeAttribute = {
  Id?: string;
  Name?: string;
  Value?: string;
  Price?: number;
};

type BillbeeProduct = {
  SKU?: string;
  Title?: string;
};

type BillbeeOrderItem = {
  Product?: BillbeeProduct;
  Attributes?: BillbeeAttribute[];
};

type BillbeeOrder = {
  OrderNumber?: string;
  OrderItems?: BillbeeOrderItem[];
};

type BillbeeOrdersResponse = {
  Paging?: {
    Page: number;
    TotalPages: number;
    TotalRows: number;
    PageSize: number;
  };
  ErrorMessage?: string | null;
  ErrorCode?: number | null;
  ErrorDescription?: unknown;
  Data?: BillbeeOrder[];
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function buildHeaders() {
  const apiKey = requiredEnv("BILLBEE_API_KEY");
  const username = requiredEnv("BILLBEE_USERNAME");
  const apiPassword = requiredEnv("BILLBEE_API_PASSWORD");
  const basic = Buffer.from(`${username}:${apiPassword}`).toString("base64");

  return {
    "Content-Type": "application/json",
    "X-Billbee-Api-Key": apiKey,
    Authorization: `Basic ${basic}`,
  };
}

/**
 * GET /api/billbee/orders/items
 * Optional Query:
 * - minOrderDate (ISO, default: 2025-01-01T00:00:00Z)
 * - maxOrderDate (ISO, optional)
 * - format=tsv|json (default: tsv)
 */
export async function GET(req: NextRequest) {
  try {
    const headers = buildHeaders();
    const { searchParams } = new URL(req.url);

    const minOrderDate =
      searchParams.get("minOrderDate") ?? "2025-06-01T00:00:00Z";
    const maxOrderDate = searchParams.get("maxOrderDate") ?? undefined;
    const format = (searchParams.get("format") ?? "tsv").toLowerCase();

    // Paginiert alle Seiten ab
    let page = 1;
    let totalPages = 1;

    type Row = {
      OrderNumber: string;
      OrderItems: string; // Item-Titel
      "OrderItems.Product.SKU": string;
      "OrderItems.Attributes": string; // Name=Value | Name=Value ...
    };

    const rows: Row[] = [];

    do {
      const url = new URL(`${BILLBEE_BASE}/orders`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));
      url.searchParams.set("minOrderDate", minOrderDate);
      if (maxOrderDate) url.searchParams.set("maxOrderDate", maxOrderDate);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(
          `Billbee responded with ${res.status}: ${res.statusText} – ${txt}`,
        );
      }

      const body = (await res.json()) as BillbeeOrdersResponse;

      if (body.ErrorMessage) {
        throw new Error(
          `Billbee API error: ${body.ErrorMessage} (code: ${body.ErrorCode ?? "n/a"})`,
        );
      }

      totalPages = body.Paging?.TotalPages ?? 1;

      const orders = body.Data ?? [];
      for (const order of orders) {
        const orderNumber = order.OrderNumber ?? "";
        const items = order.OrderItems ?? [];
        for (const item of items) {
          const title = item.Product?.Title ?? "";
          const sku = item.Product?.SKU ?? "";
          const attrs =
            item.Attributes?.map((a) => `${a.Name ?? ""}=${a.Value ?? ""}`)
              .filter(Boolean)
              .join(" | ") ?? "";

          rows.push({
            OrderNumber: orderNumber,
            OrderItems: title,
            "OrderItems.Product.SKU": sku,
            "OrderItems.Attributes": attrs,
          });
        }
      }

      page += 1;
      // Kleiner Sicherheits-Puffer gegen Rate Limits
      // await new Promise((r) => setTimeout(r, 100)); // bei Bedarf aktivieren
    } while (page <= totalPages);

    if (format === "json") {
      return new Response(JSON.stringify(rows, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    // TSV-Ausgabe für einfaches Kopieren/Einfügen (Excel/Sheets-freundlich)
    const header = [
      "OrderNumber",
      "OrderItems",
      "OrderItems.Product.SKU",
      "OrderItems.Attributes",
    ];
    const lines = [
      header.join("\t"),
      ...rows.map((r) =>
        [
          r.OrderNumber,
          r.OrderItems,
          r["OrderItems.Product.SKU"],
          r["OrderItems.Attributes"],
        ]
          .map((v) => (v ?? "").toString().replace(/\r?\n/g, " ").trim())
          .join("\t"),
      ),
    ];
    const tsv = lines.join("\n");

    return new Response(tsv, {
      status: 200,
      headers: {
        "Content-Type": "text/tsv; charset=utf-8",
        "Content-Disposition":
          'inline; filename="billbee-order-items-since-2025-01-01.tsv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}
