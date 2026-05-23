function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeHourUtc(dateTime) {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getUTCHours();
}

export function mergeAndBuildProfiles(existingProfilesMap, newTransactions) {
  // We will build a map of updated profiles.
  // We'll initialize it with the existing profiles if any.
  const updatedProfiles = new Map();

  // Helper to get or init a profile
  const getProfile = (userId) => {
    if (updatedProfiles.has(userId)) return updatedProfiles.get(userId);
    
    // Check if it exists in firestore
    const existing = existingProfilesMap.get(userId);
    const profile = {
      transactionCount: existing?.transactionCount || 0,
      sumAmount: existing?.sumAmount || 0,
      sumAmountSquared: existing?.sumAmountSquared || 0,
      hourCounts: existing?.hourCounts ? { ...existing.hourCounts } : {},
      knownLocations: existing?.knownLocations ? new Set(existing.knownLocations) : new Set(),
      // Pre-calculated stats for scoring this batch
      avgAmount: 0,
      amountStdDev: 0,
      topHourUtc: null,
      lastTransaction: existing?.lastTransaction || null, // Keep existing lastTransaction reference
    };
    updatedProfiles.set(userId, profile);
    return profile;
  };

  // 1. Process all new transactions mathematically
  // Note: we don't sort here, so lastTransaction logic will just take the last one processed in the array
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

  // 2. Compute final running averages and std dev
  updatedProfiles.forEach((profile) => {
    // Averages
    if (profile.transactionCount > 0) {
      profile.avgAmount = profile.sumAmount / profile.transactionCount;
    } else {
      profile.avgAmount = 0;
    }

    // Standard Deviation using running sum of squares formula: sqrt((Sum(x^2) - (Sum(x)^2)/N) / (N-1))
    if (profile.transactionCount > 1) {
      const variance = (profile.sumAmountSquared - ((profile.sumAmount * profile.sumAmount) / profile.transactionCount)) / (profile.transactionCount - 1);
      // Ensure variance isn't negative due to floating point inaccuracies
      profile.amountStdDev = variance > 0 ? Math.sqrt(variance) : 0;
    } else {
      profile.amountStdDev = 0;
    }

    // Top Hour
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

export function scoreBehaviorAnomalies(transaction, userProfile) {
  const anomalies = [];
  let points = 0;

  if (!userProfile) {
    return { points, anomalies };
  }

  // Amount anomaly: if far above user's typical spend.
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

  // Hour anomaly: if user usually transacts around a different hour (UTC).
  // Allow a 3-hour window around their typical hour to be more lenient.
  const hr = safeHourUtc(transaction.date_time);
  if (hr !== null && userProfile.topHourUtc !== null) {
    const diff = Math.min(Math.abs(hr - userProfile.topHourUtc), 24 - Math.abs(hr - userProfile.topHourUtc));
    if (diff > 3) {
      points += 10;
      anomalies.push("unusual_transaction_hour_for_user");
    }
  }

  // Location anomaly: if location hasn't appeared for this user in the dataset.
  if (transaction.location && !userProfile.knownLocations.has(transaction.location)) {
    points += 20;
    anomalies.push("new_location_for_user");
  }

  return { points, anomalies };
}

