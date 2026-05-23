import * as tf from "@tensorflow/tfjs";
import { BATCH_SIZE, EPOCHS, ML_THRESHOLD, TRAIN_TEST_SPLIT } from "@/lib/ml/constants";
import { classificationMetrics, confusionMatrix } from "@/lib/ml/evaluate";

function splitRows(rows) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  const trainCount = Math.max(1, Math.floor(copy.length * TRAIN_TEST_SPLIT));
  return {
    train: copy.slice(0, trainCount),
    test: copy.slice(trainCount),
  };
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

export async function trainLogisticModel(rows) {
  // Gate 1: minimum row count & both classes
  if (rows.length < 10 || !hasBothClasses(rows)) {
    return {
      model: null,
      threshold: ML_THRESHOLD,
      metrics: { accuracy: 0, precision: 0, recall: 0, f1: 0, tp: 0, tn: 0, fp: 0, fn: 0 },
      trainSize: rows.length,
      testSize: 0,
      skipped: true,
      skipReason: rows.length < 10 ? "Insufficient data (min 10 rows)" : "Missing both Fraud and Legitimate classes",
    };
  }

  // Gate 2: Data Integrity Fail-safe (NaN or Infinity check)
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

  const model = tf.sequential();
  model.add(
    tf.layers.dense({
      inputShape: [train[0].normalized.length],
      units: 1,
      activation: "sigmoid",
    }),
  );
  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  });

  await model.fit(xTrain, yTrain, {
    epochs: EPOCHS,
    batchSize: BATCH_SIZE,
    verbose: 0,
  });

  xTrain.dispose();
  yTrain.dispose();

  let metrics = {
    accuracy: 0,
    precision: 0,
    recall: 0,
    f1: 0,
    tp: 0,
    tn: 0,
    fp: 0,
    fn: 0,
  };

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
  };
}

export async function predictProbabilities({ model, rows }) {
  if (!model || rows.length === 0) {
    return rows.map(() => 0);
  }

  const x = tf.tensor2d(rows.map((r) => r.normalized));
  const output = model.predict(x);
  const arr = await output.array();
  x.dispose();
  output.dispose();
  return arr.map((v) => Number(v[0] || 0));
}

