import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { totalCycleCount, LOOP_STATE_FILE, LOOP_ARCHIVE_FILE } from "../../src/afk/loop_state";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("totalCycleCount", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-state-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns 0 when neither live nor archive files exist", () => {
    expect(totalCycleCount(tempDir)).toBe(0);
  });

  it("returns count from live file when it exists with cycle entries but no historical marker", () => {
    const liveContent = `# AI Loop State\n\n### Cycle result 1\n\n### Cycle result 2\n`;
    writeFileSync(join(tempDir, LOOP_STATE_FILE), liveContent);

    expect(totalCycleCount(tempDir)).toBe(2);
  });

  it("returns count from live file including historical marker without reading archive", () => {
    const liveContent = `# AI Loop State\n\n<!-- historical_cycle_count: 5 -->\n\n### Cycle result 1\n\n### Cycle result 2\n`;
    writeFileSync(join(tempDir, LOOP_STATE_FILE), liveContent);

    // Create an archive file that shouldn't be read
    const archiveContent = `### Cycle result 3\n\n### Cycle result 4\n`;
    writeFileSync(join(tempDir, LOOP_ARCHIVE_FILE), archiveContent);

    expect(totalCycleCount(tempDir)).toBe(7); // 5 from marker + 2 from live entries
  });

  it("returns sum of live and archive entries when live file has no historical marker", () => {
    const liveContent = `# AI Loop State\n\n### Cycle result 1\n\n### Cycle result 2\n`;
    writeFileSync(join(tempDir, LOOP_STATE_FILE), liveContent);

    const archiveContent = `### Cycle result 3\n\n### Cycle result 4\n### Cycle result 5\n`;
    writeFileSync(join(tempDir, LOOP_ARCHIVE_FILE), archiveContent);

    expect(totalCycleCount(tempDir)).toBe(5); // 2 from live + 3 from archive
  });
});
