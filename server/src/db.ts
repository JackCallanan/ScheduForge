import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read a file as UTF-8 text and normalize BOM/UTF-16 LE encodings.
 * @param abs - Absolute path to the environment file.
 * @returns File contents as a UTF-8 string.
 */
function readEnvFileText(abs: string): string {
  const buf = fs.readFileSync(abs);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  return buf.toString("utf8");
}

/**
 * Parse .env text manually when dotenv.parse misses entries.
 * @param text - Raw environment file contents.
 * @returns Parsed key/value pairs.
 */
function parseEnvLinesLoose(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Parse environment file contents into key/value pairs.
 * @param text - Raw .env file contents.
 * @returns Parsed values from the file.
 */
function parseEnvFile(text: string): Record<string, string> {
  const loose = parseEnvLinesLoose(text);
  const fromDotenv = dotenv.parse(text);
  return { ...loose, ...fromDotenv };
}

/**
 * Find and merge .env files from likely paths.
 * @returns Combined environment values and the files that were loaded.
 */
function mergeEnvFromFiles(): { merged: Record<string, string>; loadedPaths: string[] } {
  const candidates = [
    path.resolve(__dirname, "../../.env"),
    path.resolve(__dirname, "../../../.env"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];
  const merged: Record<string, string> = {};
  const loadedPaths: string[] = [];
  const seen = new Set<string>();
  for (const p of candidates) {
    const abs = path.normalize(p);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!fs.existsSync(abs)) continue;
    try {
      const text = readEnvFileText(abs);
      const parsed = parseEnvFile(text);
      Object.assign(merged, parsed);
      loadedPaths.push(abs);
      console.log(`[scheduforge-api] Loaded .env from ${abs} (${Object.keys(parsed).length} keys)`);
    } catch (e) {
      console.warn(`[scheduforge-api] Could not read ${abs}:`, e);
    }
  }
  return { merged, loadedPaths };
}

const { merged: mergedEnv, loadedPaths } = mergeEnvFromFiles();

if (loadedPaths.length === 0) {
  console.warn(
    `[scheduforge-api] No .env file found on disk. Copy .env.example to: ${path.resolve(__dirname, "../../.env")}`,
  );
} else if (Object.keys(mergedEnv).length === 0) {
  console.warn(
    `[scheduforge-api] .env was read but no KEY=value pairs were parsed. Re-save the file as UTF-8 (e.g. in VS Code / Cursor).`,
  );
}

for (const [key, val] of Object.entries(mergedEnv)) {
  process.env[key] = val;
}

const hasProjectEnv = Object.keys(mergedEnv).length > 0;

const host = mergedEnv.MYSQL_HOST ?? process.env.MYSQL_HOST ?? "127.0.0.1";
const port = Number(mergedEnv.MYSQL_PORT ?? process.env.MYSQL_PORT ?? "3306");
const user = hasProjectEnv
  ? (mergedEnv.MYSQL_USER ?? "root")
  : (process.env.MYSQL_USER ?? "root");
const password = hasProjectEnv
  ? (mergedEnv.MYSQL_PASSWORD ?? "")
  : (process.env.MYSQL_PASSWORD ?? "");
const database = mergedEnv.MYSQL_DATABASE ?? process.env.MYSQL_DATABASE ?? "scheduforge";

/**
 * Shared MySQL connection pool for the API.
 */
export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

console.log(`[scheduforge-api] MySQL connection: ${user}@${host}:${port}/${database}`);

/**
 * Verify the MySQL connection by pinging the database.
 * @returns True when the database responds.
 */
export async function pingDb(): Promise<boolean> {
  try {
    const c = await pool.getConnection();
    await c.ping();
    c.release();
    return true;
  } catch {
    return false;
  }
}
