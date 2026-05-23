import { NextResponse } from "next/server";
import { collection, getDocs, query, limit, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { applyMlScoring } from "@/lib/ml/pipeline";
import { getLastTrainingTimestamp } from "@/lib/ml/model-store";
import { NN_MIN_ROWS } from "@/lib/ml/constants";

/**
 * SCHEDULED RETRAINING MODULE
 * 
 * This module implements scheduled model retraining using Vercel cron jobs.
 * It combines time-based scheduling with condition-based retraining to optimize
 * resource usage and ensure models are only retrained when sufficient new data exists.
 * 
 * QUOTA OPTIMIZATION:
 * All transactions are fetched ONCE at the top level (limit 3000) and passed
 * in-memory to all downstream functions. This eliminates the previous pattern
 * of 4 separate limit(10000) queries that consumed up to 40,000 reads per trigger.
 * Current cost: ~3,000 reads per trigger (one fetch).
 * 
 * SCHEDULING LOGIC:
 * 1. Vercel cron job triggers this endpoint on a schedule (e.g., daily at midnight)
 * 2. Endpoint is protected by CRON_SECRET to prevent unauthorized access
 * 3. Fetches all transactions once and groups by owner_uid in-memory
 * 4. For each user, checks if enough new data exists (condition-based)
 * 5. Only retrains if new data count >= threshold (default: 50)
 * 6. Returns summary of successful, failed, and skipped retrainings
 * 
 * Configuration:
 * - Schedule: Configured in vercel.json (default: 0 0 * * * for daily at midnight)
 * - Threshold: Default 50 new records required
 * - Secret: CRON_SECRET environment variable for security
 */

/**
 * Verify cron secret to prevent unauthorized access
 * 
 * @param {Request} request - Next.js request object
 * @returns {boolean} True if secret is valid, false otherwise
 */
function verifyCronSecret(request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return false;
  }

  const token = authHeader?.replace("Bearer ", "") || request.headers.get("x-cron-secret");
  return token === cronSecret;
}

/**
 * Groups pre-fetched transactions by owner_uid.
 * Operates entirely in-memory — zero Firestore reads.
 * 
 * @param {Array} allTransactions - Pre-fetched transaction documents
 * @returns {Map<string, Array>} Map of owner_uid to their transaction arrays
 */
function groupTransactionsByOwner(allTransactions) {
  const ownerMap = new Map();
  
  allTransactions.forEach((tx) => {
    const ownerUid = tx.owner_uid;
    if (ownerUid) {
      if (!ownerMap.has(ownerUid)) ownerMap.set(ownerUid, []);
      ownerMap.get(ownerUid).push(tx);
    }
  });
  
  return ownerMap;
}

/**
 * Count new transaction records since last training.
 * Operates entirely in-memory on pre-fetched data — zero Firestore reads.
 * 
 * @param {Array} ownerTransactions - Pre-fetched transactions for this owner
 * @param {object} lastTrainingTimestamp - Firebase timestamp of last training
 * @returns {number} Count of new records
 */
function countNewRecordsSinceTraining(ownerTransactions, lastTrainingTimestamp) {
  if (!lastTrainingTimestamp) {
    // No previous training — all records are considered "new"
    return ownerTransactions.length;
  }
  
  const lastTrainingDate = lastTrainingTimestamp.toDate
    ? lastTrainingTimestamp.toDate()
    : lastTrainingTimestamp;
  
  let newCount = 0;
  ownerTransactions.forEach((tx) => {
    const docTimestamp = tx.created_at || tx.timestamp;
    
    if (!docTimestamp) {
      // If no timestamp, count as new (conservative approach)
      newCount++;
    } else {
      const docDate = docTimestamp.toDate ? docTimestamp.toDate() : docTimestamp;
      if (docDate > lastTrainingDate) {
        newCount++;
      }
    }
  });
  
  return newCount;
}

/**
 * Retrain model for a specific user with condition check.
 * Uses pre-fetched transactions — zero additional Firestore reads for data.
 * 
 * @param {string} ownerUid - User ID
 * @param {Array} ownerTransactions - Pre-fetched transactions for this owner
 * @param {string} modelType - The model type to train (logistic/neural)
 * @param {number} threshold - Minimum new records required (default: 50)
 * @returns {Promise<object>} Retrain result with status and metadata
 */
async function retrainForUser(ownerUid, ownerTransactions, modelType = "logistic", threshold = 50) {
  try {
    // Override threshold for Neural Network
    const actualThreshold = modelType === "neural" ? Math.max(threshold, NN_MIN_ROWS) : threshold;

    const lastTrainingTimestamp = await getLastTrainingTimestamp(ownerUid);
    const newDataCount = countNewRecordsSinceTraining(ownerTransactions, lastTrainingTimestamp);
    
    // Skip if below threshold (condition-based retraining)
    if (newDataCount < actualThreshold) {
      return {
        ownerUid,
        success: false,
        skipped: true,
        message: `Skipped: Only ${newDataCount} new records (threshold: ${actualThreshold}).`,
        newDataCount,
        threshold: actualThreshold,
      };
    }

    if (ownerTransactions.length === 0) {
      return {
        ownerUid,
        success: false,
        message: "No transactions found for training.",
        trainingSize: 0,
        newDataCount,
      };
    }

    // Use the unified ML pipeline for training
    // Pass historicalTransactions to eliminate the double-fetch inside pipeline
    const result = await applyMlScoring({
      ownerUid,
      transactions: ownerTransactions,
      modelType,
      historicalTransactions: ownerTransactions,
    });
    
    const model = result.model;

    if (model.skipped) {
      return {
        ownerUid,
        success: true,
        skipped: true,
        message: model.skipReason || "Training skipped by pipeline.",
        newDataCount,
      };
    }

    return {
      ownerUid,
      success: true,
      message: "Model retraining completed successfully.",
      version: model.modelVersion,
      trainingSize: model.trainSize,
      testSize: model.testSize,
      metrics: model.metrics,
      newDataCount,
    };
  } catch (error) {
    return {
      ownerUid,
      success: false,
      message: error?.message || "Model retraining failed.",
      error: error?.message,
    };
  }
}

async function getActiveModelType() {
  try {
    const snap = await getDoc(doc(db, "settings", "ml"));
    return snap.exists() ? (snap.data().activeModelType || "logistic") : "logistic";
  } catch {
    return "logistic";
  }
}

/**
 * POST endpoint for scheduled retraining (called by Vercel cron).
 */
export async function POST(request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Invalid or missing cron secret." },
      { status: 401 }
    );
  }

  try {
    // ── SINGLE FETCH: Read all transactions once (capped at 3000) ──
    // Previously this was 4 separate limit(10000) queries = up to 40,000 reads.
    // Now it's 1 query = ~3,000 reads max.
    const q = query(collection(db, "transactions"), limit(3000));
    const snapshot = await getDocs(q);
    const allTransactions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Group in-memory by owner — zero additional reads
    const ownerMap = groupTransactionsByOwner(allTransactions);

    if (ownerMap.size === 0) {
      return NextResponse.json({
        success: true,
        message: "No users with transaction data found. Skipping retraining.",
        results: [],
        summary: {
          totalUsers: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
        },
      });
    }

    const modelType = await getActiveModelType();
    const results = await Promise.all(
      Array.from(ownerMap.entries()).map(([uid, transactions]) =>
        retrainForUser(uid, transactions, modelType)
      )
    );

    const summary = {
      totalUsers: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success && !r.skipped).length,
      skipped: results.filter((r) => r.skipped || r.trainingSize === 0).length,
    };

    return NextResponse.json({
      success: true,
      message: `Scheduled retraining completed. ${summary.successful}/${summary.totalUsers} users successful.`,
      results,
      summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Scheduled retraining failed.",
        error: error?.message,
      },
      { status: 500 }
    );
  }
}

// Allow GET for testing (with secret)
export async function GET(request) {
  return POST(request);
}

