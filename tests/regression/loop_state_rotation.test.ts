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
import { parseFeedbackCycleSelection } from "../../src/feedback/acceptance.js";
import {
  rotateLoopState,
  totalCycleCount,
  countCycleEntries,
  historicalCycleCount,
  completedCycleCount,
  ROTATE_KEEP,
  LOOP_STATE_FILE,
  LOOP_ARCHIVE_FILE,
} from "../../src/afk/loop_state.js";

const RUN_ID = "2026-01-02T03-04-05-006Z";
const SELECTION_MARKER = `<!-- feedback_cycle_selection: {"run_id":"${RUN_ID}","selected_recommendation_id":null} -->`;
const SELECTION_NEAR_MISS = "- feedback_cycle_selection is described here, not asserted.";

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

function makeLogWithCycleScaffold(n: number, selectionLines: readonly string[]): string {
  return makeLog(n).replace(
    "## AFK Cycle old-driver-entry\n- terse.\n",
    `## AFK Cycle ${RUN_ID}\n${selectionLines.join("\n")}\n${SELECTION_NEAR_MISS}\n- pending.\n`,
  );
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

  it("preserves the machine-owned feedback acceptance marker in the live intro", () => {
    const marker =
      '<!-- feedback_acceptance: {"accepted_compile":null,"pending_cycle_reports":[],"schema_version":1} -->';
    const text = makeLog(ROTATE_KEEP + 2).replace(
      "# AI Loop State\n\n",
      `# AI Loop State\n\n${marker}\n\n`,
    );
    writeFileSync(join(root, LOOP_STATE_FILE), text);

    expect(rotateLoopState(root)).toBe(2);
    expect(readFileSync(join(root, LOOP_STATE_FILE), "utf8")).toContain(marker);
    expect(readFileSync(join(root, LOOP_ARCHIVE_FILE), "utf8")).not.toContain(marker);
  });

  it("relocates the frozen cycle selection into the live preamble before archiving", () => {
    writeFileSync(
      join(root, LOOP_STATE_FILE),
      makeLogWithCycleScaffold(ROTATE_KEEP + 1, [SELECTION_MARKER]),
    );

    expect(rotateLoopState(root)).toBe(1);
    const live = readFileSync(join(root, LOOP_STATE_FILE), "utf8");
    const archive = readFileSync(join(root, LOOP_ARCHIVE_FILE), "utf8");
    expect(countCycleEntries(live)).toBe(ROTATE_KEEP);
    expect(historicalCycleCount(live)).toBe(1);
    expect(
      live.split(/\r?\n/u).filter((line) => line.includes("feedback_cycle_selection:")),
    ).toEqual([SELECTION_MARKER]);
    expect(live.indexOf(SELECTION_MARKER)).toBeLessThan(live.indexOf("### Cycle result"));
    expect(live).not.toContain(SELECTION_NEAR_MISS);
    expect(archive).toContain(SELECTION_NEAR_MISS);
    expect(archive).not.toContain("feedback_cycle_selection:");
    expect(parseFeedbackCycleSelection(live, RUN_ID)).toEqual({
      ok: true,
      selection: { run_id: RUN_ID, selected_recommendation_id: null },
    });
    expect(totalCycleCount(root)).toBe(ROTATE_KEEP + 1);

    expect(rotateLoopState(root)).toBe(0);
    expect(readFileSync(join(root, LOOP_STATE_FILE), "utf8")).toBe(live);
    expect(readFileSync(join(root, LOOP_ARCHIVE_FILE), "utf8")).toBe(archive);
  });

  it.each([
    ["malformed", ['<!-- feedback_cycle_selection: {"run_id": -->']],
    ["duplicate", [SELECTION_MARKER, SELECTION_MARKER]],
  ])("keeps %s selection lines live for the seal to reject", (_kind, selectionLines) => {
    writeFileSync(
      join(root, LOOP_STATE_FILE),
      makeLogWithCycleScaffold(ROTATE_KEEP + 1, selectionLines),
    );

    expect(rotateLoopState(root)).toBe(1);
    const live = readFileSync(join(root, LOOP_STATE_FILE), "utf8");
    expect(
      live.split(/\r?\n/u).filter((line) => line.includes("feedback_cycle_selection:")),
    ).toEqual(selectionLines);
    expect(parseFeedbackCycleSelection(live, RUN_ID).ok).toBe(false);
    expect(readFileSync(join(root, LOOP_ARCHIVE_FILE), "utf8")).not.toContain(
      "feedback_cycle_selection:",
    );
  });

  it.each([
    ["selection-like prose", "- feedback_cycle_selection: prose is not a marker"],
    ["an indented marker", `  ${SELECTION_MARKER}`],
    [
      "a Unicode line separator",
      "- feedback_cycle_selection: prose\u2028continuation must stay on this LF-delimited line",
    ],
    [
      "a lone carriage return",
      "- feedback_cycle_selection: prose\rcontinuation must stay on this LF-delimited line",
    ],
  ])("does not launder %s beside a canonical selection", (_kind, malformedLine) => {
    const selectionLines = [SELECTION_MARKER, malformedLine];
    writeFileSync(
      join(root, LOOP_STATE_FILE),
      makeLogWithCycleScaffold(ROTATE_KEEP + 1, selectionLines),
    );

    expect(rotateLoopState(root)).toBe(1);
    const live = readFileSync(join(root, LOOP_STATE_FILE), "utf8");
    expect(
      live.split(/\r?\n/u).filter((line) => line.includes("feedback_cycle_selection:")),
    ).toEqual(selectionLines);
    expect(parseFeedbackCycleSelection(live, RUN_ID).ok).toBe(false);
    const archive = readFileSync(join(root, LOOP_ARCHIVE_FILE), "utf8");
    expect(archive).not.toContain("feedback_cycle_selection:");
    expect(archive).not.toContain("continuation must stay on this LF-delimited line");
  });
});

describe("completedCycleCount", () => {
  it("counts both historical marker and rich entries", () => {
    const text = `# AI Loop State\n\n<!-- historical_cycle_count: 42 -->\n\n### Cycle result 1\n\n### Cycle result 2\n`;
    expect(completedCycleCount(text)).toBe(44);
  });

  it("works with no historical marker", () => {
    const text = `# AI Loop State\n\n### Cycle result 1\n\n### Cycle result 2\n`;
    expect(completedCycleCount(text)).toBe(2);
  });

  it("works with no rich entries", () => {
    const text = `# AI Loop State\n\n<!-- historical_cycle_count: 42 -->\n`;
    expect(completedCycleCount(text)).toBe(42);
  });

  it("works with empty string", () => {
    expect(completedCycleCount("")).toBe(0);
  });

  it("works with garbage text", () => {
    expect(completedCycleCount("just some random text without markers")).toBe(0);
  });
});
