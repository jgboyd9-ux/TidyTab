// server/cleaners.js — ESM version
import express from "express";
import { db } from "../firebaseAdmin.js";
import verifyFirebaseToken from "../verifyFirebaseToken.js";
import fs from "fs";
import path from "path";

const router = express.Router();

// ✅ GET all cleaners for user
router.get("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const snapshot = await db.collection("users").doc(userId).collection("cleaners").get();
    const cleaners = {};
    snapshot.forEach(doc => {
      cleaners[doc.id] = doc.data();
    });
    res.json(cleaners);
  } catch (err) {
    console.error("❌ Failed to get cleaners:", err); // full error
    res.status(500).json({ error: "Failed to get cleaners" });
  }
});

// ✅ POST: save full set of cleaners for user (overwrites all)
router.post("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const newCleaners = req.body;

  try {
    const userCleanersRef = db.collection("users").doc(userId).collection("cleaners");

    // Delete existing cleaners
    const existing = await userCleanersRef.listDocuments();
    for (const doc of existing) {
      await doc.delete();
    }

    // Validate and add new cleaners
    for (const [id, data] of Object.entries(newCleaners)) {
      const name = (data.name || "").trim();
      if (!id.trim() || !name) {
        console.warn(`⚠️ Skipping invalid cleaner entry:`, { id, data });
        continue;
      }
      await userCleanersRef.doc(id).set(data);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save cleaners:", err); // full error
    res.status(500).json({ error: "Failed to save cleaners" });
  }
});

// ✅ DELETE a cleaner + cleanup references
router.delete("/:cleanerId", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const cleanerId = req.params.cleanerId;

  try {
    const cleanerRef = db.collection("users").doc(userId).collection("cleaners").doc(cleanerId);
    const doc = await cleanerRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Cleaner not found" });

    const cleaner = doc.data();

    // 🧼 Delete avatar file if not default
    if (cleaner.avatar && !cleaner.avatar.includes("default-avatar.png")) {
      const avatarPath = path.join(path.resolve(), cleaner.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }

    // 🧹 Clean up Firestore assignments
    const assignmentsRef = db.collection("users").doc(userId).collection("assignments");
    const assignmentsSnap = await assignmentsRef.get();
    for (const doc of assignmentsSnap.docs) {
      const assignment = doc.data();
      let updated = false;

      for (const slot of ["primary", "backup", "secondary"]) {
        if (assignment[slot] === cleanerId) {
          assignment[slot] = null;
          updated = true;
        }
      }

      if (updated) {
        await doc.ref.set(assignment);
      }
    }

    // ❌ Optional: Delete cleaner-related logs (SMS)
    const smsRef = db.collection("users").doc(userId).collection("smsReplies");
    const smsSnap = await smsRef.get();
    for (const doc of smsSnap.docs) {
      const reply = doc.data();
      if (reply.cleanerId === cleanerId) {
        await doc.ref.delete();
      }
    }

    const logRef = db.collection("users").doc(userId).collection("replyLog");
    const logSnap = await logRef.get();
    for (const doc of logSnap.docs) {
      const reply = doc.data();
      if (reply.cleanerId === cleanerId) {
        await doc.ref.delete();
      }
    }

    // Finally delete the cleaner
    await cleanerRef.delete();

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to delete cleaner:", err); // full error
    res.status(500).json({ error: "Failed to delete cleaner" });
  }
});

export default router;
