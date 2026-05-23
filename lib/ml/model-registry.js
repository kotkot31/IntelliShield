import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  FEATURE_NAMES,
  FEATURE_SCHEMA_VERSION,
  MODEL_VERSION,
} from "@/lib/ml/constants";

/**
 * Generate a time-sortable document ID.
 *
 * Firestore auto-IDs are random strings, so documents appear in random
 * order in the console. This helper produces IDs that sort chronologically:
 *   "1713600000000_abc123"  (timestamp prefix + short random suffix)
 */
function timeSortableId() {
  const timestamp = Date.now().toString().padStart(15, "0");
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}_${random}`;
}

export async function saveModelMetadata({
  ownerUid,
  threshold,
  trainSize,
  testSize,
  metrics,
  normalization,
  classBalance,
  modelType = "logistic",
  skipReason = null,
}) {
  const docId = timeSortableId();
  const docRef = doc(db, "ml_models", docId);

  const algorithmLabel =
    modelType === "neural" ? "neural_network_tfjs" : "logistic_regression_tfjs";

  await setDoc(docRef, {
    owner_uid: ownerUid,
    modelVersion: MODEL_VERSION,
    algorithm: algorithmLabel,
    modelType,
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    featureNames: FEATURE_NAMES,
    threshold,
    trainSize,
    testSize,
    classBalance,
    metrics,
    skipReason: skipReason || null,
    normalization: {
      meanByFeature: normalization.means,
      stdByFeature: normalization.stds,
    },
    created_at: serverTimestamp(),
  });

  return docId;
}

export async function startTrainingRun({ ownerUid, modelVersion }) {
  const docId = timeSortableId();
  const docRef = doc(db, "ml_training_runs", docId);

  await setDoc(docRef, {
    owner_uid: ownerUid,
    runId: docId,
    modelVersion,
    status: "started",
    errorMessage: "",
    started_at: serverTimestamp(),
    finished_at: null,
    created_at: serverTimestamp(),
  });

  return docId;
}

export async function completeTrainingRun({
  ownerUid,
  runId,
  modelVersion,
}) {
  // Update the EXISTING training run document instead of creating a new one
  const docRef = doc(db, "ml_training_runs", runId);

  await updateDoc(docRef, {
    status: "completed",
    errorMessage: "",
    finished_at: serverTimestamp(),
  });
}

export async function failTrainingRun({
  ownerUid,
  runId,
  modelVersion,
  errorMessage,
}) {
  // Update the EXISTING training run document instead of creating a new one
  const docRef = doc(db, "ml_training_runs", runId);

  await updateDoc(docRef, {
    status: "failed",
    errorMessage: errorMessage || "Unknown training error",
    finished_at: serverTimestamp(),
  });
}
