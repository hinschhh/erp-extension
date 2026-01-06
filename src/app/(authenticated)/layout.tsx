
"use client";

import React from "react"
import { Authenticated } from "@refinedev/core";
import { ThemedLayoutV2, ThemedSiderV2 } from "@refinedev/antd";
import { Layout, Menu } from "antd";
import Image from "next/image";
import Link from "next/link";

const CustomTitle = ({ collapsed }: { collapsed: boolean }) => (
  <Link href="/">
    <span>
      {collapsed ? (
        <Image src="../../../public/LL_500x500.png" alt="L&L" width={60} height={60} />
      ) : (
        <Image src="/L&L_Logo_1200_x_200.jpg" alt="Land & Liebe" width={171} height={40} />
      )}
    </span>
  </Link>
);

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Authenticated v3LegacyAuthProviderCompatible={true} key="authenticated">
      <ThemedLayoutV2
      Sider={() => (
            <ThemedSiderV2
              Title={({ collapsed }) => <CustomTitle collapsed={collapsed} />}
              render={({ items, logout, collapsed }) => {
                return (
                  <>
                    {items}
                    {logout}
                  </>
                );
              }}
            />
          )}
          
          Footer={() => (
            <Layout.Footer
              style={{
                textAlign: "center",
                color: "#fff",
                backgroundColor: "#5B6773",
              }}
            >
              Ich muss Christin erst um Erlaubnis fragen, ob ich hier etwas einfügen darf.
            </Layout.Footer>
          )}>
        {children}
      </ThemedLayoutV2>
    </Authenticated>
  );
}
