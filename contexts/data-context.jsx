"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [rows, setRows] = useState([]);
  const [latestModel, setLatestModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false); // Tracks if we've fetched at least once

  const fetchBulkData = useCallback(async (force = false) => {
    // If not forcing and we already have data, skip fetch to save quota
    if (!force && hasLoaded) return;

    setLoading(true);
    setError("");
    try {
      const [txSnap, modelSnap] = await Promise.all([
        getDocs(query(collection(db, "transactions"), orderBy("date_time", "desc"), limit(3000))),
        getDocs(query(collection(db, "ml_models"), limit(50))),
      ]);
      setRows(txSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      
      const modelDocs = modelSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0));
      setLatestModel(modelDocs[0] || null);

      setLastRefreshed(new Date());
      setHasLoaded(true);
    } catch (err) {
      console.error("Data fetch error:", err);
      setError(err?.message || "Unable to load analytics data.");
    } finally {
      setLoading(false);
    }
  }, [hasLoaded]);

  // Forces a fresh pull, ignoring the cache
  const refreshData = useCallback(() => {
    return fetchBulkData(true);
  }, [fetchBulkData]);

  // Only pulls if we haven't loaded yet
  const ensureDataLoaded = useCallback(() => {
    return fetchBulkData(false);
  }, [fetchBulkData]);

  const updateCachedTransaction = useCallback((id, updates) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  }, []);

  const value = {
    rows,
    latestModel,
    loading,
    error,
    lastRefreshed,
    refreshData,
    ensureDataLoaded,
    updateCachedTransaction,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
