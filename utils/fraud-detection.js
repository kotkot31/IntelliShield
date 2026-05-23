const FRAUD_THRESHOLD = 50;
import { mergeAndBuildProfiles, scoreBehaviorAnomalies } from "@/utils/behavior-profile";
import { getBulkUserProfiles } from "@/lib/firestore-profiles";
import { buildRiskGraph, scoreNetworkRisk } from "@/utils/graph-profiling";

function getHourFromDateTime(dateTime) {
  const parsedDate = new Date(dateTime);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return parsedDate.getUTCHours();
}

export async function scoreTransactions(transactions) {
  const userIds = [...new Set(transactions.map((t) => t.user_id).filter(Boolean))];
  const existingProfilesMap = await getBulkUserProfiles(userIds);
  
  // Mathematically merge new transactions with the existing firestore profiles
  const profiles = mergeAndBuildProfiles(existingProfilesMap, transactions);
  
  // Build Network Graph for Velocity & Entity Linkage across this batch
  const networkGraph = buildRiskGraph(transactions);

  // Tracks the last known transaction details for a user { location, timeMs } within this batch
  const lastUserTx = new Map();

  const scoredTransactions = transactions.map((transaction) => {
    let riskScore = 0;
    const rulesTriggered = [];

    if (transaction.amount > 50000) {
      riskScore += 50;
      rulesTriggered.push("amount_over_50000");
    }

    const hour = getHourFromDateTime(transaction.date_time);
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

      // If location changed within 3 hours, flag as impossible travel
      if (timeDiffHours < 3) {
        riskScore += 50;
        rulesTriggered.push("impossible_travel");
      } else {
        // Otherwise, it's just a normal location change
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

    // Graph Profiling (Entity Linkage & Velocity)
    const network = scoreNetworkRisk(transaction, networkGraph);
    if (network.score > 0) {
      riskScore += network.score;
      rulesTriggered.push(...network.anomalies);
    }

    const currentTxData = {
      location: transaction.location,
      timeMs: new Date(transaction.date_time).getTime()
    };
    lastUserTx.set(transaction.user_id, currentTxData);
    
    // Set for firestore saving later
    const profile = profiles.get(transaction.user_id);
    if (profile) profile.lastTransaction = currentTxData;

    return {
      ...transaction,
      ruleRiskScore: riskScore,
      networkRiskScore: network.score, // Used by ML later
      ruleStatus: riskScore >= FRAUD_THRESHOLD ? "Fraud" : "Legitimate",
      riskScore,
      status: riskScore >= FRAUD_THRESHOLD ? "Fraud" : "Legitimate",
      finalStatus: riskScore >= FRAUD_THRESHOLD ? "Fraud" : "Legitimate",
      rulesTriggered,
    };
  });

  return { scoredTransactions, updatedProfiles: profiles };
}
