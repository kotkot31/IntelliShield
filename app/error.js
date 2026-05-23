"use client";

import { useEffect } from "react";

/**
 * Next.js App Router error boundary.
 * This file is picked up automatically and wraps every page segment.
 * It catches render errors AND unhandled async errors thrown from Server Components.
 *
 * @param {Error}    error  - The thrown error object
 * @param {Function} reset  - Call this to attempt re-rendering the segment
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    // Log to the browser console so it still shows up in dev tools
    console.error("[App Error Boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-8 shadow-lg dark:border-rose-800/50 dark:bg-rose-950/30">
        {/* Icon */}
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-rose-600 dark:text-rose-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Heading */}
        <h2 className="mt-4 text-lg font-semibold text-rose-900 dark:text-rose-200">
          Something went wrong
        </h2>

        {/* Message */}
        <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">
          {error?.message
            ? error.message
            : "An unexpected error occurred. The page could not be displayed."}
        </p>

        {/* Error digest (Next.js production identifier) */}
        {error?.digest && (
          <p className="mt-1 font-mono text-xs text-rose-500 dark:text-rose-500">
            Error ID: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/dashboard")}
            className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 dark:border-rose-700 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
