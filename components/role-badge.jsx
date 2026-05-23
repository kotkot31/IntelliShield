"use client";

import { ROLE_LABELS } from "@/lib/user-profile";

export default function RoleBadge({ role }) {
  if (!role) return null;

  const styles = {
    admin:
      "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-800/50",
    asst_admin:
      "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-800/50",
    it_security:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800/50",
    pending:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/50",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm transition-all ${
        styles[role] ?? "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}
