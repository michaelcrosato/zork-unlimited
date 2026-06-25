/**
 * bug_0158 — the assessor's GENERATOR MINT-AND-CHECK lever.
 *
 * The fresh-pack generator (src/gen/cyoa_generator.ts, bug_0156) exists to EVOLVE the eval
 * distribution so the verifier faces a moving target instead of a memorisable frozen set
 * (arXiv 2510.14253). bug_0157 exposed it through MCP; this slice makes the assessor
 * mint-and-check a fresh slice of the distribution EVERY cycle, so the production
 * validateCyoa bar is provably exercised against never-seen packs each pass — not just the
 * curated ten.
 *
 * This suite locks the lever's three load-bearing properties, holding each to the SAME
 * production validateCyoa the curated packs clear (no weaker, lever-specific check):
 *
 *   1. The per-cycle seed base is PURE and ADVANCES with the cycle count — deterministic
 *      for a given log (so `assess()` stays deterministic) yet a different window each cycle
 *      (the "moving target" property the whole idea rests on).
 *   2. A clean sweep raises NO candidate (the healthy state — the lever must not mask the
 *      0.5 saturation floor); a sweep where the REAL validateCyoa flags a minted pack raises
 *      a high-priority engine candidate naming the offending seed + finding code.
 *   3. On the real repo the lever is LIVE but inert: the current cycle's window mints clean
 *      packs, so no generator-drift candidate is raised — and we prove the window is
 *      non-trivial (the check genuinely ran), so the green is real, not vacuous.
 */
import { describe, it, expect } from "vitest";
import {
  assess,
  generatedEvalSeedBase,
  generatorDriftCandidate,
  GEN_EVAL_CHECK_COUNT,
  type GeneratedPackCheck,
} from "../../src/afk/assessor.js";
import { generateCyoaPack } from "../../src/gen/cyoa_generator.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";
import { CyoaPackSchema } from "../../src/cyoa/schema.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCORE_ENGINE_M = Math.round((5 / 2) * 0.8 * 1000) / 1000; // score(5,"M","engine") = 2.0

describe("bug_0158 — generatedEvalSeedBase (pure, advancing, deterministic)", () => {
  it("counts the '### Cycle result' entries the log prepends, so it grows one per cycle", () => {
    const log = [
      "# AI Loop State",
      "### Cycle result — engine (bug_0003): ...",
      "- detail",
      "### Cycle result — content (bug_0002): ...",
      "### Cycle result — content (bug_0001): ...",
    ].join("\n");
    expect(generatedEvalSeedBase(log)).toBe(3);
    // One more cycle prepended ⇒ base advances by exactly one (a fresh, disjoint window).
    const next = "### Cycle result — engine (bug_0004): ...\n" + log;
    expect(generatedEvalSeedBase(next)).toBe(4);
  });

  it("adds the compact historical count marker to recent cycle entries", () => {
    const log = [
      "# AI Loop State",
      "<!-- historical_cycle_count: 16 -->",
      "### Cycle result — token efficiency: ...",
      "### Cycle result — content fix: ...",
    ].join("\n");
    expect(generatedEvalSeedBase(log)).toBe(18);
  });

  it("is 0 for an empty/markerless log (no cycles recorded yet)", () => {
    expect(generatedEvalSeedBase("")).toBe(0);
    expect(generatedEvalSeedBase("no markers here\n## Some heading")).toBe(0);
  });

  it("only counts the line-start header, not incidental mentions of the phrase", () => {
    // A prose mention of "### Cycle result" mid-line, or the words without the marker,
    // must NOT inflate the count — only the prepended headers do.
    const log =
      "see the ### Cycle result format below\nCycle result is great\n### Cycle result — x";
    expect(generatedEvalSeedBase(log)).toBe(1);
  });
});

describe("bug_0158 — generatorDriftCandidate (clean ⇒ null, dirty ⇒ high-priority fix)", () => {
  it("returns null for an empty or all-clean sweep (the verifier held)", () => {
    expect(generatorDriftCandidate([])).toBeNull();
    // A genuinely clean sweep: mint real packs and validate them with the REAL validator.
    const clean: GeneratedPackCheck[] = [101, 202, 303].map((seed) => {
      const pack = generateCyoaPack(seed);
      const report = validateCyoa(pack);
      expect(report.findings).toHaveLength(0); // precondition: these packs ARE clean
      return { seed, pack_id: pack.meta.id, report };
    });
    expect(generatorDriftCandidate(clean)).toBeNull();
  });

  it("fires a high-priority engine candidate when the REAL validateCyoa flags a minted pack", () => {
    // Take a real generated pack and mutate it into an UNCLEAN shape: an extra declared
    // ending no choice routes to (ENDING_UNREACHABLE). We run the genuine production
    // validateCyoa over it — no hand-authored fake report — so the negative path is proven
    // against the same bar the curated packs clear, exactly as the generator's own test does.
    const seed = 7;
    const good = generateCyoaPack(seed);
    const broken = CyoaPackSchema.parse({
      ...good,
      endings: [
        ...good.endings,
        { id: "ending_orphan", title: "Orphan", text: "Unreachable by design." },
      ],
    });
    const report = validateCyoa(broken);
    expect(report.findings.some((f) => f.code === "ENDING_UNREACHABLE")).toBe(true); // the bar bites

    const cand = generatorDriftCandidate([
      { seed: 0, pack_id: good.meta.id, report: validateCyoa(good) }, // clean — must not be blamed
      { seed, pack_id: broken.meta.id, report },
    ]);
    expect(cand).not.toBeNull();
    expect(cand!.id).toBe("generator-drift");
    expect(cand!.category).toBe("engine");
    expect(cand!.target).toBe("src/gen/cyoa_generator.ts");
    expect(cand!.impact).toBe(5);
    expect(cand!.effort).toBe("M");
    expect(cand!.score).toBe(SCORE_ENGINE_M);
    // Evidence names ONLY the offending seed + the real finding code, not the clean one.
    expect(cand!.evidence).toHaveLength(1);
    expect(cand!.evidence[0]).toContain(`seed ${seed}`);
    expect(cand!.evidence[0]).toContain("ENDING_UNREACHABLE");
    expect(cand!.evidence.join("\n")).not.toContain("seed 0");
  });
});

describe("bug_0158 — the lever is LIVE on the real repo, and inert because the generator is healthy", () => {
  const a = assess(process.cwd());

  it("raises NO generator-drift candidate (the verifier holds on this cycle's fresh window)", () => {
    expect(a.candidates.find((c) => c.id === "generator-drift")).toBeUndefined();
  });

  it("is non-vacuous: this cycle's seed window is real and mints validator-clean packs", () => {
    // Prove the assess() above genuinely exercised the verifier on a non-trivial window,
    // so its green is real (not "the check never ran"). Recompute the exact window assess()
    // checked and assert every pack in it is clean — the reason no candidate was raised.
    const cycles = generatedEvalSeedBase(
      readFileSync(join(process.cwd(), "AI_LOOP_STATE.md"), "utf8"),
    );
    expect(cycles).toBeGreaterThan(0); // the loop HAS run; the window is past seed 0
    const base = cycles * GEN_EVAL_CHECK_COUNT;
    let checked = 0;
    for (let i = 0; i < GEN_EVAL_CHECK_COUNT; i++) {
      const report = validateCyoa(generateCyoaPack(base + i));
      expect(report.findings).toHaveLength(0); // why no candidate fired: every minted pack is clean
      checked++;
    }
    expect(checked).toBe(GEN_EVAL_CHECK_COUNT);
  });

  it("the lever does not perturb determinism (same repo ⇒ identical ranking)", () => {
    const b = assess(process.cwd());
    expect(b.candidates.map((c) => `${c.id}:${c.score}`)).toEqual(
      a.candidates.map((c) => `${c.id}:${c.score}`),
    );
  });
});
