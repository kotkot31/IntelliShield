export function buildRiskGraph(transactions) {
  // Map of device_id -> Set of distinct user_ids
  const deviceUsers = new Map();
  // Map of ip_address -> Set of distinct user_ids
  const ipUsers = new Map();

  for (const tx of transactions) {
    if (tx.device_id) {
      if (!deviceUsers.has(tx.device_id)) {
        deviceUsers.set(tx.device_id, new Set());
      }
      deviceUsers.get(tx.device_id).add(tx.user_id);
    }

    if (tx.ip_address) {
      if (!ipUsers.has(tx.ip_address)) {
        ipUsers.set(tx.ip_address, new Set());
      }
      ipUsers.get(tx.ip_address).add(tx.user_id);
    }
  }

  return {
    deviceUsers,
    ipUsers,
  };
}

export function scoreNetworkRisk(transaction, graph) {
  let networkRiskScore = 0;
  const networkAnomalies = [];

  // Device Velocity: How many distinct users are using this device?
  if (transaction.device_id && graph.deviceUsers.has(transaction.device_id)) {
    const userCount = graph.deviceUsers.get(transaction.device_id).size;
    if (userCount >= 4) {
      // 4 or more users on a single device is highly suspicious (credential stuffing / device farm)
      networkRiskScore += 50;
      networkAnomalies.push(`high_device_velocity: ${userCount} users`);
    } else if (userCount >= 2) {
      networkRiskScore += 15;
      networkAnomalies.push(`shared_device: ${userCount} users`);
    }
  }

  // IP Velocity: How many distinct users are using this IP?
  if (transaction.ip_address && graph.ipUsers.has(transaction.ip_address)) {
    const userCount = graph.ipUsers.get(transaction.ip_address).size;
    if (userCount >= 5) {
      // Many users on one IP could be a botnet or VPN, but still risky
      networkRiskScore += 50;
      networkAnomalies.push(`high_ip_velocity: ${userCount} users`);
    }
  }

  return {
    score: networkRiskScore,
    anomalies: networkAnomalies,
  };
}
