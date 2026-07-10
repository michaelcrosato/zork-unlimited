/**
 * Trend comparison — the "is this getting better or worse" edge of the
 * feedback compiler. Matches hotspots across two compiles purely by
 * `Hotspot.id` (a `shortHash` of the underlying cluster's fingerprint — see
 * compile.ts), never by title/position, so a cluster that shifts rank or
 * gains a slightly reworded title is still recognized as "the same hotspot".
 *
 * Two ways a caller finds the "previous" compile:
 *   - `loadHotspotsFromDir` reads one specific directory's `hotspots.json`
 *     directly — what `bin/feedback.ts --prev <dir>` uses, so tests (and
 *     anyone comparing two ad-hoc compiles) can pin the comparison exactly
 *     instead of depending on wall-clock directory scanning.
 *   - `loadPreviousHotspots` is the default, no-flags-needed path: scan
 *     `<root>/ai-runs/feedback/*` (each subdirectory is a UTC-stamp-named
 *     compile output) and pick the newest one whose name sorts before
 *     `beforeDir` — again by directory NAME, never by mtime, so it is stable
 *     under filesystem copies/clones that don't preserve timestamps.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HotspotsFileSchema, type Hotspot, type HotspotsFile } from "./schema.js";

/** Reads and schema-validates `<dir>/hotspots.json`. Null if the file is
 *  missing, unparseable, or fails `HotspotsFileSchema` — a corrupt or
 *  foreign-shaped previous compile must never crash today's compile, just
 *  make it behave as if there were no previous one.
 *
 *  When `isExplicit` is true (e.g., from --prev flag), warns to console if
 *  the file is unreadable. Auto-scan paths remain silent (skipping invalid
 *  dirs is normal). */
export function loadHotspotsFromDir(dir: string, isExplicit = false): HotspotsFile | null {
  const path = join(dir, "hotspots.json");
  if (!existsSync(path)) {
    if (isExplicit)
      console.warn(
        `previous hotspots at ${path} unreadable (file not found) — trends will show "new"`,
      );
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "parse error";
    if (isExplicit)
      console.warn(`previous hotspots at ${path} unreadable (${reason}) — trends will show "new"`);
    return null;
  }
  const parsed = HotspotsFileSchema.safeParse(raw);
  if (!parsed.success) {
    if (isExplicit)
      console.warn(
        `previous hotspots at ${path} unreadable (wrong version or format) — trends will show "new"`,
      );
    return null;
  }
  return parsed.data;
}

/**
 * Scans `<root>/ai-runs/feedback/*` for UTC-stamp-named directories holding a
 * valid `hotspots.json`, and returns the newest one lexicographically BEFORE
 * `beforeDir` (or the newest overall when `beforeDir` is null). Directory
 * names are `yyyymmddThhmmssZ` stamps (see bin/feedback.ts's default
 * `--out`), which sort lexicographically exactly as they sort in time — no
 * mtime/Date parsing needed. Returns null when the feedback root doesn't
 * exist yet, or every candidate dir is missing/invalid.
 */
export function loadPreviousHotspots(root: string, beforeDir: string | null): HotspotsFile | null {
  const feedbackDir = join(root, "ai-runs", "feedback");
  if (!existsSync(feedbackDir)) return null;

  const dirNames = readdirSync(feedbackDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => beforeDir === null || name < beforeDir)
    .sort();

  // Newest-first: try each candidate (by name) until one actually holds a
  // valid hotspots.json — a stale/half-written dir must not shadow an older
  // but genuinely readable compile.
  for (let i = dirNames.length - 1; i >= 0; i--) {
    const file = loadHotspotsFromDir(join(feedbackDir, dirNames[i]!));
    if (file) return file;
  }
  return null;
}

/** Below this fraction of the previous score ⇒ "improved" (fewer/lighter issues). */
const IMPROVED_RATIO = 0.8;
/** Above this fraction of the previous score ⇒ "regressed" (more/heavier issues). */
const REGRESSED_RATIO = 1.25;

/**
 * Stamps each current hotspot's `trend`/`prev_score` by matching against
 * `previous` on `id` alone. No match ⇒ "new" (prev_score null). A match
 * compares SCORE only (never count/severity individually) against the same
 * two fixed thresholds every caller shares: below 0.8x the previous score is
 * "improved", above 1.25x is "regressed", the (asymmetric, deliberately —
 * scores can only grow via more/heavier issues, so the two directions are not
 * mirror images) band between is "flat".
 */
export function applyTrends(current: Hotspot[], previous: HotspotsFile | null): Hotspot[] {
  const prevById = new Map((previous?.hotspots ?? []).map((h) => [h.id, h] as const));
  return current.map((hotspot) => {
    const prev = prevById.get(hotspot.id);
    if (!prev) return { ...hotspot, trend: "new", prev_score: null };
    let trend: Hotspot["trend"];
    if (hotspot.score < prev.score * IMPROVED_RATIO) trend = "improved";
    else if (hotspot.score > prev.score * REGRESSED_RATIO) trend = "regressed";
    else trend = "flat";
    return { ...hotspot, trend, prev_score: prev.score };
  });
}
