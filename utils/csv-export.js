function escapeCsvCell(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  const needsQuotes =
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes("\r") ||
    stringValue.includes('"');

  if (!needsQuotes) return stringValue;
  return `"${stringValue.replaceAll('"', '""')}"`;
}

export function toCsv({ rows, columns }) {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");

  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.value(row))).join(","),
  );

  return [header, ...lines].join("\n");
}

export function downloadCsv({ filename, csvText }) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

