const fs = require('fs');
const path = require('path');

const NUM_ROWS = 200;
const CSV_PATH = path.join(__dirname, 'ph_fraud_test_200.csv');

const headers = [
  "transaction_id",
  "user_id",
  "amount",
  "date_time",
  "location",
  "device_id",
  "ip_address"
];

const PH_CITIES = [
  "Manila, PH", "Quezon City, PH", "Davao City, PH", "Cebu City, PH", 
  "Bacoor, PH", "Pasig, PH", "Las Piñas, PH", "Subic, PH", 
  "Clark, PH", "Dasmariñas, PH", "Makati, PH", "Taguig, PH"
];

const rows = [headers.join(",")];
const baseDate = new Date("2026-04-25T08:00:00Z"); // Morning UTC
const runId = Date.now().toString().slice(-6);

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
  const userId = `U${String(rowCount).padStart(3, '0')}`;
  const deviceId = `DEV_${userId}`;
  const ipAddress = `110.54.${randInt(1, 255)}.${randInt(1, 255)}`;
  const amount = randInt(200, 4500); 
  const time = addMinutes(baseDate, i * 15 + randInt(0, 10));
  const location = PH_CITIES[randInt(0, PH_CITIES.length - 1)];
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",${deviceId},${ipAddress}`);
}

// 2. High Amount Anomaly - 10 rows
for (let i = 1; i <= 10; i++) {
  rowCount++;
  const userId = `U${String(rowCount).padStart(3, '0')}`;
  const amount = randInt(55000, 150000);
  const time = addMinutes(baseDate, randInt(0, 1440));
  const location = "Makati, PH";
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",DEV_${userId},112.198.1.${i}`);
}

// 3. Late Night Transactions (00:00 - 05:00 UTC) - 15 rows
const lateNightDate = new Date("2026-04-25T02:00:00Z");
for (let i = 1; i <= 15; i++) {
  rowCount++;
  const userId = `U${String(rowCount).padStart(3, '0')}`;
  const amount = randInt(500, 2000);
  const time = addMinutes(lateNightDate, i * 10);
  const location = "Manila, PH";
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",DEV_${userId},119.92.1.${i}`);
}

// 4. Impossible Travel - 10 rows (5 pairs)
for (let i = 1; i <= 5; i++) {
  rowCount++;
  const userId = `TRAVELER_${i}`;
  const timeA = addMinutes(baseDate, 100);
  const timeB = addMinutes(baseDate, 115); // 15 mins later
  rows.push(`TX_${runId}_${rowCount}_A,${userId},500,${timeA},"Manila, PH",DEV_${userId},120.28.1.${i}`);
  rowCount++;
  rows.push(`TX_${runId}_${rowCount}_B,${userId},600,${timeB},"Davao City, PH",DEV_${userId},120.28.1.${i+10}`);
}

// 5. Device Velocity Attack - 15 rows (3 shared devices)
for (let d = 1; d <= 3; d++) {
  const sharedDevId = `DEV_FRAUD_FARM_${d}`;
  for (let u = 1; u <= 5; u++) {
    rowCount++;
    const userId = `U_FARM_${d}_${u}`;
    const amount = randInt(100, 300);
    const time = addMinutes(baseDate, 500 + rowCount);
    rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"Pasig, PH",${sharedDevId},122.2.1.${rowCount}`);
  }
}

// 6. IP Velocity Attack - 15 rows (3 shared IPs)
for (let ip = 1; ip <= 3; ip++) {
  const sharedIp = `202.126.44.${ip}`;
  for (let u = 1; u <= 5; u++) {
    rowCount++;
    const userId = `U_IP_BOT_${ip}_${u}`;
    const amount = randInt(50, 150);
    const time = addMinutes(baseDate, 600 + rowCount);
    rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"Cebu City, PH",DEV_${userId},${sharedIp}`);
  }
}

// 7. Suspicious Locations - 10 rows
for (let i = 1; i <= 10; i++) {
  rowCount++;
  const userId = `U${String(rowCount).padStart(3, '0')}`;
  const location = i % 2 === 0 ? "Remote Area, PH" : "Unknown, PH";
  const amount = randInt(1000, 5000);
  const time = addMinutes(baseDate, randInt(0, 1000));
  rows.push(`TX_${runId}_${rowCount},${userId},${amount},${time},"${location}",DEV_${userId},124.6.1.${i}`);
}

// 8. User Velocity (Spam) - 5 rows
const velocityUserId = "U_VELOCITY_SPAMMER";
for (let i = 1; i <= 5; i++) {
  rowCount++;
  const time = addMinutes(baseDate, 800 + i * 2); // Every 2 minutes
  rows.push(`TX_${runId}_${rowCount},${velocityUserId},250,${time},"Quezon City, PH",DEV_SPAM,125.5.1.1`);
}

fs.writeFileSync(CSV_PATH, rows.join("\n"));
console.log(`Generated ${rows.length - 1} transactions at ${CSV_PATH}`);
