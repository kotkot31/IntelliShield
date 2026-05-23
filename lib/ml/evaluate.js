export function confusionMatrix({ yTrue, yPred }) {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;

  for (let i = 0; i < yTrue.length; i += 1) {
    const actual = yTrue[i];
    const predicted = yPred[i];
    if (actual === 1 && predicted === 1) tp += 1;
    else if (actual === 0 && predicted === 0) tn += 1;
    else if (actual === 0 && predicted === 1) fp += 1;
    else if (actual === 1 && predicted === 0) fn += 1;
  }

  return { tp, tn, fp, fn };
}

export function classificationMetrics(matrix) {
  const { tp, tn, fp, fn } = matrix;
  const total = tp + tn + fp + fn;
  const accuracy = total ? (tp + tn) / total : 0;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return { accuracy, precision, recall, f1, tp, tn, fp, fn };
}

