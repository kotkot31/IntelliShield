import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FEATURE_SCHEMA_VERSION, MODEL_VERSION } from "@/lib/ml/constants";
import {
  applyNormalization,
  buildFeatureRows,
  buildNormalization,
} from "@/lib/ml/feature-engineering";
import {
  completeTrainingRun,
  failTrainingRun,
  saveModelMetadata,
  startTrainingRun,
} from "@/lib/ml/model-registry";
import { predictProbabilities, trainLogisticModel } from "@/lib/ml/train-logistic";
import { trainNeuralModel, predictProbabilitiesNN } from "@/lib/ml/train-neural";

function countClasses(rows) {
  const fraud = rows.filter((r) => r.label === 1).length;
  return { fraud, legitimate: rows.length - fraud };
}

async function fetchHistoricalTransactions(ownerUid) {
  const q = query(
    collection(db, "transactions"),
    where("owner_uid", "==", ownerUid),
    limit(10000),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function applyMlScoring({ ownerUid, transactions, modelType = "logistic", historicalTransactions = null }) {
  const runId = await startTrainingRun({
    ownerUid,
    modelVersion: MODEL_VERSION,
  });

  try {
    // Reuse pre-fetched data if provided, otherwise fetch from Firestore
    const historical = historicalTransactions ?? await fetchHistoricalTransactions(ownerUid);

    const trainingBase = [
      ...historical.map((t) => ({
        ...t,
        ruleStatus: t.ruleStatus || t.status || t.finalStatus,
        ruleRiskScore: t.ruleRiskScore ?? t.riskScore ?? 0,
      })),
      ...transactions.map((t) => ({
        ...t,
        ruleStatus: t.ruleStatus || t.status,
        ruleRiskScore: t.ruleRiskScore ?? t.riskScore ?? 0,
      })),
    ];

    const featureRows = buildFeatureRows(trainingBase);
    const normalization = buildNormalization(featureRows);
    const normalizedRows = applyNormalization(featureRows, normalization);

    // Route to correct trainer
    const trainingResult =
      modelType === "neural"
        ? await trainNeuralModel(normalizedRows)
        : await trainLogisticModel(normalizedRows);

    let modelId = null;
    if (!trainingResult.skipped) {
      modelId = await saveModelMetadata({
        ownerUid,
        threshold: trainingResult.threshold,
        trainSize: trainingResult.trainSize,
        testSize: trainingResult.testSize,
        metrics: trainingResult.metrics,
        normalization,
        classBalance: countClasses(normalizedRows),
        modelType,
        skipReason: trainingResult.skipReason || null,
      });
    }

    // ── FIX: Build inference features from the FULL combined dataset ──
    // Previously, features were built from only the new transactions,
    // which caused per-user state (amounts, locations, timestamps) to
    // start from scratch. This made the feature distribution differ
    // wildly from training, producing nonsensical probabilities.
    //
    // Now we tag each transaction with _inferTarget and _origIdx,
    // build features from the full dataset (same context as training),
    // then filter down to only the new transactions for prediction.
    const inferContextBase = [
      ...historical.map((t) => ({
        ...t,
        _inferTarget: false,
        ruleStatus: t.ruleStatus || t.status || t.finalStatus,
        ruleRiskScore: t.ruleRiskScore ?? t.riskScore ?? 0,
      })),
      ...transactions.map((t, idx) => ({
        ...t,
        _inferTarget: true,
        _origIdx: idx,
        ruleStatus: t.ruleStatus || t.status,
        ruleRiskScore: t.ruleRiskScore ?? t.riskScore ?? 0,
      })),
    ];

    const allInferFeatures = buildFeatureRows(inferContextBase);
    const allInferNorm = applyNormalization(allInferFeatures, normalization);

    // Filter to only new transactions, then restore original CSV order.
    // buildFeatureRows sorts by date_time internally, so without this
    // re-ordering, probs[i] would map to the wrong transaction.
    const targetRows = allInferNorm.filter((r) => r.transaction._inferTarget);
    const byOrigIdx = new Map(
      targetRows.map((r) => [r.transaction._origIdx, r]),
    );
    const inferRows = [];
    for (let i = 0; i < transactions.length; i++) {
      const row = byOrigIdx.get(i);
      if (row) inferRows.push(row);
    }

    // Route predictions to the correct inference function
    const probs =
      modelType === "neural"
        ? await predictProbabilitiesNN({ model: trainingResult.model, rows: inferRows })
        : await predictProbabilities({ model: trainingResult.model, rows: inferRows });

    if (trainingResult.model) {
      trainingResult.model.dispose();
    }

    const enrichedTransactions = transactions.map((tx, idx) => {
      const fallback = (tx.ruleStatus || tx.status) === "Fraud" ? 1 : 0;
      const fraudProbability = Number(probs[idx] ?? fallback);
      const mlStatus =
        fraudProbability >= trainingResult.threshold ? "Fraud" : "Legitimate";
      const ruleStatus = tx.ruleStatus || tx.status || "Legitimate";

      // Extract the unsupervised anomaly score (it's the last feature in the normalized array)
      const inferRow = inferRows[idx];
      const anomalyScore = inferRow && inferRow.normalized && inferRow.normalized.length > 0
        ? inferRow.normalized[inferRow.normalized.length - 1]
        : 0;

      // ── Weighted Risk Correlation Engine ──
      let weightedRiskScore = 0;
      if (inferRow && inferRow.vector) {
        const isNewLocation = inferRow.vector[3];
        const fAmountZscore = inferRow.vector[4];
        const fVelocity1h = inferRow.vector[5];
        const fNetworkRiskNorm = inferRow.vector[7];

        // 1. Velocity Anomaly (+45) - At least one other transaction in the last hour
        if (fVelocity1h > 0) weightedRiskScore += 45;
        
        // 2. Location Anomaly (+25) - Unrecognized location for this user
        if (isNewLocation === 1) weightedRiskScore += 25;

        // 3. Amount Anomaly (+20) - Amount is > 2 standard deviations above user's mean
        if (fAmountZscore > 2) weightedRiskScore += 20;

        // 4. Network Risk (Up to +30) - Scales with external network risk score
        weightedRiskScore += Math.floor(Math.min(30, (fNetworkRiskNorm * 100) * 0.3));
      }

      const correlationStatus = weightedRiskScore >= 65 ? "Fraud" : "Legitimate";

      // Final status is Fraud if ANY of the three pillars say it's Fraud
      const finalStatus =
        ruleStatus === "Fraud" || mlStatus === "Fraud" || correlationStatus === "Fraud" ? "Fraud" : "Legitimate";

      return {
        ...tx,
        fraudProbability,
        anomalyScore,
        weightedRiskScore,
        correlationStatus,
        mlStatus,
        finalStatus,
        modelVersion: MODEL_VERSION,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        status: finalStatus,
      };
    });

    await completeTrainingRun({
      ownerUid,
      runId,
      modelVersion: MODEL_VERSION,
    });

    return {
      transactions: enrichedTransactions,
      model: {
        modelId,
        runId,
        modelVersion: MODEL_VERSION,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        threshold: trainingResult.threshold,
        metrics: trainingResult.metrics,
        trainSize: trainingResult.trainSize,
        testSize: trainingResult.testSize,
        skipped: trainingResult.skipped,
        skipReason: trainingResult.skipReason || null,
        modelType,
      },
    };
  } catch (error) {
    await failTrainingRun({
      ownerUid,
      runId,
      modelVersion: MODEL_VERSION,
      errorMessage: error?.message || "ML pipeline failed",
    });
    throw error;
  }
}
