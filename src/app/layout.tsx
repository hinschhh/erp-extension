// app/layout.tsx
"use client";

import React, { Suspense, useEffect, useMemo } from "react";

import { Refine } from "@refinedev/core";
import { RefineKbarProvider } from "@refinedev/kbar";
import routerProvider from "@refinedev/nextjs-router";
import { ColorModeContextProvider } from "@contexts/color-mode";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "@refinedev/antd/dist/reset.css";

import { dataProvider } from "@refinedev/supabase";
import { authProviderClient } from "../providers/auth-provider/auth-provider.client";
import { supabaseBrowserClient } from "@utils/supabase/client";
import resources from "@resources/index";
import { notificationProvider } from "@refinedev/antd";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Color-Scheme nur clientseitig bestimmen
  const prefersDark =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false;
  const defaultMode = prefersDark ? "dark" : "light";

  // Service Worker Registrierung (PWA)
  useEffect(() => {
    if (process.env.NODE_ENV!== "production") {
      console.warn("[SW] Service Worker wird nur in Produktion registriert.");
      return;
    }
    if ("serviceWorker" in navigator) {
      const onLoad = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .catch((err) => console.error("[SW] Registration failed:", err));
      };
      if (document.readyState === "complete") onLoad();
      else window.addEventListener("load", onLoad, { once: true });
    }
  }, []);

  return (
    <html lang="de">
      <head>
        <title>Land & Liebe ERP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* PWA Meta */}
        <meta name="theme-color" content="#5B6773" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <Suspense fallback={<div>Loading...</div>}>
          <RefineKbarProvider>
            <AntdRegistry>
              <ColorModeContextProvider defaultMode={defaultMode}>
                <Refine
                  routerProvider={routerProvider}
                  dataProvider={dataProvider(supabaseBrowserClient)}
                  authProvider={authProviderClient}
                  notificationProvider={notificationProvider}
                  resources={resources}
                  options={{
                    syncWithLocation: true,
                    warnWhenUnsavedChanges: true,
                    useNewQueryKeys: true,
                    projectId: "V7joKK-Y0IYFb-wYxC8k",
                    title: { text: "Land & Liebe", icon: "/logo.png" },
                  }}  
                        >
                          {children}
                </Refine>
              </ColorModeContextProvider>
            </AntdRegistry>
          </RefineKbarProvider>
        </Suspense>
      </body>
    </html>
  );
}
