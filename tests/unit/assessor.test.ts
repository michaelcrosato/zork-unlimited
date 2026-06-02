/**
 * The AFK assessor — the loop's deterministic "next best improvement" brain.
 * Verifies it spans the four categories, is deterministic (same repo ⇒ same
 * ranking), and reads real pack/mode health.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assess,
  formatAssessment,
  parseAttendanceOffsets,
  type Category,
} from "../../src/afk/assessor.js";

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

  it("disarms the repo ESLint+Prettier lever once the tooling is in place (bug_0031)", () => {
    const cats = new Set<Category>(a.candidates.map((c) => c.category));
    // The assessor's only non-content lever was "Add ESLint + Prettier (lint is just
    // tsc)". bug_0031 CLOSED that gap — eslint.config.js + .prettierrc.json ship and
    // `npm run lint` / `format:check` now run ESLint / Prettier. So, exactly as
    // content_new disarms once every mode meets its breadth target (see "raises no
    // content_new candidate …" below), the repo-eslint candidate is correctly no
    // longer raised; content_fix (CYOA coverage gaps + the low-priority parser/rpg
    // blind-playtest reviews — a distinct kind of content work, guarded below) is the
    // live lever. If the tooling were removed the assessor RE-ARMS repo-eslint, so
    // this assertion also catches that regression.
    expect(existsSync(join(process.cwd(), "eslint.config.js"))).toBe(true);
    expect(a.candidates.find((c) => c.id === "repo-eslint")).toBeUndefined();
    expect(cats.has("content_fix")).toBe(true);
    expect(a.candidates.length).toBeGreaterThan(0);
  });

  it("does NOT raise bot-coverage content_fix for parser/rpg puzzle packs", () => {
    // The planning-free coverage bot can't solve multi-step puzzles, so its failure
    // to reach a parser/rpg ending is expected — not a content flaw. Those packs
    // must not produce a high-impact `fix-` candidate from bot coverage alone.
    // (bug_0032 generalized this to PLANNING-GATED CYOA too — see
    // tests/regression/assessor_gated_cyoa_coverage.test.ts.)
    for (const p of a.packs.filter(
      (p) => (p.mode === "parser" || p.mode === "rpg") && p.warnings === 0,
    )) {
      expect(a.candidates.find((c) => c.id === `fix-${p.path}`)).toBeUndefined();
    }
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
    expect(b.candidates.map((c) => `${c.id}:${c.score}`)).toEqual(
      a.candidates.map((c) => `${c.id}:${c.score}`),
    );
  });

  it("formatAssessment renders the recommendation", () => {
    const out = formatAssessment(a);
    expect(out).toContain("next best improvement");
    expect(out).toContain("Recommended next");
  });
});

describe("frontier lever + blind-pass rotation (ULTRAPLAN 2026-06-02)", () => {
  it("raises the benchmark-scorecard lever above the 0.5 polish floor while no tool exists", () => {
    const hasTool = [
      join(process.cwd(), "bin", "benchmark.ts"),
      join(process.cwd(), "scripts", "benchmark.ts"),
    ].some((p) => existsSync(p));
    const frontier = a.candidates.find((c) => c.id === "frontier-benchmark-scorecard");
    if (hasTool) {
      // The lever self-extinguishes once the scorecard ships (like repo-eslint).
      expect(frontier).toBeUndefined();
    } else {
      expect(frontier).toBeDefined();
      expect(frontier!.score).toBeGreaterThan(0.5);
      // It outranks every saturated blind-playtest stub, so the loop reaches for
      // structural work instead of re-polishing clean prose.
      const polishTop = Math.max(
        0,
        ...a.candidates.filter((c) => c.id.startsWith("playtest-")).map((c) => c.score),
      );
      expect(frontier!.score).toBeGreaterThan(polishTop);
      expect(a.top!.id).toBe("frontier-benchmark-scorecard");
    }
  });

  it("parseAttendanceOffsets keeps the MOST RECENT mention and strips trailing punctuation", () => {
    const text = [
      "- Mandatory LLM playtest target this cycle: content/cyoa/pack/clockwork_heist.yaml.",
      "noise",
      "- Mandatory LLM playtest target this cycle: content/rpg/pack/cold_forge.yaml.",
      "- Mandatory LLM playtest target this cycle: content/cyoa/pack/clockwork_heist.yaml.",
    ].join("\n");
    const offsets = parseAttendanceOffsets(text);
    expect(offsets.has("content/cyoa/pack/clockwork_heist.yaml")).toBe(true);
    expect(offsets.has("content/rpg/pack/cold_forge.yaml")).toBe(true);
    // clockwork's recorded offset is its LAST (largest) mention, after cold_forge's.
    expect(offsets.get("content/cyoa/pack/clockwork_heist.yaml")!).toBeGreaterThan(
      offsets.get("content/rpg/pack/cold_forge.yaml")!,
    );
  });

  it("rotates the blind pass onto the least-recently-attended pack (no clockwork lock-in)", () => {
    const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
    if (!existsSync(loopState)) return; // rotation is a no-op without the log
    const offsets = parseAttendanceOffsets(readFileSync(loopState, "utf8"));
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length < 2) return;
    // The assessor's actual order, restricted to the blind-playtest stubs.
    const actual = reviews.map((c) => c.target);
    // Expected: ascending recency offset (never-attended = -1 first), then id asc.
    const expected = [...reviews]
      .sort(
        (x, y) =>
          (offsets.get(x.target) ?? -1) - (offsets.get(y.target) ?? -1) || x.id.localeCompare(y.id),
      )
      .map((c) => c.target);
    expect(actual).toEqual(expected);
  });
});
