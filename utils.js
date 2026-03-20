
// ── Helpers ───────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "node:path";

const TARGETS_FILE = path.resolve("targets.json");
const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme";

export function getTargets() {
  try {
    return JSON.parse(fs.readFileSync(TARGETS_FILE, "utf-8"));
  } catch (err) {
    console.error("❌ Failed to read targets.json:", err.message);
    return [];
  }
}

export function saveTargets(targets) {
  fs.writeFileSync(TARGETS_FILE, JSON.stringify(targets, null, 2));
}

export function buildForwardHeaders(incoming) {
  const HOP_BY_HOP = new Set([
    "host", "connection", "keep-alive", "transfer-encoding",
    "te", "trailer", "upgrade", "proxy-authorization",
  ]);
  return Object.fromEntries(
    Object.entries(incoming).filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase()))
  );
}

export async function forwardTo(target, body, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(target.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    return `HTTP ${res.status}`;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Admin auth middleware ─────────────────────────────────────────────────────

export function adminAuth(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });
  next();
}
