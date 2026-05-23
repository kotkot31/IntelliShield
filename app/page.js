"use client";

import Link from "next/link";

function FeatureCard({ title, description, icon, iconColor = "bg-blue-600 shadow-blue-500/20" }) {
  return (
    <div className="group rounded-2xl border border-slate-300 bg-slate-100 p-6 shadow-md transition-all duration-300 hover:-translate-y-2 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/10 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:shadow-blue-900/20">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-white shadow-lg ${iconColor}`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pt-24 pb-16 lg:pt-32 lg:pb-24">
        {/* Background Gradients */}
        <div className="absolute top-0 -z-10 h-full w-full">
          <div className="absolute top-0 left-1/4 h-[500px] w-[500px] rounded-full bg-blue-500/15 blur-[120px] dark:bg-blue-900/10" />
          <div className="absolute top-1/4 right-1/4 h-[500px] w-[500px] rounded-full bg-indigo-500/15 blur-[120px] dark:bg-indigo-900/10" />
        </div>


        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50/50 px-6 py-2.5 text-base font-bold tracking-wide text-indigo-700 ring-1 ring-inset ring-indigo-600/20 shadow-sm shadow-blue-500/10 dark:bg-indigo-950/30 dark:text-indigo-300 dark:ring-indigo-500/30">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-600"></span>
            </span>
            IntelliShield Analytics
          </span>
          <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-6xl">
            Detect Fraud with <br />
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Adaptive Intelligence
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
            An enterprise-grade fraud detection system combining machine learning,
            neural network, velocity analysis, and behavioral profiling.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 hover:shadow-blue-500/40 active:scale-95"
            >
              Get Started
            </Link>
            <Link
              href="/analytics"
              className="rounded-xl border border-slate-300 bg-white px-8 py-3.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              View Analytics
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            title="ML Risk Scoring"
            iconColor="bg-emerald-600 shadow-emerald-500/20"
            description="Gaussian anomaly detection model analyzes transaction amounts and timing to identify statistically improbable patterns."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 21h6l-.75-4M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />
          <FeatureCard
            title="Velocity Checks"
            iconColor="bg-amber-500 shadow-amber-500/20"
            description="Detect credential stuffing and botnets with real-time tracking of device IDs and IP address turnover rates."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
          <FeatureCard
            title="Threat Intelligence"
            iconColor="bg-indigo-600 shadow-indigo-500/20"
            description="Visualize risk clusters and network trends with advanced bubble charts and dual-axis correlation analytics."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            }
          />
          <FeatureCard
            title="Role-Based Security"
            iconColor="bg-rose-600 shadow-rose-500/20"
            description="Granular access control for IT Security Analysts and IT Admins with a built-in approval workflow for new staff."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
          />
          <FeatureCard
            title="CSV Processing"
            iconColor="bg-sky-600 shadow-sky-500/20"
            description="Upload enterprise datasets for bulk analysis. Our pipeline includes automated deduplication and risk categorization."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            }
          />
          <FeatureCard
            title="Interactive Reports"
            iconColor="bg-purple-600 shadow-purple-500/20"
            description="Export detailed audit logs and risk summaries to CSV for external compliance reporting and deeper investigations."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          />
        </div>
      </section>

      {/* Trust Footer */}
      <footer className="mx-auto max-w-5xl px-6 py-12 text-center border-t border-slate-100 dark:border-slate-800">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-widest">
          Secured by Firebase Identity & Firestore
        </p>
      </footer>
    </main>
  );
}
