"use client";

import { useEffect, useState, useCallback } from "react";
import ProtectedRoute from "@/components/protected-route";
import { useAuth } from "@/contexts/auth-context";
import {
  listAllUsers,
  updateUserRole,
  deleteUserProfile,
  ROLES,
  ROLE_LABELS,
} from "@/lib/user-profile";
import { logActivity } from "@/lib/activity-logs";
import RoleBadge from "@/components/role-badge";

/** Returns a human-readable name from the stored profile. */
function getDisplayName(u) {
  // Prefer the explicitly stored first + last name fields
  const fromParts = [u.firstName, u.lastName].filter(Boolean).join(" ");
  if (fromParts) return fromParts;
  // Fall back to Firebase Auth displayName (set for Google users)
  if (u.displayName) return u.displayName;
  // Last resort: email username
  return u.email?.split("@")[0] || u.email || "Unknown User";
}


function ConfirmDialog({ message, onConfirm, onCancel, danger = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${danger
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-blue-600 hover:bg-blue-700"
              }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, currentUid, isSuperAdmin, onRoleChange, onDelete, loading }) {
  const isSelf = user.uid === currentUid;
  const [localRole, setLocalRole] = useState(user.role);

  const handleRoleChange = async (newRole) => {
    setLocalRole(newRole);
    await onRoleChange(user.uid, newRole);
  };

  const isTargetAdmin = user.role === ROLES.ADMIN || user.role === ROLES.ASST_ADMIN;
  // Asst Admins cannot modify existing admins or asst admins
  const canModify = isSuperAdmin || !isTargetAdmin;

  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full border border-slate-200 object-cover shadow-sm dark:border-slate-700"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
              {(user.displayName || user.email || "?")[0].toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {getDisplayName(user)}
              {isSelf && (
                <span className="ml-2 text-xs text-slate-400">(you)</span>
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.email}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-4">
        <RoleBadge role={localRole} />
      </td>
      <td className="py-3 pr-4 text-xs text-slate-500 dark:text-slate-400">
        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          {/* Role selector — restricted for Asst Admins */}
          <select
            value={localRole}
            onChange={(e) => handleRoleChange(e.target.value)}
            disabled={loading || isSelf || !canModify}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {isSuperAdmin && (
              <>
                <option value={ROLES.ADMIN}>{ROLE_LABELS.admin}</option>
                <option value={ROLES.ASST_ADMIN}>{ROLE_LABELS.asst_admin}</option>
              </>
            )}
            
            {/* If viewed by Asst Admin and target is already an admin/asst_admin, show current role */}
            {!isSuperAdmin && isTargetAdmin && (
              <option value={user.role}>{ROLE_LABELS[user.role]}</option>
            )}

            <option value={ROLES.IT_SECURITY}>{ROLE_LABELS.it_security}</option>
            <option value={ROLES.PENDING}>{ROLE_LABELS.pending}</option>
          </select>
          {isSuperAdmin && (
            <button
              onClick={() => onDelete(user.uid, user.email)}
              disabled={loading || isSelf}
              className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-slate-700"
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute adminOnly>
      <AdminPanel />
    </ProtectedRoute>
  );
}

function AdminPanel() {
  const { user, isSuperAdmin, role } = useAuth();
  const [users, setUsers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null); // { uid, email }
  const [activeTab, setActiveTab] = useState("pending");

  const fetchUsers = useCallback(async () => {
    setFetching(true);
    try {
      const all = await listAllUsers();
      setUsers(all);
    } catch (e) {
      setError(e.message || "Failed to load users.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleRoleChange = async (uid, role) => {
    setActionLoading(true);
    try {
      await updateUserRole(uid, role);
      
      const targetUser = users.find(u => u.uid === uid);
      await logActivity({
        ownerUid: user.uid,
        userEmail: user.email,
        action: "role_update",
        details: {
          targetUid: uid,
          targetEmail: targetUser?.email || "unknown",
          newRole: role,
          oldRole: targetUser?.role || "unknown"
        }
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.uid === uid ? { ...u, role, approved: role !== ROLES.PENDING } : u,
        ),
      );
      showToast("Role updated successfully.");
    } catch (e) {
      setError(e.message || "Failed to update role.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (uid) => {
    await handleRoleChange(uid, ROLES.IT_SECURITY);
  };

  const handleDeleteConfirm = (uid, email) => {
    setConfirm({ uid, email });
  };

  const handleDeleteExecute = async () => {
    if (!confirm) return;
    setActionLoading(true);
    try {
      await deleteUserProfile(confirm.uid);
      
      await logActivity({
        ownerUid: user.uid,
        userEmail: user.email,
        action: "user_deleted",
        details: {
          targetUid: confirm.uid,
          targetEmail: confirm.email
        }
      });

      setUsers((prev) => prev.filter((u) => u.uid !== confirm.uid));
      showToast("Account deleted.");
    } catch (e) {
      setError(e.message || "Failed to delete account.");
    } finally {
      setActionLoading(false);
      setConfirm(null);
    }
  };

  const pendingUsers = users.filter((u) => u.role === ROLES.PENDING);
  const approvedUsers = users.filter((u) => u.role !== ROLES.PENDING);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={`Permanently delete account "${confirm.email}"? This cannot be undone.`}
          danger
          onConfirm={handleDeleteExecute}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 shadow-lg dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              User Management
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Approve new accounts and manage roles for existing users.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            {role && <RoleBadge role={role} />}
            <button
              onClick={fetchUsers}
              disabled={fetching}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {fetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${activeTab === "pending"
                ? "border-amber-400 bg-amber-50 ring-1 ring-amber-400 dark:border-amber-700 dark:bg-amber-900/30"
                : "border-amber-200 bg-white hover:bg-amber-50/50 dark:border-amber-800/40 dark:bg-slate-900 dark:hover:bg-amber-900/20"
              }`}
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Pending</p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-amber-950 dark:text-amber-100">
              {pendingUsers.length}
            </p>
          </button>

          <button
            onClick={() => setActiveTab("approved")}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${activeTab === "approved"
                ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400 dark:border-emerald-700 dark:bg-emerald-900/30"
                : "border-emerald-200 bg-white hover:bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-slate-900 dark:hover:bg-emerald-900/20"
              }`}
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Approved</p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">
              {approvedUsers.length}
            </p>
          </button>

          <button
            onClick={() => setActiveTab("all")}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${activeTab === "all"
                ? "border-blue-400 bg-blue-50 ring-1 ring-blue-400 dark:border-blue-700 dark:bg-blue-900/30"
                : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60"
              }`}
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-400">Total Users</p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-100">
              {users.length}
            </p>
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800/40 dark:bg-rose-950/30 dark:text-rose-300">
          ⚠ {error}
        </div>
      )}

      {/* Pending Approvals Tab */}
      {activeTab === "pending" && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {fetching ? (
            <div className="flex items-center justify-center py-16">
              <svg className="h-7 w-7 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No pending accounts</p>
              <p className="mt-1 text-xs text-slate-400">All accounts have been reviewed.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingUsers.map((u) => (
                <div key={u.uid} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="flex items-center gap-3">
                    {u.photoURL ? (
                      <img
                        src={u.photoURL}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-sm"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow-sm">
                        {(u.displayName || u.email || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {getDisplayName(u)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                      <p className="text-xs text-slate-400">
                        Registered: {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(u.uid)}
                      disabled={actionLoading}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approve as IT Security Analyst
                    </button>
                    <button
                      onClick={() => handleDeleteConfirm(u.uid, u.email)}
                      disabled={actionLoading}
                      className="rounded-lg border border-rose-300 bg-white px-3.5 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-slate-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Approved Users Tab */}
      {activeTab === "approved" && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {fetching ? (
            <div className="flex items-center justify-center py-16">
              <svg className="h-7 w-7 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : approvedUsers.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              No approved users yet.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-6 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedUsers.map((u) => (
                    <UserRow
                      key={u.uid}
                      user={u}
                      currentUid={user?.uid}
                      isSuperAdmin={isSuperAdmin}
                      onRoleChange={handleRoleChange}
                      onDelete={handleDeleteConfirm}
                      loading={actionLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* All Users Tab */}
      {activeTab === "all" && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {fetching ? (
            <div className="flex items-center justify-center py-16">
              <svg className="h-7 w-7 animate-spin text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              No users found.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  <tr>
                    <th className="px-6 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRow
                      key={u.uid}
                      user={u}
                      currentUid={user?.uid}
                      isSuperAdmin={isSuperAdmin}
                      onRoleChange={handleRoleChange}
                      onDelete={handleDeleteConfirm}
                      loading={actionLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
