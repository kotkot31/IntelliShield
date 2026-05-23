"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/utils/format-money";
import { updateTransactionLabel, MFA_STATUS_LABELS } from "@/lib/firestore-transactions";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/utils/format-date";
import MfaSimulationModal from "@/components/mfa-simulation-modal";
import { useData } from "@/contexts/data-context";


export default function TransactionDetailsModal({ transaction, onClose, onLabelChange }) {
  const { updateCachedTransaction } = useData();

  useEffect(() => {
    // Prevent background scrolling while modal is open
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const [isUpdating, setIsUpdating] = useState(false);
  const [localLabel, setLocalLabel] = useState(transaction?.manualLabel);
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [localMfaStatus, setLocalMfaStatus] = useState(transaction?.mfaStatus || null);
  const { user } = useAuth();

  useEffect(() => {
    setLocalLabel(transaction?.manualLabel);
    setLocalMfaStatus(transaction?.mfaStatus || null);
  }, [transaction]);

  const handleLabel = async (labelValue) => {
    if (!transaction?.id) return;
    try {
      setIsUpdating(true);
      await updateTransactionLabel(transaction.id, labelValue, {
        uid: user?.uid,
        email: user?.email,
      });
      setLocalLabel(labelValue);

      // Re-calculate the new finalStatus locally for real-time cache update
      let newFinalStatus;
      if (labelValue === 1) {
        newFinalStatus = "Fraud";
      } else if (labelValue === 0) {
        newFinalStatus = "Legitimate";
      } else {
        // Revert to pipeline heuristic
        const isOriginalFraud =
          transaction.ruleStatus === "Fraud" ||
          transaction.mlStatus === "Fraud" ||
          transaction.correlationStatus === "Fraud" ||
          (Number(transaction.ruleRiskScore ?? transaction.riskScore ?? 0) >= 50);
        newFinalStatus = isOriginalFraud ? "Fraud" : "Legitimate";
      }

      // Update the DataContext memory cache immediately (costs 0 reads!)
      updateCachedTransaction(transaction.id, {
        manualLabel: labelValue,
        finalStatus: newFinalStatus,
        status: newFinalStatus,
      });

      // Notify parent so it can refresh any stale table caches
      onLabelChange?.(labelValue, transaction.id);
    } catch (error) {
      console.error("Failed to update label:", error);
      alert("Failed to update label. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (!transaction) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Transaction Details
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Transaction ID: <span className="font-medium text-slate-900 dark:text-slate-200">{transaction.transaction_id}</span>
          </p>
        </div>

        <div className="grid gap-4 text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-100 dark:border-slate-800">
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Final Status:</span>{" "}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ml-1 ${(transaction.finalStatus || transaction.status) === "Fraud"
                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
              }`}>
              {transaction.finalStatus || transaction.status || "—"}
            </span>
            <span className="ml-5 font-semibold text-slate-900 dark:text-slate-100">Rule Risk Score:</span>{" "}
            {transaction.ruleRiskScore ?? transaction.riskScore}
          </p>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">ML Status:</span>{" "}
            <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 ml-1 dark:bg-violet-900/40 dark:text-violet-200">
              {transaction.mlStatus || "—"}
            </span>
            <span className="ml-5 font-semibold text-slate-900 dark:text-slate-100">Fraud Prob:</span>{" "}
            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 ml-1 dark:bg-blue-900/40 dark:text-blue-200">
              {typeof transaction.fraudProbability === "number"
                ? `${(transaction.fraudProbability * 100).toFixed(1)}%`
                : "—"}
            </span>
            {typeof transaction.anomalyScore === "number" && (
              <>
                <span className="ml-5 font-semibold text-slate-900 dark:text-slate-100">Anomaly Score:</span>{" "}
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ml-1 ${transaction.anomalyScore > 0.5
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200"
                  }`}>
                  {(transaction.anomalyScore * 100).toFixed(1)}%
                </span>
              </>
            )}
            {typeof transaction.networkRiskScore === "number" && transaction.networkRiskScore > 0 && (
              <>
                <span className="ml-5 font-semibold text-slate-900 dark:text-slate-100">Network Risk:</span>{" "}
                <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ml-1 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
                  +{transaction.networkRiskScore} pts
                </span>
              </>
            )}
          </p>
          <div className="h-px w-full bg-slate-200 dark:bg-slate-700 my-1"></div>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">User:</span> {transaction.user_id}{" "}
            <span className="ml-6 font-semibold text-slate-900 dark:text-slate-100">Amount:</span> {formatMoney(transaction.amount)}
          </p>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Date/Time:</span> {formatDate(transaction.date_time)}{" "}
            <span className="ml-6 font-semibold text-slate-900 dark:text-slate-100">Location:</span> {transaction.location}
          </p>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Device ID:</span> {transaction.device_id || "—"}{" "}
            <span className="ml-6 font-semibold text-slate-900 dark:text-slate-100">IP Address:</span> {transaction.ip_address || "—"}
          </p>
          <div className="h-px w-full bg-slate-200 dark:bg-slate-700 my-1"></div>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Rules triggered:</span>{" "}
            {Array.isArray(transaction.rulesTriggered) && transaction.rulesTriggered.length > 0
              ? transaction.rulesTriggered.join(", ")
              : "—"}
          </p>
          <p className="break-all">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Source CSV URL:</span>{" "}
            {transaction.source_file_url ? (
              <a href={transaction.source_file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
                {transaction.source_file_url}
              </a>
            ) : "—"}
          </p>
          <p>
            <span className="font-semibold text-slate-900 dark:text-slate-100">Record ID:</span> {transaction.id}{" "}
            <span className="ml-6 font-semibold text-slate-900 dark:text-slate-100">Created at:</span> {formatDate(transaction.created_at)}
          </p>
        </div>

        {/* MFA Simulation Section */}
        <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/30 p-5 dark:border-indigo-900/30 dark:bg-indigo-900/10">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Step-Up MFA
            </span>
            {localMfaStatus && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                localMfaStatus === "mfa_verified"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                  : localMfaStatus === "mfa_failed"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                    : localMfaStatus === "mfa_timed_out"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
              }`}>
                {localMfaStatus === "mfa_verified" && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
                {localMfaStatus === "mfa_failed" && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                )}
                {localMfaStatus === "mfa_timed_out" && (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" /></svg>
                )}
                {MFA_STATUS_LABELS[localMfaStatus] || localMfaStatus}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
            Simulate a customer Step-Up MFA challenge for this transaction. This demonstrates how identity verification interacts with fraud detection.
          </p>
          {(transaction.finalStatus === "Fraud" || transaction.status === "Fraud") && !localMfaStatus ? (
            <button
              onClick={() => setMfaModalOpen(true)}
              className="w-full rounded-lg border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
            >
              Simulate MFA Challenge
            </button>
          ) : !localMfaStatus ? (
            <p className="text-xs text-slate-400 italic">MFA simulation is only available for fraud-flagged transactions.</p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              MFA simulation has already been completed for this transaction.
            </p>
          )}
        </div>

        {/* Analyst Feedback Section */}
        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-5 dark:border-blue-900/30 dark:bg-blue-900/10">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center justify-between">
            <span>Analyst Feedback</span>
            {localLabel !== undefined && localLabel !== null && (
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${localLabel === 1
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                }`}>
                Manually Labeled: {localLabel === 1 ? "True Fraud" : "Legitimate"}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
            Help train the machine learning model by providing human feedback for this transaction. This will override the heuristic status during the next retraining cycle.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleLabel(1)}
              disabled={isUpdating || localLabel === 1}
              className="flex-1 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-rose-800 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
            >
              Label as True Fraud
            </button>
            <button
              onClick={() => handleLabel(0)}
              disabled={isUpdating || localLabel === 0}
              className="flex-1 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            >
              Label as False Positive
            </button>
          </div>
          {localLabel !== undefined && localLabel !== null && (
            <div className="mt-3 text-right">
              <button
                onClick={() => handleLabel(null)}
                disabled={isUpdating}
                className="text-xs text-slate-500 hover:text-slate-700 underline dark:text-slate-400 dark:hover:text-slate-300"
              >
                Clear Label
              </button>
            </div>
          )}
        </div>

      </div>

      {/* MFA Simulation Modal */}
      {mfaModalOpen && (
        <MfaSimulationModal
          transaction={transaction}
          onClose={() => setMfaModalOpen(false)}
          onStatusChange={(newMfaStatus) => {
            setLocalMfaStatus(newMfaStatus);
            setMfaModalOpen(false);

            let newFinalStatus = transaction.finalStatus || transaction.status;
            if (newMfaStatus === "mfa_verified") {
              newFinalStatus = "Legitimate";
            } else if (newMfaStatus === "mfa_failed" || newMfaStatus === "mfa_timed_out") {
              newFinalStatus = "Fraud";
            }

            // Sync with DataContext memory cache immediately (costs 0 reads!)
            updateCachedTransaction(transaction.id, {
              mfaStatus: newMfaStatus,
              finalStatus: newFinalStatus,
              status: newFinalStatus,
            });

            // Trigger table refresh
            onLabelChange?.(transaction.manualLabel, transaction.id);
          }}
        />
      )}
    </div>
  );
}
