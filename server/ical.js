// server/ical.js — ESM version
import express from "express";
import { db } from "../firebaseAdmin.js";
import verifyFirebaseToken from "../verifyFirebaseToken.js";

const router = express.Router();

// ✅ GET current user's iCal URLs
router.get("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const doc = await db.collection("users").doc(userId).get();
    const data = doc.exists ? doc.data() : {};
    res.json({ icalUrls: data.icalUrls || [] });
  } catch (err) {
    console.error("❌ Failed to fetch iCal URLs:", err);
    res.status(500).json({ error: "Failed to fetch iCal URLs" });
  }
});

// ✅ POST (add) a new iCal URL to the list
router.post("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { icalUrl } = req.body;

  if (!icalUrl || typeof icalUrl !== "string") {
    return res.status(400).json({ error: "Invalid iCal URL" });
  }

  try {
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();
    const data = doc.exists ? doc.data() : {};
    const existing = Array.isArray(data.icalUrls) ? data.icalUrls : [];

    // Add only if not a duplicate
    if (!existing.includes(icalUrl)) {
      const updated = [...existing, icalUrl];
      await userRef.set({ icalUrls: updated }, { merge: true });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save iCal URL:", err);
    res.status(500).json({ error: "Failed to save iCal URL" });
  }
});

// ✅ DELETE iCal URL from the list
router.delete("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const { icalUrl } = req.body;

  if (!icalUrl || typeof icalUrl !== "string") {
    return res.status(400).json({ success: false, error: "Invalid iCal URL" });
  }

  try {
    const userRef = db.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const data = doc.data();
    const currentUrls = Array.isArray(data.icalUrls) ? data.icalUrls : [];
    const updatedUrls = currentUrls.filter(url => url !== icalUrl);

    await userRef.update({ icalUrls: updatedUrls });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to delete iCal URL:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
