// app/layout.tsx
'use client';

import React, { Suspense, useState } from 'react';

import { Authenticated, Refine } from '@refinedev/core';
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar';
import routerProvider from '@refinedev/nextjs-router';
import { Layout, Sider, useNotificationProvider, ThemedLayoutV2, ThemedHeaderV2 } from '@refinedev/antd';
import { ColorModeContextProvider } from '@contexts/color-mode';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import '@refinedev/antd/dist/reset.css';

import { dataProvider } from '@refinedev/supabase';
import { authProviderClient } from '../providers/auth-provider/auth-provider.client';
import { supabaseBrowserClient } from '@utils/supabase/client';
import resources from '@resources/index';
import { Menu,} from 'antd';
import {

  DashboardOutlined,
  AppstoreOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";

export default function RootLayout({ children }: { children: React.ReactNode }) {
   // Entweder fest auf 'light' oder per Media Query:
  const prefersDark = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  const defaultMode = prefersDark ? 'dark' : 'light';

  return (
    <html lang="de">
      <head>
        <title>Land & Liebe ERP</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
                  notificationProvider={useNotificationProvider}
                  resources={resources}
                  options={{
                    syncWithLocation: true,
                    warnWhenUnsavedChanges: true,
                    useNewQueryKeys: true,
                    projectId: 'V7joKK-Y0IYFb-wYxC8k',
                    title: { text: 'Land & Liebe', icon: '/logo.png' },
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
