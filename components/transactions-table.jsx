"use client";

import { useMemo, useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { deleteAllTransactions } from "@/lib/firestore-transactions";
import { usePagedTransactions } from "@/lib/hooks/use-paged-transactions";
import { formatMoney } from "@/utils/format-money";
import { formatDate } from "@/utils/format-date";
import TableSkeleton from "@/components/table-skeleton";

/* ─── pagination controls ─────────────────────────────────────────────────── */
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
export default function TransactionsTable({ onStatsChange, refreshTrigger }) {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    rows,
    loading,
    error,
    page,
    total,
    totalFraud,
    totalLegit,
    hasMore,
    hasPrev,
    nextPage,
    prevPage,
    refresh,
    pageSize,
  } = usePagedTransactions({ fraudOnly: false, pageSize: 50 });

  useEffect(() => {
    if (refreshTrigger > 0) {
      refresh();
    }
  }, [refreshTrigger, refresh]);

  // Notify parent of page-level stats (best-effort from current page)
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = Date.parse(a.date_time || "") || 0;
      const db_ = Date.parse(b.date_time || "") || 0;
      return db_ - da;
    });
  }, [rows]);

  useEffect(() => {
    const fraudRows = sortedRows.filter((t) => t.finalStatus === "Fraud");
    const legitimateRows = sortedRows.filter((t) => t.finalStatus !== "Fraud");
    const impossibleTravelRows = sortedRows.filter(
      (t) => Array.isArray(t.rulesTriggered) && t.rulesTriggered.includes("impossible_travel"),
    );
    onStatsChange?.({
      total: total !== null ? total : (error ? "Quota Exceeded" : "Loading..."),
      fraud: totalFraud !== null ? totalFraud : (error ? "..." : "Loading..."),
      legitimate: totalLegit !== null ? totalLegit : (error ? "..." : "Loading..."),
      rows: sortedRows,
      fraudRows,
      legitimateRows,
      impossibleTravelRows,
    });
  }, [sortedRows, total, totalFraud, totalLegit, onStatsChange]);

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteAllTransactions(user?.uid || "anonymous", user?.email);
      setShowConfirm(false);
      refresh();
    } catch (err) {
      setDeleteError(err?.message || "Failed to delete transactions.");
    } finally {
      setIsDeleting(false);
    }
  };

  const displayError = error || deleteError;

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            All Transactions
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Complete transaction list with fraud status and risk score.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {total !== null ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                  Total: {total.toLocaleString()}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                  Legitimate: {totalLegit?.toLocaleString() ?? "..."}
                </span>
              </div>
            ) : (
              <div className="rounded-full bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                Page {page}
              </div>
            )}

            {isSuperAdmin && sortedRows.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={isDeleting}
                className="rounded-md border border-rose-300 bg-white px-3 py-1 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-slate-700"
              >
                Delete All
              </button>
            )}
          </div>
        </div>
      </div>

      {isSuperAdmin && showConfirm && (
        <div className="absolute top-6 right-6 z-20 w-80 rounded-xl border border-rose-200 bg-white p-5 shadow-2xl dark:border-rose-800 dark:bg-slate-800">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h3 className="text-base font-bold">Delete All Transactions?</h3>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            You are about to permanently delete <strong>{total?.toLocaleString() ?? ""}</strong> transactions.
          </p>
          <div className="mt-3 rounded-lg bg-rose-50 p-3 dark:bg-rose-900/20">
            <p className="text-xs font-medium leading-relaxed text-rose-700 dark:text-rose-300">
              Audit logs are preserved, but please download a final CSV report for your records before proceeding.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete All"}
            </button>
          </div>
        </div>
      )}

      {displayError && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20">
          <p className="text-sm text-rose-700 dark:text-rose-300">{displayError}</p>
        </div>
      )}

      <div className="mt-4">
        {loading ? (
          <TableSkeleton columns={11} rows={8} />
        ) : (
          <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-[1300px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Transaction ID</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Date/Time</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Rule Risk Score</th>
                  <th className="px-4 py-3 font-semibold">Fraud Probability</th>
                  <th className="px-4 py-3 font-semibold">ML Status</th>
                  <th className="px-4 py-3 font-semibold">Final Status</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-slate-600 dark:text-slate-300" colSpan={11}>
                      No saved transactions yet. Upload a CSV to populate this table.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => {
                    const isFraud = row.finalStatus === "Fraud";
                    return (
                      <tr
                        key={row.id}
                        className={isFraud ? "bg-rose-50/70 dark:bg-rose-900/20" : "bg-white dark:bg-slate-900"}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.transaction_id}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.user_id}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatMoney(row.amount)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{formatDate(row.date_time)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.location}</td>
                        <td className="px-4 py-3">
                          <span className={isFraud
                            ? "inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                            : "inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          }>
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
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
                            {row.mlStatus || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={isFraud
                              ? "inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                              : "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                            }>
                              {row.finalStatus || row.status || "—"}
                            </span>
                            {row.mfaStatus === "mfa_verified" && (
                              <span title="MFA Verified" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                <svg className="h-3 w-3 text-emerald-600 dark:text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              </span>
                            )}
                            {row.mfaStatus === "mfa_failed" && (
                              <span title="MFA Failed" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
                                <svg className="h-3 w-3 text-rose-600 dark:text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              </span>
                            )}
                            {row.mfaStatus === "mfa_timed_out" && (
                              <span title="MFA Timed Out" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                                <svg className="h-3 w-3 text-amber-600 dark:text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                            )}
                            {row.mfaStatus === "mfa_required" && (
                              <span title="MFA Required" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                                <svg className="h-3 w-3 text-blue-600 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{row.modelVersion || "—"}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {Array.isArray(row.rulesTriggered) && row.rulesTriggered.length > 0
                            ? row.rulesTriggered.join(", ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationBar
        page={page}
        total={total}
        pageSize={pageSize}
        hasMore={hasMore}
        hasPrev={hasPrev}
        onNext={nextPage}
        onPrev={prevPage}
        onRefresh={refresh}
        loading={loading}
      />
    </section>
  );
}
