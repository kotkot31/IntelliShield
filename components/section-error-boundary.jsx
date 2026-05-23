"use client";

import { Component } from "react";

/**
 * SectionErrorBoundary
 *
 * A React class-based Error Boundary that wraps individual dashboard sections.
 * If a section crashes during rendering, only THAT section is replaced with a
 * friendly error card — the rest of the page continues to work normally.
 *
 * Usage:
 *   <SectionErrorBoundary label="Fraud Alerts">
 *     <FraudAlertsTable />
 *   </SectionErrorBoundary>
 */
export default class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console in all environments so developers can see what happened
    console.error(
      `[SectionErrorBoundary] "${this.props.label ?? "Section"}" crashed:`,
      error,
      info.componentStack,
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const label = this.props.label ?? "This section";
      const message = this.state.error?.message;

      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-amber-600 dark:text-amber-400"
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

            {/* Text */}
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                {label} failed to load
              </p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                {message
                  ? message
                  : "An unexpected error occurred in this section. The rest of the app is unaffected."}
              </p>

              {/* Retry */}
              <button
                type="button"
                onClick={this.handleReset}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 shadow-sm transition hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
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
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
