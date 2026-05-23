"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";

/**
 * Wraps a page to enforce authentication + role access.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading, profileLoading } = useAuth();
  const router = useRouter();

  const stillLoading = loading || profileLoading;

  useEffect(() => {
    if (stillLoading) return;

    if (!user) {
      router.replace("/signin");
      return;
    }

    // If profile is null, it means Firestore doc doesn't exist yet.
    // If we JUST logged in, there might be a split-second delay.
    if (!profile) {
      // Instead of immediate redirect, check if this is the Admin email
      // Admin should ALWAYS have a profile. If missing, it might be a rules issue.
      router.replace("/pending");
      return;
    }

    if (profile.role === "pending") {
      router.replace("/pending");
      return;
    }

    const isAdmin = profile.role === "admin" || profile.role === "asst_admin";

    if (adminOnly && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [user, profile, stillLoading, adminOnly, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (stillLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-blue-600"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">Checking permissions…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  if (!profile || profile.role === "pending") return null;
  const isAdmin = profile.role === "admin" || profile.role === "asst_admin";
  if (adminOnly && !isAdmin) return null;

  return children;
}
