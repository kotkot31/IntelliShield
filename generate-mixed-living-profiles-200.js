const fs = require('fs');
const path = require('path');

// 🛡️ CONFIGURATION
const OUTPUT_FILE = 'mixed_living_profile_200.csv';
const ROW_COUNT = 200;

// Reusing User IDs from previous generations to build "Living Profiles"
const USERS_PH = Array.from({ length: 200 }, (_, i) => `USER_PH_${(i + 1).toString().padStart(3, '0')}`);
const USERS_ASIA = Array.from({ length: 200 }, (_, i) => `USER_ASIA_${(i + 1).toString().padStart(3, '0')}`);
const ALL_USERS = [...USERS_PH, ...USERS_ASIA];

const LOCATIONS = [
  'Manila, PH', 'Bacoor, PH', 'Pasig, PH', 'Quezon City, PH', 'Cebu, PH', 'Davao, PH',
  'Singapore, SG', 'Hong Kong, HK', 'Bangkok, TH', 'Tokyo, JP', 'Seoul, KR', 'Shanghai, CN'
];

const DEVICES = Array.from({ length: 50 }, (_, i) => `DEV_${(i + 1).toString().padStart(3, '0')}`);

// Use a LATER date range (May 2026) to simulate subsequent activity
const BASE_DATE = new Date('2026-05-01T08:00:00Z');

function generateRow(index) {
  // Select a user from the pool (wrap around if index > 400, but we only have 200 rows)
  const user_id = ALL_USERS[index % ALL_USERS.length];
  
  const transaction_id = `TX_MIX_${(index + 1).toString().padStart(4, '0')}`;
  
  // Advance time: ~1 hour per index, with some random jitter
  const date_time = new Date(BASE_DATE.getTime() + (index * 60 * 60 * 1000) + (Math.random() * 1800000)).toISOString();
  
  let amount = Math.floor(Math.random() * 5000) + 100; // Default small
  let location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  let device_id = DEVICES[Math.floor(Math.random() * DEVICES.length)];
  let ip_address = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

  // 🧪 INJECT SPECIFIC SCENARIOS
  
  // Scenario 1: Impossible Travel (Index 10-20)
  // We'll make these transactions happen in quick succession for the same user in different countries
  if (index >= 10 && index <= 15) {
    const travel_user = "USER_PH_010"; // Reusing PH user
    return {
      transaction_id,
      user_id: travel_user,
      amount: 1200,
      date_time: new Date(BASE_DATE.getTime() + (10 * 60000)).toISOString(), // 10 mins apart
      location: index % 2 === 0 ? "Manila, PH" : "Singapore, SG",
      device_id: "DEV_TRAVEL_01",
      ip_address: "10.0.0.1"
    };
  }

  // Scenario 2: High Frequency Burst (Index 30-40)
  if (index >= 30 && index <= 35) {
    return {
      transaction_id,
      user_id: "USER_ASIA_050",
      amount: 500,
      date_time: new Date(BASE_DATE.getTime() + (30 * 60000) + (index * 5000)).toISOString(), // Seconds apart
      location: "Bangkok, TH",
      device_id: "DEV_BURST_02",
      ip_address: "10.0.0.2"
    };
  }

  // Scenario 3: Abnormal Amount Spike (Index 50)
  if (index === 50) {
    return {
      transaction_id,
      user_id: "USER_PH_001", // This user usually spends small amounts in previous CSV
      amount: 85000,
      date_time: new Date(BASE_DATE.getTime() + (50 * 3600000)).toISOString(),
      location: "Manila, PH",
      device_id: "DEV_001",
      ip_address: "192.168.1.1"
    };
  }

  // Scenario 4: Device Farm (Index 70-80)
  // Multiple users sharing the same device in a short window
  if (index >= 70 && index <= 75) {
    return {
      transaction_id,
      user_id: `USER_PH_${70 + (index - 70)}`, // USER_PH_070, 071, etc.
      amount: 450,
      date_time: new Date(BASE_DATE.getTime() + (70 * 3600000) + (index * 1000)).toISOString(),
      location: "Quezon City, PH",
      device_id: "DEV_FARM_X",
      ip_address: "172.16.0.1"
    };
  }

  // Scenario 5: Late Night (Index 90-100)
  if (index >= 90 && index <= 95) {
    const lateNightDate = new Date(BASE_DATE);
    lateNightDate.setUTCHours(2); // 2 AM UTC
    return {
      transaction_id,
      user_id: `USER_ASIA_${90 + (index - 90)}`,
      amount: 3200,
      date_time: lateNightDate.toISOString(),
      location: "Tokyo, JP",
      device_id: `DEV_LATE_${index}`,
      ip_address: "10.0.0.5"
    };
  }

  return { transaction_id, user_id, amount, date_time, location, device_id, ip_address };
}

const headers = ['transaction_id', 'user_id', 'amount', 'date_time', 'location', 'device_id', 'ip_address'];
const csvRows = [headers.join(',')];

for (let i = 0; i < ROW_COUNT; i++) {
  const row = generateRow(i);
  csvRows.push(`${row.transaction_id},${row.user_id},${row.amount},${row.date_time},"${row.location}",${row.device_id},${row.ip_address}`);
}

fs.writeFileSync(OUTPUT_FILE, csvRows.join('\n'));
console.log(`✅ Generated ${ROW_COUNT} mixed living profile transactions in ${OUTPUT_FILE}`);
