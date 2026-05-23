/**
 * Cursor-based paginated Firestore hook.
 *
 * Strategy: Option A — getDocs + startAfter cursor + manual Refresh button.
 * No real-time updates (onSnapshot) so pagination cursors stay stable.
 *
 * Pagination model:
 *   cursorStack[0] = null           → page 1 (start of collection)
 *   cursorStack[1] = lastDoc(page1) → page 2
 *   cursorStack[n] = lastDoc(pageN) → page n+1
 *
 * Going forward: push lastDoc of current page onto cursorStack, fetch with startAfter.
 * Going backward: pop from cursorStack, fetch with the cursor that's now on top.
 */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getGlobalStats } from "@/lib/firestore-metadata";

const DEFAULT_PAGE_SIZE = 50;

/**
 * @param {object}  opts
 * @param {boolean} [opts.fraudOnly=false]     Filter to finalStatus === "Fraud" only
 * @param {number}  [opts.pageSize=50]         Rows per page
 */
export function usePagedTransactions({ fraudOnly = false, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(null); // null = not yet fetched
  const [totalFraud, setTotalFraud] = useState(null);
  const [totalLegit, setTotalLegit] = useState(null);

  // Stack of DocumentSnapshot cursors — cursorStack[i] is the startAfter doc for page i+1
  // cursorStack[0] = null → first page has no startAfter
  const cursorStack = useRef([null]);

  // The last DocumentSnapshot of the currently displayed page (used to go forward)
  const lastDocRef = useRef(null);

  // ── build query ─────────────────────────────────────────────────────────────
  const buildQuery = useCallback(
    (startAfterDoc) => {
      const constraints = [orderBy("date_time", "desc"), limit(pageSize)];
      if (fraudOnly) {
        // Prepend where clause — requires composite index:
        // Collection: transactions | Fields: finalStatus ASC, date_time DESC
        constraints.unshift(where("finalStatus", "==", "Fraud"));
      }
      if (startAfterDoc) constraints.push(startAfter(startAfterDoc));
      return query(collection(db, "transactions"), ...constraints);
    },
    [fraudOnly, pageSize],
  );

  // ── fetch one page ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (startAfterDoc) => {
      setLoading(true);
      setError("");
      try {
        const snap = await getDocs(buildQuery(startAfterDoc));
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      } catch (e) {
        setError(e?.message || "Failed to load transactions.");
      } finally {
        setLoading(false);
      }
    },
    [buildQuery],
  );

  // ── fetch total count (once, non-blocking) ──────────────────────────────────
  const fetchTotal = useCallback(async () => {
    try {
      const stats = await getGlobalStats();
      
      setTotal(stats.total_count || 0);
      setTotalFraud(stats.fraud_count || 0);
      setTotalLegit(stats.legitimate_count || 0);
    } catch (err) {
      setError("fetchTotal error: " + err.message);
    }
  }, []);

  // ── initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    cursorStack.current = [null];
    setPage(1);
    fetchPage(null);
    fetchTotal();
  }, [fetchPage, fetchTotal]);

  // ── navigation ──────────────────────────────────────────────────────────────
  const nextPage = useCallback(() => {
    if (!lastDocRef.current) return;
    cursorStack.current = [...cursorStack.current, lastDocRef.current];
    setPage((p) => p + 1);
    fetchPage(lastDocRef.current);
  }, [fetchPage]);

  const prevPage = useCallback(() => {
    if (cursorStack.current.length <= 1) return;
    const newStack = cursorStack.current.slice(0, -1);
    cursorStack.current = newStack;
    const prevCursor = newStack[newStack.length - 1] ?? null;
    setPage((p) => p - 1);
    fetchPage(prevCursor);
  }, [fetchPage]);

  const refresh = useCallback(() => {
    cursorStack.current = [null];
    setPage(1);
    fetchPage(null);
    fetchTotal();
  }, [fetchPage, fetchTotal]);

  const relevantTotal = fraudOnly ? totalFraud : total;
  const isFinalPageReached = relevantTotal !== null 
    ? page * pageSize >= relevantTotal
    : rows.length < pageSize;

  return {
    rows,
    loading,
    error,
    page,
    total,
    totalFraud,
    totalLegit,
    hasMore: !isFinalPageReached,
    hasPrev: page > 1,
    nextPage,
    prevPage,
    refresh,
    pageSize,
  };
}
