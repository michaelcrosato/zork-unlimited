/**
 * AI_LOOP_STATE.md rotation (token efficiency, this session).
 *
 * The cycle agent reads + prepends to the loop log every cycle; unbounded it reached
 * ~1.7 MB / ~420k tokens. rotateLoopState() trims the live log to the most recent
 * ROTATE_KEEP rich "### Cycle result" entries, moving older ones to the gitignored
 * archive — while the TOTAL cycle count (live + archive) stays exact, so the generator
 * seed window (assessor.generatedEvalSeedBase) never resets. Newest-first ordering (the
 * agent prepends) means the kept slice is the head.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rotateLoopState,
  totalCycleCount,
  countCycleEntries,
  historicalCycleCount,
  ROTATE_KEEP,
  LOOP_STATE_FILE,
  LOOP_ARCHIVE_FILE,
} from "../../src/afk/loop_state.js";

/** A newest-first log of `n` rich entries (entry n-1 at the top), with a terse driver tail. */
function makeLog(n: number): string {
  const entries: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    entries.push(
      `### Cycle result — cycle ${i} did a thing (bug_${1000 + i})\n\n- detail for ${i}.\n`,
    );
  }
  return `# AI Loop State\n\n${entries.join("\n")}\n## AFK Cycle old-driver-entry\n- terse.\n`;
}

describe("AI_LOOP_STATE rotation (token efficiency)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loopstate-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("is a no-op at/below the keep window and leaves no archive", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(ROTATE_KEEP));
    expect(rotateLoopState(root)).toBe(0);
    expect(existsSync(join(root, LOOP_ARCHIVE_FILE))).toBe(false);
    expect(totalCycleCount(root)).toBe(ROTATE_KEEP);
  });

  it("trims to the keep window, archives the rest, and preserves the total count", () => {
    const N = ROTATE_KEEP + 40;
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(N));
    expect(rotateLoopState(root)).toBe(N - ROTATE_KEEP);

    const live = readFileSync(join(root, LOOP_STATE_FILE), "utf8");
    expect(countCycleEntries(live)).toBe(ROTATE_KEEP);
    expect(historicalCycleCount(live)).toBe(N - ROTATE_KEEP);
    expect(live.startsWith("# AI Loop State")).toBe(true); // the agent's prepend target survives
    expect(live).toContain(`cycle ${N - 1} did a thing`); // newest kept
    expect(live).not.toContain("cycle 0 did a thing"); // oldest archived

    expect(countCycleEntries(readFileSync(join(root, LOOP_ARCHIVE_FILE), "utf8"))).toBe(
      N - ROTATE_KEEP,
    );
    expect(totalCycleCount(root)).toBe(N); // monotonic count exactly preserved across the split
  });

  it("uses the compact historical marker on a fresh clone without a local archive", () => {
    writeFileSync(
      join(root, LOOP_STATE_FILE),
      "# AI Loop State\n\n<!-- historical_cycle_count: 40 -->\n\n### Cycle result — recent\n",
    );
    expect(totalCycleCount(root)).toBe(41);
  });

  it("is idempotent — a second rotation moves nothing more", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(ROTATE_KEEP + 10));
    expect(rotateLoopState(root)).toBe(10);
    expect(rotateLoopState(root)).toBe(0);
    expect(totalCycleCount(root)).toBe(ROTATE_KEEP + 10);
  });
});
