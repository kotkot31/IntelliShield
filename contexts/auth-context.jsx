"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { getUserProfile } from "@/lib/user-profile";

const AuthContext = createContext({
  user: null,
  profile: null,
  profileLoading: true,
  role: null,
  isAdmin: false,
  isSuperAdmin: false,
  isITSecurity: false,
  loading: true,
  logout: async () => {},
  signInWithGoogle: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // Separate flags so components can distinguish "auth loading" from "profile loading"
  const [loading, setLoading] = useState(true);           // Firebase Auth
  const [profileLoading, setProfileLoading] = useState(true); // Firestore profile

  const loadProfile = useCallback(async (firebaseUser) => {
    if (!firebaseUser) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      // Force reload the firebaseUser profile cache from the server to retrieve the absolute latest photoURL
      try {
        await firebaseUser.reload();
      } catch (reloadErr) {
        console.warn("Could not reload firebaseUser, using cached profile state:", reloadErr);
      }
      
      const updatedUser = auth.currentUser || firebaseUser;
      const p = await getUserProfile(updatedUser.uid);
      
      // Auto-sync photoURL from Auth to Firestore ONLY if a photo is present in Firebase Auth and differs from Firestore
      if (p && updatedUser.photoURL && p.photoURL !== updatedUser.photoURL) {
        const { doc, updateDoc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        const ref = doc(db, "users", updatedUser.uid);
        await updateDoc(ref, { photoURL: updatedUser.photoURL });
        p.photoURL = updatedUser.photoURL;
      }
      
      setProfile(p ?? null);
    } catch (e) {
      console.error("Error loading or syncing profile:", e);
      // Permission denied or network error — treat as "no profile"
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);          // auth state resolved
      await loadProfile(firebaseUser); // profile may still be loading after this
    });
    return () => unsubscribe();
  }, [loadProfile]);

  const logout = async () => {
    await signOut(auth);
  };

  const signInWithGoogle = async () => {
    return signInWithPopup(auth, googleProvider);
  };

  const role = profile?.role ?? null;
  const isAdmin = role === "admin" || role === "asst_admin";
  const isSuperAdmin = role === "admin";
  const isITSecurity = role === "it_security";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        profileLoading,
        role,
        isAdmin,
        isSuperAdmin,
        isITSecurity,
        loading,
        logout,
        signInWithGoogle,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
