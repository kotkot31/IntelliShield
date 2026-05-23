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
import { Bar, Bubble, Doughnut, Line } from "react-chartjs-2";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProtectedRoute from "@/components/protected-route";
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

// ─── helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, tooltip }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const colors = {
    blue: "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20",
    rose: "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20",
    violet: "border-violet-200 bg-violet-50 dark:border-violet-900/40 dark:bg-violet-900/20",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20",
  };
  const textColors = {
    blue: "text-blue-700 dark:text-blue-300",
    rose: "text-rose-700 dark:text-rose-300",
    violet: "text-violet-700 dark:text-violet-300",
    amber: "text-amber-700 dark:text-amber-300",
  };
  
  return (
    <div 
      onMouseLeave={() => setIsOpen(false)}
      className={`relative rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${colors[accent] || colors.blue}`}
    >
      {/* Tooltip */}
      {tooltip && isOpen && (
        <>
          <div className="absolute -top-2 left-1/2 z-10 w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-800 p-3 text-[11px] leading-relaxed text-white shadow-2xl dark:bg-slate-700">
            {tooltip}
            <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 bg-slate-800 dark:bg-slate-700" />
          </div>
        </>
      )}

      <div className="flex items-center gap-1.5">
        <p className={`text-xs font-semibold uppercase tracking-widest ${textColors[accent] || textColors.blue}`}>
          {label}
        </p>
        {tooltip && (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
            className={`rounded-full p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${isOpen ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
          >
            <svg className={`h-3.5 w-3.5 ${textColors[accent] || textColors.blue}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────────

export default function AdvancedAnalyticsPage() {
  const { role } = useAuth();
  const { rows, loading, lastRefreshed, ensureDataLoaded, refreshData } = useData();
  const [isStale, setIsStale] = useState(false);

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

  // ── 1. Velocity Threat: top abused device_ids ──────────────────────────────
  const velocityData = useMemo(() => {
    const deviceMap = new Map();
    const ipMap = new Map();

    rows.forEach((r) => {
      if (r.device_id) {
        if (!deviceMap.has(r.device_id)) deviceMap.set(r.device_id, new Set());
        deviceMap.get(r.device_id).add(r.user_id);
      }
      if (r.ip_address) {
        if (!ipMap.has(r.ip_address)) ipMap.set(r.ip_address, new Set());
        ipMap.get(r.ip_address).add(r.user_id);
      }
    });

    // Top 8 most-shared devices
    const topDevices = [...deviceMap.entries()]
      .map(([id, users]) => ({ id, count: users.size }))
      .filter((d) => d.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Top 8 most-shared IPs
    const topIps = [...ipMap.entries()]
      .map(([ip, users]) => ({ ip, count: users.size }))
      .filter((d) => d.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { topDevices, topIps };
  }, [rows]);

  const deviceChartData = {
    labels: velocityData.topDevices.map((d) => d.id.length > 14 ? d.id.slice(0, 14) + "…" : d.id),
    datasets: [
      {
        label: "Unique Users per Device",
        data: velocityData.topDevices.map((d) => d.count),
        backgroundColor: velocityData.topDevices.map((d) =>
          d.count >= 4 ? "rgba(225,29,72,0.8)" : "rgba(251,146,60,0.7)"
        ),
        borderRadius: 6,
      },
    ],
  };

  const ipChartData = {
    labels: velocityData.topIps.map((d) => d.ip),
    datasets: [
      {
        label: "Unique Users per IP",
        data: velocityData.topIps.map((d) => d.count),
        backgroundColor: velocityData.topIps.map((d) =>
          d.count >= 5 ? "rgba(139,92,246,0.8)" : "rgba(99,102,241,0.6)"
        ),
        borderRadius: 6,
      },
    ],
  };

  // ── 2. Fraud Trigger Breakdown (Doughnut) ──────────────────────────────────
  const triggerData = useMemo(() => {
    const counts = {};
    rows.forEach((r) => {
      const triggered = r.rulesTriggered || [];
      triggered.forEach((rule) => {
        counts[rule] = (counts[rule] || 0) + 1;
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return sorted;
  }, [rows]);

  const DOUGHNUT_COLORS = [
    "#e11d48", "#f97316", "#eab308", "#22c55e",
    "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
  ];

  const doughnutData = {
    labels: triggerData.map(([rule]) =>
      rule.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    ),
    datasets: [
      {
        data: triggerData.map(([, count]) => count),
        backgroundColor: DOUGHNUT_COLORS,
        borderWidth: 2,
        borderColor: "#1e293b",
      },
    ],
  };

  // ── 3. Gaussian Anomaly Scatter (Bubble) ───────────────────────────────────
  const bubbleData = useMemo(() => {
    // Sample at most 300 points to keep chart clean
    const sample = rows.slice(0, 300);
    const fraudPoints = [];
    const legit = [];

    sample.forEach((r) => {
      const hour = new Date(r.date_time).getUTCHours();
      const amount = Number(r.amount) || 0;
      const prob = Number(r.fraudProbability ?? r.riskScore / 100) || 0;
      const radius = Math.max(3, prob * 12);
      const isFraud = (r.finalStatus || r.status) === "Fraud";
      const point = { x: hour, y: amount, r: radius };
      if (isFraud) fraudPoints.push(point);
      else legit.push(point);
    });

    return {
      datasets: [
        {
          label: "Fraud",
          data: fraudPoints,
          backgroundColor: "rgba(225,29,72,0.55)",
          borderColor: "rgba(225,29,72,0.9)",
          borderWidth: 1,
        },
        {
          label: "Legitimate",
          data: legit,
          backgroundColor: "rgba(22,163,74,0.35)",
          borderColor: "rgba(22,163,74,0.7)",
          borderWidth: 1,
        },
      ],
    };
  }, [rows]);

  // ── 4. Network Risk vs ML Probability (Dual-axis Line) ─────────────────────
  const trendData = useMemo(() => {
    const dailyMap = new Map();

    rows.forEach((r) => {
      const d = new Date(r.date_time);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      if (!dailyMap.has(key)) dailyMap.set(key, { netRisk: [], mlProb: [] });
      const entry = dailyMap.get(key);
      if (r.networkRiskScore != null) entry.netRisk.push(Number(r.networkRiskScore));
      if (r.fraudProbability != null) entry.mlProb.push(Number(r.fraudProbability));
    });

    const sorted = [...dailyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    return {
      labels: sorted.map(([day]) => day),
      netRisk: sorted.map(([, v]) => avg(v.netRisk)),
      mlProb: sorted.map(([, v]) => avg(v.mlProb) * 100),
    };
  }, [rows]);

  const dualLineData = {
    labels: trendData.labels,
    datasets: [
      {
        label: "Avg Network Risk Score",
        data: trendData.netRisk,
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.15)",
        fill: true,
        tension: 0.4,
        yAxisID: "y",
      },
      {
        label: "Avg ML Fraud Probability (%)",
        data: trendData.mlProb,
        borderColor: "#6366f1",
        backgroundColor: "rgba(99,102,241,0.1)",
        fill: true,
        tension: 0.4,
        yAxisID: "y1",
      },
    ],
  };

  // ── summary stats ──────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const networkedRisk = rows.filter((r) => (r.networkRiskScore || 0) > 0).length;
    const avgNetRisk = rows.length
      ? (rows.reduce((s, r) => s + (Number(r.networkRiskScore) || 0), 0) / rows.length).toFixed(1)
      : "0";
    const topTrigger = triggerData[0]?.[0]?.replace(/_/g, " ") ?? "—";
    const highVelocity = velocityData.topDevices.filter((d) => d.count >= 4).length
      + velocityData.topIps.filter((d) => d.count >= 5).length;
    return { networkedRisk, avgNetRisk, topTrigger, highVelocity };
  }, [rows, triggerData, velocityData]);

  return (
    <ProtectedRoute>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
        {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Threat Intel
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Network velocity threats, Gaussian anomaly distribution, fraud trigger breakdown, and ML trend correlation.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              {role && <RoleBadge role={role} />}
              <RefreshDataButton onClick={handleRefresh} loading={loading} lastRefreshed={lastRefreshed} />
              <span className="hidden rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 sm:inline-flex">
                Showing latest 2,000 records
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

        {loading && (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800 h-36" />
            ))}
          </section>
        )}

        {!loading && (
          <>
            {/* Summary stat row */}
            <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                accent="rose"
                label="Network-Flagged Txns"
                value={summaryStats.networkedRisk}
                sub="transactions with non-zero network risk"
                tooltip="Transactions where network analysis detected a risk (e.g., shared device, IP address, or proximity to known fraud nodes)."
              />
              <StatCard
                accent="amber"
                label="Avg Network Risk"
                value={summaryStats.avgNetRisk}
                sub="pts across all transactions"
                tooltip="The average score across all processed transactions that quantifies the strength of connection to potential fraud clusters."
              />
              <StatCard
                accent="violet"
                label="High-Velocity Clusters"
                value={summaryStats.highVelocity}
                sub="devices ≥4 users or IPs ≥5 users"
                tooltip="The number of unique groups (devices or IPs) showing abnormally high user turnover, often indicating botnets or credential stuffing."
              />
              <StatCard
                accent="blue"
                label="Top Fraud Trigger"
                value={summaryStats.topTrigger}
                sub="most frequently triggered rule"
                tooltip="The heuristic rule that was most frequently responsible for flagging transactions as high-risk."
              />
            </section>

            {/* Row 1: Velocity threat charts */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <ChartCard
                title="Device Velocity Threat"
                subtitle="Shared device_ids with 2+ unique users — red bars = credential stuffing risk (≥4 users)"
              >
                {velocityData.topDevices.length === 0 ? (
                  <p className="text-sm text-slate-400">No shared devices detected in current data.</p>
                ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${Math.max(400, velocityData.topDevices.length * 70)}px` }}>
                  <Bar
                    data={deviceChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        x: { ticks: { maxRotation: 35, minRotation: 0 } },
                      },
                    }}
                  />
                </div>
              </div>
                )}
              </ChartCard>

              <ChartCard
                title="IP Velocity Threat"
                subtitle="Shared IP addresses with 2+ unique users — purple bars = botnet risk (≥5 users)"
              >
                {velocityData.topIps.length === 0 ? (
                  <p className="text-sm text-slate-400">No shared IPs detected in current data.</p>
                ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: `${Math.max(400, velocityData.topIps.length * 90)}px` }}>
                  <Bar
                    data={ipChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } },
                        x: { ticks: { maxRotation: 35, minRotation: 0 } },
                      },
                    }}
                  />
                </div>
              </div>
                )}
              </ChartCard>
            </section>

            {/* Row 2: Fraud Trigger Breakdown + Anomaly Bubble */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <ChartCard
                title="Fraud Trigger Breakdown"
                subtitle="Which rules are firing most — a spike tells you the dominant attack type right now"
              >
                {triggerData.length === 0 ? (
                  <p className="text-sm text-slate-400">No rules have fired yet.</p>
                ) : (
                  <div className="mx-auto max-w-xs">
                    <Doughnut
                      data={doughnutData}
                      options={{
                        responsive: true,
                        plugins: {
                          legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
                        },
                      }}
                    />
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Gaussian Anomaly Scatter"
                subtitle="Hour of day (X) vs. Amount (Y). Bubble size = fraud probability. Red = flagged fraud."
              >
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-400">No transactions to plot.</p>
                ) : (
                  <Bubble
                    data={bubbleData}
                    options={{
                      responsive: true,
                      plugins: { legend: { position: "top" } },
                      scales: {
                        x: {
                          title: { display: true, text: "Hour of Day (UTC)" },
                          min: 0,
                          max: 23,
                        },
                        y: {
                          title: { display: true, text: "Transaction Amount (₱)" },
                          beginAtZero: true,
                        },
                      },
                    }}
                  />
                )}
              </ChartCard>
            </section>

            {/* Row 3: Dual-axis trend */}
            <section className="mt-6">
              <ChartCard
                title="Network Risk vs ML Probability Trend"
                subtitle="Daily averages — orange = network risk score, indigo = ML fraud probability. They should converge as the model learns."
              >
                {trendData.labels.length === 0 ? (
                  <p className="text-sm text-slate-400">Not enough dated transactions yet to plot a trend.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div style={{ minWidth: `${Math.max(500, trendData.labels.length * 60)}px` }}>
                      <Line
                        data={dualLineData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: true,
                          interaction: { mode: "index", intersect: false },
                          plugins: { legend: { position: "top" } },
                          scales: {
                            y: {
                              type: "linear",
                              position: "left",
                              title: { display: true, text: "Network Risk Score" },
                              beginAtZero: true,
                            },
                            y1: {
                              type: "linear",
                              position: "right",
                              title: { display: true, text: "ML Fraud Probability (%)" },
                              beginAtZero: true,
                              max: 100,
                              grid: { drawOnChartArea: false },
                            },
                          },
                        }}
                      />
                    </div>
                  </div>
                )}
              </ChartCard>
            </section>
          </>
        )}
      </main>
    </ProtectedRoute>
  );
}
