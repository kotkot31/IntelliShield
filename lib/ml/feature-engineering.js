import { FEATURE_NAMES } from "@/lib/ml/constants";
import { trainGaussianModel, calculateAnomalyScore } from "@/lib/ml/gaussian-anomaly";

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

function toTimestamp(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
}

function getHour(dateTime) {
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getUTCHours();
}

export function getLabel(row) {
  if (row.manualLabel === "Fraud" || row.manualLabel === 1) return 1;
  if (row.manualLabel === "Legitimate" || row.manualLabel === 0) return 0;

  const status = row.ruleStatus || row.status || row.finalStatus;
  return status === "Fraud" ? 1 : 0;
}

function getRuleRisk(row) {
  const value = Number(row.ruleRiskScore ?? row.riskScore ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value / 100, 1));
}

export function buildFeatureRows(transactions) {
  const sorted = [...transactions].sort((a, b) => {
    const ta = toTimestamp(a.date_time) ?? 0;
    const tb = toTimestamp(b.date_time) ?? 0;
    return ta - tb;
  });

  const perUserState = new Map();
  const rows = [];

  sorted.forEach((tx) => {
    const userId = tx.user_id || "unknown";
    if (!perUserState.has(userId)) {
      perUserState.set(userId, {
        amounts: [],
        locations: new Set(),
        timestamps: [],
      });
    }

    const state = perUserState.get(userId);
    const amount = Number(tx.amount) || 0;
    const hour = getHour(tx.date_time);
    const ts = toTimestamp(tx.date_time);
    const userMean = mean(state.amounts);
    const userStd = stdDev(state.amounts);
    const isNewLocation = tx.location && !state.locations.has(tx.location) ? 1 : 0;

    let velocity1h = 0;
    if (ts !== null) {
      velocity1h = state.timestamps.filter((prev) => ts - prev <= 3600000).length;
    }

    const fAmountLog = Math.log(1 + Math.max(amount, 0));
    const fHourNorm = hour / 23;
    const fIsLateNight = hour >= 0 && hour <= 5 ? 1 : 0;
    const fAmountZscore =
      userStd > 0 ? Math.max(-5, Math.min(5, (amount - userMean) / userStd)) : 0;
    const fVelocity1h = Math.max(0, Math.min(velocity1h / 10, 1));
    const fRuleRiskNorm = getRuleRisk(tx);
    const fNetworkRiskNorm = Math.max(0, Math.min((tx.networkRiskScore ?? 0) / 100, 1));

    const vector = [
      fAmountLog,
      fHourNorm,
      fIsLateNight,
      isNewLocation,
      fAmountZscore,
      fVelocity1h,
      fRuleRiskNorm,
      fNetworkRiskNorm,
    ];

    rows.push({
      id: tx.id || tx.transaction_id || "",
      transaction: tx,
      vector,
      label: getLabel(tx),
    });

    state.amounts.push(amount);
    if (tx.location) state.locations.add(tx.location);
    if (ts !== null) state.timestamps.push(ts);
  });

  return rows;
}

export function buildNormalization(rows) {
  const means = [];
  const stds = [];

  for (let i = 0; i < FEATURE_NAMES.length; i += 1) {
    const values = rows.map((r) => r.vector[i] ?? 0);
    const m = mean(values);
    const s = stdDev(values);
    means.push(m);
    stds.push(s > 0 ? s : 1);
  }

  // Train Gaussian model on legitimate rows
  const legitimateVectors = rows
    .filter((r) => r.label === 0)
    .map((r) => r.vector);
  const gaussianParams = trainGaussianModel(legitimateVectors);

  return { means, stds, gaussianParams };
}

export function applyNormalization(rows, normalization) {
  return rows.map((r) => {
    const normalized = r.vector.map((value, i) => {
      // Handle the case where normalization might be missing standard arrays
      const meanValue = normalization.means?.[i] ?? 0;
      const stdValue = normalization.stds?.[i] ?? 1;
      return (value - meanValue) / stdValue;
    });

    // Add Gaussian Anomaly Score as a feature
    if (normalization.gaussianParams) {
      const anomalyScore = calculateAnomalyScore(
        r.vector,
        normalization.gaussianParams.means,
        normalization.gaussianParams.variances
      );
      normalized.push(anomalyScore);
    } else {
      normalized.push(0); // Fallback if no params exist
    }

    return { ...r, normalized };
  });
}

