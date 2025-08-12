// server/assignments.js — ESM version
import express from "express";
import { db } from "../firebaseAdmin.js";
import verifyFirebaseToken from "../verifyFirebaseToken.js";

const router = express.Router();

// ✅ Get all assignments for the user
router.get("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;

  try {
    const snapshot = await db.collection("users").doc(userId).collection("assignments").get();
    const assignments = {};
    snapshot.forEach(doc => {
      assignments[doc.id] = doc.data(); // doc.id is property address
    });
    res.json(assignments);
  } catch (err) {
    console.error("❌ Failed to fetch assignments:", err.message);
    res.status(500).json({ error: "Failed to get assignments" });
  }
});

// ✅ Overwrite all assignments + sync them into cleanings
router.post("/", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const newAssignments = req.body;

  try {
    const userRef = db.collection("users").doc(userId);
    const assignmentsRef = userRef.collection("assignments");

    // Delete old assignments
    const existing = await assignmentsRef.listDocuments();
    for (const doc of existing) {
      await doc.delete();
    }

    // Add new assignments
    for (const [property, slots] of Object.entries(newAssignments)) {
      await assignmentsRef.doc(property).set(slots);
    }

    // 🔁 Sync to matching cleanings using writeBatch per property
    for (const [property, roles] of Object.entries(newAssignments)) {
      const cleaningsSnapshot = await userRef
        .collection("cleanings")
        .where("property", "==", property)
        .get();

      const batch = db.batch();
      let updatedCount = 0;

      cleaningsSnapshot.forEach(doc => {
        const update = {};

        // Prepare update fields
        if (typeof roles.primary === "string") update.primaryPhone = roles.primary;
        if (typeof roles.backup === "string") update.backupPhone = roles.backup;
        if (typeof roles.secondary === "string") update.secondaryPhone = roles.secondary;

        // Determine status
        const hasPrimary = !!update.primaryPhone;
        const hasBackup = !!update.backupPhone;

        if (hasPrimary && hasBackup) {
          update.status = "Assigned";
        } else if (hasPrimary || hasBackup) {
          update.status = "Partial";
        } else {
          update.status = "Unassigned";
        }

        // ✅ Only update if something actually changed
        const existing = doc.data();
        const shouldUpdate = Object.entries(update).some(
          ([key, value]) => existing[key] !== value
        );

        if (shouldUpdate) {
          batch.update(doc.ref, update);
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        await batch.commit();
      }

      console.log(`📌 ${updatedCount} cleanings updated for "${property}"`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save assignments:", err.message);
    res.status(500).json({ error: "Failed to save assignments" });
  }
});

// ✅ Delete a specific property assignment
router.delete("/:propertyId", verifyFirebaseToken, async (req, res) => {
  const userId = req.user.uid;
  const propertyId = req.params.propertyId;

  try {
    await db.collection("users").doc(userId).collection("assignments").doc(propertyId).delete();
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to delete assignment:", err.message);
    res.status(500).json({ error: "Failed to delete assignment" });
  }
});

export default router;
