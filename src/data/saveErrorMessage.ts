/**
 * Turn raw API / MySQL save errors into short UI copy.
 * Duplicate key (1062 / "Duplicate entry") is common when IDs collide during concurrent saves.
 */
/**
 * Format a raw save error message for display to users.
 * @param raw - Raw error text from persistence.
 * @returns User-facing message and duplicate status.
 */
export function formatSaveErrorForUser(raw: string): { userMessage: string; isDuplicate: boolean } {
  const lower = raw.toLowerCase();

  // FK / child row — not ER_DUP_ENTRY; must run before the generic !duplicate early return
  if (
    lower.includes("schedule_shifts") ||
    lower.includes("fk_ss_shift") ||
    (lower.includes("cannot add or update a child row") && lower.includes("shift"))
  ) {
    return {
      userMessage:
        "The schedule and shift list were out of sync. Try again, or refresh the page and generate the AI schedule once more.",
      isDuplicate: false,
    };
  }

  const isDuplicate =
    lower.includes("duplicate entry") ||
    lower.includes("er_dup_entry") ||
    lower.includes(" 1062 ") ||
    /\b1062\b/.test(raw);

  if (!isDuplicate) {
    return {
      userMessage: raw.replace(/^Database save failed \(\d+\)\.\s*/i, "").trim() || raw,
      isDuplicate: false,
    };
  }

  if (lower.includes("shift") || lower.includes("shifts.")) {
    return {
      userMessage:
        "That shift is already taken on the schedule. Refresh the page if this keeps happening.",
      isDuplicate: true,
    };
  }

  if (lower.includes("employee") || lower.includes("user")) {
    return {
      userMessage:
        "This person is already in the system. Refresh the page if you just added them.",
      isDuplicate: true,
    };
  }

  return {
    userMessage:
      "This change couldn’t be saved because it conflicts with existing data. Try refreshing the page, then try again.",
    isDuplicate: true,
  };
}
