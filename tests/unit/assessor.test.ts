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

  it("spans multiple improvement categories (not just one kind of work)", () => {
    const cats = new Set<Category>(a.candidates.map((c) => c.category));
    // content_fix (coverage gaps exist), content_new (rpg is thin: 1<2), repo (no eslint).
    expect(cats.has("content_fix")).toBe(true);
    expect(cats.has("content_new")).toBe(true);
    expect(cats.size).toBeGreaterThanOrEqual(3);
  });

  it("flags the thin rpg mode as a content_new candidate", () => {
    const rpgNew = a.candidates.find((c) => c.category === "content_new" && c.target === "rpg");
    expect(rpgNew).toBeTruthy();
    expect(rpgNew!.title).toMatch(/rpg/i);
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
