import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rotateLoopState,
  ROTATE_KEEP,
  LOOP_STATE_FILE,
  LOOP_ARCHIVE_FILE,
} from "../../src/afk/loop_state.js";

function makeLog(n: number): string {
  const entries: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    entries.push(
      `### Cycle result — cycle ${i} did a thing (bug_${1000 + i})\n\n- detail for ${i}.\n`,
    );
  }
  return `# AI Loop State\n\n${entries.join("\n")}\n## AFK Cycle old-driver-entry\n- terse.\n`;
}

describe("rotateLoopState", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loopstate-unit-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns 0 if LOOP_STATE_FILE does not exist", () => {
    expect(rotateLoopState(root)).toBe(0);
  });

  it("is a no-op and returns 0 when log holds exactly keep entries", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(ROTATE_KEEP));
    expect(rotateLoopState(root)).toBe(0);
    expect(existsSync(join(root, LOOP_ARCHIVE_FILE))).toBe(false);
  });

  it("is a no-op and returns 0 when log holds fewer than keep entries", () => {
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(ROTATE_KEEP - 1));
    expect(rotateLoopState(root)).toBe(0);
    expect(existsSync(join(root, LOOP_ARCHIVE_FILE))).toBe(false);
  });

  it("trims to keep window, archives the rest, and returns moved count", () => {
    const keep = 5;
    const n = 10;
    writeFileSync(join(root, LOOP_STATE_FILE), makeLog(n));
    expect(rotateLoopState(root, keep)).toBe(n - keep);
    expect(existsSync(join(root, LOOP_ARCHIVE_FILE))).toBe(true);
    const live = readFileSync(join(root, LOOP_STATE_FILE), "utf8");
    const entries = [...live.matchAll(/^### Cycle result/gm)];
    expect(entries.length).toBe(keep);
  });
});
