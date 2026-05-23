"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { NN_MIN_ROWS } from "@/lib/ml/constants";
import { getGlobalStats } from "@/lib/firestore-metadata";

const ModelContext = createContext();

export function ModelProvider({ children }) {
  const [activeModelType, setActiveModelType] = useState("logistic");
  const [lrModel, setLrModel] = useState(null);
  const [nnModel, setNnModel] = useState(null);
  const [totalLabeled, setTotalLabeled] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchLatestByType = useCallback(async (modelType) => {
    try {
      // Uses composite index: ml_models(modelType ASC, created_at DESC)
      // Reads exactly 1 doc instead of 100 — saves ~99 reads per model type
      const q = query(
        collection(db, "ml_models"),
        where("modelType", "==", modelType),
        orderBy("created_at", "desc"),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      console.error(`Error fetching ${modelType} model:`, error);
      return null;
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const [lr, nn, typeRes] = await Promise.all([
        fetchLatestByType("logistic"),
        fetchLatestByType("neural"),
        fetch("/api/model-type", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setLrModel(lr);
      setNnModel(nn);
      if (typeRes?.success) {
        setActiveModelType(typeRes.activeModelType || "logistic");
      }
    } catch (error) {
      console.error("Error refreshing models:", error);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [fetchLatestByType]);

  useEffect(() => {
    // Initial fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshModels();

    // Labeled count from metadata counter (1 doc read instead of 1000)
    const fetchLabeledCount = async () => {
      try {
        const stats = await getGlobalStats();
        // Use labeled_count if available, fall back to total_count for backward compat
        setTotalLabeled(stats.labeled_count ?? stats.total_count ?? 0);
      } catch (err) {
        console.error("Error fetching labeled count:", err);
      }
    };

    fetchLabeledCount();

    // Re-fetch count and models whenever a retrain completes
    const handler = () => {
      refreshModels();
      fetchLabeledCount();
    };
    window.addEventListener("model-retrained", handler);

    return () => {
      window.removeEventListener("model-retrained", handler);
    };
  }, [refreshModels]);

  const value = {
    activeModelType,
    setActiveModelType,
    lrModel,
    nnModel,
    totalLabeled,
    isTraining,
    setIsTraining,
    loading,
    initialized,
    refreshModels,
  };

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModel() {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error("useModel must be used within a ModelProvider");
  }
  return context;
}

