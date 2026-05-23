"use client";

import { useEffect, useState } from "react";
import { NN_MIN_ROWS } from "@/lib/ml/constants";
import { useAuth } from "@/contexts/auth-context";
import { useModel } from "@/contexts/model-context";
import { logActivity } from "@/lib/activity-logs";

export default function RetrainModelCard() {
  const { user } = useAuth();
  const { 
    activeModelType, 
    setActiveModelType, 
    lrModel, 
    nnModel, 
    totalLabeled, 
    isTraining, 
    setIsTraining, 
    initialized 
  } = useModel();

  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [modelType, setModelType] = useState("logistic");
  const [isSwitching, setIsSwitching] = useState(false);

  // Sync internal UI state with global active type on mount
  useEffect(() => {
    if (initialized) {
      setModelType(activeModelType);
    }
  }, [initialized, activeModelType]);

  const handleModelTypeSwitch = async (newType) => {
    if (newType === modelType || isSwitching) return;
    setIsSwitching(true);
    setMessage("");
    try {
      const res = await fetch("/api/model-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelType: newType }),
      });
      const data = await res.json();
      if (data.success) {
        setModelType(newType);
        await logActivity({
          ownerUid: user.uid,
          userEmail: user.email,
          action: "model_switch",
          details: {
            newType,
            oldType: modelType
          }
        });
      }
    } catch {
      // silently ignore
    } finally {
      setIsSwitching(false);
    }
  };

  const [cooldown, setCooldown] = useState(0);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRetrain = async () => {
    if (cooldown > 0) return;

    // Reset all status states at the start of each click
    setMessage("");
    setIsError(false);
    setIsWarning(false);
    setIsTraining(false);

    // 1. Check Threshold Rule
    if (modelType === "neural" && totalLabeled < NN_MIN_ROWS) {
      setIsWarning(true);
      setMessage(`Cannot retrain: Neural Network requires at least ${NN_MIN_ROWS} labeled rows. Currently have ${totalLabeled}.`);
      return;
    }

    if (totalLabeled === 0) {
      setIsError(true);
      setMessage("Cannot retrain: No labeled transactions found in the database.");
      return;
    }

    // 2. Check for New Records
    const currentModel = modelType === "neural" ? nnModel : lrModel;
    const lastSize = (currentModel?.trainSize || 0) + (currentModel?.testSize || 0);
    const isNewArchitecture = modelType !== activeModelType;
    
    if (!isNewArchitecture && totalLabeled <= lastSize && currentModel) {
      setIsWarning(true);
      setMessage(`No new data found. Current version was already trained on all ${totalLabeled} available records.`);
      return;
    }

    setIsTraining(true);

    try {
      const response = await fetch("/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid: user?.uid || "anonymous", modelType }),
      });

      const result = await response.json();

      if (response.status === 429) {
        setCooldown(result.retryAfterSeconds || 60);
        throw new Error(result.message || "Rate limit exceeded.");
      }

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Retraining failed.");
      }

      // NN skipped due to insufficient data
      if (result.skipped) {
        setIsWarning(true);
        setMessage(result.message || `Neural Network requires ≥ 200 labeled rows.`);
        return;
      }

      setActiveModelType(modelType);
      setMessage(result.message || "Retraining successful.");
      
      await logActivity({
        ownerUid: user.uid,
        userEmail: user.email,
        action: "model_retrain",
        details: {
          modelType,
          version: result.version || "new_version",
          trainSize: totalLabeled
        }
      });

      window.dispatchEvent(new Event("model-retrained"));
    } catch (error) {
      setIsError(true);
      setMessage(error.message || "Retraining failed.");
    } finally {
      setIsTraining(false);
    }
  };

  const modelLabels = {
    logistic: "Logistic Regression",
    neural: "Neural Network",
  };

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
      <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        Manual Model Retraining
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Select a model type and retrain using labeled transactions from Firestore.
      </p>

      {/* Model type toggle */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Active Model
        </p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
          {["logistic", "neural"].map((type) => {
            const active = modelType === type;
            return (
              <button
                key={type}
                type="button"
                disabled={isSwitching || isTraining}
                onClick={() => handleModelTypeSwitch(type)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {modelLabels[type]}
              </button>
            );
          })}
        </div>

        {/* NN data requirement hint & Progress Bar */}
        {modelType === "neural" && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                </svg>
                Training Requirement: {totalLabeled} / {NN_MIN_ROWS} labeled rows
              </p>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {Math.min(100, Math.floor((totalLabeled / NN_MIN_ROWS) * 100))}%
              </span>
            </div>
            
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div 
                className={`h-full bg-amber-500 ${initialized ? "transition-all duration-500 ease-out" : ""}`}
                style={{ 
                  width: `${Math.min(100, (totalLabeled / NN_MIN_ROWS) * 100)}%`,
                  backgroundColor: totalLabeled >= NN_MIN_ROWS ? "#10b981" : "#f59e0b"
                }}
              />
            </div>
            
            {totalLabeled < NN_MIN_ROWS && (
              <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 italic">
                Neural Networks require more data than Logistic Regression to avoid overfitting. Upload more CSVs or manually label transactions to unlock.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Retrain button + version badge */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRetrain}
          disabled={isTraining || cooldown > 0}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isTraining
            ? `Training ${modelLabels[modelType]}…`
            : cooldown > 0
            ? `Rate limited — retry in ${cooldown}s`
            : `Retrain ${modelLabels[modelType]}`}
        </button>

        {activeModelType === modelType && (modelType === "neural" ? nnModel : lrModel) && !isWarning && (
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
            Latest: {(modelType === "neural" ? nnModel : lrModel).modelVersion}
          </span>
        )}
      </div>

      {(modelType === "neural" ? nnModel : lrModel) && !isWarning && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
          Training size: {(modelType === "neural" ? nnModel : lrModel).trainSize} labeled rows
        </p>
      )}

      {/* Pop-up Notification (Toast or Processing) */}
      {(message || isTraining) && (
        <div className="absolute bottom-4 right-4 z-50 animate-in fade-in zoom-in-95 duration-200 max-w-[calc(100%-2rem)]">
          <div
            className={`flex items-center gap-3 rounded-xl border p-3 shadow-xl backdrop-blur-md ${
              isTraining
                ? "border-blue-200 bg-blue-50/95 text-blue-800 dark:border-blue-800 dark:bg-blue-900/90 dark:text-blue-100"
                : isError
                ? "border-rose-200 bg-rose-50/95 text-rose-800 dark:border-rose-800 dark:bg-rose-900/90 dark:text-rose-100"
                : isWarning
                ? "border-amber-200 bg-amber-50/95 text-amber-800 dark:border-amber-800 dark:bg-amber-900/90 dark:text-amber-100"
                : "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/90 dark:text-emerald-100"
            }`}
          >
            <div className="shrink-0">
              {isTraining && (
                <div className="flex h-5 w-5 items-center justify-center">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              )}
              {isError && (
                <svg className="h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isWarning && (
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {!isError && !isWarning && !isTraining && (
                <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            
            <div className="flex flex-col min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-tight opacity-70">
                {isTraining ? "Processing" : isError ? "Error" : isWarning ? "System Note" : "Success"}
              </p>
              <p className="text-xs leading-tight font-medium">
                {isTraining ? `Optimizing ${modelLabels[modelType]} brain...` : message}
              </p>
            </div>

            {!isTraining && (
              <button 
                onClick={() => setMessage("")}
                className="shrink-0 ml-2 rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
