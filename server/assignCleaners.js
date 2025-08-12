// assignCleaners.js — role-agnostic messaging, per-phone invite tracking (canonical 10-digit)
// ✅ ASAP uses relative schedule from primary initial; others use original (before-start) schedule.
// ✅ On first primary invite for a cycle, set inviteCycleStartedAt BEFORE sending and record primary in invitedPhones.
// ✅ Guards every scheduled job: skip if Firestore status is already "Confirmed".
// ✅ Cancel routine exported and used by index.js.

import fs from 'fs';
import schedule from 'node-schedule';
import { urgencyLevels } from './cleaningAssignmentRules.js';
import { determineUrgency } from './utils/timeUtils.js'; // expects minutesUntilCleaning
import { sendSMS } from './twilioService.js';
import { db, admin } from '../firebaseAdmin.js';

const scheduledJobsFile = './server/scheduledJobs.json';

// Load or initialize scheduled jobs tracker
let scheduledJobs = {};
if (fs.existsSync(scheduledJobsFile)) {
  try {
    scheduledJobs = JSON.parse(fs.readFileSync(scheduledJobsFile, 'utf-8'));
  } catch {
    console.error('❌ Failed to parse scheduledJobs.json');
  }
}

function saveScheduledJobs() {
  fs.writeFileSync(scheduledJobsFile, JSON.stringify(scheduledJobs, null, 2));
}

// 🔢 Digits only
function digits(n) {
  return (n || '').toString().replace(/\D/g, '');
}

// 📞 Canonical 10-digit US number (strip leading 1 if present)
function canonicalUS(n) {
  let d = digits(n);
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d; // returns 10 digits or empty string
}

// ➕ Convert canonical 10-digit back to E.164 (+1XXXXXXXXXX)
function toE164FromCanonical10(d10) {
  const d = digits(d10);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d10; // fallback as-is
}

/** 📨 Unified invite message (identical for everyone; no “backup” wording) */
function buildUnifiedInviteMessage(cleaning) {
  const property = cleaning?.property || 'the property';
  const whenDate = cleaning?.start
    ? new Date(cleaning.start)
    : cleaning?.date
    ? new Date(cleaning.date)
    : null;
  const when =
    whenDate && !isNaN(whenDate)
      ? whenDate.toLocaleString()
      : 'the scheduled time';
  return `New cleaning at ${property} on ${when}. Reply YES to accept or NO to decline.`;
}

/** 🧾 Mark a phone as invited on the cleaning doc (per‑phone, canonical 10-digit key) */
async function markInvited(userId, cleaningId, phoneNumber) {
  try {
    const d10 = canonicalUS(phoneNumber);
    if (!d10) return;
    const ref = db.collection('users').doc(userId).collection('cleanings').doc(cleaningId);
    await ref.set(
      { invitedPhones: { [d10]: admin.firestore.FieldValue.serverTimestamp() } },
      { merge: true }
    );
  } catch (e) {
    console.warn('⚠️ Failed to mark invited phone:', e.message);
  }
}

// 🔍 Live guard: skip scheduled sends if already confirmed in Firestore
async function isCleaningConfirmedInDb(userId, cleaningId) {
  try {
    const snap = await db.collection('users').doc(userId).collection('cleanings').doc(cleaningId).get();
    const data = snap.exists ? snap.data() : null;
    return data?.status === 'Confirmed';
  } catch (e) {
    console.warn('⚠️ Failed to check confirmed status:', e.message);
    return false;
  }
}

// TODO: Replace with Firestore-driven checks if you later track per-role responses
function hasCleanerResponded(cleaningId, role) {
  console.log(`🧪 Simulating check: has ${role} responded for ${cleaningId}? → false`);
  return false;
}
function isAnyCleanerConfirmed(cleaningId) {
  console.log(`🧪 Simulating check: is anyone confirmed for ${cleaningId}? → false`);
  return false;
}

/**
 * Exported API accepts userId so we can record invited phones in Firestore.
 */
export async function scheduleCleanerMessages(cleaning, userId) {
  const now = Date.now();
  const startTime = new Date(cleaning.start).getTime();
  const minutesUntilCleaning = Math.round((startTime - now) / 60000);

  // ✅ Use minutesUntilCleaning (supports ASAP)
  const urgency = determineUrgency(minutesUntilCleaning);
  const rules = urgencyLevels[urgency] || urgencyLevels.low;

  console.log(`📊 Urgency: ${urgency} (${minutesUntilCleaning} min until cleaning)`);

  // Prevent duplicate scheduling per cleaning
  if (scheduledJobs[cleaning.id] === cleaning.start) {
    console.log(`⚠️ Already scheduled messages for cleaning ID ${cleaning.id}`);
  } else {
    scheduledJobs[cleaning.id] = cleaning.start;
    saveScheduledJobs();
  }

  const jobIdPrefix = `cleaning_${cleaning.id}`;

  // ===== Helpers =====
  // Relative to "now" (primary initial send time)
  const baseTime = new Date();
  const scheduleRelative = (label, offsetMin, action) => {
    const time = new Date(baseTime.getTime() + offsetMin * 60000);
    const minutesFromNow = Math.round((time - Date.now()) / 60000);
    if (minutesFromNow <= 0) {
      console.log(`⏩ Skipped past job ${jobIdPrefix}_${label}_${offsetMin} (time already passed)`);
      return;
    }
    const jobName = `${jobIdPrefix}_${label}_${offsetMin}`;
    schedule.scheduleJob(jobName, time, action);
    console.log(`📆 Scheduled job ${jobName} at ${time.toLocaleString()} (in ${minutesFromNow} min)`);
  };

  // Relative to start time (X minutes BEFORE start)
  const scheduleBeforeStart = (label, offsetMinBeforeStart, action) => {
    const time = new Date(startTime - offsetMinBeforeStart * 60000);
    const minutesFromNow = Math.round((time - Date.now()) / 60000);
    if (minutesFromNow <= 0) {
      console.log(`⏩ Skipped past job ${jobIdPrefix}_${label}_${offsetMinBeforeStart} (time already passed)`);
      return;
    }
    const jobName = `${jobIdPrefix}_${label}_${offsetMinBeforeStart}`;
    schedule.scheduleJob(jobName, time, action);
    console.log(`📆 Scheduled job ${jobName} at ${time.toLocaleString()} (in ${minutesFromNow} min)`);
  };

  const msg = buildUnifiedInviteMessage(cleaning);

  // ✅ Initial invite (only once) — set cycle start BEFORE sending; record primary invited
  if (!scheduledJobs[`${cleaning.id}_starterSent`]) {
    // NEW: skip initial if it somehow got confirmed already
    if (await isCleaningConfirmedInDb(userId, cleaning.id)) {
      console.log(`ℹ️ Skipping initial invite for ${cleaning.id} (already Confirmed)`);
    } else {
      const d10 = canonicalUS(cleaning.primaryPhone);
      if (d10 && userId) {
        try {
          const ref = db.collection('users').doc(userId).collection('cleanings').doc(cleaning.id);
          // Start a fresh cycle and record the primary as invited (server timestamps)
          await ref.update({ invitedPhones: admin.firestore.FieldValue.delete() }).catch(() => {});
          await ref.set(
            {
              inviteCycleStartedAt: admin.firestore.FieldValue.serverTimestamp(),
              invitedPhones: { [d10]: admin.firestore.FieldValue.serverTimestamp() },
            },
            { merge: true }
          );
        } catch (e) {
          console.warn('⚠️ Failed to set inviteCycleStartedAt or invitedPhones for primary:', e.message);
        }
        // Send after we mark the cycle
        await sendSMS(toE164FromCanonical10(d10), msg);
      } else if (d10) {
        await sendSMS(toE164FromCanonical10(d10), msg);
      } else {
        console.warn(`⚠️ No valid primaryPhone set for cleaning ${cleaning.id}`);
      }
    }
    scheduledJobs[`${cleaning.id}_starterSent`] = true;
    saveScheduledJobs();
  }

  if (urgency === 'ASAP') {
    // ===== ASAP cadence (all relative to the primary initial send) =====

    // t +10m: primary reminder
    scheduleRelative('primaryReminder', 10, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!hasCleanerResponded(cleaning.id, 'primary')) {
        const d10 = canonicalUS(cleaning.primaryPhone);
        if (d10) await sendSMS(toE164FromCanonical10(d10), `Reminder: ${msg}`);
      }
    });

    // t +10m: backup initial (if primary hasn't responded)
    scheduleRelative('backupInvite', 10, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!hasCleanerResponded(cleaning.id, 'primary')) {
        const d10 = canonicalUS(cleaning.backupPhone);
        if (d10) {
          await sendSMS(toE164FromCanonical10(d10), msg);
          if (userId) await markInvited(userId, cleaning.id, d10);
        }
      }
    });

    // t +20m: backup reminder (if backup hasn't responded)
    scheduleRelative('backupReminder', 20, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!hasCleanerResponded(cleaning.id, 'backup')) {
        const d10 = canonicalUS(cleaning.backupPhone);
        if (d10) await sendSMS(toE164FromCanonical10(d10), `Reminder: ${msg}`);
      }
    });

    // t +20m: secondary initial (if primary & backup haven't responded)
    if (cleaning.secondaryPhone) {
      scheduleRelative('secondaryInvite', 20, async () => {
        if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
        if (
          !hasCleanerResponded(cleaning.id, 'primary') &&
          !hasCleanerResponded(cleaning.id, 'backup')
        ) {
          const d10 = canonicalUS(cleaning.secondaryPhone);
          if (d10) {
            await sendSMS(toE164FromCanonical10(d10), msg);
            if (userId) await markInvited(userId, cleaning.id, d10);
          }
        }
      });

      // t +30m: secondary reminder (if secondary hasn't responded)
      scheduleRelative('secondaryReminder', 30, async () => {
        if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
        if (!hasCleanerResponded(cleaning.id, 'secondary')) {
          const d10 = canonicalUS(cleaning.secondaryPhone);
          if (d10) await sendSMS(toE164FromCanonical10(d10), `Reminder: ${msg}`);
        }
      });
    }

    // t +60m: final escalation (relative to primary initial)
    scheduleRelative('finalEscalation', 60, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!isAnyCleanerConfirmed(cleaning.id)) {
        sendSMS('MARKETPLACE', `URGENT: No cleaner confirmed for ${cleaning.property}. Broadcasting to network.`);
      }
    });
  } else {
    // ===== NON‑ASAP: original model (relative to start time with rules) =====

    // Primary reminder X min before start
    scheduleBeforeStart('reminder', rules.reminder, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!hasCleanerResponded(cleaning.id, 'primary')) {
        const d10 = canonicalUS(cleaning.primaryPhone);
        if (d10) await sendSMS(toE164FromCanonical10(d10), `Reminder: ${msg}`);
      }
    });

    // Backup initial X min before start
    scheduleBeforeStart('backupInvite', rules.backupInvite, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!hasCleanerResponded(cleaning.id, 'primary')) {
        const d10 = canonicalUS(cleaning.backupPhone);
        if (d10) {
          await sendSMS(toE164FromCanonical10(d10), msg);
          if (userId) await markInvited(userId, cleaning.id, d10);
        }
      }
    });

    // Backup reminder X min before start
    scheduleBeforeStart('backupReminder', rules.backupReminder, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!hasCleanerResponded(cleaning.id, 'backup')) {
        const d10 = canonicalUS(cleaning.backupPhone);
        if (d10) await sendSMS(toE164FromCanonical10(d10), `Reminder: ${msg}`);
      }
    });

    // Secondary initial X min before start
    if (cleaning.secondaryPhone) {
      scheduleBeforeStart('secondaryInvite', rules.secondaryInvite, async () => {
        if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
        if (
          !hasCleanerResponded(cleaning.id, 'primary') &&
          !hasCleanerResponded(cleaning.id, 'backup')
        ) {
          const d10 = canonicalUS(cleaning.secondaryPhone);
          if (d10) {
            await sendSMS(toE164FromCanonical10(d10), msg);
            if (userId) await markInvited(userId, cleaning.id, d10);
          }
        }
      });

      // Secondary reminder: reuse backupReminder offset unless you add a distinct value
      // Secondary reminder uses its own offset
      scheduleBeforeStart('secondaryReminder', rules.secondaryReminder, async () => {
        if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
        if (!hasCleanerResponded(cleaning.id, 'secondary')) {
          const d10 = canonicalUS(cleaning.secondaryPhone);
          if (d10) await sendSMS(toE164FromCanonical10(d10), `Reminder: ${msg}`);
        }
      });
    }

    // Final escalation X min before start (original behavior)
    scheduleBeforeStart('finalEscalation', rules.finalEscalation, async () => {
      if (await isCleaningConfirmedInDb(userId, cleaning.id)) return;
      if (!isAnyCleanerConfirmed(cleaning.id)) {
        sendSMS('MARKETPLACE', `URGENT: No cleaner confirmed for ${cleaning.property}. Broadcasting to network.`);
      }
    });
  }
}

/** 🧹 Cancel ANY pending scheduled jobs for a given cleaning */
export function cancelScheduledJobsForCleaning(cleaningId) {
  const prefix = `cleaning_${cleaningId}_`;
  const jobs = Object.keys(schedule.scheduledJobs).filter((k) => k.startsWith(prefix));
  jobs.forEach((k) => {
    try {
      schedule.scheduledJobs[k].cancel();
      delete schedule.scheduledJobs[k];
    } catch (e) {
      console.warn(`⚠️ Failed to cancel job ${k}:`, e.message);
    }
  });

  delete scheduledJobs[cleaningId];
  delete scheduledJobs[`${cleaningId}_starterSent`];
  saveScheduledJobs();

  console.log(`🧹 Cancelled ${jobs.length} scheduled job(s) for ${cleaningId}`);
}

export async function markInvitedPhoneForCleaning(userId, cleaningId, phoneNumber) {
  return markInvited(userId, cleaningId, phoneNumber);
}
