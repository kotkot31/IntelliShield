/**
 * TRAINING MODULE
 * 
 * This module implements logistic regression training for fraud detection.
 * It uses gradient descent to learn weights that minimize prediction error.
 * 
 * TRAINING LOGIC:
 * 1. Initialize weights to zero (feature weights + bias)
 * 2. For each epoch:
 *    - Calculate predictions using sigmoid activation
 *    - Compute gradients (error * features)
 *    - Update weights using learning rate
 * 3. Return trained weights with metadata
 * 
 * Algorithm: Logistic Regression with Gradient Descent
 * - Sigmoid activation: outputs probability between 0 and 1
 * - Learning rate: controls step size in weight updates (default: 0.1)
 * - Epochs: number of training iterations (default: 300)
 */

import { trainGaussianModel, calculateAnomalyScore } from "./gaussian-anomaly";

/**
 * Sigmoid activation function
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
 * Used for calculating weighted sum in logistic regression
 * Formula: sum(a[i] * b[i] for i in range(n))
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
 * Train a logistic regression model on labeled samples
 * 
 * TRAINING ALGORITHM:
 * 1. Validate input samples
 * 2. Initialize weights to zero (including bias term)
 * 3. For each epoch:
 *    - Reset gradients to zero
 *    - For each sample:
 *      - Calculate linear output: weights · features + bias
 *      - Apply sigmoid to get prediction
 *      - Calculate error: prediction - actual label
 *      - Accumulate gradients: error * features
 *    - Update weights: weights -= learning_rate * gradients / n
 * 4. Return trained model with metadata
 * 
 * @param {object} options - Training options
 * @param {Array<{x: number[], y: number}>} options.samples - Training samples with features and labels
 * @param {number} options.epochs - Number of training iterations (default: 300)
 * @param {number} options.learningRate - Learning rate for gradient descent (default: 0.1)
 * @returns {object} Trained model with weights, version, trainedAt, trainingSize
 */
export function trainModel({
  samples,
  epochs = 300,
  learningRate = 0.1,
} = {}) {
  // Validate input samples
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      weights: [],
      version: `model-${Date.now()}`,
      trainedAt: new Date().toISOString(),
      trainingSize: 0,
    };
  }

  // 1. Train Unsupervised Gaussian Anomaly Detection Model
  // Extract features (x) of only legitimate transactions (y === 0)
  const legitimateFeatures = samples
    .filter(sample => sample.y === 0)
    .map(sample => sample.x);
  
  const gaussianParams = trainGaussianModel(legitimateFeatures);

  // 2. Feed Anomaly Score back into all samples
  samples.forEach(sample => {
    const anomalyScore = calculateAnomalyScore(sample.x, gaussianParams.means, gaussianParams.variances);
    // Append the anomaly score as a new feature
    sample.x.push(anomalyScore);
  });

  // Initialize weights (feature weights + bias term)
  // Feature count is now original + 1 (the anomaly score)
  const featureCount = samples[0].x.length;
  const weights = new Array(featureCount + 1).fill(0);

  // Gradient descent training loop
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    // Reset gradients for this epoch
    const gradients = new Array(featureCount + 1).fill(0);

    // Calculate gradients for each sample
    samples.forEach(({ x, y }) => {
      // Calculate linear output: weights · features + bias
      const linear = dot(weights.slice(0, featureCount), x) + weights[featureCount];
      
      // Apply sigmoid to get probability
      const prediction = sigmoid(linear);
      
      // Calculate error
      const error = prediction - y;

      // Accumulate gradients (chain rule: dL/dw = error * feature)
      for (let i = 0; i < featureCount; i += 1) {
        gradients[i] += error * x[i];
      }
      // Bias gradient (bias is always multiplied by 1)
      gradients[featureCount] += error;
    });

    // Update weights using gradient descent
    const n = samples.length;
    for (let i = 0; i < weights.length; i += 1) {
      weights[i] -= (learningRate * gradients[i]) / n;
    }
  }

  const trainedAt = new Date().toISOString();
  return {
    weights,
    version: `model-${Date.now()}`,
    trainedAt,
    trainingSize: samples.length,
    gaussianParams, // Include the Gaussian params so they can be saved
  };
}

