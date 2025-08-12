// server/twilioService.js — ESM version
import dotenv from "dotenv";
dotenv.config();

// Toggle between mock and real Twilio sending
const USE_MOCK = process.env.TWILIO_MOCK === "true";

let client, FROM;
if (!USE_MOCK) {
  const twilio = (await import("twilio")).default;
  client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  FROM = process.env.TWILIO_FROM;
}

export async function sendSMS(to, body) {
  if (USE_MOCK) {
    console.log(`📨 [MOCK SMS] To: ${to} | Message: "${body}"`);
    return;
  }

  try {
    const res = await client.messages.create({ from: FROM, to, body });
    console.log(`✅ SMS sent to ${to} | SID: ${res.sid}`);
  } catch (err) {
    console.error(`❌ Failed to send SMS to ${to}:`, err.message);
  }
}
