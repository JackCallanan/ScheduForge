import type { AppState } from "../domain/types";

const stateUrl = "/api/state";
const resetUrl = "/api/reset";

/**
 * Pull application state from the backend API.
 * @returns AppState on success, or null on failure.
 */
export async function pullAppStateFromApi(): Promise<AppState | null> {
  try {
    const r = await fetch(stateUrl);
    if (!r.ok) return null;
    return (await r.json()) as AppState;
  } catch {
    return null;
  }
}

export type PushResult =
  | { ok: true }
  | { ok: false; message: string; detail?: string; status?: number };

/**
 * Push the current application state to the backend API.
 * @param state - AppState to persist.
 * @returns Result of the API save operation.
 */
export async function pushAppStateToApi(state: AppState): Promise<PushResult> {
  try {
    const r = await fetch(stateUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!r.ok) {
      let detail = r.statusText;
      try {
        const text = await r.text();
        if (text) {
          try {
            const j = JSON.parse(text) as { details?: string; error?: string };
            detail = j.details ?? j.error ?? text;
          } catch {
            detail = text.length > 500 ? `${text.slice(0, 500)}…` : text;
          }
        }
      } catch {
        /* ignore */
      }
      console.error("[ScheduForge] Could not save to MySQL:", r.status, detail);
      return {
        ok: false,
        message: `Database save failed (${r.status}). ${detail}`,
        detail,
        status: r.status,
      };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ScheduForge] Could not save to MySQL (network):", e);
    return { ok: false, message: `Database save failed: ${message}`, detail: message };
  }
}

/**
 * Request the backend to reset the MySQL database.
 * @returns True when the reset request succeeded.
 */
export async function resetMysqlDatabase(): Promise<boolean> {
  try {
    const r = await fetch(resetUrl, { method: "POST" });
    return r.ok;
  } catch {
    return false;
  }
}
