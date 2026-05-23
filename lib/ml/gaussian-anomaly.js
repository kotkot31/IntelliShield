/**
 * MULTIVARIATE GAUSSIAN ANOMALY DETECTION
 * Pure math implementation for unsupervised anomaly detection.
 * 100% Free-Tier compatible, zero external dependencies.
 */

export function trainGaussianModel(legitimateSamples) {
  if (!legitimateSamples || legitimateSamples.length === 0) {
    return { means: [], variances: [] };
  }

  const numFeatures = legitimateSamples[0].length;
  const n = legitimateSamples.length;
  const means = new Array(numFeatures).fill(0);
  const variances = new Array(numFeatures).fill(0);

  // Calculate Mean
  legitimateSamples.forEach(sample => {
    for (let i = 0; i < numFeatures; i++) {
      means[i] += sample[i];
    }
  });
  for (let i = 0; i < numFeatures; i++) {
    means[i] /= n;
  }

  // Calculate Variance
  legitimateSamples.forEach(sample => {
    for (let i = 0; i < numFeatures; i++) {
      const diff = sample[i] - means[i];
      variances[i] += diff * diff;
    }
  });
  for (let i = 0; i < numFeatures; i++) {
    variances[i] = variances[i] / n;
    // Add small epsilon to prevent division by zero in future calculations
    if (variances[i] < 1e-6) variances[i] = 1e-6; 
  }

  return { means, variances };
}

/**
 * Calculates the anomaly score based on the probability density function.
 * Returns a normalized score between 0 (very normal) and 1 (highly anomalous).
 */
export function calculateAnomalyScore(features, means, variances) {
  if (!means || means.length === 0 || features.length !== means.length) {
    return 0; // Default to normal if no model exists or feature mismatch
  }
  
  let logProb = 0;
  for (let i = 0; i < features.length; i++) {
    const mean = means[i];
    const variance = variances[i];
    const diff = features[i] - mean;
    
    // Log-probability density function for normal distribution
    const term1 = -0.5 * Math.log(2 * Math.PI * variance);
    const term2 = -(diff * diff) / (2 * variance);
    logProb += (term1 + term2);
  }
  
  // Log probabilities are negative. The more negative, the more anomalous.
  const absoluteLogProb = Math.abs(logProb);
  
  // Normalize to 0-1 range. 
  // For ~5 features, an absolute log prob > 20 is typically very anomalous.
  const normalizedScore = Math.max(0, Math.min(absoluteLogProb / 20, 1));
  
  return normalizedScore;
}
