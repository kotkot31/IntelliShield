import Papa from "papaparse";

const REQUIRED_FIELDS = [
  "transaction_id",
  "user_id",
  "amount",
  "date_time",
  "location",
];

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function extractField(row, fieldName) {
  const matchedKey = Object.keys(row).find(
    (key) => normalizeKey(key) === fieldName,
  );
  return matchedKey ? row[matchedKey] : "";
}

function validateTransaction(transaction) {
  const errors = [];

  if (!transaction.transaction_id) {
    errors.push("Missing transaction_id");
  }

  if (!transaction.user_id) {
    errors.push("Missing user_id");
  }

  if (!transaction.location) {
    errors.push("Missing location");
  }

  if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
    errors.push("Invalid amount");
  }

  if (!transaction.date_time || Number.isNaN(Date.parse(transaction.date_time))) {
    errors.push("Invalid date_time");
  }

  return errors;
}

function mapRowToTransaction(row) {
  const mapped = {
    transaction_id: String(extractField(row, "transaction_id") || "").trim(),
    user_id: String(extractField(row, "user_id") || "").trim(),
    amount: Number(extractField(row, "amount")),
    date_time: String(extractField(row, "date_time") || "").trim(),
    location: String(extractField(row, "location") || "").trim(),
    device_id: String(extractField(row, "device_id") || "").trim(),
    ip_address: String(extractField(row, "ip_address") || "").trim(),
  };

  return mapped;
}

export function parseTransactionsFromCsvUrl(csvUrl) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          const firstError = results.errors[0];
          reject(
            new Error(
              `CSV Parsing Error: ${firstError?.message} at row ${firstError?.row || "unknown"}. File might be corrupted.`,
            ),
          );
          return;
        }

        const rows = Array.isArray(results.data) ? results.data : [];
        if (rows.length === 0) {
          reject(new Error("The CSV file is empty or has no readable rows."));
          return;
        }

        const validTransactions = [];
        const invalidRows = [];

        rows.forEach((row, index) => {
          const transaction = mapRowToTransaction(row);
          const rowErrors = validateTransaction(transaction);

          if (rowErrors.length > 0) {
            invalidRows.push({
              row: index + 2,
              issues: rowErrors,
            });
            return;
          }

          validTransactions.push(transaction);
        });

        // Strict Validation: Reject the entire CSV if any invalid rows are found
        if (invalidRows.length > 0) {
          const totalInvalid = invalidRows.length;
          const firstError = invalidRows[0];
          reject(
            new Error(
              `Upload Rejected: Found ${totalInvalid} invalid row(s). Row ${firstError.row} has issues: ${firstError.issues.join(", ")}. Please fix your CSV and try again.`,
            ),
          );
          return;
        }

        resolve({
          requiredFields: REQUIRED_FIELDS,
          validTransactions,
          invalidRows,
        });
      },
      error: (error) => {
        reject(new Error(`Unable to read CSV file: ${error.message}`));
      },
    });
  });
}
