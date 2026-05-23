import { describe, it, expect } from 'vitest';
import {
  trainGaussianModel,
  calculateAnomalyScore
} from '@/lib/ml/gaussian-anomaly';

describe('Gaussian Anomaly Detection', () => {
  it('handles empty input gracefully', () => {
    const params = trainGaussianModel([]);
    expect(params.means).toEqual([]);
    expect(params.variances).toEqual([]);
  });

  it('computes correct means and variances with epsilon guard', () => {
    const features = [
      [1, 2],
      [1, 4],
      [1, 6]
    ];
    
    const params = trainGaussianModel(features);
    
    // Mean of [1, 1, 1] is 1
    // Mean of [2, 4, 6] is 4
    expect(params.means[0]).toBeCloseTo(1);
    expect(params.means[1]).toBeCloseTo(4);
    
    // Variance of [1, 1, 1] is 0, but epsilon guard should set it to 1e-6
    expect(params.variances[0]).toBeCloseTo(1e-6);
    
    // Variance of [2, 4, 6] around mean 4 is ((2-4)^2 + (4-4)^2 + (6-4)^2) / 3
    // = (4 + 0 + 4) / 3 = 8/3 = 2.666...
    expect(params.variances[1]).toBeCloseTo(2.666, 2);
  });

  it('returns 0 if feature length mismatches mean length', () => {
    const params = {
      means: [1, 2],
      variances: [1, 1]
    };
    
    const score = calculateAnomalyScore([1], params);
    expect(score).toBe(0);
  });

  it('calculates anomaly scores correctly', () => {
    const features = [
      [10, 20],
      [10, 20],
      [10, 20],
      [10, 20]
    ];
    
    const params = trainGaussianModel(features);
    
    // Identical feature will have a small positive absolute log prob due to the PDF formula at the mean
    const identicalScore = calculateAnomalyScore([10, 20], params.means, params.variances);
    expect(identicalScore).toBeGreaterThan(0);
    expect(identicalScore).toBeLessThan(0.7);
    
    // Different feature should have a much higher anomaly score (close to or at 1.0 due to clipping)
    const anomalousScore = calculateAnomalyScore([100, 200], params.means, params.variances);
    expect(anomalousScore).toBeGreaterThan(identicalScore);
  });
});
