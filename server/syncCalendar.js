// syncCalendar.js — ESM version (safe sync: only deletes iCal docs)
import express from "express";
import { db } from "../firebaseAdmin.js";
import verifyFirebaseToken from "../verifyFirebaseToken.js";
import ical from "node-ical";
import fs from "fs";
import path from "path";

const router = express.Router();

// ✅ Shared sync function for both route and cron
async function syncCalendarForUser(userId) {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const urls = Array.isArray(userData.icalUrls) && userData.icalUrls.length > 0
      ? userData.icalUrls
      : userData.icalUrl
        ? [userData.icalUrl]
        : [];

    if (urls.length === 0) {
      console.warn(`⚠️ No iCal URL(s) for user ${userId}`);
      return { success: false, error: "No iCal URLs found" };
    }

    const allEvents = [];

    for (const url of urls) {
      try {
        const parsed = await ical.async.fromURL(url);
        if (!parsed || typeof parsed !== "object") {
          console.warn(`⚠️ Invalid iCal response (non-object) for URL: ${url}`);
          continue;
        }
        const events = Object.values(parsed).filter(e => e.type === "VEVENT");
        allEvents.push(...events);
      } catch (err) {
        console.warn(`⚠️ Failed to fetch or parse iCal for ${url}`);
        if (err.response) console.warn(`  ↳ Status: ${err.response.status}`);
        else if (err.request) console.warn(`  ↳ No response received.`);
        else console.warn(`  ↳ Error: ${err.message}`);
      }
    }

    // Optional local backup
    const savePath = path.join("./user-data", userId, "cleanings.json");
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, JSON.stringify(allEvents, null, 2));

    const cleaningsRef = db.collection("users").doc(userId).collection("cleanings");

    // ❗Only delete previously imported iCal docs
    const icalDocs = await cleaningsRef.where("source", "==", "ical").get();
    const deletions = icalDocs.docs.map(d => d.ref.delete());
    await Promise.all(deletions);

    // Save each event (tag as iCal + use `start`)
    for (const event of allEvents) {
      const id = event.uid || `${event.start?.toISOString?.() || event.start}-${event.summary}`;
      await cleaningsRef.doc(id).set({
        id,
        property: event.summary || "Untitled",
        start: event.start instanceof Date ? event.start.toISOString() : event.start,
        end: event.end instanceof Date ? event.end.toISOString() : event.end,
        status: "Unassigned",
        primaryPhone: "",
        backupPhone: "",
        secondaryPhone: "",
        source: "ical",
      }, { merge: true });
    }

    return { success: true, count: allEvents.length };
  } catch (err) {
    console.error("❌ Failed to sync calendar:", err);
    return { success: false, error: "Internal error" };
  }
}

// ✅ Manual GET sync trigger
router.get("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const result = await syncCalendarForUser(userId);
  if (result.success) res.json(result);
  else res.status(500).json(result);
});

export default router;
export { syncCalendarForUser };
