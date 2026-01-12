"use client";

import { useTable, List, DeleteButton, EditButton } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Space, Table } from "antd";
import Link from "next/link";

type Orders = Tables<"app_orders">;

export default function PageAuftragÜbersicht() {
    const { tableProps } = useTable<Orders>({
        resource: "app_orders",
        meta: { select: "*, app_customers(*)" },
        pagination: { mode: "off" },
        filters: { mode: "server" },
        sorters: { initial:[{field:"bb_CreatedAt", order:"desc"}],mode: "server" },
    });
    return (
        <List>
            <Table {...tableProps} rowKey="id">
                <Table.Column title="Auftragsnummer" dataIndex="bb_OrderNumber" sorter 
                    render={(v, r) =>
                        v ? (
                        <Link href={`/kundenberatung/auftrag/${r.id}`}>
                            {v}
                        </Link>
                        ) : (
                        
                        <Link href={`/kundenberatung/auftrag/${r.id}`}>
                            —
                        </Link>
                        )
                    }
                />
                <Table.Column title="Kunde" dataIndex={["app_customers", "bb_Name"]} sorter />
                <Table.Column title="Status" dataIndex="bb_State" sorter />
                <Table.Column title="Erstellt am" dataIndex="bb_CreatedAt" sorter />
            </Table>
        </List>
    
    );
}