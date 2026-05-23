import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/** The one hardcoded admin email. */
export const ADMIN_EMAIL = "dc.unicomtec@gmail.com";

export const ROLES = {
  ADMIN: "admin",
  ASST_ADMIN: "asst_admin",
  IT_SECURITY: "it_security",
  PENDING: "pending",
};

export const ROLE_LABELS = {
  admin: "IT Admin",
  asst_admin: "Asst. IT Admin",
  it_security: "IT Security Analyst",
  pending: "Pending Approval",
};

/**
 * Creates a Firestore profile on first sign-in.
 * The hardcoded admin email always receives role = "admin".
 * All other new accounts start as "pending".
 * If a profile already exists it is returned unchanged.
 *
 * @param {object} user - Firebase Auth user object
 * @param {{ firstName?: string, lastName?: string }} extras - optional name fields from sign-up form
 */
export async function createUserProfile(user, extras = {}) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const isAdminEmail =
    (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Profile already exists — but if this is the admin email and the role is
  // wrong (e.g. signed up before RBAC was in place), silently promote it.
  if (snap.exists()) {
    const existing = snap.data();
    if (isAdminEmail && existing.role !== ROLES.ADMIN) {
      await updateDoc(ref, { role: ROLES.ADMIN, approved: true });
      return { ...existing, role: ROLES.ADMIN, approved: true };
    }
    return existing;
  }

  const role = isAdminEmail ? ROLES.ADMIN : ROLES.PENDING;

  const firstName = extras.firstName?.trim() ?? "";
  const lastName  = extras.lastName?.trim()  ?? "";
  // Prefer the name from extras (sign-up form); fall back to Firebase Auth displayName
  const displayName =
    firstName || lastName
      ? `${firstName} ${lastName}`.trim()
      : (user.displayName || "");

  const profile = {
    uid: user.uid,
    email: user.email || "",
    firstName,
    lastName,
    displayName,
    photoURL: user.photoURL || "",
    role,
    approved: role === ROLES.ADMIN,
    createdAt: new Date().toISOString(),
  };

  await setDoc(ref, profile);
  return profile;
}

/** Fetch an existing profile by UID. Returns null if not found. */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * Update a user's role.
 * Automatically sets approved = true for non-pending roles.
 */
export async function updateUserRole(uid, role) {
  await updateDoc(doc(db, "users", uid), {
    role,
    approved: role !== ROLES.PENDING,
  });
}

/**
 * Delete a user's Firestore profile.
 * This revokes app access — they will be redirected to /pending on next login.
 */
export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, "users", uid));
}

/** List all registered users, sorted oldest-first. Admin only. */
export async function listAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}
