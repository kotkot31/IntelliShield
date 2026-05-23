import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * MODEL STORAGE MODULE
 * 
 * This module handles the storage and retrieval of trained ML models in Firestore.
 * It implements a safe model update mechanism with backup/restore capabilities.
 * 
 * Firestore Structure:
 * - models/latest: Single document containing current and previous model
 *   - current: The active model with weights, metadata, and normalization
 *   - previous: Backup of the previous model for rollback capability
 *   - updated_at: Timestamp of last update
 * 
 * Safety Features:
 * - Minimum training size validation (default: 30 records)
 * - Model degradation warning (warns if new model has < 80% training data)
 * - Automatic backup of previous model
 * - Restore function for rollback capability
 */

const MODELS_COLLECTION = "models";
const LATEST_DOC = "latest";

/**
 * Save the latest trained model to Firestore with safety checks
 * 
 * MODEL STORAGE LOGIC:
 * 1. Validates training data size to prevent saving poorly trained models
 * 2. Compares new model with previous model using training size as a simple metric
 * 3. Warns if new model has significantly less training data (potential degradation)
 * 4. Automatically backs up the previous model before saving the new one
 * 5. Stores model weights, metadata, and normalization parameters
 * 
 * @param {object} options - Save options
 * @param {string} options.ownerUid - User ID who owns the model
 * @param {object} options.model - Model object with weights, threshold, etc.
 * @param {object} options.metadata - Additional metadata (trainingSize, retrainType, etc.)
 * @param {number} options.minTrainingSize - Minimum training size required (default: 30)
 * @returns {object} Save result with version info
 * @throws {Error} If validation fails
 */
export async function saveLatestModel({
  ownerUid,
  model,
  metadata = {},
  minTrainingSize = 30,
} = {}) {
  if (!ownerUid) {
    throw new Error("ownerUid is required to save model.");
  }
  if (!model) {
    throw new Error("model payload is required.");
  }

  // Validate training data size before saving
  // This prevents saving models trained on insufficient data
  const trainingSize = metadata.trainingSize || model.trainingSize || 0;
  if (trainingSize < minTrainingSize) {
    throw new Error(
      `Training data too small (${trainingSize}). Minimum required: ${minTrainingSize}. Model not saved.`
    );
  }

  const latestRef = doc(db, MODELS_COLLECTION, LATEST_DOC);
  const currentSnap = await getDoc(latestRef);
  const currentData = currentSnap.exists() ? currentSnap.data() : null;

  // Compare with previous model (simple metric: training size)
  // This helps detect model degradation
  if (currentData?.current) {
    const previousTrainingSize = currentData.current.trainingSize || 0;
    
    // Warn if new model has significantly less training data
    if (trainingSize < previousTrainingSize * 0.8) {
      console.warn(
        `Warning: New model training size (${trainingSize}) is significantly less than previous (${previousTrainingSize}).`
      );
    }
  }

  // Construct payload with current model and backup
  const payload = {
    owner_uid: ownerUid,
    current: {
      ...model,
      ...metadata,
    },
    previous: currentData?.current || null, // Backup model preserved for rollback
    updated_at: serverTimestamp(),
  };

  await setDoc(latestRef, payload);

  return {
    savedVersion: model.version || null,
    hadPreviousVersion: Boolean(currentData?.current),
    previousTrainingSize: currentData?.current?.trainingSize || 0,
  };
}

/**
 * Get the timestamp of the last model training
 * 
 * Used in condition-based retraining to determine if enough new data exists
 * since the last training run.
 * 
 * @param {string} ownerUid - User ID
 * @returns {object|null} Firebase timestamp or null if no model exists
 */
export async function getLastTrainingTimestamp(ownerUid) {
  if (!ownerUid) {
    return null;
  }

  const latestRef = doc(db, MODELS_COLLECTION, LATEST_DOC);
  const snap = await getDoc(latestRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  
  // Return the timestamp regardless of owner (shared model structure)
  // The timestamp will be used to determine if new data exists
  return data.updated_at || null;
}

/**
 * Restore the previous model from backup
 * 
 * This function allows rolling back to the previous model if the new model
 * performs poorly. It swaps the current and previous models, preserving
 * both for potential future rollback.
 * 
 * @param {object} options - Restore options
 * @param {string} options.ownerUid - User ID
 * @returns {object} Restore result with version info
 * @throws {Error} If no model or previous model exists
 */
export async function restorePreviousModel({ ownerUid } = {}) {
  if (!ownerUid) {
    throw new Error("ownerUid is required to restore previous model.");
  }

  const latestRef = doc(db, MODELS_COLLECTION, LATEST_DOC);
  const snap = await getDoc(latestRef);

  if (!snap.exists()) {
    throw new Error("No model found to restore.");
  }

  const data = snap.data();
  
  if (!data.previous) {
    throw new Error("No previous model available for restoration.");
  }

  // Restore previous model as current, and keep current as previous (for rollback)
  // This allows toggling between models if needed
  const payload = {
    owner_uid: ownerUid,
    current: data.previous,
    previous: data.current, // Keep current as previous for rollback
    updated_at: serverTimestamp(),
    restored: true,
  };

  await setDoc(latestRef, payload);

  return {
    restoredVersion: data.previous.version || null,
    previousVersion: data.current.version || null,
  };
}

/**
 * Get the current model from Firestore for prediction
 * 
 * This function retrieves the latest trained model including:
 * - Model weights for prediction
 * - Threshold for classification
 * - Normalization parameters for feature scaling
 * - Metadata (version, training size, etc.)
 * 
 * The returned model is used by the prediction module to score transactions.
 * 
 * @returns {object|null} Model object with weights, threshold, normalization, metadata
 */
export async function getCurrentModel() {
  const latestRef = doc(db, MODELS_COLLECTION, LATEST_DOC);
  const snap = await getDoc(latestRef);

  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  
  return {
    version: data.current?.version || null,
    trainedAt: data.current?.trainedAt || null,
    trainingSize: data.current?.trainingSize || 0,
    retrainType: data.current?.retrainType || null,
    updated_at: data.updated_at || null,
    hasPrevious: Boolean(data.previous),
    previousVersion: data.previous?.version || null,
    // Optional metrics if available
    metrics: data.current?.metrics || null,
    // Return the actual model weights for prediction
    weights: data.current?.weights || null,
    threshold: data.current?.threshold || null,
    normalization: data.current?.normalization || null,
    gaussianParams: data.current?.gaussianParams || null,
  };
}

