import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generatedEvalSeedBase,
  generatedEvalSeedBaseFromDisk,
  rpgGeneratorChecksForRoot,
  GEN_EVAL_CHECK_COUNT,
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

    it("ignores malformed historical marker values (non-numeric, negative, or invalid format)", () => {
      expect(
        generatedEvalSeedBase("<!-- historical_cycle_count: abc -->\n\n### Cycle result — one\n"),
      ).toBe(1);
      expect(
        generatedEvalSeedBase("<!-- historical_cycle_count: -5 -->\n\n### Cycle result — one\n"),
      ).toBe(1);
      expect(
        generatedEvalSeedBase("<!-- historical_cycle_count: 3.14 -->\n\n### Cycle result — one\n"),
      ).toBe(1);
    });

    it("handles whitespace variations in historical markers", () => {
      expect(
        generatedEvalSeedBase("<!--historical_cycle_count:15-->\n\n### Cycle result — test\n"),
      ).toBe(16);
      expect(
        generatedEvalSeedBase("<!--   historical_cycle_count:   7   -->\n\n### Cycle result — test\n"),
      ).toBe(8);
    });

    it("counts cycle results correctly when interspersed with other markdown headers and text", () => {
      const markdown = `
# AI Loop State

<!-- historical_cycle_count: 10 -->

Some introductory summary text.

## Section 1

### Cycle result — 2026-03-01
Details about cycle 1.

### Some other header
Not a cycle result.

### Cycle result — 2026-03-02
Details about cycle 2.
`;
      expect(generatedEvalSeedBase(markdown)).toBe(12);
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

  describe("rpgGeneratorChecksForRoot", () => {
    let root: string;
    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "geneval-rpg-"));
    });
    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it("generates pack checks based on total cycle count from disk", () => {
      writeFileSync(
        join(root, LOOP_STATE_FILE),
        "<!-- historical_cycle_count: 2 -->\n\n### Cycle result — one\n",
      );
      // total completed cycles = 3; GEN_EVAL_CHECK_COUNT = 4; expected seed base = 3 * 4 = 12
      const checks = rpgGeneratorChecksForRoot(root);

      expect(checks).toHaveLength(GEN_EVAL_CHECK_COUNT);
      expect(checks[0]?.seed).toBe(12);
      expect(checks[1]?.seed).toBe(13);
      expect(checks[2]?.seed).toBe(14);
      expect(checks[3]?.seed).toBe(15);

      for (const check of checks) {
        expect(check).toHaveProperty("seed");
        expect(check).toHaveProperty("report");
        expect(Array.isArray(check.report.findings)).toBe(true);
      }
    });
  });
});
