"use client";

import React from "react";
import { useAccessControl } from "../../hooks/useAccessControl";
import { VwapScanProvider } from "./hooks/page";
import VWAPScanner from "./VWAPScanner/page";

export default function ScannerPage() {
  const { hasAccess, loading } = useAccessControl('/longterm');

  if (loading) return <div className="p-6 text-center text-gray-600 font-medium">Loading...</div>;
  if (!hasAccess) return null;

  return (
    <VwapScanProvider>
      <VWAPScanner />
    </VwapScanProvider>
  );
}