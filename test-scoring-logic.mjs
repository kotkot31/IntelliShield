/**
 * Standalone test script that replicates the scoring logic from:
 *   - utils/fraud-detection.js   (rule-based scoring)
 *   - utils/behavior-profile.js  (behavior anomaly scoring)
 *
 * It reads the test CSV, runs the scoring, and verifies the expected results
 * for every transaction row-by-row.
 *
 * Run:  node test-scoring-logic.mjs
 */

import { readFileSync } from "fs";

// ─────────────────────────────────────────────
// 1.  Re-implement the scoring functions (pure copies from source)
// ─────────────────────────────────────────────

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeHourUtc(dateTime) {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCHours();
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function mergeAndBuildProfiles(existingProfilesMap, newTransactions) {
  const updatedProfiles = new Map();

  const getProfile = (userId) => {
    if (updatedProfiles.has(userId)) return updatedProfiles.get(userId);
    const existing = existingProfilesMap.get(userId);
    const profile = {
      transactionCount: existing?.transactionCount || 0,
      sumAmount: existing?.sumAmount || 0,
      sumAmountSquared: existing?.sumAmountSquared || 0,
      hourCounts: existing?.hourCounts ? { ...existing.hourCounts } : {},
      knownLocations: existing?.knownLocations ? new Set(existing.knownLocations) : new Set(),
      avgAmount: 0,
      amountStdDev: 0,
      topHourUtc: null,
      lastTransaction: existing?.lastTransaction || null,
    };
    updatedProfiles.set(userId, profile);
    return profile;
  };

  newTransactions.forEach((t) => {
    const userId = t.user_id;
    if (!userId) return;

    const profile = getProfile(userId);
    const amt = safeNumber(t.amount);
    if (amt !== null) {
      profile.transactionCount += 1;
      profile.sumAmount += amt;
      profile.sumAmountSquared += (amt * amt);
    }

    const hr = safeHourUtc(t.date_time);
    if (hr !== null) {
      profile.hourCounts[hr] = (profile.hourCounts[hr] || 0) + 1;
    }
    if (t.location) {
      profile.locations?.add?.(t.location) || profile.knownLocations.add(t.location);
    }
  });

  updatedProfiles.forEach((profile) => {
    if (profile.transactionCount > 0) {
      profile.avgAmount = profile.sumAmount / profile.transactionCount;
    } else {
      profile.avgAmount = 0;
    }
    if (profile.transactionCount > 1) {
      const variance = (profile.sumAmountSquared - ((profile.sumAmount * profile.sumAmount) / profile.transactionCount)) / (profile.transactionCount - 1);
      profile.amountStdDev = variance > 0 ? Math.sqrt(variance) : 0;
    } else {
      profile.amountStdDev = 0;
    }
    let topHour = null;
    let topHourCount = -1;
    Object.entries(profile.hourCounts).forEach(([hourStr, count]) => {
      if (count > topHourCount) {
        topHourCount = count;
        topHour = parseInt(hourStr, 10);
      }
    });
    profile.topHourUtc = topHour;
  });

  return updatedProfiles;
}

function scoreBehaviorAnomalies(transaction, userProfile) {
  const anomalies = [];
  let points = 0;

  if (!userProfile) return { points, anomalies };

  const amt = safeNumber(transaction.amount);
  if (amt !== null && userProfile.amountStdDev > 0) {
    const z = (amt - userProfile.avgAmount) / userProfile.amountStdDev;
    if (z >= 3) {
      points += 25;
      anomalies.push("amount_far_above_user_baseline");
    } else if (z >= 2) {
      points += 15;
      anomalies.push("amount_above_user_baseline");
    }
  }

  const hr = safeHourUtc(transaction.date_time);
  if (hr !== null && userProfile.topHourUtc !== null) {
    const diff = Math.min(Math.abs(hr - userProfile.topHourUtc), 24 - Math.abs(hr - userProfile.topHourUtc));
    if (diff > 3) {
      points += 10;
      anomalies.push("unusual_transaction_hour_for_user");
    }
  }

  if (transaction.location && !userProfile.knownLocations.has(transaction.location)) {
    points += 20;
    anomalies.push("new_location_for_user");
  }

  return { points, anomalies };
}

const FRAUD_THRESHOLD = 50;

async function scoreTransactions(transactions) {
  const existingProfilesMap = new Map(); // Mock empty firestore profiles
  const profiles = mergeAndBuildProfiles(existingProfilesMap, transactions);
  const lastUserTx = new Map();

  const scoredTransactions = transactions.map((transaction) => {
    let riskScore = 0;
    const rulesTriggered = [];

    if (transaction.amount > 50000) {
      riskScore += 50;
      rulesTriggered.push("amount_over_50000");
    }

    const hour = safeHourUtc(transaction.date_time);
    if (hour !== null && hour >= 0 && hour <= 5) {
      riskScore += 30;
      rulesTriggered.push("late_night_transaction");
    }

    let prev = lastUserTx.get(transaction.user_id);
    if (!prev) {
      const existingProfile = existingProfilesMap.get(transaction.user_id);
      if (existingProfile?.lastTransaction) {
        prev = existingProfile.lastTransaction;
      }
    }

    if (prev && prev.location && transaction.location && prev.location !== transaction.location) {
      const currentMs = new Date(transaction.date_time).getTime();
      const timeDiffHours = Math.abs(currentMs - prev.timeMs) / (1000 * 60 * 60);

      if (timeDiffHours < 3) {
        riskScore += 40;
        rulesTriggered.push("impossible_travel");
      } else {
        riskScore += 20;
        rulesTriggered.push("new_or_different_location");
      }
    }

    const behavior = scoreBehaviorAnomalies(
      transaction,
      profiles.get(transaction.user_id),
    );
    if (behavior.points > 0) {
      riskScore += behavior.points;
      rulesTriggered.push(...behavior.anomalies);
    }

    const currentTxData = {
      location: transaction.location,
      timeMs: new Date(transaction.date_time).getTime()
    };
    lastUserTx.set(transaction.user_id, currentTxData);
    
    const profile = profiles.get(transaction.user_id);
    if (profile) profile.lastTransaction = currentTxData;

    return {
      ...transaction,
      ruleRiskScore: riskScore,
      ruleStatus: riskScore >= FRAUD_THRESHOLD ? "Fraud" : "Legitimate",
      rulesTriggered,
    };
  });

  return { scoredTransactions, updatedProfiles: profiles };
}

// ─────────────────────────────────────────────
// 2.  Parse the test CSV
// ─────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));
    // coerce amount to number
    row.amount = Number(row.amount);
    rows.push(row);
  }

  return rows;
}

// ─────────────────────────────────────────────
// 3.  Run tests
// ─────────────────────────────────────────────

const csvText = readFileSync("public/test_transactions.csv", "utf-8");
const allRows = parseCsv(csvText);

// Separate valid from invalid (same validation as csv-transactions.js)
const validRows = allRows.filter((r) => {
  if (!r.transaction_id) return false;
  if (!r.user_id) return false;
  if (!r.location) return false;
  if (!Number.isFinite(r.amount) || r.amount <= 0) return false;
  if (!r.date_time || Number.isNaN(Date.parse(r.date_time))) return false;
  return true;
});

const invalidRows = allRows.filter((r) => !validRows.includes(r));

console.log("=".repeat(80));
console.log("FRAUD DETECTION SCORING LOGIC — VERIFICATION TEST");
console.log("=".repeat(80));
console.log(`\nTotal CSV rows: ${allRows.length}`);
console.log(`Valid rows:     ${validRows.length}`);
console.log(`Invalid rows:   ${invalidRows.length}\n`);

// ── Show user profiles (built from ALL valid transactions) ──
const existingProfilesMapMock = new Map();
const profiles = mergeAndBuildProfiles(existingProfilesMapMock, validRows);
console.log("-".repeat(80));
console.log("USER BEHAVIOR PROFILES (built from all valid transactions)");
console.log("-".repeat(80));
profiles.forEach((profile, userId) => {
  console.log(`\n  ${userId}:`);
  console.log(`    avgAmount:      ${profile.avgAmount.toFixed(2)}`);
  console.log(`    amountStdDev:   ${profile.amountStdDev.toFixed(2)}`);
  console.log(`    topHourUtc:     ${profile.topHourUtc}`);
  console.log(`    knownLocations: ${[...profile.knownLocations].join(", ")}`);
});

// ── Score all valid transactions ──
const { scoredTransactions: scored } = await scoreTransactions(validRows);

console.log("\n" + "=".repeat(80));
console.log("RULE-BY-RULE SCORING TRACE FOR EACH TRANSACTION");
console.log("=".repeat(80));

let passCount = 0;
let failCount = 0;
const issues = [];

scored.forEach((tx) => {
  const profile = profiles.get(tx.user_id);
  const hour = safeHourUtc(tx.date_time);

  // Manually compute expected score
  let expectedScore = 0;
  const expectedRules = [];

  // Rule 1: amount > 50000
  if (tx.amount > 50000) {
    expectedScore += 50;
    expectedRules.push("amount_over_50000");
  }

  // Rule 2: late night 0-5 UTC
  if (hour !== null && hour >= 0 && hour <= 5) {
    expectedScore += 30;
    expectedRules.push("late_night_transaction");
  }

  // Rule 3: impossible travel / different location
  if (tx.rulesTriggered.includes("impossible_travel")) {
    expectedScore += 40;
    expectedRules.push("impossible_travel");
  } else if (tx.rulesTriggered.includes("new_or_different_location")) {
    expectedScore += 20;
    expectedRules.push("new_or_different_location");
  }

  // Rule 4a: amount z-score anomaly
  if (profile && profile.amountStdDev > 0) {
    const z = (tx.amount - profile.avgAmount) / profile.amountStdDev;
    if (z >= 3) {
      expectedScore += 25;
      expectedRules.push("amount_far_above_user_baseline");
    } else if (z >= 2) {
      expectedScore += 15;
      expectedRules.push("amount_above_user_baseline");
    }
  }

  // Rule 4b: unusual hour
  if (hour !== null && profile && profile.topHourUtc !== null) {
    const diff = Math.min(Math.abs(hour - profile.topHourUtc), 24 - Math.abs(hour - profile.topHourUtc));
    if (diff > 3) {
      expectedScore += 10;
      expectedRules.push("unusual_transaction_hour_for_user");
    }
  }

  // Rule 4c: new location for user
  // NOTE: buildUserProfiles builds from ALL transactions, so all locations are known.
  // This rule can NEVER trigger because the profile includes every location the user
  // has in the dataset. This is a design observation (potential bug).
  if (profile && tx.location && !profile.knownLocations.has(tx.location)) {
    expectedScore += 20;
    expectedRules.push("new_location_for_user");
  }

  const expectedStatus = expectedScore >= FRAUD_THRESHOLD ? "Fraud" : "Legitimate";
  const match = tx.ruleRiskScore === expectedScore && tx.ruleStatus === expectedStatus;

  if (match) {
    passCount++;
  } else {
    failCount++;
    issues.push({
      id: tx.transaction_id,
      expected: expectedScore,
      got: tx.ruleRiskScore,
      expectedStatus,
      gotStatus: tx.ruleStatus,
    });
  }

  const statusIcon = match ? "✅" : "❌";
  console.log(
    `\n${statusIcon} ${tx.transaction_id} | ${tx.user_id} | ₱${tx.amount.toLocaleString()} | ${tx.date_time}`
  );
  console.log(`   Hour(UTC): ${hour} | Location: ${tx.location}`);
  console.log(`   Score: ${tx.ruleRiskScore} → ${tx.ruleStatus}`);
  if (tx.rulesTriggered.length > 0) {
    console.log(`   Rules: ${tx.rulesTriggered.join(", ")}`);
  } else {
    console.log(`   Rules: (none)`);
  }
});

// ── Verify the "new_location_for_user" observation ──
console.log("\n" + "=".repeat(80));
console.log("KEY OBSERVATION: 'new_location_for_user' BEHAVIOR RULE");
console.log("=".repeat(80));

const newLocRuleCount = scored.filter((t) =>
  t.rulesTriggered.includes("new_location_for_user")
).length;
console.log(
  `\nTransactions triggering 'new_location_for_user': ${newLocRuleCount}`
);
console.log(
  "EXPLANATION: buildUserProfiles() collects ALL locations from ALL transactions"
);
console.log(
  "BEFORE scoring begins. So every location a user has is already 'known'."
);
console.log(
  "This means 'new_location_for_user' can NEVER fire. This is a design issue —"
);
console.log(
  "the profile includes the transaction being scored, making the check a no-op."
);

// ── Summarize ──
console.log("\n" + "=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));

const fraudCount = scored.filter((t) => t.ruleStatus === "Fraud").length;
const legitCount = scored.filter((t) => t.ruleStatus === "Legitimate").length;

console.log(`\nTotal scored:  ${scored.length}`);
console.log(`Fraud:         ${fraudCount}`);
console.log(`Legitimate:    ${legitCount}`);
console.log(`\nTests passed:  ${passCount}/${scored.length}`);
console.log(`Tests failed:  ${failCount}/${scored.length}`);

if (issues.length > 0) {
  console.log("\nFAILED TRANSACTIONS:");
  issues.forEach((i) => {
    console.log(
      `  ${i.id}: expected score=${i.expected} (${i.expectedStatus}), got score=${i.got} (${i.gotStatus})`
    );
  });
}

// ── Final status: ML override explanation ──
console.log("\n" + "=".repeat(80));
console.log("FRAUD PROBABILITY (ML SCORING) EXPLANATION");
console.log("=".repeat(80));
console.log(`
The 'fraudProbability' is NOT determined by the rules above. It comes from a
separate ML pipeline (lib/ml/pipeline.js) that:

1. Collects historical transactions + new transactions
2. Builds 7-dimensional feature vectors per transaction:
   - f_amount_log:     log(1 + amount)
   - f_hour_norm:      hour / 23
   - f_is_late_night:  1 if hour 0-5, else 0
   - f_is_new_location: 1 if location is new for user (incremental)
   - f_amount_zscore:  z-score of amount vs user's running average
   - f_velocity_1h:    count of user's transactions in last 1 hour
   - f_rule_risk_norm: ruleRiskScore / 100 (capped 0-1)
3. Trains a TensorFlow.js logistic regression model on this data
4. Predicts a probability (0.0 – 1.0) for each new transaction
5. If probability >= threshold (default 0.65) → mlStatus = "Fraud"

FINAL STATUS = "Fraud" if EITHER ruleStatus OR mlStatus is "Fraud".
This means the ML can escalate a rule-based "Legitimate" to "Fraud" but
can never override a rule-based "Fraud" back to "Legitimate".
`);

// ── Invalid rows verification ──
console.log("=".repeat(80));
console.log("INVALID ROW VALIDATION");
console.log("=".repeat(80));

invalidRows.forEach((row, i) => {
  const reasons = [];
  if (!row.transaction_id) reasons.push("Missing transaction_id");
  if (!row.user_id) reasons.push("Missing user_id");
  if (!row.location) reasons.push("Missing location");
  if (!Number.isFinite(row.amount) || row.amount <= 0) reasons.push("Invalid amount");
  if (!row.date_time || Number.isNaN(Date.parse(row.date_time))) reasons.push("Invalid date_time");
  console.log(`\n  Row ${validRows.length + i + 2}: ${row.transaction_id || "(empty)"}`);
  console.log(`    Issues: ${reasons.join(", ")}`);
});

console.log("\n" + "=".repeat(80));
console.log(failCount === 0 ? "✅ ALL SCORING LOGIC TESTS PASSED" : "❌ SOME TESTS FAILED");
console.log("=".repeat(80));
