const fs = require('fs');

const countries = [
  "USA", "UK", "France", "Japan", "Brazil", "India", "Australia", 
  "Singapore", "Canada", "Germany", "South Africa", "UAE", "China", 
  "Russia", "Mexico", "Italy", "Spain", "South Korea", "Indonesia", "Turkey"
];

const users = Array.from({length: 40}, (_, i) => `user_${i+1}`);
const devices = Array.from({length: 50}, (_, i) => `dev_${i+1}`);

let csvContent = "transaction_id,user_id,amount,date_time,location,device_id\n";
let currentTime = new Date("2026-05-01T10:00:00Z").getTime();

// We will inject specific fraud cases at certain indices, otherwise randomize
for (let i = 1; i <= 200; i++) {
  let user = users[Math.floor(Math.random() * users.length)];
  let amount = (Math.random() * 1000 + 10).toFixed(2); // Normal amounts 10-1010
  let location = countries[Math.floor(Math.random() * countries.length)];
  let device = devices[Math.floor(Math.random() * devices.length)];
  let date_time = new Date(currentTime);
  
  // Inject explicit fraud triggers
  
  // 1. Impossible Travel (user_99 changes location in < 3 hrs)
  if (i === 10) {
    user = "user_99";
    location = "USA";
    date_time = new Date("2026-05-01T12:00:00Z");
  } else if (i === 11) {
    user = "user_99";
    location = "Japan"; 
    date_time = new Date("2026-05-01T13:30:00Z"); // 1.5 hrs later, trigger impossible_travel
  } 
  
  // 2. High Amount (> 50,000)
  else if (i === 25) {
    user = "user_88";
    amount = "65000.00"; // trigger amount_over_50000
    location = "Germany";
  } 
  
  // 3. Late Night Transaction (0-5 UTC)
  else if (i === 40) {
    user = "user_77";
    date_time = new Date("2026-05-01T03:15:00Z"); // 3:15 AM
  } 
  
  // 4. Shared Device (Network Risk) - 3 different users on the same device at the same time
  else if (i === 50 || i === 51 || i === 52) {
    device = "dev_hacker_001";
    location = "Russia";
    date_time = new Date("2026-05-01T14:00:00Z");
    user = `user_victim_${i}`; 
  } 
  
  // 5. Normal Travel (new_or_different_location) - >3 hours gap
  else if (i === 60) {
    user = "user_66";
    location = "Brazil";
    date_time = new Date("2026-05-01T08:00:00Z");
  } else if (i === 61) {
    user = "user_66";
    location = "UK";
    date_time = new Date("2026-05-01T15:00:00Z"); // 7 hrs later, trigger normal location change
  } 
  
  // 6. Rapid Transactions / Velocity (Same user, many txns in short time)
  else if (i >= 80 && i <= 85) {
    user = "user_55";
    amount = "10.00";
    location = "France";
    // 1 minute apart
    date_time = new Date(new Date("2026-05-01T16:00:00Z").getTime() + ((i-80) * 60000));
  }
  
  // 7. Combination (Late night + High amount)
  else if (i === 100) {
    user = "user_44";
    amount = "85000.00";
    date_time = new Date("2026-05-01T02:45:00Z");
    location = "Singapore";
  }

  // 8. Normal random progression
  else {
    currentTime += Math.random() * 1000 * 60 * 60; // 0-1 hour steps
    date_time = new Date(currentTime);
  }

  const tx_id = `TXN-${String(i).padStart(4, '0')}`;
  csvContent += `${tx_id},${user},${amount},${date_time.toISOString()},${location},${device}\n`;
}

fs.writeFileSync("realistic_global_test_200.csv", csvContent);
console.log("CSV generated successfully: realistic_global_test_200.csv");
