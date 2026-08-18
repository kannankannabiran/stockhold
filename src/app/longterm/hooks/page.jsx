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

function stopPollingTimer(pollIntervalRef) {
  if (pollIntervalRef.current) {
    clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = null;
  }
}

export function useVwapScan() {
  const [results, setResults] = useState({ rise: [], decline: [] });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const pollIntervalRef = useRef(null);
  const pollingStoppedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (pollingStoppedRef.current) return;
    try {
      const res = await fetch("/api/long-data");
      if (!res.ok) return;
      const data = await res.json();
      if (pollingStoppedRef.current) return;

      setResults(data);
      setScanning(!!data.isScanning);

      if (!data.isScanning) {
        stopPollingTimer(pollIntervalRef);
      }
    } catch (err) {
      console.warn("Failed to fetch scan status:", err);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingStoppedRef.current) return;
    if (pollIntervalRef.current) return;
    pollIntervalRef.current = setInterval(fetchStatus, 5000);
  }, [fetchStatus]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/long-data");
        if (!res.ok || cancelled || pollingStoppedRef.current) return;
        const data = await res.json();
        if (cancelled || pollingStoppedRef.current) return;
        setResults(data);
        if (data.isScanning) {
          setScanning(true);
          startPolling();
        }
      } catch (err) {
        console.warn("Init fetch failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();

    return () => {
      cancelled = true;
      stopPollingTimer(pollIntervalRef);
    };
  }, [startPolling]);

  const handleScan = useCallback(async () => {
    if (scanning && !pollingStoppedRef.current) {
      fetchStatus();
      return;
    }

    pollingStoppedRef.current = false;
    setLoading(true);
    setScanning(true);
    try {
      const res = await fetch("/api/long-data", { method: "POST" });
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      if (pollingStoppedRef.current) return;
      setResults(data);
      setScanning(true);
      startPolling();
    } catch (error) {
      console.error("Scan trigger failed:", error);
      setScanning(false);
      alert("Scan failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [scanning, fetchStatus, startPolling]);

  const cancelScan = useCallback(() => {
    pollingStoppedRef.current = true;
    stopPollingTimer(pollIntervalRef);
    setScanning(false);
    setLoading(false);
    setResults((prev) => ({ ...prev, isScanning: false }));

    fetch("/api/long-data", { method: "DELETE" }).catch((err) => {
      console.warn("Failed to cancel background scan:", err);
    });
  }, []);

  return {
    results,
    loading,
    scanning,
    handleScan,
    cancelScan,
  };
}
