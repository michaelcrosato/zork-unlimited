/**
 * AI_LOOP_STATE.md rotation — keep the live loop log small (token-efficient for the
 * cycle agent) while preserving full history and the monotonic cycle count.
 *
 * The cycle agent reads + prepends to AI_LOOP_STATE.md every cycle; left unbounded it
 * grew to ~1.7 MB / ~420k tokens, so each cycle re-ingested a huge log. This keeps only
 * the most recent {@link ROTATE_KEEP} rich "### Cycle result" entries in the live log
 * and moves older entries (plus the terse driver entries that sit below them) to an
 * append-only AI_LOOP_STATE_ARCHIVE.md. The archive is gitignored — git history already
 * preserves every old version of the live log, so the archive is a local convenience,
 * not a second source of truth.
 *
 * The total completed-cycle count (which the generator seed window rides on, see
 * assessor.ts `generatedEvalSeedBase`) is recovered by counting "### Cycle result"
 * entries across BOTH files, so trimming the live log never resets it.
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export const LOOP_STATE_FILE = "AI_LOOP_STATE.md";
export const LOOP_ARCHIVE_FILE = "AI_LOOP_STATE_ARCHIVE.md";

/**
 * How many recent rich cycle entries stay in the live log. Sized so the agent keeps
 * useful recent context AND the blind-pass rotation sees a recent attendance for the
 * packs in active rotation; a pack absent from the window correctly sorts as
 * least-recently-attended (rotated first), so the rotation degrades gracefully.
 */
export const ROTATE_KEEP = 15;

const CYCLE_ENTRY = /^### Cycle result/gm;

/** Count completed "### Cycle result" entries in a log text. Pure. */
export function countCycleEntries(text: string): number {
  return (text.match(CYCLE_ENTRY) ?? []).length;
}

/**
 * Total completed cycles across the live log + the archive — the monotonic count the
 * generator seed window rides on. Robust to rotation: entries moved to the archive are
 * still counted. On a fresh clone with no local archive it returns just the live count
 * (only the running loop relies on the absolute value; tests use synthetic input).
 */
export function totalCycleCount(root: string): number {
  const live = join(root, LOOP_STATE_FILE);
  const arch = join(root, LOOP_ARCHIVE_FILE);
  const liveN = existsSync(live) ? countCycleEntries(readFileSync(live, "utf8")) : 0;
  const archN = existsSync(arch) ? countCycleEntries(readFileSync(arch, "utf8")) : 0;
  return liveN + archN;
}

/**
 * Trim the live log to its most recent {@link ROTATE_KEEP} rich entries, moving older
 * entries (and the terse driver entries below them) to the append-only archive.
 * Deterministic; a no-op when the log holds <= keep entries. Returns entries moved.
 *
 * The live log is NEWEST-FIRST (the agent prepends each cycle's entry at the top), so
 * the kept slice is the head up to the start of the (keep+1)th entry; the title is
 * preserved so the agent's prepend target is unchanged.
 */
export function rotateLoopState(root: string, keep: number = ROTATE_KEEP): number {
  const live = join(root, LOOP_STATE_FILE);
  if (!existsSync(live)) return 0;
  const text = readFileSync(live, "utf8");
  const entries = [...text.matchAll(CYCLE_ENTRY)];
  if (entries.length <= keep) return 0;

  const cut = entries[keep]!.index!; // first char of the (keep+1)th entry from the top
  const kept = text.slice(0, cut).replace(/\s+$/, "") + "\n";
  const moved = text.slice(cut);

  appendFileSync(join(root, LOOP_ARCHIVE_FILE), moved.startsWith("\n") ? moved : "\n" + moved);
  writeFileSync(live, kept);
  return entries.length - keep;
}
