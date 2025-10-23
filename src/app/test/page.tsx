"use client";

import React, { useEffect, useState } from "react";

export default function BillbeeOrdersPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/billbee/orders/items?format=json")
      .then((res) => res.json())
      .then(setRows);
  }, []);

  return (
    <div>
      <h1>Billbee Orders</h1>
      <table border={1}>
        <thead>
          <tr>
            <th>OrderNumber</th>
            <th>Item</th>
            <th>SKU</th>
            <th>Attributes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.OrderNumber}</td>
              <td>{r.OrderItems}</td>
              <td>{r["OrderItems.Product.SKU"]}</td>
              <td>{r["OrderItems.Attributes"]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
