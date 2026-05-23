export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value ?? "");
  return amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
