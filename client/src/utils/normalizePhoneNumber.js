export default function normalizePhoneNumber(number) {
  number = number.trim();
  if (number.startsWith("+1")) return number;
  if (number.startsWith("1") && number.length === 11) return `+${number}`;
  if (number.length === 10) return `+1${number}`;
  return number;
}
