"use client";

import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import RoleBadge from "@/components/role-badge";

async function handleSignOut() {
  await signOut(auth);
  window.location.href = "/signin";
}

export default function PendingPage() {
  const { role } = useAuth();
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-6">
      <div className="relative w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center shadow-lg dark:border-amber-800/40 dark:bg-amber-950/30">
        {/* Clock icon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-amber-600 dark:text-amber-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        {/* Role badge in top right corner of the centered card */}
        <div className="absolute top-6 right-6">
          {role && <RoleBadge role={role} />}
        </div>

        <h1 className="text-2xl font-semibold text-amber-900 dark:text-amber-100">
          Awaiting Approval
        </h1>
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          Your account has been created and is currently pending IT Admin
          review. You will receive access once an IT Admin approves your account.
        </p>
        <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
          Please contact your IT Admin if you need immediate access.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {/* Retry — reloads the page, which re-runs the auth flow */}
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
          >
            Check Again
          </button>

          <button
            onClick={handleSignOut}
            className="w-full rounded-lg border border-amber-300 bg-white px-5 py-2.5 text-sm font-medium text-amber-800 shadow-sm transition hover:bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}
