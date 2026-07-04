/** Compact canonical source identity shared by saves, traces, and source resolution. */
export type CompactSourceRef = ["wq", string] | ["gen", number] | ["pack", string];

export function compactSourceRefValidationError(raw: unknown, label: string): string | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return `${label} must be a compact tuple when present.`;
  }
  const [tag, value] = raw;
  if (tag === "wq") {
    return typeof value === "string" ? undefined : `${label} world quest id must be a string.`;
  }
  if (tag === "gen") {
    return typeof value === "number" && Number.isInteger(value)
      ? undefined
      : `${label} generated seed must be an integer.`;
  }
  if (tag === "pack") {
    return typeof value === "string" ? undefined : `${label} pack id must be a string.`;
  }
  return `${label} tag must be "wq", "gen", or "pack", got ${JSON.stringify(tag)}.`;
}
