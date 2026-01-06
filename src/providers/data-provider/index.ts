"use client";

import type { DataProvider } from "@refinedev/core";
import { dataProvider as dataProviderSupabase } from "@refinedev/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";

const baseProvider = dataProviderSupabase(supabaseBrowserClient);

export const dataProvider: DataProvider = {
  ...baseProvider,

  custom: async ({ url, method, payload, headers, query }) => {
    const httpMethod = (method ?? "get").toUpperCase();

    // optional: query-params anhängen
    let finalUrl = url;
    if (query && Object.keys(query).length > 0) {
      const u = new URL(url, "http://localhost");
      Object.entries(query).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        u.searchParams.set(k, String(v));
      });
      finalUrl = u.pathname + u.search;
    }

    const isFormData = payload instanceof FormData;

    const res = await fetch(finalUrl, {
      method: httpMethod,
      body:
        httpMethod === "GET" || httpMethod === "HEAD"
          ? undefined
          : isFormData
            ? payload
            : payload
              ? JSON.stringify(payload)
              : undefined,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(headers ?? {}),
      },
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    return { data } as any;
  },
};
