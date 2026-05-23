import { describe, it, expect, vi } from 'vitest';
import { scoreTransactions } from '@/utils/fraud-detection';

// Mock getBulkUserProfiles so it doesn't hit Firestore during unit tests
vi.mock('@/lib/firestore-profiles', () => ({
  getBulkUserProfiles: vi.fn().mockResolvedValue(new Map()),
}));

// Mock behavior and graph profiles to isolate rule testing
vi.mock('@/utils/behavior-profile', () => ({
  mergeAndBuildProfiles: vi.fn().mockReturnValue(new Map()),
  scoreBehaviorAnomalies: vi.fn().mockReturnValue({ points: 0, anomalies: [] }),
}));

vi.mock('@/utils/graph-profiling', () => ({
  buildRiskGraph: vi.fn().mockReturnValue({}),
  scoreNetworkRisk: vi.fn().mockReturnValue({ score: 0, anomalies: [] }),
}));

// Mock firebase
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
}));

describe('Fraud Detection Rules Engine', () => {
  it('triggers amount_over_50000 rule and adds +50 score', async () => {
    const transactions = [
      {
        transaction_id: 'TX1',
        amount: 60000,
        user_id: 'U1',
        date_time: '2024-05-01T12:00:00Z',
        location: 'Manila',
      },
    ];

    const { scoredTransactions: scored } = await scoreTransactions(transactions);
    expect(scored[0].rulesTriggered).toContain('amount_over_50000');
    expect(scored[0].ruleRiskScore).toBeGreaterThanOrEqual(50);
    // Since 50 >= 50, it should be marked as Fraud
    expect(scored[0].finalStatus).toBe('Fraud');
  });

  it('does not trigger amount_over_50000 rule for exactly 50,000', async () => {
    const transactions = [
      {
        transaction_id: 'TX2',
        amount: 50000,
        user_id: 'U1',
        date_time: '2024-05-01T12:00:00Z',
        location: 'Manila',
      },
    ];

    const { scoredTransactions: scored } = await scoreTransactions(transactions);
    expect(scored[0].rulesTriggered).not.toContain('amount_over_50000');
    // If no other rules trigger, score should be 0 and legitimate
    expect(scored[0].ruleRiskScore).toBe(0);
    expect(scored[0].finalStatus).toBe('Legitimate');
  });

  it('triggers late_night_transaction (+30) for hour between 0-5 UTC', async () => {
    const transactions = [
      {
        transaction_id: 'TX3',
        amount: 1000,
        user_id: 'U1',
        date_time: '2024-05-01T03:00:00Z', // 3 AM UTC
        location: 'Manila',
      },
      {
        transaction_id: 'TX4',
        amount: 1000,
        user_id: 'U1',
        date_time: '2024-05-01T14:00:00Z', // 2 PM UTC
        location: 'Manila',
      },
    ];

    const { scoredTransactions: scored } = await scoreTransactions(transactions);
    expect(scored[0].rulesTriggered).toContain('late_night_transaction');
    expect(scored[0].ruleRiskScore).toBe(30);

    expect(scored[1].rulesTriggered).not.toContain('late_night_transaction');
    expect(scored[1].ruleRiskScore).toBe(0);
  });

  it('triggers impossible_travel (+50) if location changes within 3 hours', async () => {
    const transactions = [
      {
        transaction_id: 'TX5',
        amount: 1000,
        user_id: 'U2',
        date_time: '2024-05-01T10:00:00Z',
        location: 'Manila',
      },
      {
        transaction_id: 'TX6',
        amount: 1000,
        user_id: 'U2',
        date_time: '2024-05-01T11:00:00Z', // 1 hour later
        location: 'Cebu',
      },
    ];

    const { scoredTransactions: scored } = await scoreTransactions(transactions);
    // TX5 is the first one for U2, so it's the baseline
    expect(scored[0].rulesTriggered).not.toContain('impossible_travel');
    
    // TX6 is in Cebu, 1 hour later
    expect(scored[1].rulesTriggered).toContain('impossible_travel');
    expect(scored[1].ruleRiskScore).toBeGreaterThanOrEqual(50);
  });

  it('triggers new_or_different_location (+20) if location changes after 3 hours', async () => {
    const transactions = [
      {
        transaction_id: 'TX7',
        amount: 1000,
        user_id: 'U3',
        date_time: '2024-05-01T10:00:00Z',
        location: 'Manila',
      },
      {
        transaction_id: 'TX8',
        amount: 1000,
        user_id: 'U3',
        date_time: '2024-05-01T15:00:00Z', // 5 hours later
        location: 'Davao',
      },
    ];

    const { scoredTransactions: scored } = await scoreTransactions(transactions);
    expect(scored[1].rulesTriggered).toContain('new_or_different_location');
    expect(scored[1].ruleRiskScore).toBe(20);
    expect(scored[1].finalStatus).toBe('Legitimate'); // 20 < 50
  });

  it('does not trigger travel rules if location is the same', async () => {
    const transactions = [
      {
        transaction_id: 'TX9',
        amount: 1000,
        user_id: 'U4',
        date_time: '2024-05-01T10:00:00Z',
        location: 'Manila',
      },
      {
        transaction_id: 'TX10',
        amount: 1000,
        user_id: 'U4',
        date_time: '2024-05-01T11:00:00Z',
        location: 'Manila',
      },
    ];

    const { scoredTransactions: scored } = await scoreTransactions(transactions);
    expect(scored[1].rulesTriggered).not.toContain('impossible_travel');
    expect(scored[1].rulesTriggered).not.toContain('new_or_different_location');
    expect(scored[1].ruleRiskScore).toBe(0);
  });
});
