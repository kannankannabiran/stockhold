"use client";

import React from "react";
import { useAccessControl } from "../../hooks/useAccessControl";
import VWAPScanner from "./VWAPScanner/page";

export default function ScannerPage() {
  const { hasAccess, loading } = useAccessControl('/longterm');

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return <VWAPScanner />;
}