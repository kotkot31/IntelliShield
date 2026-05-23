"use client";

import { useMemo, useEffect, useState } from "react";
import { usePagedTransactions } from "@/lib/hooks/use-paged-transactions";
import { formatMoney } from "@/utils/format-money";
import { formatDate } from "@/utils/format-date";
import TableSkeleton from "@/components/table-skeleton";

/* ─── pagination bar (shared style) ──────────────────────────────────────── */
function PaginationBar({ page, total, pageSize, hasMore, hasPrev, onNext, onPrev, onRefresh, loading }) {
  const from = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total ?? Infinity);
  const to = total === 0 ? 0 : Math.min(from + (pageSize - 1), total ?? Infinity);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Page <span className="font-medium text-slate-800 dark:text-slate-200">{page}</span>
        {total !== null && (
          <> · {from}–{to} of <span className="font-medium text-slate-800 dark:text-slate-200">{total.toLocaleString()}</span></>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:hover:bg-transparent disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-orange-400"
        >
          ↺ Refresh
        </button>
        <button
          type="button"
          disabled={!hasPrev || loading}
          onClick={onPrev}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-orange-400"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          disabled={!hasMore || loading}
          onClick={onNext}
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-orange-400"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────────────────── */
export default function FraudAlertsTable({ refreshTrigger }) {
  const [selectedId, setSelectedId] = useState("");

  const {
    rows,
    loading,
    error,
    page,
    total,
    totalFraud,
    hasMore,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
    pageSize,
  } = usePagedTransactions({ fraudOnly: true, pageSize: 50 });

  // Re-fetch when a parent action (e.g. label change) increments refreshTrigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger, refresh]);

  const sortedRows = useMemo(() =>
    [...rows].sort((a, b) => {
      const scoreA = Number(a.ruleRiskScore ?? a.riskScore) || 0;
      const scoreB = Number(b.ruleRiskScore ?? b.riskScore) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (Date.parse(b.date_time || "") || 0) - (Date.parse(a.date_time || "") || 0);
    }),
    [rows],
  );

  const selected = useMemo(
    () => sortedRows.find((r) => r.id === selectedId) || null,
    [selectedId, sortedRows],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Fraud Alerts ({totalFraud ?? "..."})
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Transactions flagged as <span className="font-medium">Fraud</span> using rule-based scoring.
          </p>
        </div>
        <div className="rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
          {totalFraud !== null ? `Fraud count: ${totalFraud.toLocaleString()}` : `Page ${page}`}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20">
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <TableSkeleton columns={9} rows={6} />
        ) : (
          <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Transaction ID</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Date/Time</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Rule Risk</th>
                  <th className="px-4 py-3 font-semibold">Fraud Probability</th>
                  <th className="px-4 py-3 font-semibold">Rules</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-600 dark:text-slate-300" colSpan={9}>
                      No fraud entries on this page.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr key={row.id} className="bg-white dark:bg-slate-900">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.transaction_id}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.user_id}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatMoney(row.amount)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDate(row.date_time)}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.location}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
                          {row.ruleRiskScore ?? row.riskScore ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                          {typeof row.fraudProbability === "number"
                            ? `${(row.fraudProbability * 100).toFixed(1)}%`
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {Array.isArray(row.rulesTriggered) && row.rulesTriggered.length > 0
                          ? row.rulesTriggered.join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedId((prev) => (prev === row.id ? "" : row.id))}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                        >
                          {selectedId === row.id ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationBar
        page={page}
        total={totalFraud}
        pageSize={pageSize}
        hasMore={hasMore}
        hasPrev={hasPrev}
        onNext={nextPage}
        onPrev={prevPage}
        onRefresh={refresh}
        loading={loading}
      />

      {selected && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Selected fraud entry: {selected.transaction_id}
            </p>
            <span className="text-xs text-slate-600 dark:text-slate-300">Document ID: {selected.id}</span>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 dark:text-slate-200">
            <p><span className="font-medium">Final Status:</span> {selected.finalStatus}{" "}<span className="ml-2 font-medium">Rule Risk Score:</span> {selected.ruleRiskScore ?? selected.riskScore}</p>
            <p><span className="font-medium">ML Status:</span> {selected.mlStatus || "—"}{" "}<span className="ml-2 font-medium">Fraud Probability:</span> {typeof selected.fraudProbability === "number" ? `${(selected.fraudProbability * 100).toFixed(1)}%` : "—"}</p>
            <p><span className="font-medium">User:</span> {selected.user_id}{" "}<span className="ml-2 font-medium">Amount:</span> {formatMoney(selected.amount)}</p>
            <p><span className="font-medium">Date/Time:</span> {formatDate(selected.date_time)}{" "}<span className="ml-2 font-medium">Location:</span> {selected.location}</p>
            <p><span className="font-medium">Rules triggered:</span>{" "}{Array.isArray(selected.rulesTriggered) && selected.rulesTriggered.length > 0 ? selected.rulesTriggered.join(", ") : "—"}</p>
            <p className="break-all"><span className="font-medium">Source CSV URL:</span> {selected.source_file_url || "—"}</p>
            <p><span className="font-medium">Created at:</span> {formatDate(selected.created_at)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
