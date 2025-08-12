// determineUrgency.js — ESM version

function determineUrgency(minutesUntilCleaning) {
  if (minutesUntilCleaning <= 360) return "ASAP";
  if (minutesUntilCleaning <= 1440) return "critical";
  if (minutesUntilCleaning <= 2880) return "high";
  if (minutesUntilCleaning <= 4320) return "medium";
  return "low";
}

export { determineUrgency };
