import Papa from "papaparse";

// Mock validation logic from utils/csv-transactions.js
function validateTransaction(row) {
  if (!row.transaction_id || !row.user_id) return false;
  const amount = parseFloat(row.amount);
  if (isNaN(amount) || amount <= 0) return false;
  if (!row.date_time || row.date_time === "INVALID_DATE" || row.date_time === "NotADate") return false;
  if (!row.location || row.location.trim() === "") return false;
  return true;
}

// Mock CSV parsing logic with the new fail-safe
async function simulateCsvUpload(csvContent) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rowCount = results.data.length;
        const validRows = results.data.filter(validateTransaction);
        
        console.log(`Total Rows Found: ${rowCount}`);
        console.log(`Valid Rows Found: ${validRows.length}`);

        // THE FAIL-SAFE LOGIC
        if (validRows.length === 0 && rowCount > 0) {
          reject(new Error("🛑 Upload Aborted: All rows in the CSV are invalid or corrupted. Current model retained."));
          return;
        }

        resolve(validRows);
      }
    });
  });
}

// Mock ML training fail-safe
function simulateMlTraining(data, modelName) {
  console.log(`Starting ${modelName} training...`);
  const hasNaN = data.some(row => row.normalized.some(val => isNaN(val)));
  if (hasNaN) {
    throw new Error(`🛑 [${modelName}] Training Aborted: Input data contains NaN or invalid values. Current model retained.`);
  }
  console.log(`${modelName} training successful!`);
}

async function runIntegratedTest() {
  const corruptedCsv = `transaction_id,user_id,amount,date_time,location
TXN_1,USER_1,-100,INVALID,Manila
TXN_2,USER_2,NaN,2024,
`;

  console.log("--- TEST 1: CSV Upload Fail-Safe ---");
  try {
    await simulateCsvUpload(corruptedCsv);
  } catch (error) {
    console.log("Caught Expected Error:", error.message);
  }

  console.log("\n--- TEST 2: ML Training Fail-Safe (NaN Detection) ---");
  const badMlData = [
    { normalized: [0.1, NaN, 0.3], label: 0 }
  ];
  try {
    simulateMlTraining(badMlData, "Neural Network");
  } catch (error) {
    console.log("Caught Expected Error:", error.message);
  }
}

runIntegratedTest();
