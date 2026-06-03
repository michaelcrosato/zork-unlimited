/**
 * bug_0166 — the assessor's PARSER GENERATOR MINT-AND-CHECK lever (the THIRD twin that completes
 * the generator trilogy on the assessor side).
 *
 * The CYOA generator went core (bug_0156) → MCP (bug_0157) → assessor mint-and-check (bug_0158).
 * The RPG generator went core (bug_0159) → MCP (bug_0160) → assessor mint-and-check (bug_0162).
 * The PARSER generator (src/gen/parser_generator.ts) went core+MCP (bug_0164), was sealed into the
 * held-out corpus (bug_0163) and scored (bug_0165) — but never got its per-cycle mint-and-check
 * half. This slice lands it: every cycle the assessor mints a fresh WINDOW of never-seen parser
 * packs and asserts the production `validateParser` bar holds on them — so the STRICTEST verifier
 * surfaces in the suite (the obtainability fixpoint, soft-lock detection, the WIN_FIRES_AT_START
 * stability proof, and the SCORE_UNREACHABLE economy check) are exercised against a MOVING target
 * each pass, not just the static 24-seed unit test and the 4-seed sealed corpus — the
 * memorisable-target condition the frozen-verifier literature warns against (arXiv 2510.14253).
 *
 * This suite locks the lever's load-bearing properties, holding each to the SAME production
 * validateParser the curated parser packs clear (no weaker, lever-specific check):
 *
 *   1. A clean sweep raises NO candidate (the healthy state — the lever must not mask the 0.5
 *      saturation floor); a sweep where the REAL validateParser flags a minted pack raises a
 *      high-priority engine candidate naming the offending seed + finding code — proven against
 *      the SCORE_UNREACHABLE bar.
 *   2. On the real repo the lever is LIVE but inert: the current cycle's parser window mints clean
 *      packs, so no generator-parser-drift candidate is raised — and we prove the window is
 *      non-trivial (the check genuinely ran), so the green is real, not vacuous.
 *   3. The lever does not perturb assess() determinism.
 */
import { describe, it, expect } from "vitest";
import {
  assess,
  generatedEvalSeedBase,
  generatorParserDriftCandidate,
  GEN_EVAL_CHECK_COUNT,
  type GeneratedPackCheck,
} from "../../src/afk/assessor.js";
import { generateParserPack } from "../../src/gen/parser_generator.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { ParserPackSchema } from "../../src/parser/schema.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCORE_ENGINE_M = Math.round((5 / 2) * 0.8 * 1000) / 1000; // score(5,"M","engine") = 2.0

describe("bug_0166 — generatorParserDriftCandidate (clean ⇒ null, dirty ⇒ high-priority fix)", () => {
  it("returns null for an empty or all-clean sweep (the parser verifier held)", () => {
    expect(generatorParserDriftCandidate([])).toBeNull();
    // A genuinely clean sweep: mint real parser packs and validate them with the REAL validator.
    const clean: GeneratedPackCheck[] = [101, 202, 303, 404].map((seed) => {
      const pack = generateParserPack(seed);
      const report = validateParser(pack);
      expect(report.findings).toHaveLength(0); // precondition: these packs ARE clean
      return { seed, pack_id: pack.meta.id, report };
    });
    expect(generatorParserDriftCandidate(clean)).toBeNull();
  });

  it("fires a high-priority engine candidate when the REAL validateParser flags a minted pack", () => {
    // Take a real generated parser pack and mutate it into a SCORE-UNREACHABLE shape: declare a
    // max_score LARGER than the reachable award sum (the parser economy check). We run the genuine
    // production validateParser over it — no hand-authored fake report — so the negative path is
    // proven against the same bar the curated parser packs clear, exactly as the parser generator's
    // own test does.
    const seed = 7;
    const good = generateParserPack(seed);
    const broken = ParserPackSchema.parse({
      ...good,
      meta: { ...good.meta, max_score: good.meta.max_score + 50 }, // declared > reachable sum
    });
    const report = validateParser(broken);
    expect(report.findings.some((f) => f.code === "SCORE_UNREACHABLE")).toBe(true); // the bar bites

    const cand = generatorParserDriftCandidate([
      { seed: 0, pack_id: good.meta.id, report: validateParser(good) }, // clean — must not be blamed
      { seed, pack_id: broken.meta.id, report },
    ]);
    expect(cand).not.toBeNull();
    expect(cand!.id).toBe("generator-parser-drift");
    expect(cand!.category).toBe("engine");
    expect(cand!.target).toBe("src/gen/parser_generator.ts");
    expect(cand!.impact).toBe(5);
    expect(cand!.effort).toBe("M");
    expect(cand!.score).toBe(SCORE_ENGINE_M);
    // Evidence names ONLY the offending seed + the real finding code, not the clean one.
    expect(cand!.evidence).toHaveLength(1);
    expect(cand!.evidence[0]).toContain(`seed ${seed}`);
    expect(cand!.evidence[0]).toContain("SCORE_UNREACHABLE");
    expect(cand!.evidence.join("\n")).not.toContain("seed 0");
  });
});

describe("bug_0166 — the parser lever is LIVE on the real repo, and inert because the generator is healthy", () => {
  const a = assess(process.cwd());

  it("raises NO generator-parser-drift candidate (the parser verifier holds on this cycle's fresh window)", () => {
    expect(a.candidates.find((c) => c.id === "generator-parser-drift")).toBeUndefined();
  });

  it("is non-vacuous: this cycle's parser seed window is real and mints validateParser-clean packs", () => {
    // Prove the assess() above genuinely exercised the parser verifier on a non-trivial window, so
    // its green is real (not "the check never ran"). Recompute the exact window assess() checked
    // (the SAME advancing base the CYOA and RPG levers use) and assert every parser pack in it is
    // clean — the reason no candidate was raised — confirming the obtainability/soft-lock/SCORE
    // checks all held.
    const log = readFileSync(join(process.cwd(), "AI_LOOP_STATE.md"), "utf8");
    const cycles = generatedEvalSeedBase(log);
    expect(cycles).toBeGreaterThan(0); // the loop HAS run; the window is past seed 0
    const base = cycles * GEN_EVAL_CHECK_COUNT;
    let checked = 0;
    for (let i = 0; i < GEN_EVAL_CHECK_COUNT; i++) {
      const report = validateParser(generateParserPack(base + i));
      expect(report.findings).toHaveLength(0); // why no candidate fired: every minted parser pack is clean
      checked++;
    }
    expect(checked).toBe(GEN_EVAL_CHECK_COUNT);
  });

  it("the parser lever does not perturb determinism (same repo ⇒ identical ranking)", () => {
    const b = assess(process.cwd());
    expect(b.candidates.map((c) => `${c.id}:${c.score}`)).toEqual(
      a.candidates.map((c) => `${c.id}:${c.score}`),
    );
  });
});
