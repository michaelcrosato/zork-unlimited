/**
 * The laundering path around the two protected solver assets, closed.
 *
 * PROTECTED_FILES guards `src/solve/exhaustive_endings.ts` (the ground truth under the
 * whole census-proof family) together with `tests/regression/exhaustive_endings_cap_
 * backstop.test.ts` (its two-sided witness that the state cap actually fires), with the
 * stated rationale that guarding either alone is theatre. But every one of those callers
 * — the cap backstop included — reaches the solver through a three-line re-export shim at
 * `tests/regression/support/exhaustive_endings.ts`, and that shim was in neither list. It
 * is also not a `.test.ts` file, so listTestFiles never sees it: no case, assertion,
 * strong-matcher or tautology count reads it, and DISABLED_RE never scans it.
 *
 * Replacing its `export *` with a weakened local search therefore neutralised the
 * protected solver AND its protected backstop in one edit, with no PROTECTED_DELETED, no
 * VERIFIER_TOUCHED, no count change and no disabled marker. The shim is now protected,
 * and this test is the behavioural half: the bindings the proofs import must BE the
 * protected implementation, not merely resemble it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROTECTED_FILES } from "../../scripts/verify-integrity.js";
import * as shim from "./support/exhaustive_endings.js";
import * as implementation from "../../src/solve/exhaustive_endings.js";

const SHIM_PATH = "tests/regression/support/exhaustive_endings.ts";
const IMPLEMENTATION_PATH = "src/solve/exhaustive_endings.ts";
const asRecord = (namespace: object): Record<string, unknown> =>
  namespace as unknown as Record<string, unknown>;

describe("the solver shim is the protected implementation, not a copy of it", () => {
  it("exports exactly the protected module's runtime bindings, by reference", () => {
    const exported = Object.keys(asRecord(implementation)).sort();
    expect(exported).toContain("exhaustiveEndings");
    expect(exported.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(asRecord(shim)).sort()).toEqual(exported);
    for (const name of exported) {
      // Referential identity: a re-export yields the same object; a local reimplementation
      // — however similar its behaviour looks — cannot.
      expect(asRecord(shim)[name]).toBe(asRecord(implementation)[name]);
    }
  });

  it("its source is a re-export of the protected path and holds no search of its own", () => {
    const text = readFileSync(join(process.cwd(), SHIM_PATH), "utf8");
    expect(text).toMatch(/export \* from ".*\/src\/solve\/exhaustive_endings\.js";/);
    // No local implementation smuggled in beside the re-export.
    expect(text).not.toMatch(/\bfunction\b/);
    expect(text).not.toMatch(/=>/);
  });

  it("both the shim and the assets that reach the solver through it are protected", () => {
    expect(PROTECTED_FILES).toContain(SHIM_PATH);
    expect(PROTECTED_FILES).toContain(IMPLEMENTATION_PATH);
    expect(PROTECTED_FILES).toContain("tests/regression/exhaustive_endings_cap_backstop.test.ts");
  });

  it("the protected cap backstop really does import through the shim", () => {
    // If this ever stops being true the protection above is over-broad rather than
    // wrong, but the rationale in PROTECTED_FILES would need rewriting — so pin it.
    const backstop = readFileSync(
      join(process.cwd(), "tests/regression/exhaustive_endings_cap_backstop.test.ts"),
      "utf8",
    );
    expect(backstop).toContain('from "./support/exhaustive_endings.js"');
  });
});
