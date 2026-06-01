/**
 * The AFK assessor — the loop's deterministic "next best improvement" brain.
 * Verifies it spans the four categories, is deterministic (same repo ⇒ same
 * ranking), and reads real pack/mode health.
 */
import { describe, it, expect } from "vitest";
import { assess, formatAssessment, type Category } from "../../src/afk/assessor.js";

const a = assess(process.cwd());

describe("assess()", () => {
  it("counts packs by mode from the real content dirs", () => {
    expect(a.packsByMode["cyoa"]).toBeGreaterThanOrEqual(2);
    expect(a.packsByMode["parser"]).toBeGreaterThanOrEqual(2);
    expect(a.packsByMode["rpg"]).toBeGreaterThanOrEqual(1);
  });

  it("produces candidates and a top recommendation", () => {
    expect(a.candidates.length).toBeGreaterThan(0);
    expect(a.top).not.toBeNull();
    expect(a.top!.score).toBe(a.candidates[0]!.score); // top is the highest-scored
  });

  it("spans content and non-content work (not just one kind of work)", () => {
    const cats = new Set<Category>(a.candidates.map((c) => c.category));
    // content_fix (CYOA coverage gaps + parser/rpg playtest reviews) and repo (no
    // eslint) are the live levers. content_new is no longer raised because every
    // mode now meets its breadth target (cold_forge, bug_0021, brought rpg to 2/2)
    // — see "raises no content_new candidate …" below. The assessor must still span
    // content work AND non-content (tooling) work, so it never monotonically grinds
    // one kind of task.
    expect(cats.has("content_fix")).toBe(true);
    expect(cats.has("repo")).toBe(true);
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });

  it("does NOT raise bot-coverage content_fix for parser/rpg puzzle packs", () => {
    // The planning-free coverage bot can't solve multi-step puzzles, so its failure
    // to reach a parser/rpg ending is expected — not a content flaw. Those packs
    // must not produce a high-impact `fix-` candidate from bot coverage alone.
    for (const p of a.packs.filter((p) => (p.mode === "parser" || p.mode === "rpg") && p.warnings === 0)) {
      expect(a.candidates.find((c) => c.id === `fix-${p.path}`)).toBeUndefined();
    }
    // Any content_fix the assessor *recommends* must target a CYOA pack (where the
    // bot's coverage is a fair signal), never a parser/rpg bot-coverage phantom.
    const topPack = a.packs.find((p) => p.path === a.top!.target);
    if (topPack) expect(topPack.mode).toBe("cyoa");
  });

  it("keeps parser/rpg packs on the radar as low-priority blind-playtest reviews", () => {
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    expect(reviews.length).toBeGreaterThan(0);
    for (const r of reviews) expect(r.score).toBeLessThan(1); // ranked below real fixes + new content
  });

  it("raises no content_new candidate once every mode meets its breadth target", () => {
    // This cycle authored the game's 2nd RPG pack (The Cold Forge, bug_0021),
    // bringing every mode to TARGET_PER_MODE (cyoa/parser/rpg = 2/2/2). With the
    // game no longer thin in any mode, the assessor correctly STOPS recommending new
    // packs — the success condition of the broadening work. (Previously this test
    // asserted "flags the thin rpg mode as a content_new candidate"; that premise —
    // rpg 1<2 — is now false. If an operator wants deeper breadth, raising
    // TARGET_PER_MODE re-arms content_new; meeting the existing target legitimately
    // disarms it.)
    for (const mode of ["cyoa", "parser", "rpg"]) {
      expect(a.packsByMode[mode]).toBeGreaterThanOrEqual(2);
    }
    expect(a.candidates.find((c) => c.category === "content_new")).toBeUndefined();
  });

  it("every candidate is well-formed (evidence + score + effort)", () => {
    for (const c of a.candidates) {
      expect(c.id).toBeTruthy();
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.score).toBeGreaterThan(0);
      expect(["S", "M", "L"]).toContain(c.effort);
    }
  });

  it("ranks by score descending (deterministic ordering)", () => {
    for (let i = 1; i < a.candidates.length; i++) {
      expect(a.candidates[i - 1]!.score).toBeGreaterThanOrEqual(a.candidates[i]!.score);
    }
  });

  it("is deterministic: same repo ⇒ identical ranking", () => {
    const b = assess(process.cwd());
    expect(b.candidates.map((c) => `${c.id}:${c.score}`)).toEqual(a.candidates.map((c) => `${c.id}:${c.score}`));
  });

  it("formatAssessment renders the recommendation", () => {
    const out = formatAssessment(a);
    expect(out).toContain("next best improvement");
    expect(out).toContain("Recommended next");
  });
});
