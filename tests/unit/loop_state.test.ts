import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { totalCycleCount, LOOP_STATE_FILE, LOOP_ARCHIVE_FILE } from "../../src/afk/loop_state.js";

function makeLog(entries: number): string {
  let log = "# AI Loop State\n\n";
  for (let i = entries - 1; i >= 0; i--) {
    log += `### Cycle result\n\n- cycle ${i}\n\n`;
  }
  return log;
}

describe("totalCycleCount", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loopstate-totalcount-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns 0 when no files exist", () => {
    expect(totalCycleCount(root)).toBe(0);
  });

  it("counts entries from local archive when no live file exists", () => {
    writeFileSync(join(root, LOOP_ARCHIVE_FILE), makeLog(3));
    expect(totalCycleCount(root)).toBe(3);
  });

  it("counts entries from live file and archive when no historical marker is present", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(2));
    writeFileSync(join(root, LOOP_ARCHIVE_FILE), makeLog(3));
    expect(totalCycleCount(root)).toBe(5);
  });

  it("uses live file count and ignores archive when historical marker is present", () => {
    // 2 entries in live file, and historical marker of 10. Total should be 12.
    // Even if archive has 3, it should be ignored.
    const liveText = `# AI Loop State\n\n<!-- historical_cycle_count: 10 -->\n\n### Cycle result\n\n- cycle 1\n\n### Cycle result\n\n- cycle 0\n\n`;
    writeFileSync(join(root, LOOP_STATE_FILE), liveText);
    writeFileSync(join(root, LOOP_ARCHIVE_FILE), makeLog(3));

    expect(totalCycleCount(root)).toBe(12);
  });
});
