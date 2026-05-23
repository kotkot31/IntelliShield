"use client";

import { NN_MIN_ROWS } from "@/lib/ml/constants";
import { formatDate } from "@/utils/format-date";
import { useModel } from "@/contexts/model-context";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(value) {
  if (value == null) return "—";
  return (Number(value) * 100).toFixed(1) + "%";
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ModelAnalyticsCard() {
  const { lrModel, nnModel, activeModelType: activeType, loading } = useModel();

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Model Analytics
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Loading model information…</p>
      </section>
    );
  }

  const nnUnavailable = !nnModel;
  const nnInsufficient = nnModel && (nnModel.trainSize || 0) < NN_MIN_ROWS;

  function colClass(type) {
    return activeType === type
      ? "rounded-xl border-2 border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20 p-4"
      : "rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 p-4";
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Model Analytics
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Side-by-side comparison of both trained models. Active model is highlighted.
          </p>
        </div>
        <span className={`hidden shrink-0 rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex ${
          activeType === "neural"
            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
            : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
        }`}>
          Active: {activeType === "neural" ? "Neural Network" : "Logistic Regression"}
        </span>
      </div>

      {/* Column headers */}
      <div className="mt-5 grid grid-cols-2 gap-4">
        {/* LR column */}
        <div className={colClass("logistic")}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Logistic Regression
            </p>
            {activeType === "logistic" && (
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                ACTIVE
              </span>
            )}
          </div>

          {lrModel ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {[
                  ["Accuracy", fmt(lrModel.metrics?.accuracy)],
                  ["Precision", fmt(lrModel.metrics?.precision)],
                  ["Recall", fmt(lrModel.metrics?.recall)],
                  ["F1 Score", fmt(lrModel.metrics?.f1)],
                  ["Train size", `${lrModel.trainSize ?? "—"} rows`],
                  ["Test size", `${lrModel.testSize ?? "—"} rows`],
                  ["Version", lrModel.modelVersion || "—"],
                  ["Trained at", formatDate(lrModel.created_at)],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{val}</p>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No Logistic Regression model trained yet.
            </p>
          )}
        </div>

        {/* NN column */}
        <div className={colClass("neural")}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Neural Network
            </p>
            {activeType === "neural" && (
              <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                ACTIVE
              </span>
            )}
          </div>

          {nnUnavailable ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                ⚠ Not Yet Trained
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Neural Network requires ≥ {NN_MIN_ROWS} labeled transactions.
                Upload more data and retrain using the Neural Network model type.
              </p>
            </div>
          ) : nnInsufficient ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/20">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                ⚠ Insufficient Data
              </p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Last run had {nnModel.trainSize} rows. Need ≥ {NN_MIN_ROWS} to train.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {[
                ["Accuracy", fmt(nnModel.metrics?.accuracy)],
                ["Precision", fmt(nnModel.metrics?.precision)],
                ["Recall", fmt(nnModel.metrics?.recall)],
                ["F1 Score", fmt(nnModel.metrics?.f1)],
                ["Train size", `${nnModel.trainSize ?? "—"} rows`],
                ["Test size", `${nnModel.testSize ?? "—"} rows`],
                ["Version", nnModel.modelVersion || "—"],
                ["Trained at", formatDate(nnModel.created_at)],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
        Switch the active model using the toggle in the Retrain Card below.
        Changes take effect on the next CSV upload or retrain.
      </p>
    </section>
  );
}
