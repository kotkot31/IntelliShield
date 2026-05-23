"use client";

import { useEffect } from "react";

/**
 * Next.js root-layout error boundary.
 * Unlike app/error.js, this one CAN catch errors thrown inside layout.js itself
 * (e.g. AuthProvider, ThemeProvider, Navbar crashing).
 * It must be a Client Component and must render its own <html>/<body>.
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[Global Error Boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#1e1b2e",
            border: "1px solid #7f1d1d55",
            borderRadius: 16,
            padding: "2rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#450a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#f87171"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 style={{ color: "#fca5a5", fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            Application Error
          </h1>
          <p style={{ color: "#fda4af", fontSize: 14, margin: "0 0 4px", lineHeight: 1.5 }}>
            {error?.message || "A critical error prevented the application from loading."}
          </p>
          {error?.digest && (
            <p style={{ color: "#9ca3af", fontSize: 12, fontFamily: "monospace", margin: "4px 0 0" }}>
              Error ID: {error.digest}
            </p>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              onClick={reset}
              style={{
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              style={{
                background: "transparent",
                color: "#f87171",
                border: "1px solid #7f1d1d",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
