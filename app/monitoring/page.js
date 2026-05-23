"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProtectedRoute from "@/components/protected-route";
import { useAuth } from "@/contexts/auth-context";
import RoleBadge from "@/components/role-badge";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toCsv, downloadCsv } from "@/utils/csv-export";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  BarElement,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

function dateKey(timestamp) {
  if (!timestamp) return "Unknown";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toISOString().slice(0, 10);
}

/** Color-coded action badge */
function ActionBadge({ action }) {
  const isDestructive = action.includes("delete") || action === "upload_failed";
  const isWarning = action.includes("rejected");
  const isML = action.includes("train") || action.includes("switch") || action.includes("detection");
  const isUpload = action.includes("upload") && !isDestructive && !isWarning;
  const isAdmin = action.includes("role") || action.includes("user");

  let cls = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"; // Default
  if (isDestructive) {
    cls = "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  } else if (isWarning) {
    cls = "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300";
  } else if (isML) {
    cls = "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";
  } else if (isUpload) {
    cls = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  } else if (isAdmin) {
    cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight ${cls}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

/** Reusable audit table rows */
function AuditRows({ logs }) {
  if (logs.length === 0) {
    return (
      <tr>
        <td colSpan="4" className="px-4 py-8 text-center text-slate-400 italic">
          No activity recorded yet.
        </td>
      </tr>
    );
  }
  return logs.map((log) => (
    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
        {log.created_at ? new Date(log.created_at.toDate()).toLocaleString() : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
          {log.user_email || "System"}
        </div>
      </td>
      <td className="px-4 py-3">
        <ActionBadge action={log.action} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-xs truncate" title={JSON.stringify(log.details)}>
          {log.details?.targetEmail ||
            log.details?.fileName ||
            log.details?.actionType ||
            JSON.stringify(log.details)}
        </div>
      </td>
    </tr>
  ));
}

/** Reusable confirmation dialog — matches the one in report-download.jsx */
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
      aria-labelledby="audit-confirm-title"
      aria-describedby="audit-confirm-desc"
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
          <h3 id="audit-confirm-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
        <p id="audit-confirm-desc" className="mt-2 text-sm text-slate-600 dark:text-slate-400">
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

/** Full-screen modal showing only the audit trail */
function AuditModal({ logs, onClose }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [exportError, setExportError] = useState(""); // shows banner if export fails
  const printRef = useRef(null);

  const requestConfirm = useCallback((opts, action) => {
    setConfirm({
      ...opts,
      onConfirm: () => { setConfirm(null); action(); },
    });
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Filter logs by date range (client-side, zero extra reads)
  const filteredLogs = useMemo(() => {
    if (!startDate && !endDate) return logs; // No filter = all logs
    return logs.filter((log) => {
      if (!log.created_at) return false;
      const logDate = log.created_at.toDate ? log.created_at.toDate() : new Date(log.created_at);
      const logDay = logDate.toISOString().slice(0, 10);
      if (startDate && logDay < startDate) return false;
      if (endDate && logDay > endDate) return false;
      return true;
    });
  }, [logs, startDate, endDate]);

  const dateRangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "All Records";
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Up to ${endDate}`;
  }, [startDate, endDate]);

  // ── Export CSV (with confirmation + error handling) ──
  const handleExportCsv = useCallback(() => {
    requestConfirm(
      {
        title: "Download Audit Trail (CSV)",
        description: `This will download ${filteredLogs.length} audit log record(s) for "${dateRangeLabel}" as a CSV file. Proceed?`,
        confirmLabel: "Download",
        confirmClassName: "rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-800",
      },
      () => {
        try {
          setExportError("");
          const columns = [
            { header: "Timestamp",  value: (r) => r.created_at ? new Date(r.created_at.toDate()).toLocaleString() : "—" },
            { header: "User Email", value: (r) => r.user_email || "System" },
            { header: "Action",     value: (r) => r.action || "" },
            { header: "Details",   value: (r) => r.details?.targetEmail || r.details?.fileName || r.details?.actionType || JSON.stringify(r.details || {}) },
          ];
          const csvText = toCsv({ rows: filteredLogs, columns });
          const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
          downloadCsv({ filename: `audit_trail_${stamp}.csv`, csvText });
        } catch (err) {
          setExportError(err?.message || "Failed to export CSV. Please try again.");
        }
      }
    );
  }, [filteredLogs, dateRangeLabel, requestConfirm]);

  // ── Export PDF (with confirmation + error handling) ──
  const handleExportPdf = useCallback(() => {
    requestConfirm(
      {
        title: "Download Audit Trail (PDF)",
        description: `This will download ${filteredLogs.length} audit log record(s) for "${dateRangeLabel}" as a PDF document. Proceed?`,
        confirmLabel: "Download",
        confirmClassName: "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700",
      },
      () => {
        try {
          setExportError("");
          const pdf = new jsPDF({ orientation: "landscape" });
          pdf.setFontSize(16);
          pdf.setTextColor(30, 41, 59);
          pdf.text("IntelliShield — System Audit Trail", 14, 14);
          pdf.setFontSize(9);
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Date Range: ${dateRangeLabel}`, 14, 21);
          pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
          pdf.text(`Total Records: ${filteredLogs.length}`, 14, 31);
          autoTable(pdf, {
            startY: 37,
            head: [["Timestamp", "User Email", "Action", "Details"]],
            body: filteredLogs.map((r) => [
              r.created_at ? new Date(r.created_at.toDate()).toLocaleString() : "—",
              r.user_email || "System",
              (r.action || "").replace(/_/g, " "),
              r.details?.targetEmail || r.details?.fileName || r.details?.actionType || JSON.stringify(r.details || {}),
            ]),
            styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
            headStyles: { fillColor: [79, 70, 229], textColor: 255 },
            columnStyles: { 3: { cellWidth: 80 } },
          });
          const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
          pdf.save(`audit_trail_${stamp}.pdf`);
        } catch (err) {
          setExportError(err?.message || "Failed to export PDF. Please try again.");
        }
      }
    );
  }, [filteredLogs, dateRangeLabel, requestConfirm]);

  // ── Print (with confirmation + error handling) ──
  const handlePrint = useCallback(() => {
    requestConfirm(
      {
        title: "Print Audit Trail",
        description: `This will open the browser print dialog for ${filteredLogs.length} record(s) — "${dateRangeLabel}". Continue?`,
        confirmLabel: "Print",
        confirmClassName: "rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700",
      },
      () => {
        try {
          setExportError("");
          window.print();
        } catch (err) {
          setExportError(err?.message || "Failed to open print dialog. Please try again.");
        }
      }
    );
  }, [filteredLogs.length, dateRangeLabel, requestConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label="System Audit Trail"
    >
      {/* Modal header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              System Audit Trail
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {filteredLogs.length} of {logs.length} events — {dateRangeLabel}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-200"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-sm text-slate-700 focus:outline-none dark:text-slate-200"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            >
              ✕ Clear
            </button>
          )}

          {/* Export Buttons */}
          <button
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-semibold text-teal-700 shadow-sm transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50"
          >
            ↓ CSV
          </button>
          <button
            onClick={handleExportPdf}
            disabled={filteredLogs.length === 0}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
          >
            ↓ PDF
          </button>
          <button
            onClick={handlePrint}
            disabled={filteredLogs.length === 0}
            className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            🖨 Print
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* Export error banner (click to dismiss) */}
      {exportError && (
        <div
          onClick={() => setExportError("")}
          className="mx-6 mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 transition hover:bg-rose-100 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 print:hidden"
          title="Click to dismiss"
        >
          <span><span className="mr-2">⚠</span>{exportError}</span>
          <span className="text-rose-400 text-xs">✕</span>
        </div>
      )}

      {/* Print-only header */}
      <div className="hidden print:block px-6 pt-4 pb-2">
        <h1 className="text-xl font-bold">IntelliShield — System Audit Trail</h1>
        <p className="text-sm text-slate-500">Date Range: {dateRangeLabel} · Generated: {new Date().toLocaleString()} · Records: {filteredLogs.length}</p>
      </div>

      {/* Modal body — scrollable */}
      <div ref={printRef} className="flex-1 overflow-auto px-6 py-4">
        {filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400 italic">No events found for the selected date range.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <AuditRows logs={filteredLogs} />
            </tbody>
          </table>
        )}
      </div>
      {/* Confirm dialog */}
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
    </div>
  );
}

export default function MonitoringPage() {
  const { isAdmin, role } = useAuth();
  const [auditModalOpen, setAuditModalOpen] = useState(false);

  const [logs, setLogs] = useState([]);
  const [models, setModels] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [logsSnap, modelsSnap, resultsSnap] = await Promise.all([
          getDocs(query(collection(db, "activity_logs"), orderBy("created_at", "desc"), limit(500))),
          getDocs(query(collection(db, "ml_models"), orderBy("created_at", "desc"), limit(50))),
          getDocs(query(collection(db, "results"), orderBy("created_at", "desc"), limit(50))),
        ]);
        setLogs(logsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setModels(modelsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setResults(resultsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(err?.message || "Failed to load monitoring data.");
      } finally {
        setLoading(false);
      }
    }
    if (isAdmin) fetchData();
  }, [isAdmin]);

  const { uploadHistory, errorRateTrend, modelMetrics, detectionSummary, overallStats } =
    useMemo(() => {
      const uploadsPerDay = new Map();
      const errorsPerDay = new Map();
      let totalUploads = 0;
      let totalErrors = 0;

      logs.forEach((log) => {
        const day = dateKey(log.created_at);
        if (log.action === "file_upload") {
          totalUploads++;
          uploadsPerDay.set(day, (uploadsPerDay.get(day) || 0) + 1);
        } else if (
          log.action === "upload_failed" ||
          log.action === "upload_rejected_invalid" ||
          log.action === "upload_rejected_duplicate" ||
          log.status === "error"
        ) {
          totalErrors++;
          errorsPerDay.set(day, (errorsPerDay.get(day) || 0) + 1);
        }
      });

      const sortedDays = Array.from(new Set([...uploadsPerDay.keys(), ...errorsPerDay.keys()]))
        .filter((d) => d !== "Unknown")
        .sort();

      const sortedModels = [...models].reverse();
      const sortedResults = [...results].reverse();
      const latestModel = models[0];

      return {
        uploadHistory: {
          labels: sortedDays,
          datasets: [{ label: "Successful Uploads", data: sortedDays.map((d) => uploadsPerDay.get(d) || 0), borderColor: "#3b82f6", backgroundColor: "#3b82f6", tension: 0.3 }],
        },
        errorRateTrend: {
          labels: sortedDays,
          datasets: [{ label: "Upload Errors", data: sortedDays.map((d) => errorsPerDay.get(d) || 0), borderColor: "#ef4444", backgroundColor: "#ef4444", tension: 0.3 }],
        },
        modelMetrics: {
          labels: sortedModels.map((m) => m.modelVersion || "v?"),
          datasets: [
            { label: "Accuracy (%)", data: sortedModels.map((m) => (m.metrics?.accuracy || 0) * 100), borderColor: "#10b981", tension: 0.2 },
            { label: "F1 Score (%)", data: sortedModels.map((m) => (m.metrics?.f1 || 0) * 100), borderColor: "#8b5cf6", tension: 0.2 },
          ],
        },
        detectionSummary: {
          labels: sortedResults.map((_, i) => `Batch ${i + 1}`),
          datasets: [
            { label: "Fraud", data: sortedResults.map((r) => r.fraud_count || 0), backgroundColor: "#ef4444" },
            { label: "Legitimate", data: sortedResults.map((r) => r.legitimate_count || 0), backgroundColor: "#10b981" },
          ],
        },
        overallStats: {
          totalUploads,
          totalErrors,
          errorRate: totalUploads > 0 ? ((totalErrors / (totalUploads + totalErrors)) * 100).toFixed(1) : 0,
          latestAccuracy: latestModel?.metrics?.accuracy ? (latestModel.metrics.accuracy * 100).toFixed(1) : "—",
          lastTrained: latestModel?.created_at ? new Date(latestModel.created_at.toDate()).toLocaleDateString() : "—",
        },
      };
    }, [logs, models, results]);

  if (!isAdmin) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-slate-500">You do not have permission to view this page.</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      {/* Audit Trail Modal */}
      {auditModalOpen && <AuditModal logs={logs} onClose={() => setAuditModalOpen(false)} />}

      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
        {/* Header */}
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                System Monitoring
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Track system health, error rates, upload activity, and model performance over time.
              </p>
            </div>

            {/* Quick-access shortcuts */}
            <div className="flex flex-col items-end gap-3">
              {role && <RoleBadge role={role} />}
              <button
                id="audit-trail-shortcut"
                onClick={() => setAuditModalOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Audit Trail
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <>
            {/* Stat Cards */}
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total Uploads", value: overallStats.totalUploads, color: "text-slate-900 dark:text-slate-100" },
                { label: "System Errors", value: overallStats.totalErrors, sub: `${overallStats.errorRate}% error rate`, color: "text-rose-600 dark:text-rose-400" },
                { label: "Latest Accuracy", value: `${overallStats.latestAccuracy}%`, color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Last Trained", value: overallStats.lastTrained, color: "text-indigo-600 dark:text-indigo-400" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
                  <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
                  {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
                </div>
              ))}
            </section>

            {/* Charts */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Upload History Trend</h2>
                {uploadHistory.labels.length > 0 ? <Line data={uploadHistory} options={{ maintainAspectRatio: true }} /> : <p className="text-sm text-slate-500">No upload history available.</p>}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Error Rate Trend</h2>
                {errorRateTrend.labels.length > 0 ? <Line data={errorRateTrend} options={{ maintainAspectRatio: true }} /> : <p className="text-sm text-slate-500">No errors recorded.</p>}
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Model Performance History</h2>
                {modelMetrics.labels.length > 0 ? <Line data={modelMetrics} options={{ maintainAspectRatio: true }} /> : <p className="text-sm text-slate-500">No model history available.</p>}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Detection Summary (Per Batch)</h2>
                {detectionSummary.labels.length > 0 ? (
                  <Bar data={detectionSummary} options={{ maintainAspectRatio: true, scales: { x: { stacked: true }, y: { stacked: true } } }} />
                ) : (
                  <p className="text-sm text-slate-500">No detection results available.</p>
                )}
              </div>
            </section>

            {/* Recent Model Versions */}
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Recent Model Versions</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 text-slate-900 dark:bg-slate-800/60 dark:text-slate-100">
                    <tr>
                      <th className="px-4 py-3 font-medium">Version</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Accuracy</th>
                      <th className="px-4 py-3 font-medium">Train Size</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {models.length === 0 ? (
                      <tr><td colSpan="5" className="px-4 py-4 text-center text-slate-500">No models trained yet.</td></tr>
                    ) : (
                      models.slice(0, 10).map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 font-medium">{m.modelVersion || "—"}</td>
                          <td className="px-4 py-3 capitalize">{m.modelType === "neural" ? "Neural Network" : "Logistic Regression"}</td>
                          <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400">{m.metrics?.accuracy ? `${(m.metrics.accuracy * 100).toFixed(1)}%` : "—"}</td>
                          <td className="px-4 py-3">{m.trainSize || "—"}</td>
                          <td className="px-4 py-3">{m.created_at ? new Date(m.created_at.toDate()).toLocaleString() : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

          </>
        )}
      </main>
    </ProtectedRoute>
  );
}
