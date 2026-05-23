const fs = require('fs');
const path = require('path');

const NUM_ROWS = 100;
const CSV_PATH = path.join(__dirname, 'test_transactions.csv');

const headers = [
  "transaction_id",
  "user_id",
  "amount",
  "date_time",
  "location",
  "device_id",
  "ip_address"
];

const rows = [headers.join(",")];
const baseDate = new Date("2026-04-24T12:00:00Z");
const runId = Date.now();

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 1. Normal Transactions (Baseline for Gaussian)
// Users U001 to U080
for (let i = 1; i <= 80; i++) {
  const userId = `U${String(i).padStart(3, '0')}`;
  const deviceId = `DEV_${userId}`;
  const ipAddress = `192.168.1.${randInt(1, 254)}`;
  const amount = randInt(10, 500); // Normal amount
  const time = addMinutes(baseDate, i * 5); // Normal time distribution
  const location = "New York, USA";
  rows.push(`TX_${runId}_${1000 + i},${userId},${amount},${time},"${location}",${deviceId},${ipAddress}`);
}

// 2. High Amount Anomaly & Gaussian Outlier
// User U081
rows.push(`TX_${runId}_1081,U081,60000,${addMinutes(baseDate, 500)},"London, UK",DEV_U081,10.0.0.81`);

// 3. Late Night Transaction
// User U082 (Time is 03:00 AM UTC)
rows.push(`TX_${runId}_1082,U082,1500,2026-04-24T03:15:00Z,"Tokyo, JP",DEV_U082,10.0.0.82`);

// 4. Impossible Travel (Two transactions for same user far apart but close in time)
// User U083
rows.push(`TX_${runId}_1083_A,U083,100,${addMinutes(baseDate, 600)},"Paris, FR",DEV_U083,10.0.0.83`);
rows.push(`TX_${runId}_1083_B,U083,150,${addMinutes(baseDate, 660)},"Sydney, AU",DEV_U083,10.0.0.84`); // 1 hour later, impossible travel

// 5. Graph Profiling: Device Velocity Attack (Credential Stuffing / Device Farm)
// 5 different users using the exact same device ID
const attackDeviceId = "DEV_HACKER_99";
for (let i = 84; i <= 88; i++) {
  const userId = `U${String(i).padStart(3, '0')}`;
  const amount = randInt(50, 150);
  const time = addMinutes(baseDate, 700 + i);
  rows.push(`TX_${runId}_${1000 + i},${userId},${amount},${time},"Miami, USA",${attackDeviceId},172.16.0.${i}`);
}

// 6. Graph Profiling: IP Velocity Attack (Botnet)
// 6 different users using the exact same IP address
const attackIp = "203.0.113.42";
for (let i = 89; i <= 94; i++) {
  const userId = `U${String(i).padStart(3, '0')}`;
  const amount = randInt(10, 50);
  const time = addMinutes(baseDate, 800 + i);
  rows.push(`TX_${runId}_${1000 + i},${userId},${amount},${time},"Seattle, USA",DEV_${userId},${attackIp}`);
}

// 7. Legitimate Users for the rest to reach 100
for (let i = 95; i <= 100; i++) {
  const userId = `U${String(i).padStart(3, '0')}`;
  const deviceId = `DEV_${userId}`;
  const ipAddress = `10.1.1.${i}`;
  const amount = randInt(20, 300);
  const time = addMinutes(baseDate, 900 + i * 5);
  const location = "Chicago, USA";
  rows.push(`TX_${runId}_${1000 + i},${userId},${amount},${time},"${location}",${deviceId},${ipAddress}`);
}

fs.writeFileSync(CSV_PATH, rows.join("\n"));
console.log(`Generated ${rows.length - 1} transactions at ${CSV_PATH}`);
