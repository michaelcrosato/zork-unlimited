import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "../../src/intake/atomic_file.js";

/**
 * bug_0609 — queue and ticket files were written with a bare writeFileSync, so a crash
 * or a second lane mid-write could leave a half-written JSON file behind, and readQueue
 * then refused the whole directory. The atomic writer stages the bytes beside the
 * target and renames into place, which the filesystem applies as one step.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atomic-file-"));
  dirs.push(dir);
  return dir;
}

describe("writeFileAtomic", () => {
  it("creates the file with exactly the given bytes and leaves no staging file behind", () => {
    const dir = tempDir();
    writeFileAtomic(join(dir, "a.json"), '{"a":1}\n');
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe('{"a":1}\n');
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });

  it("replaces an existing file in place", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "a.json"), "old", "utf8");
    writeFileAtomic(join(dir, "a.json"), "new");
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe("new");
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });

  it("never leaves a partial target when the write cannot complete", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "a.json"), "intact", "utf8");
    // The staging file cannot be created inside a path that does not exist, so the
    // rename never happens and the original stays untouched.
    expect(() => writeFileAtomic(join(dir, "missing", "a.json"), "new")).toThrow();
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe("intact");
    expect(readdirSync(dir)).toEqual(["a.json"]);
  });
});
