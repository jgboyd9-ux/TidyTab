// ical-parser.js
import ical from 'node-ical';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get user ID from command-line args
const userId = process.argv[2];
if (!userId) {
  console.error("❌ Please provide a user ID as an argument. Example:\n  node ical-parser.js WfQlu6K29CX6dj6e7euHxD7rCFd2");
  process.exit(1);
}

// Read and parse .ics file
const icsData = fs.readFileSync('./mock-calendar.ics', 'utf-8');
const events = ical.parseICS(icsData);

const cleanings = [];

for (let key in events) {
  const event = events[key];
  if (event.type === 'VEVENT') {
    cleanings.push({
      id: key,
      property: event.summary.replace('Booking: ', ''),
      start: event.start,
      end: event.end,
      status: 'Unassigned',
    });
  }
}

// Save to per-user path
const outputDir = path.join(__dirname, 'user-data', userId);
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.join(outputDir, 'cleanings.json');
fs.writeFileSync(outputPath, JSON.stringify(cleanings, null, 2));

console.log(`✅ Saved ${cleanings.length} mock cleanings to ${outputPath}`);
