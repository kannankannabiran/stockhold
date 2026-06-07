"use client";

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

const VwapScanContext = createContext();

export function VwapScanProvider({ children }) {
  const vwapScanData = useVwapScan();
  return (
    <VwapScanContext.Provider value={vwapScanData}>
      {children}
    </VwapScanContext.Provider>
  );
}

// Safe fallback if used outside provider (e.g., during prerender)
export function useVwapScanContext() {
  const context = useContext(VwapScanContext);
  if (!context) {
    return {
      results: { rise: [], decline: [] },
      loading: false,
      scanning: false,
      handleScan: () => {},
      cancelScan: () => {},
    };
  }
  return context;
}

export function useVwapScan() {
  const [results, setResults] = useState({ rise: [], decline: [] });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const pollIntervalRef = useRef(null);

  // Fetch current status + data from server
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/long-data");
      if (!res.ok) return;
      const data = await res.json();
      setResults(data);
      setScanning(!!data.isScanning);

      // Stop polling if scan is done
      if (!data.isScanning && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        console.log("✅ Scan completed — polling stopped.");
      }
    } catch (err) {
      console.warn("Failed to fetch scan status:", err);
    }
  }, []);

  // Start polling every 5 seconds
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // already polling
    pollIntervalRef.current = setInterval(fetchStatus, 5000);
  }, [fetchStatus]);

  // On mount: load current data, then poll if scan is in progress
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/long-data");
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          if (data.isScanning) {
            setScanning(true);
            startPolling();
          }
        }
      } catch (err) {
        console.warn("Init fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };
    init();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [startPolling]);

  // Scan button: only triggers POST — which only starts a scan if none is running
  const handleScan = useCallback(async () => {
    if (scanning) {
      // If already scanning, just refresh displayed data
      fetchStatus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/long-data", { method: "POST" });
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      setResults(data);
      if (data.isScanning) {
        setScanning(true);
        startPolling();
      }
    } catch (error) {
      console.error("Scan trigger failed:", error);
      alert("Scan failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [scanning, fetchStatus, startPolling]);

  // Stop client-side polling (doesn't cancel the server-side scan)
  const cancelScan = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setScanning(false);
    setLoading(false);
  }, []);

  return {
    results,
    loading,
    scanning,
    handleScan,
    cancelScan,
  };
}
