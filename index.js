// Airbnb Cleaner Coordination MVP (Backend + SMS Logic)
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import ical from "node-ical";
import twilio from "twilio";
import fs from "fs";
import path from "path";
import cron from "node-cron";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";

import verifyFirebaseToken from "./verifyFirebaseToken.js";
import { scheduleCleanerMessages, cancelScheduledJobsForCleaning } from "./server/assignCleaners.js";
import cleanersRoutes from "./server/cleaners.js";
import assignmentsRoutes from "./server/assignments.js";
import cleaningsRoutes from "./server/cleanings.js";
import icalRoutes from "./server/ical.js";
import syncCalendarRoutes, { syncCalendarForUser } from "./server/syncCalendar.js";
import triggerSchedulerRoutes from "./server/triggerScheduler.js";
import { db } from "./firebaseAdmin.js";
import {
  setUserICalUrl,
  getUserICalUrl,
  loadUserData,
} from "./server/utils/userDataUtils.js";
import { sendSMS } from "./server/twilioService.js";

// ✅ Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 3000;

app.use(cors({ origin: "http://localhost:3001" }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Helpers for phone normalization
const digits = (n) => (n || "").toString().replace(/\D/g, "");
const canonical10 = (n) => {
  let d = digits(n);
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
};
const toE164 = (n) => {
  const d10 = canonical10(n);
  return d10?.length === 10 ? `+1${d10}` : n;
};

// 🕓 Timezone formatting for outgoing SMS timestamps
const DEFAULT_TZ = process.env.APP_TIMEZONE || "America/New_York";
function formatWhen(whenLike, tz = DEFAULT_TZ) {
  const d = whenLike ? new Date(whenLike) : null;
  if (!d || isNaN(d)) return "the scheduled time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

// 🔔 Build messages
function buildUnifiedInviteMessage(job) {
  const property = job?.property || "the property";
  const when = formatWhen(job?.start || job?.date);
  return `New cleaning at ${property} on ${when}. Reply YES to accept or NO to decline.`;
}
function buildThanksConfirmation(cleanerName) {
  return `✅ Thanks${cleanerName ? ` ${cleanerName}` : ""}! You're confirmed for the job.`;
}
function buildSlotFilled(job) {
  const property = job?.property || "the property";
  const when = formatWhen(job?.start || job?.date);
  return `The shift at ${property} on ${when} has been filled. Thank you for your time and we'll reach out again soon.`;
}

// ✅ Rate limiter
const smsLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

// 🔄 Timestamp helper
function toJSDate(maybeTs) {
  if (!maybeTs) return null;
  if (typeof maybeTs.toDate === "function") return maybeTs.toDate(); // Firestore Timestamp
  const d = new Date(maybeTs);
  return isNaN(d) ? null : d;
}

// === Slot-filled notifier (only phones invited in THIS cycle; never the confirmer) ===
async function notifyInvitedSlotFilled(userId, job, confirmerCanonical10) {
  try {
    const cleaningRef = db.collection("users").doc(userId).collection("cleanings").doc(job.firestoreId);
    const snap = await cleaningRef.get();
    const data = snap.exists ? snap.data() : {};

    const invited = data.invitedPhones || {}; // { '8605551234': Timestamp/ISO }
    const cycleStart = toJSDate(data.inviteCycleStartedAt);

    // If no cycle start yet, be conservative: notify nobody
    if (!cycleStart) {
      console.log("ℹ️ Skipping slot-filled notifications: no inviteCycleStartedAt yet.");
      return;
    }

    const numbersToNotify = Object.entries(invited)
      .filter(([d10, ts]) => {
        if (d10 === confirmerCanonical10) return false; // exclude confirmer
        const invitedAt = toJSDate(ts);
        return invitedAt && invitedAt >= cycleStart; // Only current cycle
      })
      .map(([d10]) => `+1${d10}`);

    if (!numbersToNotify.length) {
      console.log("ℹ️ No invited candidates from the current cycle to notify.");
      return;
    }

    console.log(`🔔 Notifying invited candidate(s) slot filled: ${numbersToNotify.join(", ")}`);
    for (const e164 of numbersToNotify) {
      await sendSMS(e164, buildSlotFilled(job));
    }
  } catch (e) {
    console.warn("⚠️ Failed to notify invited about slot filled:", e.message);
  }
}

// === Job selection logic when an SMS comes in ===
function chooseBestJobForReply(jobs, fromD10) {
  const now = new Date();

  const invitedThisCycle = [];
  const upcomingRelevant = [];
  const anyMatch = [];

  for (const job of jobs) {
    const start = job.start ? new Date(job.start) : job.date ? new Date(job.date) : null;
    const invited = job.invitedPhones || {};
    const cycleStart = toJSDate(job.inviteCycleStartedAt);
    const invitedAt = invited[fromD10] ? toJSDate(invited[fromD10]) : null;
    const included =
      [job.primaryPhone, job.backupPhone, job.secondaryPhone]
        .filter(Boolean)
        .map(canonical10)
        .includes(fromD10);

    if (!included) continue;

    const base = {
      ...job,
      _start: start,
      _invitedThisCycle: !!(cycleStart && invitedAt && invitedAt >= cycleStart),
    };

    if (base._invitedThisCycle) invitedThisCycle.push(base);
    else if (start && start > now && job.status !== "Confirmed" && job.status !== "Declined")
      upcomingRelevant.push(base);
    else anyMatch.push(base);
  }

  const bySoonestStart = (a, b) => {
    if (!a._start && !b._start) return 0;
    if (!a._start) return 1;
    if (!b._start) return -1;
    return a._start - b._start;
  };

  if (invitedThisCycle.length) return invitedThisCycle.sort(bySoonestStart)[0];
  if (upcomingRelevant.length) return upcomingRelevant.sort(bySoonestStart)[0];
  if (anyMatch.length) return anyMatch.sort(bySoonestStart)[0];
  return null;
}

// ✅ SMS Reply Endpoint
app.post("/sms-reply", smsLimiter, async (req, res) => {
  // Normalize sender
  let from = req.body.From?.replace(/\D/g, "").trim();
  if (from?.startsWith("1") && from.length === 11) from = from.slice(1);
  const fromD10 = canonical10(from);
  const fromE164 = fromD10 ? `+1${fromD10}` : undefined;

  const bodyRaw = req.body.Body?.trim();
  const body = bodyRaw?.toLowerCase();

  let matchedJob = null;
  let matchedUserId = null;

  try {
    console.log("📩 Incoming SMS Reply");
    console.log(`   ↳ From: ${from}`);
    console.log(`   ↳ Raw Body: ${bodyRaw}`);
    console.log(`   ↳ Normalized Body: ${body}`);

    // Gather candidate jobs across users
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const cleaningsRef = db.collection("users").doc(userId).collection("cleanings");
      const cleaningsSnapshot = await cleaningsRef.get();

      const candidates = cleaningsSnapshot.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
      const best = chooseBestJobForReply(candidates, fromD10);

      if (best) {
        matchedJob = best;
        matchedUserId = userId;
        break;
      }
    }

    // Fallback for dev curl
    if (!matchedUserId) {
      matchedUserId = process.env.FALLBACK_FIREBASE_UID || "WfQIu6K29CX6dj6e7euHxD7rCFd2";
      console.warn("⚠️ Using fallback UID for curl test:", matchedUserId);
    }

    // Lookup cleaner name
    let cleanerName = "";
    if (matchedUserId) {
      const cleanersRef = db.collection("users").doc(matchedUserId).collection("cleaners");
      const snapshot = await cleanersRef.get();

      snapshot.forEach((doc) => {
        const docId = doc.id.replace(/\D/g, "");
        if (docId.endsWith(fromD10)) {
          const data = doc.data();
          if (typeof data.name === "string") {
            cleanerName = data.name.trim().replace(/^"(.*)"$/, "$1");
          }
        }
      });
    }

    if (matchedJob && matchedUserId) {
      const userRef = db.collection("users").doc(matchedUserId);
      const jobRef = userRef.collection("cleanings").doc(matchedJob.firestoreId);

      if (body === "yes") {
        // 1) Confirm to the responder
        if (fromE164) {
          await sendSMS(fromE164, buildThanksConfirmation(cleanerName));
        }

        // 2) Update job status
        console.log(`   🔄 Updating job status to "Confirmed"`);
        await jobRef.update({ status: "Confirmed" });

        // 3) Cancel pending jobs for THIS cleaning
        cancelScheduledJobsForCleaning(matchedJob.firestoreId);

        // 4) Notify invited others (current cycle only), excluding confirmer
        await notifyInvitedSlotFilled(matchedUserId, matchedJob, fromD10);

        // 5) Log reply
        await logSMSReplyToFirestore(matchedUserId, fromD10, body, matchedJob);

        // 6) Empty TwiML response (already replied via REST)
        const empty = new twilio.twiml.MessagingResponse();
        res.type("text/xml").send(empty.toString());
        return;
      }

      if (body === "no") {
        console.log(`   🔄 Updating job status to "Declined"`);
        await jobRef.update({ status: "Declined" });

        await logSMSReplyToFirestore(matchedUserId, fromD10, body, matchedJob);

        const unifiedMessage = buildUnifiedInviteMessage(matchedJob);

        const nextPhones = [matchedJob.backupPhone, matchedJob.secondaryPhone]
          .map(canonical10)
          .filter(Boolean);

        if (nextPhones.length) {
          const next = `+1${nextPhones[0]}`;
          console.log(`   📣 Declined → inviting next candidate: ${next}`);
          await sendSMS(next, unifiedMessage);
          try {
            await jobRef.set(
              { invitedPhones: { [nextPhones[0]]: new Date().toISOString() } },
              { merge: true }
            );
          } catch {}
        } else {
          console.log("   ⚠️ No backup/secondary available to invite");
        }

        const twiml = new twilio.twiml.MessagingResponse();
        twiml.message("❌ No worries. We'll find someone else.");
        res.type("text/xml").send(twiml.toString());
        return;
      }

      // Any other message: log + guide
      await logSMSReplyToFirestore(matchedUserId, fromD10, body, matchedJob);
    }

    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("🤔 Got your message. Please reply YES to accept or NO to decline.");
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error(`[ERROR /sms-reply]: ${err.message}`, err);
    res.status(500).send("Internal Server Error");
  }
});

// 🔁 Log SMS Replies
async function logSMSReplyToFirestore(userId, fromD10, body, matchedJob) {
  const userRef = db.collection("users").doc(userId);
  const smsRef = userRef.collection("smsReplies").doc(fromD10);
  const doc = await smsRef.get();
  const previous = doc.exists ? doc.data().messages || [] : [];
  const updated = [...previous, { message: body, timestamp: new Date().toISOString() }];
  await smsRef.set({ messages: updated }, { merge: true });

  await userRef.collection("replyLog").add({
    cleaner: fromD10,
    response: body,
    jobId: matchedJob?.id || matchedJob?.firestoreId || null,
    timestamp: new Date().toISOString(),
  });
}

// 🗂 Routes
app.use("/avatars", express.static(path.join(__dirname, "public", "avatars")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/cleaners", cleanersRoutes);
app.use("/assignments", assignmentsRoutes);
app.use("/api/cleanings", cleaningsRoutes);
app.use("/ical", icalRoutes);
app.use("/sync-calendar", syncCalendarRoutes);
app.use("/api", triggerSchedulerRoutes);

// 📤 Avatar Upload
const uploadsDir = path.join(__dirname, "uploads", "avatars");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${req.file?.originalname || 'avatar'}`),
});
const upload = multer({ storage });

app.post("/upload-avatar", upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  res.json({ success: true, avatarUrl });
});

// 🔁 iCal API Endpoints
app.post("/api/user/ical", verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { icalUrl } = req.body;
    if (!icalUrl) return res.status(400).json({ success: false, message: "Missing iCal URL" });

    const docRef = db.collection("icalUrls").doc(userId);
    const existing = (await docRef.get()).data()?.urls || [];
    if (!existing.includes(icalUrl)) {
      await docRef.set({ urls: [...existing, icalUrl] }, { merge: true });
    }

    console.log(`✅ Saved iCal URL for user: ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[ERROR /api/user/ical POST]: ${err.message}`, err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/user/ical", verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const doc = await db.collection("icalUrls").doc(userId).get();
    const urls = doc.exists ? doc.data().urls || [] : [];
    res.json({ success: true, icalUrls: urls });
  } catch (err) {
    console.error(`[ERROR /api/user/ical GET]: ${err.message}`, err);
    res.status(500).json({ success: false });
  }
});

app.delete("/api/user/ical", verifyFirebaseToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { icalUrl } = req.body;
    if (!icalUrl) return res.status(400).json({ success: false, message: "Missing iCal URL to delete" });

    const docRef = db.collection("icalUrls").doc(userId);
    const existing = (await docRef.get()).data()?.urls || [];
    const updated = existing.filter((url) => url !== icalUrl);
    await docRef.set({ urls: updated }, { merge: true });

    res.json({ success: true });
  } catch (err) {
    console.error(`[ERROR /api/user/ical DELETE]: ${err.message}`, err);
    res.status(500).json({ success: false });
  }
});

// ⏰ Cron Sync
cron.schedule("*/15 * * * *", async () => {
  console.log("⏳ Running scheduled calendar sync...");
  const allUsers = loadUserData();
  for (const userId of Object.keys(allUsers)) {
    try {
      await syncCalendarForUser(userId);
      console.log(`🔁 Synced calendar for ${userId}`);
    } catch (err) {
      console.error(`❌ Sync failed for ${userId}:`, err);
    }
  }
});

// ✅ Health Check
app.get("/", (_, res) => {
  res.send("✅ Server is running and responding!");
});

app.listen(port, () => {
  console.log(`✅ Backend running at http://localhost:${port}`);
});
