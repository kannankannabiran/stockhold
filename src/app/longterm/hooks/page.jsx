"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useVwapScan() {
  const [results, setResults] = useState({ rise: [], decline: [] });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const controllerRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("longterm");
    if (saved) {
      try {
        setResults(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved results:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (Array.isArray(results?.rise) && results.rise.length) {
      fetch("/api/save-scan-data-long-term", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results),
      }).catch((e) => console.warn("Failed saving long-term scan data:", e));
    }
  }, [results]);

  useEffect(() => {
    if (!Array.isArray(results?.rise) || results.rise.length === 0) {
      fetch("/api/load-scan-data-long-term")
        .then((res) => res.json())
        .then((data) => {
          if (data?.rise?.length) {
            console.log("Loaded saved scan data from server:", data);
            setResults(data);
            localStorage.setItem("longterm", JSON.stringify(data));
          }
        })
        .catch((e) => console.warn("Failed loading long-term scan data:", e));
    }
  }, [results]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setLoading(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      setResults({ rise: [], decline: [] });
      localStorage.removeItem("longterm");

      const res = await fetch("/api/long-data", { signal: controller.signal });
      if (!res.ok) throw new Error("Network error during scan");
      const data = await res.json();

      setResults(data);
      localStorage.setItem("longterm", JSON.stringify(data));
      console.log("Scan completed and saved to localStorage:", data);
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Scan cancelled by user.");
      } else {
        console.error("Scan failed", error);
        alert("Scan failed. Check console for details.");
      }
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  const cancelScan = () => {
    controllerRef.current?.abort();
    setScanning(false);
    setLoading(false);
  };

  return {
    results,
    loading,
    scanning,
    handleScan,
    cancelScan,
  };
}
