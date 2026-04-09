export function splitDisplayName(name: string): { first: string; last: string } {
  const t = name.trim();
  if (!t) return { first: "Unknown", last: "-" };
  const parts = t.split(/\s+/);
  const first = parts[0] ?? "Unknown";
  const last = parts.slice(1).join(" ") || "-";
  return { first, last };
}

export function joinDisplayName(first: string, last: string): string {
  const f = first.trim();
  const l = last.trim();
  if (l === "" || l === "-") return f;
  return `${f} ${l}`.trim();
}
