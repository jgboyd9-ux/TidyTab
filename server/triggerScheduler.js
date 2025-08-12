// server/triggerScheduler.js
import express from "express";
const router = express.Router();

import { db } from "../firebaseAdmin.js";
import verifyFirebaseToken from "../verifyFirebaseToken.js";
import { scheduleCleanerMessages } from "./assignCleaners.js";

// ✅ POST route to manually trigger scheduling for current user's upcoming cleanings
router.post("/schedule-cleanings", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const snapshot = await db.collection("users").doc(userId).collection("cleanings").get();
    const now = new Date();

    const upcomingCleanings = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      // 🔧 Use `start` (not `date`) and ensure it’s in the future and has a primary
      .filter(c => c.start && new Date(c.start) > now && !!c.primaryPhone);

    // Log what we’re about to schedule for easier debugging
    console.log(`🧹 Found ${upcomingCleanings.length} upcoming cleaning(s) to schedule`);
    upcomingCleanings.forEach(c =>
      console.log(`  • ${c.id} @ ${c.property} — start: ${c.start}, primary: ${c.primaryPhone}`)
    );

    // ✅ Schedule each one
    upcomingCleanings.forEach(cleaning => {
      scheduleCleanerMessages(cleaning, userId);
    });

    res.json({ success: true, count: upcomingCleanings.length });
  } catch (err) {
    console.error("❌ Failed to schedule cleanings:", err);
    res.status(500).json({ error: "Failed to schedule cleanings" });
  }
});

export default router;
