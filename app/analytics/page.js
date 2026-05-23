"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";
import { collection, getDocs, limit, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProtectedRoute from "@/components/protected-route";
import { formatMoney } from "@/utils/format-money";
import TransactionDetailsModal from "@/components/transaction-details-modal";
import { useAuth } from "@/contexts/auth-context";
import { useData } from "@/contexts/data-context";
import RoleBadge from "@/components/role-badge";
import RefreshDataButton from "@/components/refresh-data-button";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Filler,
);

function dateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toISOString().slice(0, 10);
}

function DetailsPopup({ title, data, colorClass, onTransactionClick }) {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [data.length]);

  const currentRows = data.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 w-80 pt-3 invisible opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 cursor-default">
      <div className={`rounded-xl border bg-white p-4 shadow-xl dark:bg-slate-800 ${colorClass}`}>
        <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">{title} Details</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
          {currentRows.length === 0 ? (
             <p className="text-xs text-slate-500">No data available.</p>
          ) : (
            currentRows.map(r => (
              <div key={r.id} className="text-xs border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 last:pb-0">
                <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                  <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTransactionClick?.(r); }}
                    className="hover:underline text-blue-600 dark:text-blue-400 text-left cursor-pointer"
                  >
                    {r.transaction_id}
                  </button>
                  <span>{formatMoney(r.amount)}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400 mt-1">
                  <span className="truncate pr-2">{r.user_id}</span>
                  <span className="shrink-0">{r.location}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <button 
            disabled={page === 1} 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPage(p => Math.max(1, p - 1)); }}
            className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:!bg-transparent dark:text-amber-400 dark:hover:text-orange-400 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button 
            disabled={page === totalPages} 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPage(p => Math.min(totalPages, p + 1)); }}
            className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:!bg-transparent dark:text-amber-400 dark:hover:text-orange-400 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { role } = useAuth();
  const { rows, latestModel, loading, error, lastRefreshed, ensureDataLoaded, refreshData } = useData();
  const [selectedTx, setSelectedTx] = useState(null);
  const [isStale, setIsStale] = useState(false);

  const fraudRows = useMemo(() => rows.filter((r) => (r.finalStatus || r.status) === "Fraud"), [rows]);
  const legitimateRows = useMemo(() => rows.filter((r) => (r.finalStatus || r.status) !== "Fraud"), [rows]);

  // Initial load
  useEffect(() => {
    ensureDataLoaded();
  }, [ensureDataLoaded]);

  // Listen for new data from CSV uploads
  useEffect(() => {
    const handler = () => setIsStale(true);
    window.addEventListener("data-updated", handler);
    return () => window.removeEventListener("data-updated", handler);
  }, []);

  const handleRefresh = useCallback(() => {
    setIsStale(false);
    refreshData();
  }, [refreshData]);

  const stats = useMemo(() => {
    const fraud = fraudRows.length;
    const legitimate = legitimateRows.length;

    const riskBuckets = {
      "0-19": 0,
      "20-49": 0,
      "50-79": 0,
      "80+": 0,
    };
    const locationCounts = new Map();
    const dailyFraudCounts = new Map();

    rows.forEach((r) => {
      const score = Number(r.ruleRiskScore ?? r.riskScore) || 0;
      if (score < 20) riskBuckets["0-19"] += 1;
      else if (score < 50) riskBuckets["20-49"] += 1;
      else if (score < 80) riskBuckets["50-79"] += 1;
      else riskBuckets["80+"] += 1;

      const location = r.location || "Unknown";
      locationCounts.set(location, (locationCounts.get(location) || 0) + 1);

      const finalStatus = r.finalStatus || r.status;
      if (finalStatus === "Fraud") {
        const key = dateKey(r.date_time);
        dailyFraudCounts.set(key, (dailyFraudCounts.get(key) || 0) + 1);
      }
    });

    const topLocations = [...locationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const dailyFraud = [...dailyFraudCounts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );

    return {
      total: rows.length,
      fraud,
      legitimate,
      riskBuckets,
      topLocations,
      dailyFraud,
    };
  }, [rows, fraudRows.length, legitimateRows.length]);

  const statusData = {
    labels: ["Fraud", "Legitimate"],
    datasets: [
      {
        data: [stats.fraud, stats.legitimate],
        backgroundColor: ["#e11d48", "#16a34a"],
        borderColor: ["#be123c", "#15803d"],
        borderWidth: 1,
      },
    ],
  };

  const riskData = {
    labels: Object.keys(stats.riskBuckets),
    datasets: [
      {
        label: "Transactions",
        data: Object.values(stats.riskBuckets),
        backgroundColor: "#2563eb",
      },
    ],
  };

  const locationData = {
    labels: stats.topLocations.map(([loc]) => loc),
    datasets: [
      {
        label: "Transactions by Location",
        data: stats.topLocations.map(([, count]) => count),
        backgroundColor: "#7c3aed",
      },
    ],
  };

  const fraudTrendData = {
    labels: stats.dailyFraud.map(([day]) => day),
    datasets: [
      {
        label: "Daily Fraud Count",
        data: stats.dailyFraud.map(([, count]) => count),
        borderColor: "#f43f5e",
        backgroundColor: "rgba(244, 63, 94, 0.2)",
        fill: true,
        tension: 0.3,
      },
    ],
  };

  return (
    <ProtectedRoute>
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Analytics Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Visual analytics of transaction risk, fraud distribution, and trends.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {role && <RoleBadge role={role} />}
            <RefreshDataButton onClick={handleRefresh} loading={loading} lastRefreshed={lastRefreshed} />
            <span className="hidden rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 sm:inline-flex">
              Showing latest 3,000 records
            </span>
          </div>
        </div>
        {isStale && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            </svg>
            New data was uploaded. Click <strong className="mx-1">Refresh Data</strong> to update the charts.
          </div>
        )}
      </header>

      {error ? (
        <div className="mt-8 rounded-md border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800 h-32" />
          ))}
        </section>
      ) : (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Total transactions</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{stats.total}</p>
            <DetailsPopup title="All Transactions" data={rows} colorClass="border-slate-200 dark:border-slate-600" onTransactionClick={setSelectedTx} />
          </div>
          <div className="group relative rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm hover:shadow-md transition-shadow dark:border-rose-900/40 dark:bg-rose-900/20">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-200">Fraud count</p>
            <p className="mt-2 text-3xl font-semibold text-rose-900 dark:text-rose-100">{stats.fraud}</p>
            <DetailsPopup title="Fraud Transactions" data={fraudRows} colorClass="border-rose-200 dark:border-rose-800" onTransactionClick={setSelectedTx} />
          </div>
          <div className="group relative rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm hover:shadow-md transition-shadow dark:border-emerald-900/40 dark:bg-emerald-900/20">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-200">Legitimate count</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-900 dark:text-emerald-100">{stats.legitimate}</p>
            <DetailsPopup title="Legitimate Transactions" data={legitimateRows} colorClass="border-emerald-200 dark:border-emerald-800" onTransactionClick={setSelectedTx} />
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          ML Model Metrics
        </h2>
        {latestModel?.metrics ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-300">Accuracy</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {(Number(latestModel.metrics.accuracy || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-300">Precision</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {(Number(latestModel.metrics.precision || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-300">Recall</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {(Number(latestModel.metrics.recall || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-300">F1 Score</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {(Number(latestModel.metrics.f1 || 0) * 100).toFixed(1)}%
              </p>
            </div>
            <div className="md:col-span-4 mt-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Confusion Matrix (TP/TN/FP/FN):{" "}
                {latestModel.metrics.tp ?? 0} / {latestModel.metrics.tn ?? 0} /{" "}
                {latestModel.metrics.fp ?? 0} / {latestModel.metrics.fn ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                Model: {latestModel.modelVersion || "—"} | Threshold:{" "}
                {latestModel.threshold ?? "—"} | Train/Test:{" "}
                {latestModel.trainSize ?? 0}/{latestModel.testSize ?? 0}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No ML model metrics yet. Process a CSV to trigger training and generate metrics.
          </p>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Fraud vs Legitimate</h2>
          <Pie data={statusData} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Risk Score Distribution</h2>
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${Math.max(320, Object.keys(stats.riskBuckets).length * 80)}px` }}>
              <Bar data={riskData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Top Locations</h2>
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${Math.max(360, stats.topLocations.length * 90)}px` }}>
              <Bar data={locationData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 35, minRotation: 0 } } } }} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Daily Fraud Trend</h2>
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${Math.max(400, stats.dailyFraud.length * 60)}px` }}>
              <Line data={fraudTrendData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
            </div>
          </div>
        </div>
      </section>

      {selectedTx && (
        <TransactionDetailsModal 
          transaction={selectedTx} 
          onClose={() => setSelectedTx(null)} 
        />
      )}
    </main>
    </ProtectedRoute>
  );
}

