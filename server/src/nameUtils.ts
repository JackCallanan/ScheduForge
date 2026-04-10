/**
 * Split a display name into first and last name.
 * @param name - Full display name.
 * @returns Parsed first and last names.
 */
export function splitDisplayName(name: string): { first: string; last: string } {
  const t = name.trim();
  if (!t) return { first: "Unknown", last: "-" };
  const parts = t.split(/\s+/);
  const first = parts[0] ?? "Unknown";
  const last = parts.slice(1).join(" ") || "-";
  return { first, last };
}

/**
 * Join first and last names into a display name.
 * @param first - First name.
 * @param last - Last name.
 * @returns Full display name.
 */
export function joinDisplayName(first: string, last: string): string {
  const f = first.trim();
  const l = last.trim();
  if (l === "" || l === "-") return f;
  return `${f} ${l}`.trim();
}
