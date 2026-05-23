import { doc, getDoc, setDoc, increment as firestoreIncrement } from "firebase/firestore";
import { db } from "@/lib/firebase";

const METADATA_COLLECTION = "settings";
const STATS_DOC_ID = "transaction_stats";

/**
 * Updates the running tally of transactions in the metadata document.
 * Creates the document if it doesn't exist.
 * 
 * @param {number} totalDelta - Number of transactions added/removed
 * @param {number} fraudDelta - Number of fraud transactions added/removed
 * @param {number} legitimateDelta - Number of legitimate transactions added/removed
 */
export async function updateTransactionStats(totalDelta = 0, fraudDelta = 0, legitimateDelta = 0) {
  const docRef = doc(db, METADATA_COLLECTION, STATS_DOC_ID);
  
  await setDoc(docRef, {
    total_count: firestoreIncrement(totalDelta),
    fraud_count: firestoreIncrement(fraudDelta),
    legitimate_count: firestoreIncrement(legitimateDelta)
  }, { merge: true });
}

/**
 * Atomically adjusts the labeled_count counter.
 * Called when transactions are stored (all have a definitive label) or
 * when an analyst manually labels/clears a transaction.
 *
 * @param {number} delta - Positive to increment, negative to decrement
 */
export async function incrementLabeledCount(delta = 0) {
  if (delta === 0) return;
  const docRef = doc(db, METADATA_COLLECTION, STATS_DOC_ID);
  
  await setDoc(docRef, {
    labeled_count: firestoreIncrement(delta)
  }, { merge: true });
}

/**
 * Resets the transaction stats to zero. Used when all transactions are deleted.
 */
export async function resetTransactionStats() {
  const docRef = doc(db, METADATA_COLLECTION, STATS_DOC_ID);
  
  await setDoc(docRef, {
    total_count: 0,
    fraud_count: 0,
    legitimate_count: 0,
    labeled_count: 0
  });
}

/**
 * Fetches the current global stats from the metadata document.
 * 
 * @returns {Promise<{total_count: number, fraud_count: number, legitimate_count: number}>}
 */
export async function getGlobalStats() {
  const docRef = doc(db, METADATA_COLLECTION, STATS_DOC_ID);
  const snapshot = await getDoc(docRef);
  
  if (snapshot.exists()) {
    return snapshot.data();
  }
  
  return { total_count: 0, fraud_count: 0, legitimate_count: 0 };
}
