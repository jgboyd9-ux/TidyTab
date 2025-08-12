// server/utils/timeUtils.js — accepts minutes OR a date/ISO string; supports ASAP

/**
 * determineUrgency(input)
 * - If input is a number -> treated as minutesUntilCleaning
 * - If input is a string/Date -> diff from now in minutes
 *
 * Buckets:
 *   <= 360  min  → "ASAP"
 *   <= 1440 min  → "critical"
 *   <= 2880 min  → "high"
 *   <= 4320 min  → "medium"
 *   >  4320 min  → "low"
 */
export function determineUrgency(input) {
  let minutesUntilCleaning;

  if (typeof input === "number" && Number.isFinite(input)) {
    minutesUntilCleaning = input;
  } else {
    const now = new Date();
    const when = new Date(input);
    minutesUntilCleaning = Math.round((when - now) / 60000);
  }

  if (minutesUntilCleaning <= 360) return "ASAP";
  if (minutesUntilCleaning <= 1440) return "critical";
  if (minutesUntilCleaning <= 2880) return "high";
  if (minutesUntilCleaning <= 4320) return "medium";
  return "low";
}
