"use client";

import { createContext, useEffect, useState } from "react";

export const ScanContext = createContext();

export function ScanProvider({ children }) {
  const [results, setResults] = useState({ rise: [], decline: [] });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  // ✅ Load saved scan results on mount
  useEffect(() => {
    const savedResults = localStorage.getItem("vwapResults");
    if (savedResults) {
      try {
        setResults(JSON.parse(savedResults));
      } catch (e) {
        console.error("Failed to parse saved results:", e);
      }
    }
  }, []);

  // ✅ Scan and store results in localStorage
const handleScan = async () => {
  try {
    const res = await fetch("/api/load-scan-data");
    const data = await res.json();
    if (data?.rise?.length || data?.decline?.length) {
      setResults(data);
    } else {
      alert("No saved scan data available.");
    }
  } catch (err) {
    alert("Error loading scan data");
  }
};

  // ✅ Cancel Scan
  const cancelScan = () => {
    setScanning(false);
    setLoading(false);
  };

  return (
    <ScanContext.Provider
      value={{
        results,
        loading,
        scanning,
        handleScan,
        cancelScan,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}