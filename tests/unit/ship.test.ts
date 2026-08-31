import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePorcelainPaths, parseShipArguments, shipBranchName } from "../../scripts/ship.js";
import {
  barForChangedFiles,
  CENSUS_PROOF_SOURCE_SCOPES,
  EXHAUSTIVE_PROOF_FILES,
  touchesCensusProofScope,
} from "../../scripts/test-lanes.js";

describe("ship", () => {
  it("requires a message and accepts only the documented flags", () => {
    expect(parseShipArguments(["fix", "the", "thing"])).toEqual({
      message: "fix the thing",
      full: false,
      merge: true,
      dryRun: false,
    });
    expect(parseShipArguments(["retune the solver", "--full", "--no-merge"])).toEqual({
      message: "retune the solver",
      full: true,
      merge: false,
      dryRun: false,
    });
    expect(() => parseShipArguments([])).toThrow("commit message is required");
    expect(() => parseShipArguments(["--full"])).toThrow("commit message is required");
    expect(() => parseShipArguments(["msg", "--force"])).toThrow("Unknown flag --force");
  });

  it("builds a unique, readable, short-lived branch name", () => {
    const at = new Date("2026-08-31T23:45:07Z");
    expect(shipBranchName("Split the vitest suite!", at)).toBe(
      "ship/split-the-vitest-suite-20260831-234507",
    );
    // Punctuation-only input still yields a valid ref rather than a trailing dash.
    // Seconds are in the stamp on purpose: two ships in the same minute must not collide.
    expect(shipBranchName("---", at)).toBe("ship/change-20260831-234507");
    expect(shipBranchName("a".repeat(80), at).length).toBeLessThan(64);
  });

  it("keeps both halves of a rename so a move out of census reach still escalates", () => {
    // Porcelain -z emits the destination, then the ORIGINAL, as separate NUL fields.
    expect(parsePorcelainPaths("R  scripts/engine.ts\0src/core/engine.ts\0")).toEqual([
      "scripts/engine.ts",
      "src/core/engine.ts",
    ]);
    // Keeping only the destination reads as a plain scripts/ edit and picks the fast lane,
    // while what actually moved is a file the proofs read.
    expect(
      barForChangedFiles(parsePorcelainPaths("R  scripts/engine.ts\0src/core/engine.ts\0")),
    ).toBe("full");
    expect(parsePorcelainPaths(" M src/rpg/runner.ts\0?? notes.md\0")).toEqual([
      "src/rpg/runner.ts",
      "notes.md",
    ]);
    // A path containing the literal " -> " survives, which arrow-splitting mangled.
    expect(parsePorcelainPaths(" M docs/a -> b.md\0")).toEqual(["docs/a -> b.md"]);
    expect(parsePorcelainPaths("")).toEqual([]);
  });

  it("escalates to the full bar for anything the census proofs can see", () => {
    expect(barForChangedFiles(["README.md", "scripts/ship.ts"])).toBe("fast");
    expect(barForChangedFiles(["blind-tester/fleet.mjs", "src/feedback/rank.ts"])).toBe("fast");
    // The safe direction: one engine or content path in a large diff forces the full bar.
    expect(barForChangedFiles(["README.md", "src/core/engine.ts"])).toBe("full");
    expect(barForChangedFiles(["content/rpg/quests/sunken_barrow.yaml"])).toBe("full");
    expect(barForChangedFiles(["vitest.config.ts"])).toBe("full");
    expect(barForChangedFiles([])).toBe("fast");
    // Windows-style separators reach this from `git status` on win32 checkouts.
    expect(touchesCensusProofScope("src\\core\\engine.ts")).toBe(true);
    // A prefix that merely starts with a scope name must not count as being inside it.
    expect(touchesCensusProofScope("src/coreutils/helper.ts")).toBe(false);
    expect(touchesCensusProofScope("vitest.config.ts.bak")).toBe(false);
  });

  it("covers the census proofs' TRANSITIVE dependency closure, not just direct imports", () => {
    // The direct-imports version of this test passed while four scopes were missing, because
    // the proofs import tests/regression/support/exhaustive_endings.ts, which is a one-line
    // re-export of src/solve/exhaustive_endings.ts — the solver they all run on. Walking one
    // hop found the re-export and stopped. This walks the whole closure, so a proof that
    // grows a dependency fails here instead of silently escaping the full-bar rule.
    const closure = new Set<string>();
    const queue = [...EXHAUSTIVE_PROOF_FILES];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (closure.has(file) || !existsSync(resolve(file))) continue;
      closure.add(file);
      for (const match of readFileSync(resolve(file), "utf8").matchAll(/from "(\.[^"]+)"/g)) {
        const specifier = match[1]!.replace(/\.js$/, ".ts");
        queue.push(
          relative(process.cwd(), resolve(dirname(file), specifier))
            .split("\\")
            .join("/"),
        );
      }
    }

    // A collapse to just the six seed files would make the assertion below vacuous.
    expect(closure.size).toBeGreaterThan(50);
    expect([...closure].filter((file) => !touchesCensusProofScope(file))).toEqual([]);
  });

  it("puts a census proof file itself on the full bar", () => {
    // Editing a proof and then running only the lane that excludes it is the most direct
    // way to land an unexercised change. The proofs sit in tests/regression/, which is not
    // a declared scope, so this is carried by the explicit file check rather than a prefix.
    for (const proof of EXHAUSTIVE_PROOF_FILES) {
      expect(touchesCensusProofScope(proof)).toBe(true);
      expect(barForChangedFiles(["README.md", proof])).toBe("full");
    }
    expect(touchesCensusProofScope("tests/regression/some_other_guard.test.ts")).toBe(false);
  });

  it("declares no scope it does not need", () => {
    for (const scope of CENSUS_PROOF_SOURCE_SCOPES)
      expect(touchesCensusProofScope(scope.endsWith("/") ? `${scope}x.ts` : scope)).toBe(true);
  });
});
