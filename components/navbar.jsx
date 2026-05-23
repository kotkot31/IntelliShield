"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@/lib/user-profile";

function NavLink({ href, children }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={
        isActive
          ? "rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 shadow-sm dark:border-amber-500/50 dark:bg-amber-900/20 dark:text-amber-300"
          : "rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-orange-500/50 dark:hover:bg-slate-700/30 dark:hover:!text-orange-400"
      }
    >
      {children}
    </Link>
  );
}

function RolePill({ role }) {
  if (!role) return null;
  const styles = {
    admin:
      "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/40",
    it_security:
      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/40",
    pending:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/40",
  };
  return (
    <span
      className={`hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold sm:inline-flex ${styles[role] ?? "bg-slate-100 text-slate-600"}`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default function Navbar() {
  const { user, role, isAdmin, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/signin");
  };

  const isSignInPage = pathname === "/signin";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        {/* Left: brand + nav */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            <span className="inline-flex h-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 px-2 text-xs font-extrabold tracking-wide text-white shadow shadow-blue-500/25">
              IntelliShield
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {/* Home */}
            <NavLink href="/">
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Home
              </span>
            </NavLink>
            {/* Dashboard */}
            <NavLink href="/dashboard">
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Dashboard
              </span>
            </NavLink>
            {/* Analytics */}
            <NavLink href="/analytics">
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
                Analytics
              </span>
            </NavLink>
            {/* Threat Intel */}
            <NavLink href="/advanced-analytics">
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Threat Intel
              </span>
            </NavLink>
            {/* Admin-only link */}
            {isAdmin && (
              <>
                <NavLink href="/monitoring">
                  <span className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Monitoring
                  </span>
                </NavLink>
                <NavLink href="/admin">
                  <span className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Users
                  </span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* Right: role pill + theme + auth */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {!loading && (
            <>
              {user ? (
                <div className="flex items-center gap-2">
                  <RolePill role={role} />
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(true)}
                    className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 hover:text-violet-600 hover:border-violet-400/50 hover:shadow-[0_0_12px_rgba(139,92,246,0.4)] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/30 dark:hover:text-violet-400 dark:hover:border-violet-300 dark:hover:shadow-[0_0_15px_rgba(167,139,250,0.7),0_0_30px_rgba(167,139,250,0.5),inset_0_0_8px_rgba(167,139,250,0.5)]"
                  >
                    Sign Out
                  </button>
                </div>
              ) : !isSignInPage ? (
                <Link
                  href="/signin"
                  className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700"
                >
                  Sign In
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sign Out</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Are you sure you want to sign out of IntelliShield?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100/80 transition-colors dark:text-slate-300 dark:hover:bg-slate-800/80"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSignOutConfirm(false);
                  handleLogout();
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/50 dark:hover:bg-rose-500"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
