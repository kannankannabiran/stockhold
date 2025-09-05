// "use client";

// import React from "react";
// import { useAccessControl } from "../../hooks/useAccessControl";
// import VWAPScanner from "./VWAPScanner/page";

// export default function ScannerPage() {
//   const { hasAccess, loading } = useAccessControl('/longterm');

//   if (loading) return <div>Loading...</div>;
//   if (!hasAccess) return null;

//   return <VWAPScanner />;
// }


"use client";

import React from "react";
import { ScanProvider } from "../context/SwingContext";
import VWAPScanner from "./VWAPScanner/page";

export default function ScannerPage() {
  return (
    <ScanProvider>
      <VWAPScanner />
    </ScanProvider>
  );
}