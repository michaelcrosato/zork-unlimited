/**
 * bug_0167 — active generator programs are under the verifier-integrity guard.
 *
 * The supported procedural generator (src/gen/rpg_generator.ts) and the seal CLI are
 * protected. Retired non-RPG generators move to FORBIDDEN_FILES so they cannot
 * reappear as hidden authoring paths.
 *
 * It exercises the REAL pure detectors on the REAL PROTECTED_FILES list (not synthetic
 * stand-ins), so it fails if a future cycle removes a generator from the guard's surface.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  FORBIDDEN_FILES,
  PROTECTED_FILES,
  classifyDrift,
  detectGuardWeakening,
  runStatic,
  type GuardConstants,
} from "../../scripts/verify-integrity.js";

const GENERATOR_PROGRAM = ["src/gen/rpg_generator.ts", "bin/seal-corpus.ts"] as const;
const RETIRED_GENERATORS = ["src/gen/cyoa_generator.ts", "src/gen/parser_generator.ts"] as const;

describe("bug_0167 — active generator programs are guarded", () => {
  it("every generator-program file is in PROTECTED_FILES", () => {
    for (const f of GENERATOR_PROGRAM) expect(PROTECTED_FILES).toContain(f);
  });

  it("every guarded generator-program file actually exists on disk (no phantom protection)", () => {
    for (const f of GENERATOR_PROGRAM) expect(existsSync(join(process.cwd(), f))).toBe(true);
  });

  it("the real static check raises NO PROTECTED_MISSING for any generator-program file", () => {
    const res = runStatic(process.cwd());
    const missing = res.findings.filter((f) => f.code === "PROTECTED_MISSING").map((f) => f.where);
    for (const f of GENERATOR_PROGRAM) expect(missing).not.toContain(f);
  });

  it("retired non-RPG generators are forbidden rather than protected", () => {
    for (const f of RETIRED_GENERATORS) {
      expect(PROTECTED_FILES).not.toContain(f);
      expect(FORBIDDEN_FILES).toContain(f);
      expect(existsSync(join(process.cwd(), f))).toBe(false);
    }
    const res = runStatic(process.cwd());
    expect(res.findings.filter((f) => f.code === "FORBIDDEN_FILE_PRESENT")).toEqual([]);
  });

  it("DELETING the RPG generator now trips PROTECTED_DELETED (hard error)", () => {
    const fs = classifyDrift(["src/gen/rpg_generator.ts"], () => false);
    const del = fs.find((f) => f.code === "PROTECTED_DELETED");
    expect(del).toBeDefined();
    expect(del!.severity).toBe("error");
    expect(del!.where).toBe("src/gen/rpg_generator.ts");
  });

  it("EDITING the RPG generator surfaces VERIFIER_TOUCHED (warning, not a block — deepen cycles stay legal)", () => {
    const fs = classifyDrift(["src/gen/rpg_generator.ts"], () => true);
    expect(fs.some((f) => f.code === "VERIFIER_TOUCHED" && f.severity === "warning")).toBe(true);
    // a mere edit must NOT be a hard error — a deliberate deepen behind a generator_version
    // bump should commit, just visibly.
    expect(fs.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("REMOVING a generator from PROTECTED_FILES is itself GUARD_WEAKENED (the membership is locked)", () => {
    const before: GuardConstants = {
      minTestCases: 120,
      minAssertions: 400,
      minStrongAssertions: 400,
      protectedFiles: [...PROTECTED_FILES],
      forbiddenFiles: [...FORBIDDEN_FILES],
      forbiddenTrackedFiles: [],
      forbiddenPathPatterns: [],
      hashPinFiles: [],
    };
    const now: GuardConstants = {
      ...before,
      protectedFiles: PROTECTED_FILES.filter((f) => f !== "bin/seal-corpus.ts"),
    };
    const fs = detectGuardWeakening(before, now);
    expect(fs.map((f) => f.code)).toEqual(["GUARD_WEAKENED"]);
    expect(fs[0]!.severity).toBe("error");
    expect(fs[0]!.message).toContain("bin/seal-corpus.ts");
  });
});
