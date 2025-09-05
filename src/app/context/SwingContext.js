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
    setScanning(true);
    setLoading(true);

    try {
      // 💥 Clear previous data
      setResults({ rise: [], decline: [] });
      localStorage.removeItem("vwapResults");

      // 🛜 Fetch from backend
      const res = await fetch("/api/long-data");
      const data = await res.json();

      // ✅ Save results to state
      setResults(data);

      // 💾 Save to localStorage
      localStorage.setItem("vwapResults", JSON.stringify(data));

      console.log("Scan completed and saved to localStorage:", data);
    } catch (error) {
      console.error("Scan failed", error);
    }

    setLoading(false);
    setScanning(false);
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
