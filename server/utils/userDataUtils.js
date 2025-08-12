// userDataUtils.js — ESM version

import fs from "fs";
import path from "path";
import { db } from "../../firebaseAdmin.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

// __dirname workaround in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const userDataPath = path.join(__dirname, "..", "userData.json");

function loadUserData() {
  return fs.existsSync(userDataPath)
    ? JSON.parse(fs.readFileSync(userDataPath, "utf-8"))
    : {};
}

function saveUserData(data) {
  fs.writeFileSync(userDataPath, JSON.stringify(data, null, 2));
}

// 🔄 Old file-based setter (still works if needed)
function setUserICalUrlFile(userId, icalUrl) {
  const data = loadUserData();
  data[userId] = { ...data[userId], icalUrl };
  saveUserData(data);
}

// 🔄 Old file-based getter (still works if needed)
function getUserICalUrlFile(userId) {
  const data = loadUserData();
  return data[userId]?.icalUrl || null;
}

// ✅ Firestore-based setter
async function setUserICalUrl(userId, icalUrl) {
  const userRef = db.collection("users").doc(userId);
  await userRef.set({ icalUrl }, { merge: true });
}

// ✅ Firestore-based getter
async function getUserICalUrl(userId) {
  const doc = await db.collection("users").doc(userId).get();
  return doc.exists ? doc.data().icalUrl || null : null;
}

export {
  // JSON fallback
  loadUserData,
  saveUserData,
  setUserICalUrlFile,
  getUserICalUrlFile,

  // Firestore logic
  setUserICalUrl,
  getUserICalUrl,
};
