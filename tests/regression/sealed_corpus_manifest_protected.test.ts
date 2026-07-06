/**
 * bug_0176 — the sealed held-out corpus manifest is under the verifier-integrity guard.
 *
 * corpus/manifest.json is the OUTPUT of bin/seal-corpus.ts and a committed,
 * contamination-free held-out generator corpus (bug_0163/bug_0165): each entry fixes a
 * generated pack content_hash + generator_version for a frozen seed window — a sealed,
 * timestamped held-out split kept aside for any future real-model evaluation. The
 * generators that MINT it (src/gen/*) were locked under PROTECTED_FILES in bug_0167, but
 * the manifest itself sat OUTSIDE the guard —
 * so a manual re-seal that rewrites these hashes WITHOUT a generator change (the launder
 * that swaps in a degraded eval distribution and re-pins to make held_out_corpus_sealed
 * go green) would slip past the drift check unseen. This was the standing trust-tightening
 * lever (c) deferred across bug_0172/0173/0174.
 *
 * This test locks the manifest under the guard the same way bug_0167 locked the generator
 * program: deleting it is a hard PROTECTED_DELETED error, editing/re-sealing it surfaces
 * VERIFIER_TOUCHED for review (a deliberate re-seal stays legal, just visibly), and dropping
 * it from PROTECTED_FILES is itself the DGM "edit-the-checker" launder (GUARD_WEAKENED).
 * It exercises the REAL pure detectors on the REAL PROTECTED_FILES list, so it fails if a
 * future cycle removes the manifest from the guard's surface.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  PROTECTED_FILES,
  classifyDrift,
  detectGuardWeakening,
  runStatic,
  type GuardConstants,
} from "../../scripts/verify-integrity.js";

const MANIFEST = "corpus/manifest.json";

describe("bug_0176 — the sealed corpus manifest is guarded", () => {
  it("the manifest is in PROTECTED_FILES", () => {
    expect(PROTECTED_FILES).toContain(MANIFEST);
  });

  it("the guarded manifest actually exists on disk (no phantom protection)", () => {
    expect(existsSync(join(process.cwd(), MANIFEST))).toBe(true);
  });

  it("the real static check raises NO PROTECTED_MISSING for the manifest", () => {
    const res = runStatic(process.cwd());
    const missing = res.findings.filter((f) => f.code === "PROTECTED_MISSING").map((f) => f.where);
    expect(missing).not.toContain(MANIFEST);
  });

  it("DELETING the manifest now trips PROTECTED_DELETED (hard error)", () => {
    const fs = classifyDrift([MANIFEST], () => false);
    const del = fs.find((f) => f.code === "PROTECTED_DELETED");
    expect(del).toBeDefined();
    expect(del!.severity).toBe("error");
    expect(del!.where).toBe(MANIFEST);
  });

  it("RE-SEALING the manifest surfaces VERIFIER_TOUCHED (warning, not a block — deliberate re-seals stay legal)", () => {
    const fs = classifyDrift([MANIFEST], () => true);
    expect(fs.some((f) => f.code === "VERIFIER_TOUCHED" && f.severity === "warning")).toBe(true);
    // a re-seal must NOT be a hard error — a deliberate deepen behind a generator_version
    // bump (which also re-seals) should commit, just visibly.
    expect(fs.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("REMOVING the manifest from PROTECTED_FILES is itself GUARD_WEAKENED (the membership is locked)", () => {
    const before: GuardConstants = {
      minTestCases: 120,
      minAssertions: 400,
      minStrongAssertions: 400,
      protectedFiles: [...PROTECTED_FILES],
      forbiddenFiles: [],
      forbiddenTrackedFiles: [],
      forbiddenPathPatterns: [],
      hashPinFiles: [],
    };
    const now: GuardConstants = {
      ...before,
      protectedFiles: PROTECTED_FILES.filter((f) => f !== MANIFEST),
    };
    const fs = detectGuardWeakening(before, now);
    expect(fs.map((f) => f.code)).toEqual(["GUARD_WEAKENED"]);
    expect(fs[0]!.severity).toBe("error");
    expect(fs[0]!.message).toContain(MANIFEST);
  });
});
