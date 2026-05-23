"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { createUserProfile } from "@/lib/user-profile";

export default function SignInPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setError("");
    if (formRef.current) formRef.current.reset();
  }, []);

  // 1. Remove the automatic redirect useEffect that was causing race conditions.
  // Instead, we will handle redirection manually in handleSubmit or handleGoogleSignIn.
  // This ensures the profile is created/refreshed BEFORE we move to the dashboard.
  
  function switchMode(toSignUp) {
    setIsSignUp(toSignUp);
    setError("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading || googleLoading) return;

    setError("");

    if (isSignUp && !firstName.trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (isSignUp && !lastName.trim()) {
      setError("Please enter your last name.");
      return;
    }

    const trimmedEmail = email.trim();
    setLoading(true);
    try {
      console.log("Attempting auth...");
      let result;
      if (isSignUp) {
        result = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        const fullName = `${firstName.trim()} ${lastName.trim()}`;
        await updateProfile(result.user, { displayName: fullName });
      } else {
        result = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }

      console.log("Auth successful, preparing profile...");
      
      // Ensure the Firestore profile exists before moving on
      await createUserProfile(
        result.user,
        isSignUp ? { firstName: firstName.trim(), lastName: lastName.trim() } : {},
      );
      
      console.log("Profile ready, refreshing context...");
      await refreshProfile();
      
      // Small delay to ensure state propagates
      setTimeout(() => {
        router.push("/dashboard");
      }, 100);
      
    } catch (err) {
      console.error("Auth Error Code:", err.code);
      console.error("Auth Error Message:", err.message);
      console.dir(err); 
      
      const messages = {
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/user-disabled": "This account has been disabled.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password. Please try again.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-credential": "Invalid email or password.",
        "auth/network-request-failed": "Network error. Please check your connection.",
      };
      
      let errorMsg = messages[err.code] || err.message || "Authentication failed.";
      
      // Specialized hint for admin email
      if (err.code === "auth/invalid-credential" && trimmedEmail.toLowerCase() === "dc.unicomtec@gmail.com") {
        errorMsg = "Invalid credentials. If you usually use Google, you may need to click 'Forgot Password' to set an email password.";
      }

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    const trimmedEmail = email.trim();
    console.log(`[AUTH DEBUG] Sending reset email to: "${trimmedEmail}"`);
    setLoading(true);
    setError("");
    setResetSent(false);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSent(true);
    } catch (err) {
      console.error("Reset Error:", err);
      const msg = err.code === "auth/user-not-found" 
        ? "No account found with this email."
        : "Failed to send reset email. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError("");
    try {
      console.log("Attempting Google auth...");
      const result = await signInWithGoogle();

      // result is null when signInWithRedirect is used (mobile) — page will reload
      if (!result) return;

      console.log("Google auth successful, preparing profile...");
      await createUserProfile(result.user);
      
      console.log("Profile ready, refreshing context...");
      await refreshProfile();
      
      setTimeout(() => {
        router.push("/dashboard");
      }, 100);
    } catch (err) {
      console.error("Google Auth Error:", err);
      const suppressedErrors = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
      if (!suppressedErrors.includes(err.code)) {
        setError(`Google sign-in failed: ${err.message || "Please try again."}`);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // If already logged in, show nothing while the redirect happens
  if (user) return null;

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-md items-center justify-center px-6 py-10">
      <section className="relative z-10 w-full rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/90 md:p-10">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 px-3 text-sm font-extrabold tracking-wide text-white shadow-lg shadow-blue-500/25">
              IntelliShield
            </span>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {isSignUp ? "Create Account" : "Welcome Back"}
          </h1>
          {isSignUp && (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              New accounts require IT Admin approval before access is granted.
            </p>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div 
            onClick={() => setError("")}
            className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 cursor-pointer hover:bg-rose-100 transition-colors group relative dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
            title="Click to dismiss"
          >
            <div className="flex justify-between items-center">
              <span><span className="mr-2">⚠</span>{error}</span>
              <span className="text-rose-400 group-hover:text-rose-600 text-xs transition-colors">✕</span>
            </div>
          </div>
        )}

        {/* Success banner */}
        {resetSent && (
          <div 
            onClick={() => setResetSent(false)}
            className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 cursor-pointer hover:bg-emerald-100 transition-colors group relative dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
            title="Click to dismiss"
          >
            <div className="flex justify-between items-start mb-1">
              <p className="font-bold">✓ Reset email initiated!</p>
              <span className="text-emerald-400 group-hover:text-emerald-600 text-xs transition-colors">✕</span>
            </div>
            <div className="text-xs opacity-90 leading-relaxed">
              If the email exists in our system, a link will arrive shortly. 
              <br/><br/>
              <strong className="underline">Not arriving?</strong>
              <ul className="mt-1 list-disc pl-4 space-y-1">
                <li>Check your Spam folder</li>
                <li>Verify spelling: <b>{email.trim()}</b></li>
                <li>Try <b>Signing Up</b> with this email. If it's already in use, Firebase will block it; if not, you've just set your password!</li>
              </ul>
            </div>
          </div>
        )}

        {/* Google Sign-In */}
        <button
          id="google-signin-btn"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="mb-5 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {googleLoading ? (
            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
          )}
          {googleLoading ? "Signing in…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            or {isSignUp ? "sign up" : "sign in"} with email
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
          {/* Name fields — sign-up only */}
          {isSignUp && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-firstname" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  First Name
                </label>
                <input
                  id="signup-firstname"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="Juan"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
              <div>
                <label htmlFor="signup-lastname" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Last Name
                </label>
                <input
                  id="signup-lastname"
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="dela Cruz"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="signin-email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
            </label>
            <input
              id="signin-email"
              name="email"
              type="email"
              required
              autoComplete="new-password"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="signin-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Password
              </label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="signin-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-[25%] -translate-y-1/2 rounded p-0.5 text-slate-400 transition hover:text-slate-600 focus:outline-none dark:text-slate-500 dark:hover:text-slate-300"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {isSignUp && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                Must be at least 6 characters
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(!isSignUp)}
            className="font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </div>
      </section>
    </main>
  );
}
