/**
 * NEURAL NETWORK TRAINING MODULE
 *
 * Implements a Multi-Layer Perceptron (MLP) for fraud detection using TensorFlow.js.
 * Architecture:  Input(9) → Dense(16, relu) → Dropout(0.2) → Dense(8, relu) → Dense(1, sigmoid)
 *
 * Minimum data requirement: 200 labeled rows with both fraud and legitimate classes.
 * Below this threshold the model is skipped and logistic regression remains active.
 */

import * as tf from "@tensorflow/tfjs";
import {
  BATCH_SIZE,
  ML_THRESHOLD,
  NN_BATCH_SIZE,
  NN_EPOCHS,
  NN_HIDDEN_UNITS,
  NN_LEARNING_RATE,
  NN_MIN_ROWS,
  TRAIN_TEST_SPLIT,
} from "@/lib/ml/constants";
import { classificationMetrics, confusionMatrix } from "@/lib/ml/evaluate";

// ── helpers (same as train-logistic.js) ────────────────────────────────────

function splitRows(rows) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const trainCount = Math.max(1, Math.floor(copy.length * TRAIN_TEST_SPLIT));
  return { train: copy.slice(0, trainCount), test: copy.slice(trainCount) };
}

function toTensor2D(rows) {
  return tf.tensor2d(rows.map((r) => r.normalized));
}

function toTensorLabels(rows) {
  return tf.tensor2d(rows.map((r) => [r.label]));
}

function hasBothClasses(rows) {
  const labels = new Set(rows.map((r) => r.label));
  return labels.has(0) && labels.has(1);
}

// ── skipped result shape (mirrors train-logistic.js) ───────────────────────

function skippedResult(rows, reason) {
  return {
    model: null,
    threshold: ML_THRESHOLD,
    metrics: { accuracy: 0, precision: 0, recall: 0, f1: 0, tp: 0, tn: 0, fp: 0, fn: 0 },
    trainSize: rows.length,
    testSize: 0,
    skipped: true,
    skipReason: reason,
  };
}

// ── main trainer ────────────────────────────────────────────────────────────

/**
 * Train a Multi-Layer Perceptron on labeled, normalized feature rows.
 *
 * @param {Array<{normalized: number[], label: number}>} rows
 * @returns {Promise<object>} Result object identical in shape to trainLogisticModel()
 */
export async function trainNeuralModel(rows) {
  // Gate 1: minimum row count
  if (rows.length < NN_MIN_ROWS) {
    return skippedResult(
      rows,
      `Neural Network requires ≥ ${NN_MIN_ROWS} labeled rows. Currently have ${rows.length}.`,
    );
  }

  // Gate 2: both classes must be present
  if (!hasBothClasses(rows)) {
    return skippedResult(rows, "Neural Network requires both Fraud and Legitimate examples.");
  }

  // Gate 3: Data Integrity Fail-safe (NaN or Infinity check)
  const hasInvalidData = rows.some((r) => 
    r.normalized.some((val) => !Number.isFinite(val))
  );

  if (hasInvalidData) {
    throw new Error(
      "Retraining Aborted: Corrupted feature data detected (NaN or Infinity). Current model retained to prevent system failure.",
    );
  }

  const { train, test } = splitRows(rows);

  const xTrain = toTensor2D(train);
  const yTrain = toTensorLabels(train);

  const inputDim = train[0].normalized.length;
  const [h1, h2] = NN_HIDDEN_UNITS;

  // Build MLP: Input → Dense(16,relu) → Dropout(0.2) → Dense(8,relu) → Dense(1,sigmoid)
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [inputDim], units: h1, activation: "relu" }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: h2, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

  model.compile({
    optimizer: tf.train.adam(NN_LEARNING_RATE),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });

  await model.fit(xTrain, yTrain, {
    epochs: NN_EPOCHS,
    batchSize: NN_BATCH_SIZE,
    verbose: 0,
  });

  xTrain.dispose();
  yTrain.dispose();

  // Evaluate on test split
  let metrics = { accuracy: 0, precision: 0, recall: 0, f1: 0, tp: 0, tn: 0, fp: 0, fn: 0 };

  if (test.length > 0) {
    const xTest = toTensor2D(test);
    const probsTensor = model.predict(xTest);
    const probs = await probsTensor.array();
    const yTrue = test.map((r) => r.label);
    const yPred = probs.map((p) => (p[0] >= ML_THRESHOLD ? 1 : 0));
    const matrix = confusionMatrix({ yTrue, yPred });
    metrics = classificationMetrics(matrix);
    xTest.dispose();
    probsTensor.dispose();
  }

  return {
    model,
    threshold: ML_THRESHOLD,
    metrics,
    trainSize: train.length,
    testSize: test.length,
    skipped: false,
    skipReason: null,
  };
}

/**
 * Run inference using a trained Neural Network model.
 * Identical interface to predictProbabilities() in train-logistic.js.
 */
export async function predictProbabilitiesNN({ model, rows }) {
  if (!model || rows.length === 0) return rows.map(() => 0);
  const x = tf.tensor2d(rows.map((r) => r.normalized));
  const output = model.predict(x);
  const arr = await output.array();
  x.dispose();
  output.dispose();
  return arr.map((v) => Number(v[0] || 0));
}
