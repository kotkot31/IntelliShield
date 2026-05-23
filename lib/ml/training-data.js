import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

const TRAINING_COLLECTION = "transactions";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBinary(value) {
  if (value === 1 || value === "1" || value === true) return 1;
  if (value === 0 || value === "0" || value === false) return 0;
  return null;
}

function getHourFromDateTime(dateTime) {
  if (!dateTime) return null;
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCHours();
}

function normalizeRow(raw) {
  const amount = toNumber(raw.amount);
  if (amount === null) return null;

  // Derive hour from date_time field (stored by CSV upload pipeline)
  const hour = getHourFromDateTime(raw.date_time);
  if (hour === null || hour < 0 || hour > 23) return null;

  // Derive isLateNight from hour (matches fraud-detection.js rule: 0–5 UTC)
  const isLateNight = hour >= 0 && hour <= 5 ? 1 : 0;

  // Derive isNewLocation from rulesTriggered array
  const rules = Array.isArray(raw.rulesTriggered) ? raw.rulesTriggered : [];
  const isNewLocation =
    rules.includes("new_or_different_location") ||
    rules.includes("new_location_for_user")
      ? 1
      : 0;

  // ruleRiskScore is stored directly by the pipeline
  const ruleRiskScore = toNumber(raw.ruleRiskScore ?? raw.riskScore ?? 0);
  if (ruleRiskScore === null) return null;

  // Derive label from finalStatus / status (the ground truth from scoring)
  const status = raw.finalStatus || raw.status;
  let label;
  if (raw.manualLabel !== undefined && raw.manualLabel !== null) {
    label = toBinary(raw.manualLabel);
  } else if (status === "Fraud") {
    label = 1;
  } else if (status === "Legitimate") {
    label = 0;
  } else {
    label = null;
  }
  if (label === null) return null;

  return {
    amount,
    hour,
    isLateNight,
    isNewLocation,
    ruleRiskScore,
    label,
  };
}

export async function getTrainingData({ ownerUid, maxRows = 3000 } = {}) {
  const constraints = [limit(maxRows)];
  if (ownerUid) {
    constraints.unshift(where("owner_uid", "==", ownerUid));
  }

  const q = query(collection(db, TRAINING_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);

  const validRows = [];
  let invalidCount = 0;

  snapshot.docs.forEach((docSnap) => {
    const normalized = normalizeRow(docSnap.data());
    if (!normalized) {
      invalidCount += 1;
      return;
    }
    validRows.push({
      id: docSnap.id,
      ...normalized,
    });
  });

  return {
    rows: validRows,
    totalFetched: snapshot.size,
    invalidCount,
    validCount: validRows.length,
  };
}
