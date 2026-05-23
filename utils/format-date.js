/**
 * Formats a date value (string or Firestore Timestamp) for display.
 * If the value is a string that looks like a UTC timestamp (ends with Z),
 * it returns the UTC representation to match the CSV source exactly.
 * Otherwise, it uses the local timezone.
 * 
 * @param {string|object} value - Date string or Firestore Timestamp
 * @returns {string} Formatted date
 */
export function formatDate(value) {
  try {
    if (!value) return "—";

    // Handle Firestore Timestamps
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }

    // Handle Date objects or strings
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    // If it's a string that explicitly specifies UTC (Z), show it in UTC
    if (typeof value === "string" && (value.endsWith("Z") || value.includes("+00:00"))) {
      return date.toISOString().replace("T", " ").split(".")[0] + " UTC";
    }

    // Otherwise use local browser time
    return date.toLocaleString();
  } catch {
    return "—";
  }
}
