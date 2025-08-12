// testScheduler.js
import dotenv from "dotenv";
dotenv.config();

import { db } from "../firebaseAdmin.js";

const userId = "WfQlu6K29CX6dj6e7euHxD7rCFd2"; // Your actual test user ID

async function debugCleanings() {
  const snapshot = await db
    .collection("users")
    .doc(userId)
    .collection("cleanings")
    .get();

  console.log(`🧹 Found ${snapshot.size} cleaning(s):`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`🧾 Firestore Doc ID: ${doc.id} → 'id' field: ${data.id}`);
  });
}

debugCleanings();
