const fs = require('fs');
const path = require('path');

const NUM_ROWS = 200;
const CSV_PATH = path.join(__dirname, 'asia_fraud_test_200.csv');

const headers = [
  "transaction_id",
  "user_id",
  "amount",
  "date_time",
  "location",
  "device_id",
  "ip_address"
];

const ASIA_CITIES = [
  "Singapore, SG", "Hong Kong, HK", "Seoul, KR", "Busan, KR",
  "Tokyo, JP", "Osaka, JP", "Shanghai, CN", "Beijing, CN",
  "Bangkok, TH", "Phuket, TH", "Incheon, KR", "Kyoto, JP"
];

const rows = [headers.join(",")];
const baseDate = new Date("2026-04-25T10:00:00Z");
const runId = "ASIA_" + Date.now().toString().slice(-4);

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let rowCount = 0;

// 1. Normal Transactions (Baseline) - 120 rows
for (let i = 1; i <= 120; i++) {
  rowCount++;
  const userId = `U_ASIA_${String(rowCount).padStart(3, '0')}`;
  const deviceId = `DEV_${userId}`;
  const ipAddress = `${randInt(1, 223)}.${randInt(1, 255)}.${randInt(1, 255)}.${randInt(1, 255)}`;
  const amount = randInt(50, 5000); 
  const time = addMinutes(baseDate, i * 12);
  const location = ASIA_CITIES[randInt(0, ASIA_CITIES.length - 1)];
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",${deviceId},${ipAddress}`);
}

// 2. High Amount Anomaly - 10 rows
for (let i = 1; i <= 10; i++) {
  rowCount++;
  const userId = `U_ASIA_${String(rowCount).padStart(3, '0')}`;
  const amount = randInt(51000, 200000);
  const time = addMinutes(baseDate, randInt(0, 500));
  const location = "Singapore, SG";
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",DEV_${userId},103.1.1.${i}`);
}

// 3. Late Night Transactions (00:00 - 05:00 UTC) - 15 rows
const lateNightDate = new Date("2026-04-25T01:30:00Z");
for (let i = 1; i <= 15; i++) {
  rowCount++;
  const userId = `U_ASIA_${String(rowCount).padStart(3, '0')}`;
  const amount = randInt(100, 1000);
  const time = addMinutes(lateNightDate, i * 5);
  const location = "Seoul, KR";
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",DEV_${userId},210.1.1.${i}`);
}

// 4. Impossible Travel (Cross-Country) - 10 rows (5 pairs)
for (let i = 1; i <= 5; i++) {
  rowCount++;
  const userId = `ASIA_TRAV_${i}`;
  const timeA = addMinutes(baseDate, 200);
  const timeB = addMinutes(baseDate, 230); // 30 mins later
  rows.push(`TX_${runId}_${rowCount}_A,${userId},450,${timeA},"Hong Kong, HK",DEV_${userId},202.1.1.${i}`);
  rowCount++;
  rows.push(`TX_${runId}_${rowCount}_B,${userId},550,${timeB},"Tokyo, JP",DEV_${userId},202.1.1.${i+10}`);
}

// 5. Device Velocity Attack - 15 rows (3 shared devices)
for (let d = 1; d <= 3; d++) {
  const sharedDevId = `DEV_ASIA_FARM_${d}`;
  for (let u = 1; u <= 5; u++) {
    rowCount++;
    const userId = `U_ASIA_FARM_${d}_${u}`;
    const amount = randInt(200, 400);
    const time = addMinutes(baseDate, 400 + rowCount);
    rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"Bangkok, TH",${sharedDevId},171.1.1.${rowCount}`);
  }
}

// 6. IP Velocity Attack - 15 rows (3 shared IPs)
for (let ip = 1; ip <= 3; ip++) {
  const sharedIp = `118.1.${ip}.99`;
  for (let u = 1; u <= 5; u++) {
    rowCount++;
    const userId = `U_ASIA_BOT_${ip}_${u}`;
    const amount = randInt(10, 80);
    const time = addMinutes(baseDate, 500 + rowCount);
    rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"Shanghai, CN",DEV_${userId},${sharedIp}`);
  }
}

// 7. Suspicious Locations (Custom) - 10 rows
for (let i = 1; i <= 10; i++) {
  rowCount++;
  const userId = `U_ASIA_${String(rowCount).padStart(3, '0')}`;
  const location = i % 2 === 0 ? "Unknown, ASIA" : "Remote Server, ASIA";
  const amount = randInt(1000, 3000);
  const time = addMinutes(baseDate, randInt(0, 1000));
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",DEV_${userId},1.1.1.${i}`);
}

// 8. User Velocity (Bursts) - 5 rows
const burstUserId = "ASIA_SPAMMER_88";
for (let i = 1; i <= 5; i++) {
  rowCount++;
  const time = addMinutes(baseDate, 700 + i); // Every 1 minute
  rows.push(`TX_${runId}_${rowCount},${burstUserId},99,${time},"Osaka, JP",DEV_BURST,126.1.1.1`);
}

fs.writeFileSync(CSV_PATH, rows.join("\n"));
console.log(`Generated ${rows.length - 1} transactions at ${CSV_PATH}`);
