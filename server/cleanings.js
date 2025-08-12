// server/cleanings.js — ESM version
import express from "express";
import { db } from "../firebaseAdmin.js";
import verifyFirebaseToken from "../verifyFirebaseToken.js";

const router = express.Router();

// ✅ Get all cleanings for current user
router.get("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const snapshot = await db.collection("users").doc(userId).collection("cleanings").get();
    const cleanings = [];
    snapshot.forEach(doc => cleanings.push(doc.data()));
    res.json(cleanings);
  } catch (err) {
    console.error("❌ Failed to fetch cleanings:", err.message);
    res.status(500).json({ error: "Failed to fetch cleanings" });
  }
});

export default router;
