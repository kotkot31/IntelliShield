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

// Using a unique prefix to prevent the database from filtering them out as duplicates
const uniquePrefix = `TXN-${Date.now()}`;

for (let i = 1; i <= 200; i++) {
  let user = users[Math.floor(Math.random() * users.length)];
  let amount = (Math.random() * 1000 + 10).toFixed(2);
  let location = countries[Math.floor(Math.random() * countries.length)];
  let device = devices[Math.floor(Math.random() * devices.length)];
  let date_time = new Date(currentTime);
  
  // Inject explicit fraud triggers
  if (i === 10) {
    user = "user_99";
    location = "USA";
    date_time = new Date("2026-05-01T12:00:00Z");
  } else if (i === 11) {
    user = "user_99";
    location = "Japan"; 
    date_time = new Date("2026-05-01T13:30:00Z");
  } else if (i === 25) {
    user = "user_88";
    amount = "65000.00"; 
    location = "Germany";
  } else if (i === 40) {
    user = "user_77";
    date_time = new Date("2026-05-01T03:15:00Z");
  } else if (i === 50 || i === 51 || i === 52) {
    device = "dev_hacker_001";
    location = "Russia";
    date_time = new Date("2026-05-01T14:00:00Z");
    user = `user_victim_${i}`; 
  } else if (i === 60) {
    user = "user_66";
    location = "Brazil";
    date_time = new Date("2026-05-01T08:00:00Z");
  } else if (i === 61) {
    user = "user_66";
    location = "UK";
    date_time = new Date("2026-05-01T15:00:00Z");
  } else if (i >= 80 && i <= 85) {
    user = "user_55";
    amount = "10.00";
    location = "France";
    date_time = new Date(new Date("2026-05-01T16:00:00Z").getTime() + ((i-80) * 60000));
  } else if (i === 100) {
    user = "user_44";
    amount = "85000.00";
    date_time = new Date("2026-05-01T02:45:00Z");
    location = "Singapore";
  } else {
    currentTime += Math.random() * 1000 * 60 * 60;
    date_time = new Date(currentTime);
  }

  const tx_id = `${uniquePrefix}-${String(i).padStart(4, '0')}`;
  csvContent += `${tx_id},${user},${amount},${date_time.toISOString()},${location},${device}\n`;
}

fs.writeFileSync("realistic_global_test_200_unique.csv", csvContent);
