"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadCsv, toCsv } from "@/utils/csv-export";
import { formatMoney } from "@/utils/format-money";
import { useData } from "@/contexts/data-context";

/* ─── helpers ─────────────────────────────────────────────── */

function formatFirestoreTimestamp(value) {
  try {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value?.toDate === "function") return value.toDate().toISOString();
    return "";
  } catch {
    return "";
  }
}

function normalizeRules(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(" | ");
  return String(value);
}

function sortByDateTimeDesc(rows) {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.date_time || a.created_at?.toDate?.() || "") || 0;
    const tb = Date.parse(b.date_time || b.created_at?.toDate?.() || "") || 0;
    return tb - ta;
  });
}

const PREVIEW_COLUMNS = [
  { header: "Transaction ID", value: (r) => r.transaction_id ?? "" },
  { header: "User ID", value: (r) => r.user_id ?? "" },
  { header: "Amount", value: (r) => r.amount != null ? formatMoney(r.amount) : "" },
  { header: "Date / Time", value: (r) => r.date_time ?? "" },
  { header: "Location", value: (r) => r.location ?? "" },
  { header: "Rule Risk Score", value: (r) => r.ruleRiskScore ?? r.riskScore ?? "" },
  { header: "Rule Status", value: (r) => r.ruleStatus ?? r.status ?? "" },
  { header: "Fraud Probability", value: (r) => r.fraudProbability ?? "" },
  { header: "ML Status", value: (r) => r.mlStatus ?? "" },
  { header: "Final Status", value: (r) => r.finalStatus ?? r.status ?? "" },
  { header: "Model Version", value: (r) => r.modelVersion ?? "" },
  { header: "Rules Triggered", value: (r) => normalizeRules(r.rulesTriggered) },
];

const PAGE_SIZE = 50;

/* ─── confirm dialog ─────────────────────────────────────── */
function ConfirmDialog({ open, title, description, confirmLabel, confirmClassName, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 id="confirm-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
        <p id="confirm-desc" className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={confirmClassName ?? "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"}
          >
            {confirmLabel ?? "Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── status badge ────────────────────────────────────────── */
function StatusBadge({ value }) {
  const v = String(value).toLowerCase();
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-semibold";
  if (v === "fraud")
    return <span className={`${base} bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300`}>Fraud</span>;
  if (v === "legitimate")
    return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`}>Legitimate</span>;
  if (v === "review")
    return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`}>Review</span>;
  return <span className="text-slate-600 dark:text-slate-300">{value}</span>;
}

/* ─── preview modal ───────────────────────────────────────── */
function PreviewModal({ rows, title, onClose, onDownloadCsv, onDownloadPdf, onPrint, downloading }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? rows.filter((r) =>
      PREVIEW_COLUMNS.some((col) =>
        String(col.value(r)).toLowerCase().includes(search.toLowerCase())
      )
    )
    : rows;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Close on ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-[90vh] w-full max-w-7xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">

        {/* ── header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {filtered.length.toLocaleString()} row{filtered.length !== 1 ? "s" : ""}
              {search ? " (filtered)" : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* search */}
            <input
              type="search"
              placeholder="Global search…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />

            {/* download from modal */}
            <button
              type="button"
              disabled={downloading}
              onClick={onDownloadCsv}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-60 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-800"
            >
              ↓ CSV
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={onDownloadPdf}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
            >
              ↓ PDF
            </button>
            <button
              type="button"
              onClick={onPrint}
              className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              🖨 Print
            </button>

            {/* close */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="ml-1 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── table ── */}
        <div className="min-h-0 flex-1 overflow-auto">
          {pageRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">
              No rows match your search.
            </div>
          ) : (
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">#</th>
                  {PREVIEW_COLUMNS.map((col) => (
                    <th key={col.header} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((row, idx) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + idx + 1;
                  const isFraud = (row.finalStatus ?? row.status ?? "").toLowerCase() === "fraud";
                  return (
                    <tr
                      key={row.id ?? idx}
                      className={`transition-colors ${isFraud
                          ? "bg-rose-50/40 dark:bg-rose-900/10"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        }`}
                    >
                      <td className="px-4 py-2.5 text-slate-400 dark:text-slate-600">{globalIdx}</td>
                      {PREVIEW_COLUMNS.map((col, ci) => {
                        const val = col.value(row);
                        const isStatus = col.header === "Final Status" || col.header === "Rule Status" || col.header === "ML Status";
                        return (
                          <td key={ci} className="whitespace-nowrap px-4 py-2.5 text-slate-700 dark:text-slate-300">
                            {isStatus ? <StatusBadge value={val} /> : val}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── pagination ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page <span className="font-medium text-slate-800 dark:text-slate-200">{page}</span> of{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">{totalPages}</span>
            {" · "}showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage(1)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-orange-400"
            >«</button>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-orange-400"
            >‹ Prev</button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-orange-400"
            >Next ›</button>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => setPage(totalPages)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:hover:bg-transparent disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-amber-400 dark:hover:text-amber-300"
            >»</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── main export ─────────────────────────────────────────── */
export default function ReportDownload() {
  const { rows: cachedRows, ensureDataLoaded } = useData();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  // preview state
  const [preview, setPreview] = useState(null); // { rows, fraudOnly }

  // confirm dialog state: { title, description, confirmLabel, confirmClassName, onConfirm }
  const [confirm, setConfirm] = useState(null);

  // Ensure DataContext has loaded data (costs 0 reads if already cached)
  useEffect(() => {
    ensureDataLoaded();
  }, [ensureDataLoaded]);

  const requestConfirm = useCallback((opts, action) => {
    setConfirm({
      ...opts,
      onConfirm: () => { setConfirm(null); action(); },
    });
  }, []);
  const fetchTransactions = useCallback(({ fraudOnly, legitimateOnly }) => {
    const rows = cachedRows.map((r) => ({
      ...r,
      finalStatus: r.finalStatus || r.status || "Legitimate",
    }));
    let filtered = rows;
    if (fraudOnly) {
      filtered = rows.filter((r) => r.finalStatus === "Fraud");
    } else if (legitimateOnly) {
      filtered = rows.filter((r) => r.finalStatus === "Legitimate");
    }
    return sortByDateTimeDesc(filtered);
  }, [cachedRows]);

  const getExportColumns = () => [
    { header: "transaction_id", value: (r) => r.transaction_id ?? "" },
    { header: "user_id", value: (r) => r.user_id ?? "" },
    { header: "amount", value: (r) => r.amount ?? "" },
    { header: "date_time", value: (r) => r.date_time ?? "" },
    { header: "location", value: (r) => r.location ?? "" },
    { header: "ruleRiskScore", value: (r) => r.ruleRiskScore ?? r.riskScore ?? "" },
    { header: "ruleStatus", value: (r) => r.ruleStatus ?? r.status ?? "" },
    { header: "fraudProbability", value: (r) => r.fraudProbability ?? "" },
    { header: "mlStatus", value: (r) => r.mlStatus ?? "" },
    { header: "finalStatus", value: (r) => r.finalStatus ?? r.status ?? "" },
    { header: "modelVersion", value: (r) => r.modelVersion ?? "" },
    { header: "rulesTriggered", value: (r) => normalizeRules(r.rulesTriggered) },
    { header: "source_file_url", value: (r) => r.source_file_url ?? "" },
    { header: "created_at", value: (r) => formatFirestoreTimestamp(r.created_at) },
    { header: "owner_uid", value: (r) => r.owner_uid ?? "" },
    { header: "firestore_doc_id", value: (r) => r.id ?? "" },
  ];

  /* ── preview open ── */
  const openPreview = useCallback(({ fraudOnly, legitimateOnly }) => {
    setError("");
    try {
      const rows = fetchTransactions({ fraudOnly, legitimateOnly });
      setPreview({ rows, fraudOnly, legitimateOnly });
    } catch (e) {
      setError(e?.message || "Failed to load preview.");
    }
  }, [fetchTransactions]);

  const closePreview = useCallback(() => setPreview(null), []);

  /* ── confirm-gated print ── */
  const confirmPrint = useCallback(() => {
    requestConfirm(
      {
        title: "Print Report",
        description: "This will open the browser print dialog for the current report view. Continue?",
        confirmLabel: "Print",
        confirmClassName: "rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700",
      },
      () => window.print()
    );
  }, [requestConfirm]);
  const _doExportCsv = async ({ fraudOnly, legitimateOnly, rows }) => {
    setError("");
    setDownloading(true);
    try {
      const docs = rows ?? fetchTransactions({ fraudOnly, legitimateOnly });
      const csvText = toCsv({ rows: docs, columns: getExportColumns() });
      const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      const filename = fraudOnly
        ? `fraud_report_${stamp}.csv`
        : legitimateOnly
          ? `legitimate_report_${stamp}.csv`
          : `transactions_report_${stamp}.csv`;
      downloadCsv({ filename, csvText });
    } catch (e) {
      setError(e?.message || "Failed to export CSV report.");
    } finally {
      setDownloading(false);
    }
  };

  const exportCsv = useCallback(({ fraudOnly, legitimateOnly, rows }) => {
    const label = fraudOnly
      ? "Fraud Only (CSV)"
      : legitimateOnly
        ? "Legitimate Only (CSV)"
        : "All Transactions (CSV)";
    requestConfirm(
      {
        title: `Download ${label}`,
        description: `This will download the ${label} report to your device. Proceed?`,
        confirmLabel: "Download",
        confirmClassName: "rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800",
      },
      () => _doExportCsv({ fraudOnly, legitimateOnly, rows })
    );
  }, [requestConfirm]); // eslint-disable-line react-hooks-exhaustive-deps

  /* ── PDF download (internal — called after confirmation) ── */
  const _doExportPdf = async ({ fraudOnly, legitimateOnly, rows }) => {
    setError("");
    setDownloading(true);
    try {
      const docs = rows ?? fetchTransactions({ fraudOnly, legitimateOnly });
      const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      const filename = fraudOnly
        ? `fraud_report_${stamp}.pdf`
        : legitimateOnly
          ? `legitimate_report_${stamp}.pdf`
          : `transactions_report_${stamp}.pdf`;

      const pdf = new jsPDF({ orientation: "landscape" });
      pdf.setFontSize(14);
      pdf.text(
        fraudOnly
          ? "Fraud Report"
          : legitimateOnly
            ? "Legitimate Report"
            : "Transactions Report",
        14,
        14
      );
      pdf.setFontSize(9);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 20);
      pdf.text(`Rows: ${docs.length}`, 14, 25);

      const head = [[
        "transaction_id", "user_id", "amount", "date_time", "location",
        "ruleRiskScore", "ruleStatus", "fraudProbability", "mlStatus",
        "finalStatus", "modelVersion", "rulesTriggered",
      ]];

      const body = docs.map((r) => [
        r.transaction_id ?? "",
        r.user_id ?? "",
        r.amount != null ? formatMoney(r.amount) : "",
        r.date_time ?? "",
        r.location ?? "",
        r.ruleRiskScore ?? r.riskScore ?? "",
        r.ruleStatus ?? r.status ?? "",
        r.fraudProbability ?? "",
        r.mlStatus ?? "",
        r.finalStatus ?? r.status ?? "",
        r.modelVersion ?? "",
        normalizeRules(r.rulesTriggered),
      ]);

      autoTable(pdf, {
        startY: 30,
        head,
        body,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      pdf.save(filename);
    } catch (e) {
      setError(e?.message || "Failed to export PDF report.");
    } finally {
      setDownloading(false);
    }
  };

  const exportPdf = useCallback(({ fraudOnly, legitimateOnly, rows }) => {
    const label = fraudOnly
      ? "Fraud Only (PDF)"
      : legitimateOnly
        ? "Legitimate Only (PDF)"
        : "All Transactions (PDF)";
    requestConfirm(
      {
        title: `Download ${label}`,
        description: `This will download the ${label} report to your device. Proceed?`,
        confirmLabel: "Download",
        confirmClassName: "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700",
      },
      () => _doExportPdf({ fraudOnly, legitimateOnly, rows })
    );
  }, [requestConfirm]); // eslint-disable-line react-hooks-exhaustive-deps

  /* ── render ── */
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Report Export
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Preview transactions in-app, or download as CSV / PDF for documentation and reporting.
            </p>
          </div>
        </div>

        {/* ── Preview buttons ── */}
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Preview in App
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              id="preview-all-btn"
              type="button"
              disabled={downloading}
              onClick={() => openPreview({ fraudOnly: false })}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {downloading ? "Loading…" : "Preview All Transactions"}
            </button>
            <button
              id="preview-fraud-btn"
              type="button"
              disabled={downloading}
              onClick={() => openPreview({ fraudOnly: true })}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {downloading ? "Loading…" : "Preview Fraud Only"}
            </button>
            <button
              id="preview-legitimate-btn"
              type="button"
              disabled={downloading}
              onClick={() => openPreview({ legitimateOnly: true })}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {downloading ? "Loading…" : "Preview Legitimate Only"}
            </button>
          </div>
        </div>

        {/* ── Download buttons ── */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Download Report
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              id="download-all-csv-btn"
              type="button"
              disabled={downloading}
              onClick={() => exportCsv({ fraudOnly: false })}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-800"
            >
              {downloading ? "Preparing…" : "Download All (CSV)"}
            </button>
            <button
              id="download-fraud-csv-btn"
              type="button"
              disabled={downloading}
              onClick={() => exportCsv({ fraudOnly: true })}
              className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Preparing…" : "Download Fraud Only (CSV)"}
            </button>
            <button
              id="download-all-pdf-btn"
              type="button"
              disabled={downloading}
              onClick={() => exportPdf({ fraudOnly: false })}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Preparing…" : "Download All (PDF)"}
            </button>
            <button
              id="download-fraud-pdf-btn"
              type="button"
              disabled={downloading}
              onClick={() => exportPdf({ fraudOnly: true })}
              className="rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Preparing…" : "Download Fraud Only (PDF)"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-900/20">
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        )}
      </section>

      {/* ── Preview modal ── */}
      {preview && (
        <PreviewModal
          rows={preview.rows}
          title={
            preview.fraudOnly
              ? "Fraud Transactions Report"
              : preview.legitimateOnly
                ? "Legitimate Transactions Report"
                : "All Transactions Report"
          }
          onClose={closePreview}
          onDownloadCsv={() => exportCsv({ fraudOnly: preview.fraudOnly, legitimateOnly: preview.legitimateOnly, rows: preview.rows })}
          onDownloadPdf={() => exportPdf({ fraudOnly: preview.fraudOnly, legitimateOnly: preview.legitimateOnly, rows: preview.rows })}
          onPrint={confirmPrint}
          downloading={downloading}
        />
      )}

      {/* ── Confirm dialog ── */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          confirmClassName={confirm.confirmClassName}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
