import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pingDb } from "./db.js";
import { ensureSeeded, loadAppState, replaceAppState } from "./stateRepo.js";
import type { AppState } from "./types.js";

const PORT = Number(process.env.PORT ?? "3001");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load the initial seed app state from the frontend data module.
 * @returns Seed app state for reset or initialization.
 */
async function loadSeed(): Promise<AppState> {
  const seedPath = path.join(__dirname, "..", "..", "src", "data", "seed.ts");
  const mod = await import(pathToFileURL(seedPath).href);
  return mod.initialState as AppState;
}

/**
 * Normalize an unknown server error into a string.
 * @param e - Error value.
 * @returns Human-readable error message.
 */
function formatServerError(e: unknown): string {
  if (e && typeof e === "object" && "sqlMessage" in e && typeof (e as { sqlMessage?: unknown }).sqlMessage === "string") {
    return (e as { sqlMessage: string }).sqlMessage;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Validate that a request body matches AppState shape.
 * @param body - Incoming request body.
 * @returns True when the payload is AppState.
 */
function isAppState(body: unknown): body is AppState {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    Array.isArray(o.users) &&
    Array.isArray(o.shifts) &&
    typeof o.userCredentials === "object" &&
    o.userCredentials !== null
  );
}

/**
 * Bootstrap and start the Express API server.
 */
async function main() {
  const seed = await loadSeed();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", async (_req, res) => {
    const dbOk = await pingDb();
    res.json({ ok: true, database: dbOk });
  });

  app.get("/api/state", async (_req, res) => {
    try {
      await ensureSeeded(seed);
      const state = await loadAppState();
      res.json(state);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to load state" });
    }
  });

  app.put("/api/state", async (req, res) => {
    try {
      if (!isAppState(req.body)) {
        const b = req.body as Record<string, unknown> | undefined;
        console.warn("[PUT /api/state] rejected body:", {
          hasUsers: Array.isArray(b?.users),
          hasShifts: Array.isArray(b?.shifts),
          hasCredentials: typeof b?.userCredentials === "object" && b?.userCredentials !== null,
        });
        res.status(400).json({ error: "Invalid AppState payload" });
        return;
      }
      await replaceAppState(req.body);
      const u = req.body.users.length;
      const m = req.body.managers.length;
      console.log(`[PUT /api/state] saved ok (users=${u}, managers=${m})`);
      res.json({ ok: true });
    } catch (e) {
      const details = formatServerError(e);
      console.error("[PUT /api/state]", details, e);
      res.status(500).json({ error: "Failed to save state", details });
    }
  });

  app.post("/api/reset", async (_req, res) => {
    try {
      await replaceAppState(seed);
      res.json({ ok: true });
    } catch (e) {
      const details = formatServerError(e);
      console.error("[POST /api/reset]", details, e);
      res.status(500).json({ error: "Failed to reset database", details });
    }
  });

  const httpServer = app.listen(PORT, () => {
    console.log(`ScheduForge API listening on http://localhost:${PORT}`);
  });
  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[scheduforge-api] Port ${PORT} is already in use (another API still running?). Close that terminal or set PORT=3002 in your project .env`,
      );
    }
    throw err;
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
