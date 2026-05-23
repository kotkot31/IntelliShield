import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
  addDoc,
  documentId,
  updateDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logActivity } from "@/lib/activity-logs";
import { updateTransactionStats, resetTransactionStats, incrementLabeledCount } from "@/lib/firestore-metadata";

const TRANSACTIONS_COLLECTION = "transactions";
const RESULTS_COLLECTION = "results";

/**
 * Delete all transactions for a given user from Firestore.
 * Uses batched writes (max 500 per Firestore batch) to handle large datasets.
 *
 * @param {string} ownerUid - The authenticated user's UID
 * @param {string} userEmail - The authenticated user's email
 * @returns {{ deletedCount: number }} Number of documents deleted
 */
export async function deleteAllTransactions(ownerUid, userEmail) {
  let totalDeleted = 0;
  let hasMore = true;

  // Delete in batches of 500 (Firestore batch limit)
  while (hasMore) {
    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      limit(500),
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(doc(db, TRANSACTIONS_COLLECTION, docSnap.id));
    });

    await batch.commit();
    totalDeleted += snapshot.size;

    // If we got fewer than 500, we've reached the end
    if (snapshot.size < 500) {
      hasMore = false;
    }
  }

  if (totalDeleted > 0) {
    await logActivity({
      ownerUid,
      userEmail,
      action: "bulk_delete",
      details: {
        count: totalDeleted,
        target: "all_transactions"
      }
    });

    // Reset server-side aggregation stats
    await resetTransactionStats();
  }

  return { deletedCount: totalDeleted };
}

/**
 * Checks Firestore for existing transactions by transaction_id to prevent duplicates.
 * 
 * @param {Array} transactions - Array of parsed transactions
 * @returns {Promise<Array>} Array of net-new transactions that don't exist in Firestore
 */
export async function filterExistingTransactions(transactions) {
  if (!transactions || transactions.length === 0) return [];

  const newTransactions = [];
  const chunkSize = 30; // Firestore 'in' query limit

  for (let i = 0; i < transactions.length; i += chunkSize) {
    const chunk = transactions.slice(i, i + chunkSize);
    // Ensure transaction_id exists and is a string for Firestore queries
    const chunkIds = chunk.map((t) => String(t.transaction_id || ""));

    const q = query(
      collection(db, TRANSACTIONS_COLLECTION),
      where(documentId(), "in", chunkIds)
    );

    const snapshot = await getDocs(q);
    const existingIds = new Set(snapshot.docs.map((docSnap) => docSnap.id));

    chunk.forEach((t) => {
      const tId = String(t.transaction_id || "");
      if (!existingIds.has(tId)) {
        newTransactions.push(t);
      }
    });
  }

  return newTransactions;
}

export async function storeParsedTransactions({
  transactions,
  uploadedFileUrl,
  invalidRows,
  ownerUid,
}) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    throw new Error("No valid transactions to store.");
  }

  const batch = writeBatch(db);
  const transactionsRef = collection(db, TRANSACTIONS_COLLECTION);

  transactions.forEach((item) => {
    // Force the Firestore document ID to be the transaction_id for deduplication
    const tId = String(item.transaction_id || doc(transactionsRef).id); // Fallback if missing
    const newDocRef = doc(transactionsRef, tId);
    
    batch.set(newDocRef, {
      ...item,
      owner_uid: ownerUid,
      source_file_url: uploadedFileUrl,
      created_at: serverTimestamp(),
    });
  });

  await batch.commit();

  const fraudCount = transactions.filter(
    (item) => (item.finalStatus || item.status) === "Fraud",
  ).length;
  const legitimateCount = transactions.length - fraudCount;

  const summaryRef = await addDoc(collection(db, RESULTS_COLLECTION), {
    owner_uid: ownerUid,
    source_file_url: uploadedFileUrl,
    total_valid_transactions: transactions.length,
    total_invalid_rows: Array.isArray(invalidRows) ? invalidRows.length : 0,
    invalid_rows_preview: Array.isArray(invalidRows) ? invalidRows.slice(0, 10) : [],
    fraud_count: fraudCount,
    legitimate_count: legitimateCount,
    status: "parsed",
    created_at: serverTimestamp(),
  });

  // Increment server-side aggregation stats
  await updateTransactionStats(transactions.length, fraudCount, legitimateCount);

  // All stored transactions have a definitive Fraud/Legitimate status → count as labeled
  await incrementLabeledCount(transactions.length);

  return {
    savedCount: transactions.length,
    fraudCount,
    legitimateCount,
    resultId: summaryRef.id,
  };
}

/**
 * Derives the pipeline-assigned finalStatus from stored fields.
 * Used when a manual label is cleared to restore the original pipeline verdict.
 *
 * Priority: ANY pillar flagging Fraud → Fraud; fallback to ruleRiskScore threshold.
 *
 * @param {object} data - Firestore document data
 * @returns {"Fraud"|"Legitimate"}
 */
function derivePipelineStatus(data) {
  if (
    data.ruleStatus === "Fraud" ||
    data.mlStatus === "Fraud" ||
    data.correlationStatus === "Fraud"
  ) {
    return "Fraud";
  }
  const score = Number(data.ruleRiskScore ?? data.riskScore ?? 0);
  return score >= 50 ? "Fraud" : "Legitimate";
}

/**
 * Updates a transaction with an analyst's manual label (feedback).
 * Immediately overrides `finalStatus` in Firestore AND keeps the global
 * fraud/legitimate counters in sync.
 * Cost: 1 read (inside runTransaction) + 1 write + 1 counter write.
 *
 * @param {string} transactionId - The ID of the transaction document to update
 * @param {number|null} labelValue - 1 for Fraud, 0 for Legitimate, null to clear
 * @param {object} analystInfo - Information about the analyst performing the action
 */
export async function updateTransactionLabel(transactionId, labelValue, analystInfo = {}) {
  if (!transactionId) throw new Error("Transaction ID is required");

  // Capture the counter delta outside the transaction so we can apply it after commit.
  // (Firestore runTransaction must not contain async side-effects like Firestore writes
  //  that are not part of the transaction itself.)
  let counterDelta = null;
  let oldStatus = null;
  let newStatus = null;

  await runTransaction(db, async (txn) => {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    const docSnap = await txn.get(docRef);

    if (!docSnap.exists()) throw new Error("Transaction document not found.");

    const data = docSnap.data();
    oldStatus = data.finalStatus || data.status || "Legitimate";

    if (labelValue === 1) {
      newStatus = "Fraud";
    } else if (labelValue === 0) {
      newStatus = "Legitimate";
    } else {
      // Clearing label → revert to original pipeline verdict
      newStatus = derivePipelineStatus(data);
    }

    txn.update(docRef, {
      manualLabel: labelValue ?? null,
      finalStatus: newStatus,
      status: newStatus,
      labeled_at: serverTimestamp(),
      labeled_by_uid: analystInfo.uid || null,
      labeled_by_email: analystInfo.email || null,
    });

    if (oldStatus !== newStatus) {
      counterDelta = {
        fraud: (newStatus === "Fraud" ? 1 : 0) - (oldStatus === "Fraud" ? 1 : 0),
        legit: (newStatus === "Legitimate" ? 1 : 0) - (oldStatus === "Legitimate" ? 1 : 0),
      };
    }
  });

  // Apply counter adjustment AFTER the transaction commits successfully
  if (counterDelta) {
    await updateTransactionStats(0, counterDelta.fraud, counterDelta.legit);
  }

  // Labeled count: +1 when setting a label, -1 when clearing
  if (labelValue !== null && labelValue !== undefined) {
    await incrementLabeledCount(1);
  } else {
    await incrementLabeledCount(-1);
  }

  // Audit log
  if (analystInfo.uid) {
    let actionText = "Cleared transaction label";
    if (labelValue === 1) actionText = "Labeled transaction as True Fraud";
    if (labelValue === 0) actionText = "Labeled transaction as False Positive";

    await logActivity({
      ownerUid: analystInfo.uid,
      userEmail: analystInfo.email,
      action: "manual_labeling",
      details: {
        transaction_id: transactionId,
        labelValue,
        actionType: actionText,
        previousStatus: oldStatus,
        newStatus,
      },
    });
  }
}

/**
 * MFA Status Constants for Simulated Step-Up Authentication.
 */
export const MFA_STATUS = {
  REQUIRED: "mfa_required",
  VERIFIED: "mfa_verified",
  FAILED: "mfa_failed",
  TIMED_OUT: "mfa_timed_out",
};

/**
 * Human-readable labels for MFA statuses.
 */
export const MFA_STATUS_LABELS = {
  [MFA_STATUS.REQUIRED]: "MFA Required",
  [MFA_STATUS.VERIFIED]: "MFA Verified",
  [MFA_STATUS.FAILED]: "MFA Failed",
  [MFA_STATUS.TIMED_OUT]: "MFA Timed Out",
};

/**
 * Updates a transaction's simulated MFA status.
 *
 * @param {string} transactionId - The Firestore document ID of the transaction
 * @param {string} mfaStatus    - One of MFA_STATUS values
 * @param {object} options
 * @param {string} options.reason   - Why MFA was triggered (e.g. "impossible_travel", "high_risk_score")
 * @param {number} options.attempts - Number of MFA attempts made
 * @param {object} options.analystInfo - { uid, email } of the admin performing the action
 */
export async function updateTransactionMfaStatus(transactionId, mfaStatus, options = {}) {
  if (!transactionId) throw new Error("Transaction ID is required");
  if (!Object.values(MFA_STATUS).includes(mfaStatus)) {
    throw new Error(`Invalid MFA status: ${mfaStatus}`);
  }

  const { reason = "", attempts = 0, analystInfo = {} } = options;

  // Capture counter delta after transaction commits — same pattern as updateTransactionLabel.
  let counterDelta = null;
  let oldStatus = null;
  let newStatus = null;

  await runTransaction(db, async (txn) => {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    const docSnap = await txn.get(docRef);

    if (!docSnap.exists()) throw new Error("Transaction document not found.");

    const data = docSnap.data();
    oldStatus = data.finalStatus || data.status || "Legitimate";
    newStatus = oldStatus;

    const updateData = {
      mfaStatus,
      mfaReason: reason,
      mfaAttempts: attempts,
    };

    if (mfaStatus === MFA_STATUS.REQUIRED) {
      updateData.mfaTriggeredAt = serverTimestamp();
      updateData.mfaResolvedAt = null;
    } else if (mfaStatus === MFA_STATUS.VERIFIED) {
      newStatus = "Legitimate";
      updateData.mfaResolvedAt = serverTimestamp();
    } else if (mfaStatus === MFA_STATUS.FAILED || mfaStatus === MFA_STATUS.TIMED_OUT) {
      newStatus = "Fraud";
      updateData.mfaResolvedAt = serverTimestamp();
    }

    // Always write finalStatus + status so UI filters stay accurate
    updateData.finalStatus = newStatus;
    updateData.status = newStatus;
    txn.update(docRef, updateData);

    if (oldStatus !== newStatus) {
      counterDelta = {
        fraud: (newStatus === "Fraud" ? 1 : 0) - (oldStatus === "Fraud" ? 1 : 0),
        legit: (newStatus === "Legitimate" ? 1 : 0) - (oldStatus === "Legitimate" ? 1 : 0),
      };
    }
  });

  // Apply counter adjustment AFTER the transaction commits successfully
  if (counterDelta) {
    await updateTransactionStats(0, counterDelta.fraud, counterDelta.legit);
  }

  // Audit log
  if (analystInfo.uid) {
    const label = MFA_STATUS_LABELS[mfaStatus] || mfaStatus;
    await logActivity({
      ownerUid: analystInfo.uid,
      userEmail: analystInfo.email,
      action: "mfa_simulation",
      details: {
        transaction_id: transactionId,
        mfaStatus,
        reason,
        attempts,
        actionType: `Simulated ${label}`,
        previousStatus: oldStatus,
        newStatus,
      },
    });
  }
}
