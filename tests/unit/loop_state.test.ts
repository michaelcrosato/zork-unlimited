import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { totalCycleCount, LOOP_STATE_FILE, LOOP_ARCHIVE_FILE } from "../../src/afk/loop_state.js";

function makeLog(n: number, withHistoricalMarker: number | null = null): string {
  const entries: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    entries.push(
      `### Cycle result — cycle ${i} did a thing (bug_${1000 + i})\n\n- detail for ${i}.\n`,
    );
  }
  const marker =
    withHistoricalMarker !== null
      ? `<!-- historical_cycle_count: ${withHistoricalMarker} -->\n\n`
      : "";
  return `# AI Loop State\n\n${marker}${entries.join("\n")}\n## AFK Cycle old-driver-entry\n- terse.\n`;
}

describe("totalCycleCount", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loopstate-unit-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns 0 when neither live nor archive file exists", () => {
    expect(totalCycleCount(root)).toBe(0);
  });

  it("returns the count of live entries when only live file exists", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(3));
    expect(totalCycleCount(root)).toBe(3);
  });

  it("returns the sum of live and archive entries when both exist without historical marker", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(2));
    writeFileSync(join(root, LOOP_ARCHIVE_FILE), makeLog(5));
    expect(totalCycleCount(root)).toBe(7);
  });

  it("returns historical marker count plus live entries, ignoring archive when historical marker exists", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(2, 10));
    writeFileSync(join(root, LOOP_ARCHIVE_FILE), makeLog(5));
    expect(totalCycleCount(root)).toBe(12);
  });
});
