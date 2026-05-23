"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/utils/format-money";
import { useAuth } from "@/contexts/auth-context";
import {
  updateTransactionMfaStatus,
  MFA_STATUS,
} from "@/lib/firestore-transactions";

/** Generate a random 6-digit numeric code */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_SECONDS = 300; // 5 minutes

/**
 * MFA Simulation Modal
 *
 * Allows an admin to simulate the customer Step-Up MFA verification flow
 * for a fraud-flagged transaction. Supports three outcomes:
 *   1. Pass  — customer enters correct code → transaction becomes Legitimate
 *   2. Fail  — customer enters wrong code 3 times → transaction stays Fraud
 *   3. Timeout — customer doesn't respond in time → transaction stays Fraud
 */
export default function MfaSimulationModal({ transaction, onClose, onStatusChange }) {
  const { user } = useAuth();

  // Generate the "correct" code once when the modal opens
  const correctCode = useMemo(() => generateCode(), []);

  const [inputCode, setInputCode] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [status, setStatus] = useState("pending"); // pending | verifying | success | failed | timed_out
  const [errorMsg, setErrorMsg] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Auto-focus the input field
  useEffect(() => {
    if (status === "pending") inputRef.current?.focus();
  }, [status]);

  // Countdown timer
  useEffect(() => {
    if (status !== "pending") return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setStatus("timed_out");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Format seconds as mm:ss
  const timeDisplay = useMemo(() => {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  // Determine MFA trigger reason from transaction data
  const triggerReason = useMemo(() => {
    const rules = transaction?.rulesTriggered || [];
    if (rules.includes("impossible_travel")) return "impossible_travel";
    if (rules.includes("new_or_different_location") || rules.includes("new_location_for_user")) return "new_location";
    if ((transaction?.fraudProbability ?? 0) >= 0.7) return "high_risk_score";
    return "suspicious_activity";
  }, [transaction]);

  const triggerReasonLabel = {
    impossible_travel: "Impossible Travel Detected",
    new_location: "New Location Detected",
    high_risk_score: "High ML Risk Score",
    suspicious_activity: "Suspicious Activity",
  }[triggerReason];

  // ── Save MFA result to Firestore ──
  const saveMfaResult = useCallback(async (mfaStatus) => {
    if (!transaction?.id) return;
    setSaving(true);
    try {
      await updateTransactionMfaStatus(transaction.id, mfaStatus, {
        reason: triggerReason,
        attempts,
        analystInfo: { uid: user?.uid, email: user?.email },
      });
      onStatusChange?.(mfaStatus);
    } catch (err) {
      console.error("Failed to save MFA status:", err);
    } finally {
      setSaving(false);
    }
  }, [transaction?.id, triggerReason, attempts, user, onStatusChange]);

  // ── Handle code submission ──
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (status !== "pending" || saving) return;

    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    if (inputCode.trim() === correctCode) {
      clearInterval(timerRef.current);
      setStatus("success");
      setErrorMsg("");
      saveMfaResult(MFA_STATUS.VERIFIED);
    } else if (newAttempts >= MAX_ATTEMPTS) {
      clearInterval(timerRef.current);
      setStatus("failed");
      setErrorMsg("Maximum attempts exceeded. Verification failed.");
      saveMfaResult(MFA_STATUS.FAILED);
    } else {
      setErrorMsg(`Incorrect code. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`);
      setInputCode("");
      inputRef.current?.focus();
    }
  }, [inputCode, correctCode, attempts, status, saving, saveMfaResult]);

  // ── Handle manual timeout trigger ──
  const handleSimulateTimeout = useCallback(() => {
    clearInterval(timerRef.current);
    setStatus("timed_out");
    setSecondsLeft(0);
    saveMfaResult(MFA_STATUS.TIMED_OUT);
  }, [saveMfaResult]);

  // ── Handle manual fail trigger ──
  const handleSimulateFail = useCallback(() => {
    clearInterval(timerRef.current);
    setAttempts(MAX_ATTEMPTS);
    setStatus("failed");
    setErrorMsg("Simulated verification failure.");
    saveMfaResult(MFA_STATUS.FAILED);
  }, [saveMfaResult]);

  // ── Handle manual pass trigger ──
  const handleSimulatePass = useCallback(() => {
    clearInterval(timerRef.current);
    setStatus("success");
    setErrorMsg("");
    saveMfaResult(MFA_STATUS.VERIFIED);
  }, [saveMfaResult]);

  // Auto-trigger timeout save
  useEffect(() => {
    if (status === "timed_out" && !saving) {
      saveMfaResult(MFA_STATUS.TIMED_OUT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!transaction) return null;

  // ── Status-specific result display ──
  const resultDisplay = {
    success: {
      icon: (
        <svg className="h-12 w-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: "MFA Verified — Transaction Approved",
      desc: "The customer successfully verified their identity. Transaction status updated to Legitimate.",
      bg: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/30",
    },
    failed: {
      icon: (
        <svg className="h-12 w-12 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6M9 9l6 6" />
        </svg>
      ),
      title: "MFA Failed — Transaction Rejected",
      desc: "The customer could not verify their identity. Transaction remains flagged as Fraud.",
      bg: "border-rose-200 bg-rose-50/80 dark:border-rose-800/50 dark:bg-rose-950/30",
    },
    timed_out: {
      icon: (
        <svg className="h-12 w-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: "MFA Timed Out — Transaction Rejected",
      desc: "The customer did not respond within the 5-minute window. Transaction remains flagged as Fraud.",
      bg: "border-amber-200 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30",
    },
  };

  const result = resultDisplay[status];

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="MFA Simulation"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
            <svg className="h-5 w-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Step-Up MFA Simulation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simulating customer identity verification
            </p>
          </div>
        </div>

        {/* Transaction Summary */}
        <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Transaction</span>
              <p className="font-medium text-slate-900 dark:text-slate-100">{transaction.transaction_id}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</span>
              <p className="font-medium text-slate-900 dark:text-slate-100">{formatMoney(transaction.amount)}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Location</span>
              <p className="font-medium text-slate-900 dark:text-slate-100">{transaction.location || "—"}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Trigger</span>
              <p className="font-medium text-amber-600 dark:text-amber-400">{triggerReasonLabel}</p>
            </div>
          </div>
        </div>

        {/* ── Result Screen (shown after resolution) ── */}
        {result ? (
          <div className={`rounded-xl border p-6 text-center ${result.bg}`}>
            <div className="flex justify-center mb-3">{result.icon}</div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{result.title}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{result.desc}</p>
            <p className="mt-3 text-xs text-slate-500">Attempts used: {attempts} / {MAX_ATTEMPTS}</p>
            <button
              onClick={onClose}
              className="mt-5 rounded-lg bg-slate-800 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* ── Active Verification Screen ── */}
            {/* Timer */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-sm font-mono font-bold ${secondsLeft <= 60 ? "text-rose-600 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"}`}>
                  {timeDisplay}
                </span>
                <span className="text-xs text-slate-400">remaining</span>
              </div>
              <span className="text-xs font-medium text-slate-500">
                Attempt {attempts} / {MAX_ATTEMPTS}
              </span>
            </div>

            {/* Simulated code display (for demo purposes) */}
            <div className="mb-4 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/60 p-3 dark:border-indigo-700 dark:bg-indigo-950/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-1">
                Simulated OTP Code (visible for demo)
              </p>
              <p className="text-center font-mono text-2xl font-bold tracking-[0.3em] text-indigo-700 dark:text-indigo-300">
                {correctCode}
              </p>
            </div>

            {/* Code input */}
            <form onSubmit={handleSubmit}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                Enter 6-digit verification code
              </label>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.4em] text-slate-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                disabled={saving}
              />

              {/* Error message */}
              {errorMsg && (
                <p className="mt-2 text-sm font-medium text-rose-600 dark:text-rose-400">{errorMsg}</p>
              )}

              {/* Verify button */}
              <button
                type="submit"
                disabled={inputCode.length !== 6 || saving}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Verifying..." : "Verify Code"}
              </button>
            </form>

            {/* Simulation shortcuts */}
            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Quick Simulation Controls
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleSimulatePass}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                >
                  ✓ Pass MFA
                </button>
                <button
                  onClick={handleSimulateFail}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                >
                  ✕ Fail MFA
                </button>
                <button
                  onClick={handleSimulateTimeout}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  ⏱ Timeout
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
