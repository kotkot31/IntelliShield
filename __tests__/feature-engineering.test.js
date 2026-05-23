import { describe, it, expect } from 'vitest';
import {
  buildFeatureRows,
  buildNormalization,
  applyNormalization,
  getLabel
} from '@/lib/ml/feature-engineering';

describe('Feature Engineering Pipeline', () => {
  const sampleTransactions = [
    {
      transaction_id: '1',
      user_id: 'U1',
      amount: 1000,
      date_time: '2024-05-01T12:00:00Z',
      location: 'Manila',
      finalStatus: 'Legitimate'
    },
    {
      transaction_id: '2',
      user_id: 'U1',
      amount: 50000,
      date_time: '2024-05-01T12:30:00Z', // 30 mins later
      location: 'Cebu',
      finalStatus: 'Fraud'
    },
    {
      transaction_id: '3',
      user_id: 'U2',
      amount: 500,
      date_time: '2024-05-01T03:00:00Z', // Late night
      location: 'Davao',
      finalStatus: 'Legitimate'
    }
  ];

  it('buildFeatureRows returns correct vector schema', () => {
    const rawFeatures = buildFeatureRows(sampleTransactions);
    
    expect(rawFeatures.length).toBe(3);
    
    // Each raw feature vector should have 8 elements before normalization
    // [fAmountLog, fHourNorm, fIsLateNight, isNewLocation, fAmountZscore, fVelocity1h, fRuleRiskNorm, fNetworkRiskNorm]
    expect(rawFeatures[0].vector.length).toBe(8);
    
    // buildFeatureRows sorts transactions by date_time ASC.
    // TX3: 03:00:00 (index 0)
    // TX1: 12:00:00 (index 1)
    // TX2: 12:30:00 (index 2)
    
    // Check first transaction (TX3, amount 500, late night)
    expect(rawFeatures[0].vector[0]).toBeCloseTo(Math.log(1 + 500)); // fAmountLog
    expect(rawFeatures[0].vector[1]).toBeCloseTo(3 / 23); // fHourNorm (3 AM)
    expect(rawFeatures[0].vector[2]).toBe(1); // fIsLateNight
    expect(rawFeatures[0].label).toBe(0); // label (Legitimate)

    // Check second transaction (TX1, amount 1000)
    expect(rawFeatures[1].vector[0]).toBeCloseTo(Math.log(1 + 1000));
    expect(rawFeatures[1].vector[2]).toBe(0); // not late night
    expect(rawFeatures[1].vector[3]).toBe(1); // new location

    // Check third transaction (TX2, velocity and location change)
    expect(rawFeatures[2].vector[5]).toBe(0.1); // fVelocity1h (1 previous tx within 1h, bounded by /10)
    expect(rawFeatures[2].vector[3]).toBe(1); // isNewLocation (different from Manila)
    expect(rawFeatures[2].label).toBe(1); // label (Fraud)
  });

  it('buildNormalization returns correct parameters', () => {
    const rawFeatures = buildFeatureRows(sampleTransactions);
    const params = buildNormalization(rawFeatures);
    
    expect(params).toHaveProperty('means');
    expect(params).toHaveProperty('stds');
    expect(params).toHaveProperty('gaussianParams');
    
    // We have 9 features in FEATURE_NAMES, so means and stds should have length 9
    expect(params.means.length).toBe(9);
    expect(params.stds.length).toBe(9);
  });

  it('applyNormalization adds gaussian anomaly score', () => {
    const rawFeatures = buildFeatureRows(sampleTransactions);
    const params = buildNormalization(rawFeatures);
    
    const normalizedRows = applyNormalization(rawFeatures, params);
    
    expect(normalizedRows.length).toBe(3);
    
    // Original 8 features + 1 gaussian score = 9 features, or if vector had 8, normalized should have 9.
    // Depending on what applyNormalization outputs. Since vector has 8, but it iterates over means length, it outputs 9 + 1 = 10?
    // Actually, `applyNormalization` iterates over `r.vector.map`, so it outputs `vector.length + 1` = 9
    expect(normalizedRows[0].normalized.length).toBe(9);
  });

  it('getLabel maps Fraud to 1 and Legitimate to 0', () => {
    expect(getLabel({ finalStatus: 'Fraud' })).toBe(1);
    expect(getLabel({ status: 'Fraud' })).toBe(1);
    expect(getLabel({ finalStatus: 'Legitimate' })).toBe(0);
    expect(getLabel({})).toBe(0);
  });
});
