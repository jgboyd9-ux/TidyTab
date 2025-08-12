// backend/sms.js
import express from "express";
import { db } from "../firebaseAdmin.js";
import { MessagingResponse } from "twilio";
import verifyFirebaseToken from "../verifyFirebaseToken.js";

const router = express.Router();

function normalizePhone(phone) {
  return phone.replace(/\D/g, ""); // strips +, dashes, spaces
}

// ✅ GET: Load SMS replies for authenticated user
router.get("/", verifyFirebaseToken, async (req, res) => {
  const userId = "WfQlu6K29CX6dj6e7euHxD7rCFd2"; // 🔧 Temporary hardcoded

  try {
    const snapshot = await db.collection("users").doc(userId).collection("smsReplies").get();
    const replies = {};
    snapshot.forEach(doc => {
      replies[doc.id] = doc.data(); // doc.id = cleaner phone number
    });
    res.json(replies);
  } catch (err) {
    console.error("❌ Failed to fetch sms replies:", err.message);
    res.status(500).json({ error: "Failed to load SMS replies" });
  }
});

// ✅ POST: Handle Twilio webhook for incoming SMS
router.post("/sms-reply", async (req, res) => {
  try {
    const rawFrom = req.body.From;
    const body = req.body.Body;
    const timestamp = new Date();

    const from = normalizePhone(rawFrom);
    console.log("📩 SMS Reply received:", { from, body });

    // 🔍 Look through all users to find a matching cleaner in their subcollection
    const usersSnapshot = await db.collection("users").get();
    let matchedUserId = null;
    let cleanerName = "";

    for (const doc of usersSnapshot.docs) {
      const cleanerDoc = await db
        .collection("users")
        .doc(doc.id)
        .collection("cleaners")
        .doc(from)
        .get();

      if (cleanerDoc.exists) {
        matchedUserId = doc.id;
        const cleanerData = cleanerDoc.data();
        console.log("✅ Cleaner found:", cleanerData);
        cleanerName = cleanerData.name || "";
        break;
      }
    }

    if (!matchedUserId) {
      console.warn(`⚠️ No user found with cleaner phone: ${from}`);
      const twiml = new MessagingResponse();
      twiml.message("❌ We couldn’t find your assignment.");
      return res.type("text/xml").send(twiml.toString());
    }

    // 💾 Save the reply under correct user ID
    const ref = db.collection("users").doc(matchedUserId).collection("smsReplies").doc(from);
    await ref.set(
      {
        messages: [{ body, timestamp }],
        lastMessage: body,
        lastUpdated: timestamp,
      },
      { merge: true }
    );

    // ✅ Personalized response
    const twiml = new MessagingResponse();
    twiml.message(`✅ Thanks${cleanerName ? ` ${cleanerName}` : ""}! You're confirmed for the job.`);
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("❌ Error in SMS handler:", err.message);
    res.status(500).send("Error");
  }
});

export default router;
