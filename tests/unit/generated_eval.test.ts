import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatedEvalSeedBase,
  generatedEvalSeedBaseFromDisk,
} from "../../src/afk/generated_eval.js";
import { LOOP_STATE_FILE, LOOP_ARCHIVE_FILE } from "../../src/afk/loop_state.js";

describe("generated_eval pure seed wrappers", () => {
  describe("generatedEvalSeedBase", () => {
    it("returns 0 for empty or malformed text", () => {
      expect(generatedEvalSeedBase("")).toBe(0);
      expect(generatedEvalSeedBase("just some text\nno cycles here")).toBe(0);
    });

    it("counts rich cycle entries", () => {
      expect(generatedEvalSeedBase("### Cycle result — one\n\n### Cycle result — two\n\n")).toBe(2);
    });

    it("adds the historical marker count to the rich cycle count", () => {
      expect(
        generatedEvalSeedBase("<!-- historical_cycle_count: 42 -->\n\n### Cycle result — one\n\n"),
      ).toBe(43);
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

    it("returns 0 when no state files exist", () => {
      expect(generatedEvalSeedBaseFromDisk(root)).toBe(0);
    });

    it("reads only the live log if a historical marker is present", () => {
      writeFileSync(
        join(root, LOOP_STATE_FILE),
        "<!-- historical_cycle_count: 10 -->\n\n### Cycle result — one\n",
      );
      // Even if an archive exists (which shouldn't be read if historical marker > 0)
      writeFileSync(
        join(root, LOOP_ARCHIVE_FILE),
        "### Cycle result — old\n### Cycle result — older\n",
      );
      expect(generatedEvalSeedBaseFromDisk(root)).toBe(11);
    });

    it("combines the live log and the archive when no historical marker is present", () => {
      writeFileSync(
        join(root, LOOP_STATE_FILE),
        "### Cycle result — live 1\n### Cycle result — live 2\n",
      );
      writeFileSync(
        join(root, LOOP_ARCHIVE_FILE),
        "### Cycle result — arch 1\n### Cycle result — arch 2\n### Cycle result — arch 3\n",
      );
      expect(generatedEvalSeedBaseFromDisk(root)).toBe(5);
    });
  });
});
