"use client";

import { useTable, Show } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { useList, useOne } from "@refinedev/core";
import { Card, Col, Descriptions, Row, Table, Tag, Typography } from "antd";
import { Area, AreaConfig } from "@ant-design/plots";
import Link from "next/link";
import { DollarCircleOutlined } from "@ant-design/icons";

type Product = Tables<"app_products">;
type ProductBOM = Tables<"bom_recipes"> & {
  component?: {
    bb_sku: string;
    bb_net_purchase_price: number;
  };
};
type PurchaseOrderPosition = Tables<"app_purchase_orders_positions_normal">;

export default function ArtikelAnzeigenPage({ params }: { params: { id: string } }) {
    const id = params.id;
    const today = new Date();
    const twoYearsAgo = new Date();
    twoYearsAgo.setDate(today.getDate() - 730);

    const {data: product,  isLoading: isLoadingProduct, isError: isErrorProduct } = useOne<Product>({
    resource: "app_products",
    id: id,
  });

  const { tableProps: tablePropsBOM } = useTable<ProductBOM>({
    resource: "bom_recipes",
    meta: {
      select: "*, component:app_products!bom_recipes_billbee_component_id_fkey(bb_sku, bb_net_purchase_price)",
    },
    filters:{permanent: [{ field: "billbee_bom_id", operator: "eq", value: id }], mode: "server" },
  });

  const {data: materialCostDevelopment} = useList<PurchaseOrderPosition>({
    resource: "app_purchase_orders_positions_normal",
    filters: [{ field: "billbee_product_id", operator: "eq", value: id }, {field: "goods_received_at", operator: "nnull", value: null}],
    sorters: [{ field: "goods_received_at", order: "asc" }],
  });

  const rawData = materialCostDevelopment?.data ?? [];

const chartData =
  rawData
    .filter((item) => item.goods_received_at) // safety
    .map((item) => ({
      date: new Date(item.goods_received_at as string),
      purchase_price: Number(item.unit_price_net),
    }));


  const config: Omit<AreaConfig, "animate"> = {
    data: chartData,
    xField: 'date',
    yField: 'purchase_price',
    height: 150,
    scale: {
      x: {
        type: "time",
        domain: [twoYearsAgo, today], // letzte 730 Tage
        nice: false,                  // nicht automatisch “schön” erweitern
      },
    },
    axis:{
      x: {
        tickCount: 4,
        labelFormatter: (v: number) => {
          return `${new Date(v).getDate()}.${new Date(v).getMonth()+1}.${new Date(v).getFullYear()}`
        },
        labelAutoRotate: false,
    },
      y: {
        tickCount: 4,
        labelFormatter: (v: number) => {
            return `${Number(v)} €`
          },
      },
    },
    tooltip: {
      title: {channel: 'x', valueFormatter: (v: number) => {
        const d = new Date(v);
        const day = d.getDate().toString().padStart(2, "0");
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const year = d.getFullYear();
        return `Datum: ${day}.${month}.${year}`;
      }},
      items: [{name: 'Einkaufspreis:', channel: 'y', valueFormatter: (v: number) =>
        `${v.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
      }],
    },
    stack: false,
    shapeField: 'smooth',
    style: {
      fill: 'linear-gradient(-90deg, white 0%, blue 100%)',
    },
    line: {
      style:{ stroke: 'blue' },
    },
    point: {
      size: 1,
      shape: 'circle',
      style: { fill: 'linear-gradient(-90deg, white 0%, blue 100%)', stroke: 'blue' },
    },
  };

  const bomMaterialCosts = tablePropsBOM?.dataSource?.reduce((sum, item) => {
    const unitPrice = item.component?.bb_net_purchase_price ?? 0;
    return sum + unitPrice * item.quantity;
  }, 0) ?? 0;
  const shippingCosts = 120.00;
  const totalCosts = bomMaterialCosts + shippingCosts;
  const margin = Math.round(((product?.data.bb_Net ?? 1) - totalCosts) / (product?.data.bb_Net ?? 1) * 100);
  const shippingCostRatio = Math.round((shippingCosts / (product?.data.bb_Net ?? 1)) * 100);
  const materialCostRatio = Math.round((bomMaterialCosts / (product?.data.bb_Net ?? 1)) * 100);

  const mkTagColor = materialCostRatio < 25 ? "green" : materialCostRatio < 30 ? "gold" : "red";
  const vkTagColor = shippingCostRatio < 6 ? "green" : shippingCostRatio < 8 ? "gold" : "red";
  const marginTagColor = margin >= 70 ? "green" : margin >= 60 ? "gold"  : "red";         

  
  return (
    <Show title={product?.data.bb_sku + " anzeigen"} isLoading={isLoadingProduct}>
      <Descriptions layout="horizontal" column={1} >
        <Descriptions.Item label="SKU">{product?.data.bb_sku}</Descriptions.Item>
        <Descriptions.Item label="Name">{product?.data.bb_name}</Descriptions.Item>
        <Descriptions.Item label="Preis (brutto)">{product?.data.bb_Price} €</Descriptions.Item>
        <Descriptions.Item label="Preis (netto)">{product?.data.bb_Net} €</Descriptions.Item>
        <Descriptions.Item label="Kalkulation" >
            <Col style={{width: "40%"}}>
              <Row>
                <Tag color={mkTagColor}>MK-Quote: {materialCostRatio} %</Tag><Tag color={vkTagColor}>VK-Quote: {shippingCostRatio} %</Tag><Tag color={marginTagColor}>Marge: {margin} %</Tag>
              </Row>
              <Row>
                <Table {...tablePropsBOM} 
                    showHeader={false} 
                    size="small" 
                    footer={() => (
                        <>
                            <div style={{display:"flex", justifyContent:"space-between"}}>
                                <div>Materialkosten:</div><strong>{bomMaterialCosts ?? 0}</strong>
                            </div>
                            <div style={{display:"flex", justifyContent:"space-between"}}>
                                <div>Versandkosten:</div><strong>{shippingCosts}</strong>
                            </div>
                            <div style={{display:"flex", justifyContent:"space-between"}}>
                                <div>Sonstige Variablekosten :</div><strong>{0}</strong>
                            </div>
                            <div style={{display:"flex", justifyContent:"space-between"}}>
                                <div>Stückkosten:</div><strong>{totalCosts ?? 0}</strong>
                            </div>
                        </>
                    )} 
                    rowKey="id"
                    pagination={false} 
                    style={{ marginTop: 16 }}
                    >
                    <Table.Column title="ID" dataIndex="id" key="id" hidden/>
                    <Table.Column title="Menge" dataIndex="quantity" key="quantity" render={(value, item) => `${item.quantity} x`}/>
                    <Table.Column title="Komponente" dataIndex={["component", "bb_sku"]} key="bb_sku" render={(value, item) => <Link href={`/artikel/anzeigen/${item.component?.id}`}>{value}</Link>}/>
                    <Table.Column title="Netto Einkaufspreis" dataIndex={["component", "bb_net_purchase_price"]} key="bb_net_purchase_price" align="right"/>
                </Table>
              </Row>
            </Col>

            <Col style={{width: "60%", height:"240px"}}>
              <Card style={{width: "100%", height: "100%"}} title={<><DollarCircleOutlined /><Typography.Text style={{ marginLeft:'0.5rem'}}>Entwicklung der Einkaufspreise</Typography.Text></>}>
                  <Area {...config}></Area>
              </Card>    
            </Col>

      </Descriptions.Item>
    </Descriptions>
    </Show>
  );
}