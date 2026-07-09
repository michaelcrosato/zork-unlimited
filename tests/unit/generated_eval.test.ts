import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatedEvalSeedBaseFromDisk,
  generatedEvalSeedBase,
} from "../../src/afk/generated_eval.js";
import { LOOP_STATE_FILE, LOOP_ARCHIVE_FILE } from "../../src/afk/loop_state.js";

describe("generatedEvalSeedBase", () => {
  it("counts completed cycles from live log text", () => {
    const text = `
# AI Loop State

<!-- historical_cycle_count: 5 -->

### Cycle result
stuff
### Cycle result
more stuff
`;
    expect(generatedEvalSeedBase(text)).toBe(7);
  });
});

describe("generatedEvalSeedBaseFromDisk", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "geneval-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns 0 for empty directory", () => {
    expect(generatedEvalSeedBaseFromDisk(root)).toBe(0);
  });

  it("counts cycles from live log only", () => {
    const live = `
# AI Loop State

### Cycle result
stuff
### Cycle result
more stuff
`;
    writeFileSync(join(root, LOOP_STATE_FILE), live);
    expect(generatedEvalSeedBaseFromDisk(root)).toBe(2);
  });

  it("counts cycles from live log with historical marker", () => {
    const live = `
# AI Loop State

<!-- historical_cycle_count: 10 -->

### Cycle result
stuff
`;
    writeFileSync(join(root, LOOP_STATE_FILE), live);
    expect(generatedEvalSeedBaseFromDisk(root)).toBe(11);
  });

  it("combines live log and archive when no historical marker is present", () => {
    const live = `
# AI Loop State

### Cycle result
stuff
`;
    const archive = `
### Cycle result
archived 1
### Cycle result
archived 2
`;
    writeFileSync(join(root, LOOP_STATE_FILE), live);
    writeFileSync(join(root, LOOP_ARCHIVE_FILE), archive);
    expect(generatedEvalSeedBaseFromDisk(root)).toBe(3);
  });
});
