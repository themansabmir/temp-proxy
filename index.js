import express from "express";
import { getTargets, saveTargets, buildForwardHeaders, forwardTo, adminAuth } from "./utils.js";

const app = express();
const PORT = process.env.PORT || 4000;


// ── Parsers ───────────────────────────────────────────────────────────────────

app.use("/admin", express.json());        // JSON body for admin routes
app.use(express.raw({ type: "*/*" }));    // Raw body for webhook forwarding

// ── Admin API ─────────────────────────────────────────────────────────────────

// GET /admin/targets — list all targets
app.get("/admin/targets", adminAuth, (req, res) => {
  res.json(getTargets());
});

// POST /admin/targets — add a new target
// body: { "name": "devD", "url": "https://xyz.ngrok-free.app/webhook" }
app.post("/admin/targets", adminAuth, (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url are required" });

  const targets = getTargets();
  if (targets.find(t => t.name === name)) {
    return res.status(409).json({ error: `Target "${name}" already exists` });
  }

  const newTarget = { name, url, enabled: true };
  targets.push(newTarget);
  saveTargets(targets);

  console.log(`➕ Target added: ${name}`);
  res.status(201).json(newTarget);
});

// PATCH /admin/targets/enable/:name — enable a target
app.patch("/admin/targets/enable/:name", adminAuth, (req, res) => {
  const targets = getTargets();
  const target = targets.find(t => t.name === req.params.name);
  if (!target) return res.status(404).json({ error: "Target not found" });

  target.enabled = true;
  saveTargets(targets);

  console.log(`✅ Target enabled: ${target.name}`);
  res.json(target);
});

// PATCH /admin/targets/disable/:name — disable a target
app.patch("/admin/targets/disable/:name", adminAuth, (req, res) => {
  const targets = getTargets();
  const target = targets.find(t => t.name === req.params.name);
  if (!target) return res.status(404).json({ error: "Target not found" });

  target.enabled = false;
  saveTargets(targets);

  console.log(`🔴 Target disabled: ${target.name}`);
  res.json(target);
});

// DELETE /admin/targets/:name — remove a target
app.delete("/admin/targets/:name", adminAuth, (req, res) => {
  const targets = getTargets();
  const idx = targets.findIndex(t => t.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: "Target not found" });

  const [removed] = targets.splice(idx, 1);
  saveTargets(targets);

  console.log(`🗑️  Target removed: ${removed.name}`);
  res.json(removed);
});

// PATCH /admin/targets/:name/url — update a target's URL
app.patch("/admin/targets/:name/url", adminAuth, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  const targets = getTargets();
  const target = targets.find(t => t.name === req.params.name);
  if (!target) return res.status(404).json({ error: "Target not found" });

  target.url = url;
  saveTargets(targets);

  console.log(`🔗 Target URL updated: ${target.name} → ${url}`);
  res.json(target);
});

// ── WhatsApp webhook verification (GET) ───────────────────────────────────────

app.get("/webhook", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === (process.env.VERIFY_TOKEN || "your_verify_token")) {
    console.log("✅ Webhook verified by Meta");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Incoming WhatsApp messages (POST) ─────────────────────────────────────────

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const activeTargets = getTargets().filter(t => t.enabled);
  if (!activeTargets.length) {
    console.warn("⚠️  No enabled targets. Request dropped.");
    return;
  }

  const body    = req.body;
  const headers = buildForwardHeaders(req.headers);

  console.log(`\n📨 Forwarding to ${activeTargets.length} target(s):`);

  const results = await Promise.allSettled(
    activeTargets.map(target => forwardTo(target, body, headers))
  );

  results.forEach((r, i) => {
    const { name } = activeTargets[i];
    if (r.status === "fulfilled") console.log(`  ✅ ${name} → ${r.value}`);
    else console.error(`  ❌ ${name} → ${r.reason?.message ?? r.reason}`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Webhook proxy running on port ${PORT}`);
  const targets = getTargets();
  console.log("Active targets:");
  targets.filter(t => t.enabled).forEach(t => console.log(`  → ${t.name}: ${t.url}`));
});