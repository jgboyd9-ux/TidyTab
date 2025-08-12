// test-server.js
import express from "express";
import cors from "cors";

const app = express();
const port = 3000;

console.log("⏳ Launching clean test backend...");

app.use(cors());

app.get("/", (req, res) => {
  console.log("🏠 Hit the root route!");
  res.send("🔥 Hello from CLEAN test server");
});

app.get("/sync-calendar", (req, res) => {
  console.log("📅 /sync-calendar was triggered!");
  res.json({ message: "✅ Calendar endpoint working" });
});

app.listen(port, () => {
  console.log(`✅ CLEAN backend ready at http://localhost:${port}`);
});
