"use client";

import { useMemo } from "react";

/**
 * RefreshDataButton
 *
 * A reusable button that triggers a data refresh on analytics/chart pages.
 * Displays a spinner while loading and shows the last-refreshed timestamp.
 *
 * Props:
 *   onClick        — async function to call on click
 *   loading        — boolean, shows spinner when true
 *   lastRefreshed  — Date | null, the timestamp of the last successful fetch
 */
export default function RefreshDataButton({ onClick, loading, lastRefreshed }) {
  const label = useMemo(() => {
    if (!lastRefreshed) return null;
    // eslint-disable-next-line react-hooks/purity
    const diffMs = Date.now() - lastRefreshed.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin === 1) return "1 min ago";
    return `${diffMin} min ago`;
  }, [lastRefreshed]);

  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Updated {label}
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {loading ? "Refreshing…" : "Refresh Data"}
      </button>
    </div>
  );
}
