// cleaningAssignmentRules.js — final urgency rules with realistic timing

export const urgencyLevels = {
  low: {
    reminder: 360,             // 6h
    backupInvite: 1080,        // 18h
    backupReminder: 1440,      // 24h (reminder after backup invite)
    secondaryInvite: 1800,     // 30h
    secondaryReminder: 1440,   // 24h (after secondary invite; same as backupReminder)
    finalEscalation: 2160      // 36h
  },
  medium: {
    reminder: 180,             // 3h
    backupInvite: 360,         // 6h
    backupReminder: 540,       // 9h
    secondaryInvite: 720,      // 12h
    secondaryReminder: 540,    // 9h
    finalEscalation: 900       // 15h
  },
  high: {
    reminder: 60,              // 1h
    backupInvite: 120,         // 2h
    backupReminder: 180,       // 3h
    secondaryInvite: 240,      // 4h
    secondaryReminder: 180,    // 3h
    finalEscalation: 300       // 5h
  },
  critical: {
    reminder: 15,              // 15m
    backupInvite: 45,          // 45m
    backupReminder: 90,        // 1.5h
    secondaryInvite: 120,      // 2h
    secondaryReminder: 90,     // 1.5h
    finalEscalation: 180       // 3h
  },
  ASAP: {
    // All are relative to the initial primary send (not "before start")
    reminder: 10,              // +10m (primary reminder)
    backupInvite: 10,          // +10m (backup initial if primary silent)
    backupReminder: 20,        // +20m
    secondaryInvite: 20,       // +20m
    secondaryReminder: 30,     // +30m
    finalEscalation: 60        // +60m
  },
};
