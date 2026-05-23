import { getCurrentModel } from "@/lib/ml/model-store";
import { applyNormalization, buildFeatureRows } from "@/lib/ml/feature-engineering";
import { MODEL_VERSION, FEATURE_SCHEMA_VERSION } from "@/lib/ml/constants";

/**
 * PREDICTION MODULE
 * 
 * This module handles fraud prediction using the latest trained model.
 * It ensures predictions always use the most up-to-date model from storage.
 * 
 * PREDICTION LOGIC:
 * 1. Loads the latest trained model from Firestore
 * 2. Applies the same feature engineering used during training
 * 3. Uses model weights to calculate fraud probability
 * 4. Returns enriched transactions with fraudProbability and modelVersion
 * 
 * Safety Features:
 * - Fallback to rule-based prediction if no model exists
 * - Error handling to prevent prediction failures
 * - Consistent feature engineering with training
 */

/**
 * Sigmoid activation function for logistic regression
 * Converts linear output to probability between 0 and 1
 * Formula: 1 / (1 + e^(-x))
 * 
 * @param {number} value - Linear output from weighted sum
 * @returns {number} Probability between 0 and 1
 */
function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

/**
 * Dot product of two vectors
 * 
 * @param {number[]} a - First vector (weights)
 * @param {number[]} b - Second vector (features)
 * @returns {number} Dot product result
 */
function dot(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += a[i] * b[i];
  }
  return total;
}

/**
 * Predict fraud probability for a single transaction using loaded model.
 * 
 * FIX: The original code passed the feature row object { id, transaction,
 * vector, label, normalized } to dot() instead of the actual numeric array
 * (row.normalized or row.vector). This caused dot() to iterate over object
 * keys, producing NaN for every prediction.
 * 
 * @param {object} transaction - Transaction to predict
 * @param {object} model - Model object with weights and threshold
 * @param {object} normalization - Normalization parameters from training
 * @returns {object} Prediction result with fraudProbability and status
 */
function predictSingle(transaction, model, normalization) {
  if (!model || !model.weights) {
    // Fallback to rule-based prediction if no model available
    const ruleStatus = transaction.ruleStatus || transaction.status || "Legitimate";
    const fraudProbability = ruleStatus === "Fraud" ? 1 : 0;
    return {
      fraudProbability,
      mlStatus: ruleStatus === "Fraud" ? "Fraud" : "Legitimate",
    };
  }

  // Convert transaction to feature vector using same engineering as training
  const featureRows = buildFeatureRows([{
    ...transaction,
    ruleStatus: transaction.ruleStatus || transaction.status,
    ruleRiskScore: transaction.ruleRiskScore ?? transaction.riskScore ?? 0,
  }]);
  
  if (!featureRows.length) {
    const ruleStatus = transaction.ruleStatus || transaction.status || "Legitimate";
    return {
      fraudProbability: ruleStatus === "Fraud" ? 1 : 0,
      mlStatus: ruleStatus === "Fraud" ? "Fraud" : "Legitimate",
    };
  }

  // Extract the numeric feature vector (not the wrapper object)
  let featureVector;
  
  if (normalization && normalization.means && normalization.stds) {
    // Apply normalization (same as training) — returns array of row objects
    const normalizedRows = applyNormalization(featureRows, normalization);
    featureVector = normalizedRows[0].normalized;
  } else {
    featureVector = featureRows[0].vector;
  }

  // Calculate weighted sum (linear output)
  const weights = model.weights;
  const featureCount = featureVector.length;
  const linearOutput = dot(weights.slice(0, featureCount), featureVector) + (weights[featureCount] || 0);

  // Apply sigmoid to get probability
  const fraudProbability = sigmoid(linearOutput);

  // Apply threshold to get classification
  const threshold = model.threshold || 0.5;
  const mlStatus = fraudProbability >= threshold ? "Fraud" : "Legitimate";

  return {
    fraudProbability,
    mlStatus,
  };
}

/**
 * Load latest model and predict fraud probabilities for transactions.
 * 
 * @param {object[]} transactions - Array of transactions to predict
 * @returns {Promise<object[]>} Enriched transactions with fraudProbability and modelVersion
 */
export async function predictWithLatestModel(transactions = []) {
  try {
    // Load the latest trained model from Firestore storage
    const model = await getCurrentModel();

    if (!model || !model.weights) {
      // No model available, return transactions with default values
      console.warn("No trained model found. Using rule-based fallback.");
      return transactions.map((tx) => {
        const ruleStatus = tx.ruleStatus || tx.status || "Legitimate";
        const fraudProbability = ruleStatus === "Fraud" ? 1 : 0;
        return {
          ...tx,
          fraudProbability,
          mlStatus: ruleStatus === "Fraud" ? "Fraud" : "Legitimate",
          modelVersion: MODEL_VERSION,
          featureSchemaVersion: FEATURE_SCHEMA_VERSION,
          status: ruleStatus,
        };
      });
    }

    // Reconstruct normalization from stored format
    const normalization =
      model.normalization && model.normalization.means && model.normalization.stds
        ? model.normalization
        : model.normalization && model.normalization.meanByFeature
          ? { means: model.normalization.meanByFeature, stds: model.normalization.stdByFeature }
          : null;

    // Predict for each transaction using the loaded model
    const enrichedTransactions = transactions.map((tx) => {
      const prediction = predictSingle(tx, model, normalization);
      const ruleStatus = tx.ruleStatus || tx.status || "Legitimate";
      
      // Final status is Fraud if either rule or ML detects fraud
      const finalStatus =
        ruleStatus === "Fraud" || prediction.mlStatus === "Fraud" ? "Fraud" : "Legitimate";

      return {
        ...tx,
        fraudProbability: prediction.fraudProbability,
        mlStatus: prediction.mlStatus,
        modelVersion: model.version,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        status: finalStatus,
      };
    });

    return enrichedTransactions;
  } catch (error) {
    console.error("Prediction failed:", error);
    // Return transactions with error state
    return transactions.map((tx) => ({
      ...tx,
      fraudProbability: 0,
      mlStatus: "Legitimate",
      modelVersion: MODEL_VERSION,
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      status: tx.status || "Legitimate",
      predictionError: true,
    }));
  }
}
