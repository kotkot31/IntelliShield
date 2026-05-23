"use client";

import { useCallback, useState, useEffect } from "react";
import CsvUpload from "@/components/csv-upload";
import FraudAlertsTable from "@/components/fraud-alerts-table";
import DashboardSummary from "@/components/dashboard-summary";
import ReportDownload from "@/components/report-download";
import RetrainModelCard from "@/components/retrain-model-card";
import TransactionsTable from "@/components/transactions-table";
import ModelAnalyticsCard from "@/components/model-analytics-card";
import ProtectedRoute from "@/components/protected-route";
import SectionErrorBoundary from "@/components/section-error-boundary";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/user-profile";
import RoleBadge from "@/components/role-badge";
import { useData } from "@/contexts/data-context";

export default function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, fraud: 0, legitimate: 0 });

  const handleStatsChange = useCallback((nextStats) => {
    setStats(nextStats);
  }, []);

  return (
    <ProtectedRoute>
      <DashboardContent stats={stats} onStatsChange={handleStatsChange} />
    </ProtectedRoute>
  );
}

function DashboardContent({ stats, onStatsChange }) {
  const { isAdmin, isITSecurity, role } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { refreshData } = useData();

  // Re-sync the global analytical data cache when parent actions increment refreshTrigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      refreshData();
    }
  }, [refreshTrigger, refreshData]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Fraud Monitoring Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Real-time transaction analysis and fraud detection.
            </p>
          </div>
          {role && <RoleBadge role={role} />}
        </div>

        {/* Permission summary */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "View Transactions", allowed: true },
            { label: "Upload CSV", allowed: true },
            { label: "Download Reports", allowed: true },
            { label: "Delete Records", allowed: isAdmin },
            { label: "Retrain Model", allowed: isAdmin },
            { label: "Manage Users", allowed: isAdmin },
          ].map(({ label, allowed }) => (
            <span
              key={label}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                allowed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500"
              }`}
            >
              {allowed ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {label}
            </span>
          ))}
        </div>
      </header>

      <section className="mt-8">
        <SectionErrorBoundary label="CSV Upload">
          <CsvUpload onUploadComplete={() => setRefreshTrigger(prev => prev + 1)} />
        </SectionErrorBoundary>
      </section>

      <section className="mt-8">
        <SectionErrorBoundary label="Dashboard Summary">
          <DashboardSummary
            stats={stats}
            onLabelChange={() => setRefreshTrigger(prev => prev + 1)}
          />
        </SectionErrorBoundary>
      </section>

      <section className="mt-8">
        <SectionErrorBoundary label="Model Analytics">
          <ModelAnalyticsCard />
        </SectionErrorBoundary>
      </section>

      {/* Retrain Model — Admin only */}
      {isAdmin && (
        <section className="mt-8">
          <SectionErrorBoundary label="Retrain Model">
            <RetrainModelCard />
          </SectionErrorBoundary>
        </section>
      )}

      {/* Report Download — both roles */}
      <section className="mt-8">
        <SectionErrorBoundary label="Report Export">
          <ReportDownload />
        </SectionErrorBoundary>
      </section>

      {/* Transactions Table — both roles (delete button is hidden inside for non-admins) */}
      <section className="mt-8">
        <SectionErrorBoundary label="All Transactions">
          <TransactionsTable onStatsChange={onStatsChange} refreshTrigger={refreshTrigger} />
        </SectionErrorBoundary>
      </section>

      <section className="mt-8">
        <SectionErrorBoundary label="Fraud Alerts">
          <FraudAlertsTable refreshTrigger={refreshTrigger} />
        </SectionErrorBoundary>
      </section>
    </main>
  );
}
