// server/insertTestCleaning.js
import dotenv from "dotenv";
import { db } from "../firebaseAdmin.js";

dotenv.config();

/**
 * Simple arg parser: --key value
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key?.startsWith("--")) {
      args[key.replace(/^--/, "")] = val ?? true;
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

// Defaults (override with CLI flags)
const userId = args.uid || "WfQIu6K29CX6dj6e7euHxD7rCFd2"; // your test UID
const minutesFromNow = Number(args.minutes ?? 120); // default 120 min
const cleaningId =
  args.id || `test-cleaning-${Date.now().toString().slice(-6)}`;
const property = args.property || "Test Property";

const primaryPhone = args.primary || "+15551234567";
const backupPhone = args.backup || "+15557654321";
const secondaryPhone = args.secondary || "+15559876543";

if (Number.isNaN(minutesFromNow) || minutesFromNow <= 0) {
  console.error("❌ --minutes must be a positive number (e.g., --minutes 45)");
  process.exit(1);
}

const startISO = new Date(Date.now() + minutesFromNow * 60_000).toISOString();

async function insertTestCleaning() {
  try {
    const ref = db
      .collection("users")
      .doc(userId)
      .collection("cleanings")
      .doc(cleaningId);

    await ref.set({
      id: cleaningId,
      property,
      primaryPhone,
      backupPhone,
      secondaryPhone,
      start: startISO, // scheduler uses `start`
      status: "Unassigned",
      source: "manual" // so syncCalendar won't wipe it
    });

    console.log("✅ Inserted test cleaning:");
    console.log(`   • uid:        ${userId}`);
    console.log(`   • doc id:     ${cleaningId}`);
    console.log(`   • property:   ${property}`);
    console.log(`   • start in:   ${minutesFromNow} min (${startISO})`);
    console.log(`   • primary:    ${primaryPhone}`);
    console.log(`   • backup:     ${backupPhone}`);
    console.log(`   • secondary:  ${secondaryPhone}`);
  } catch (err) {
    console.error("❌ Failed to insert test cleaning:", err);
    process.exit(1);
  }
}

insertTestCleaning();
