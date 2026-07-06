/**
 * bug_0162 — the assessor's RPG GENERATOR MINT-AND-CHECK lever.
 *
 * The RPG generator (src/gen/rpg_generator.ts) is the consolidated loop's only live generated
 * eval surface. Every cycle the assessor mints a fresh WINDOW of never-seen RPG packs and asserts
 * the production `validateRpg` bar holds on them — so the suite's RICHEST
 * verifier surfaces (COMBAT winnability + SCORE-economy soundness, the RPG-only checks) are
 * exercised against a MOVING target each pass, not just the two FROZEN hand-authored RPG packs
 * (sunken_barrow, cold_forge), the memorisable-target condition the frozen-verifier literature
 * warns against (arXiv 2510.14253).
 *
 * This suite locks the lever's load-bearing properties, holding each to the SAME production
 * validateRpg the curated RPG packs clear (no weaker, lever-specific check):
 *
 *   1. A clean sweep raises NO candidate (the healthy state — the lever must not mask the 0.5
 *      saturation floor); a sweep where the REAL validateRpg flags a minted pack raises a
 *      high-priority engine candidate naming the offending seed + finding code — proven against
 *      the RPG-only SCORE_UNREACHABLE bar.
 *   2. On the real repo the lever is LIVE but inert: the current cycle's RPG window mints clean
 *      packs, so no generator-rpg-drift candidate is raised — and we prove the window is
 *      non-trivial (the check genuinely ran), so the green is real, not vacuous.
 *   3. The lever does not perturb assess() determinism.
 */
import { describe, it, expect } from "vitest";
import {
  assess,
  generatedEvalSeedBase,
  generatorRpgDriftCandidate,
  GEN_EVAL_CHECK_COUNT,
  type GeneratedPackCheck,
} from "../../src/afk/assessor.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { RpgPackSchema } from "../../src/rpg/schema.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCORE_ENGINE_M = Math.round((5 / 2) * 0.8 * 1000) / 1000; // score(5,"M","engine") = 2.0

describe("bug_0162 — generatorRpgDriftCandidate (clean ⇒ null, dirty ⇒ high-priority fix)", () => {
  it("returns null for an empty or all-clean sweep (the RPG verifier held)", () => {
    expect(generatorRpgDriftCandidate([])).toBeNull();
    // A genuinely clean sweep: mint real RPG packs and validate them with the REAL validator.
    const clean: GeneratedPackCheck[] = [101, 202, 303, 404].map((seed) => {
      const pack = generateRpgPack(seed);
      const report = validateRpg(pack);
      expect(report.findings).toHaveLength(0); // precondition: these packs ARE clean
      return { seed, report };
    });
    expect(generatorRpgDriftCandidate(clean)).toBeNull();
  });

  it("fires a high-priority engine candidate when the REAL validateRpg flags a minted pack", () => {
    // Take a real generated RPG pack and mutate it into a SCORE-UNREACHABLE shape: declare a
    // max_score LARGER than the reachable award sum (the RPG-only economy check). We run the
    // genuine production validateRpg over it — no hand-authored fake report — so the negative path
    // is proven against the same bar the curated
    // RPG packs clear, exactly as the RPG generator's own test does.
    const seed = 7;
    const good = generateRpgPack(seed);
    const broken = RpgPackSchema.parse({
      ...good,
      meta: { ...good.meta, max_score: good.meta.max_score + 5 }, // declared > reachable sum
    });
    const report = validateRpg(broken);
    expect(report.findings.some((f) => f.code === "SCORE_UNREACHABLE")).toBe(true); // the bar bites

    const cand = generatorRpgDriftCandidate([
      { seed: 0, report: validateRpg(good) }, // clean — must not be blamed
      { seed, report },
    ]);
    expect(cand).not.toBeNull();
    expect(cand!.id).toBe("generator-rpg-drift");
    expect(cand!.category).toBe("engine");
    expect(cand!.target).toBe("src/gen/rpg_generator.ts");
    expect(cand!.impact).toBe(5);
    expect(cand!.effort).toBe("M");
    expect(cand!.score).toBe(SCORE_ENGINE_M);
    // Evidence names ONLY the offending seed + the real finding code, not the clean one.
    expect(cand!.evidence).toHaveLength(1);
    expect(cand!.evidence[0]).toContain(`seed ${seed}`);
    expect(cand!.evidence[0]).toContain("SCORE_UNREACHABLE");
    expect(cand!.evidence[0]).not.toContain(broken.meta.id);
    expect(cand!.evidence.join("\n")).not.toContain("seed 0");
  });
});

describe("bug_0162 — the RPG lever is LIVE on the real repo, and inert because the generator is healthy", () => {
  const a = assess(process.cwd());

  it("raises NO generator-rpg-drift candidate (the RPG verifier holds on this cycle's fresh window)", () => {
    expect(a.candidates.find((c) => c.id === "generator-rpg-drift")).toBeUndefined();
  });

  it("is non-vacuous: this cycle's RPG seed window is real and mints validateRpg-clean packs", () => {
    // Prove the assess() above genuinely exercised the RPG verifier on a non-trivial window, so
    // its green is real (not "the check never ran"). Recompute the exact window assess() checked
    // and assert every RPG pack in it is clean — the reason no candidate was raised — confirming
    // the COMBAT/SCORE checks all held.
    const log = readFileSync(join(process.cwd(), "AI_LOOP_STATE.md"), "utf8");
    const cycles = generatedEvalSeedBase(log);
    expect(cycles).toBeGreaterThan(0); // the loop HAS run; the window is past seed 0
    const base = cycles * GEN_EVAL_CHECK_COUNT;
    let checked = 0;
    for (let i = 0; i < GEN_EVAL_CHECK_COUNT; i++) {
      const report = validateRpg(generateRpgPack(base + i));
      expect(report.findings).toHaveLength(0); // why no candidate fired: every minted RPG pack is clean
      checked++;
    }
    expect(checked).toBe(GEN_EVAL_CHECK_COUNT);
  });

  it("the RPG lever does not perturb determinism (same repo ⇒ identical ranking)", () => {
    const b = assess(process.cwd());
    expect(b.candidates.map((c) => `${c.id}:${c.score}`)).toEqual(
      a.candidates.map((c) => `${c.id}:${c.score}`),
    );
  });
});
