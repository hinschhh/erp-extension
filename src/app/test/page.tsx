"use client";
import { LoadingFallback } from "@components/common/loading-fallback";
import * as React from "react";

export default function ReactProbe() {
  console.log("React.version =", React.version);
  console.log("typeof createContext =", typeof React.createContext);
  return (<LoadingFallback />);
}
