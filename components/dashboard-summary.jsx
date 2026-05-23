"use client";

import { useState, useEffect } from "react";
import { formatMoney } from "@/utils/format-money";
import TransactionDetailsModal from "@/components/transaction-details-modal";

function DetailsPopup({ title, data, colorClass, onTransactionClick }) {
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil((data?.length || 0) / pageSize));
  
  useEffect(() => {
    setPage(1);
  }, [data?.length]);

  if (!data) return null;

  const currentRows = data.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 z-50 w-80 pt-3 invisible opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 cursor-default">
      <div className={`rounded-xl border bg-white p-4 shadow-xl dark:bg-slate-800 ${colorClass}`}>
        <h3 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">{title} Details</h3>
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
          {currentRows.length === 0 ? (
             <p className="text-xs text-slate-500">No data available.</p>
          ) : (
            currentRows.map(r => (
              <div key={r.id} className="text-xs border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0 last:pb-0">
                <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-200">
                  <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTransactionClick?.(r); }}
                    className="hover:underline text-blue-600 dark:text-blue-400 text-left cursor-pointer"
                  >
                    {r.transaction_id}
                  </button>
                  <span>{formatMoney(r.amount)}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400 mt-1">
                  <span className="truncate pr-2">{r.user_id}</span>
                  <span className="shrink-0">{r.location}</span>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
          <button 
            disabled={page === 1} 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPage(p => Math.max(1, p - 1)); }}
            className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:!bg-transparent dark:text-amber-400 dark:hover:text-orange-400 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button 
            disabled={page === totalPages} 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPage(p => Math.min(totalPages, p + 1)); }}
            className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 dark:!bg-transparent dark:text-amber-400 dark:hover:text-orange-400 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

import { useData } from "@/contexts/data-context";

export default function DashboardSummary({ stats, onLabelChange }) {
  const [selectedTx, setSelectedTx] = useState(null);
  const { rows: cachedRows, ensureDataLoaded } = useData();

  useEffect(() => {
    ensureDataLoaded();
  }, [ensureDataLoaded]);

  // Compute full cached lists (up to 3000) for details hovers to ensure ALL items are displayed
  const allRows = cachedRows;
  const fraudRows = cachedRows.filter(r => (r.finalStatus || r.status) === "Fraud");
  const legitimateRows = cachedRows.filter(r => (r.finalStatus || r.status) !== "Fraud");

  // Keep counts aligned with global metadata counters for consistency, fallback to cache
  const total = stats?.total !== undefined && stats?.total !== "Loading..." && stats?.total !== "..." ? stats.total : allRows.length;
  const fraud = stats?.fraud !== undefined && stats?.fraud !== "Loading..." && stats?.fraud !== "..." ? stats.fraud : fraudRows.length;
  const legitimate = stats?.legitimate !== undefined && stats?.legitimate !== "Loading..." && stats?.legitimate !== "..." ? stats.legitimate : legitimateRows.length;

  return (
    <>
    <section className="grid gap-4 md:grid-cols-3">
      <div className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Total transactions
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {total}
        </p>
        {allRows.length > 0 && <DetailsPopup title="All Transactions" data={allRows} colorClass="border-slate-200 dark:border-slate-600" onTransactionClick={setSelectedTx} />}
      </div>

      <div className="group relative rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm hover:shadow-md transition-shadow dark:border-rose-900/40 dark:bg-rose-900/20">
        <p className="text-sm font-medium text-rose-700 dark:text-rose-200">
          Fraud count
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-900 dark:text-rose-100">
          {fraud}
        </p>
        {fraudRows.length > 0 && <DetailsPopup title="Fraud Transactions" data={fraudRows} colorClass="border-rose-200 dark:border-rose-800" onTransactionClick={setSelectedTx} />}
      </div>

      <div className="group relative rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm hover:shadow-md transition-shadow dark:border-emerald-900/40 dark:bg-emerald-900/20">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-200">
          Legitimate count
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-900 dark:text-emerald-100">
          {legitimate}
        </p>
        {legitimateRows.length > 0 && <DetailsPopup title="Legitimate Transactions" data={legitimateRows} colorClass="border-emerald-200 dark:border-emerald-800" onTransactionClick={setSelectedTx} />}
      </div>
    </section>

    {selectedTx && (
      <TransactionDetailsModal 
        transaction={selectedTx} 
        onClose={() => setSelectedTx(null)}
        onLabelChange={(labelValue, txId) => {
          onLabelChange?.(labelValue, txId);
        }}
      />
    )}
    </>
  );
}

