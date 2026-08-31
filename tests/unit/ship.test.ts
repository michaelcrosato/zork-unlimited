import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseShipArguments, shipBranchName } from "../../scripts/ship.js";
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

  it("covers every scope the census proofs actually import", () => {
    // Re-derived from the proofs themselves, so a proof that grows a new dependency fails
    // here instead of quietly escaping the full-bar rule that protects it.
    const imported = new Set<string>();
    for (const proof of EXHAUSTIVE_PROOF_FILES) {
      const text = readFileSync(resolve(proof), "utf8");
      for (const match of text.matchAll(/from "(\.[^"]+)"/g)) {
        const specifier = match[1]!.replace(/\.js$/, ".ts");
        imported.add(
          relative(process.cwd(), resolve(dirname(proof), specifier))
            .split("\\")
            .join("/"),
        );
      }
    }

    expect(imported.size).toBeGreaterThan(0);
    const uncovered = [...imported].filter((path) => !touchesCensusProofScope(path));
    expect(uncovered).toEqual([]);
    // Every declared scope earns its place: content/ is read at runtime by the proofs'
    // pack discovery, and vitest.config.ts decides which project runs them at all.
    for (const scope of CENSUS_PROOF_SOURCE_SCOPES)
      expect(touchesCensusProofScope(scope.endsWith("/") ? `${scope}x.ts` : scope)).toBe(true);
  });
});
