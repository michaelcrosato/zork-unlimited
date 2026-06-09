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
  isSaturated,
  packStem,
  parseAttendanceOffsets,
  SATURATION_FLOOR,
  type Assessment,
  type Category,
  type ImprovementCandidate,
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

  it("does NOT raise content_new candidates once all modes have met their breadth target", () => {
    // TARGET_PER_MODE = {cyoa:12, parser:10, rpg:10} (bug_0335). All three modes have
    // now reached their targets (cyoa=12, parser=10, rpg=10 with advocates_case_v1), so
    // the assessor correctly DISARMS content_new for all modes. Raising TARGET_PER_MODE
    // re-arms it; this assertion catches any unintended regression that re-adds the lever
    // when all modes are satisfied.
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

describe("blind-pass rotation (bug_0128)", () => {
  it("packStem normalizes a pack path OR a bare id to the same stem", () => {
    expect(packStem("content/cyoa/pack/clockwork_heist.yaml")).toBe("clockwork_heist");
    expect(packStem("content/rpg/pack/cold_forge.yml")).toBe("cold_forge");
    expect(packStem("clockwork_heist")).toBe("clockwork_heist");
    // bug_0293: a pack ID carries a _vN suffix the file stem does not; both must converge
    // so the code-written `Blind-playtest "<id>"` attendance line keys to the candidate's
    // path-derived stem.
    expect(packStem("clockwork_heist_v1")).toBe("clockwork_heist");
    expect(packStem("content/cyoa/pack/clockwork_heist.yaml")).toBe(packStem("clockwork_heist_v1"));
  });

  it("parseAttendanceOffsets keeps the MOST RECENT (topmost) mention in the newest-first log (bug_0128)", () => {
    // AI_LOOP_STATE.md is NEWEST-FIRST (each cycle PREPENDS at the top), so a pack's
    // FIRST (smallest-offset) mention is its most recent. Here clockwork appears at the
    // very top (most recent) and again at the bottom (older); cold_forge sits between.
    const text = [
      "- Mandated blind pass ran on clockwork_heist (CYOA, seed 3).", // most recent
      "noise noise noise",
      "- Mandated blind pass ran on cold_forge (rpg, seed 7).",
      "- Mandated blind pass ran on clockwork_heist (CYOA, seed 99).", // older repeat
    ].join("\n");
    const offsets = parseAttendanceOffsets(text);
    // Keyed by stem, recognizing the CURRENT prose phrasing + a bare id token.
    expect(offsets.has("clockwork_heist")).toBe(true);
    expect(offsets.has("cold_forge")).toBe(true);
    // clockwork's kept offset is its FIRST (topmost = most recent) mention, BEFORE
    // cold_forge's — the opposite of the pre-bug_0128 last-write-wins behaviour.
    expect(offsets.get("clockwork_heist")!).toBeLessThan(offsets.get("cold_forge")!);
  });

  it("parseAttendanceOffsets still recognizes the legacy structured-header marker", () => {
    const text =
      "- Mandatory LLM playtest target this cycle: content/cyoa/pack/wreckers_light.yaml.";
    const offsets = parseAttendanceOffsets(text);
    expect(offsets.has("wreckers_light")).toBe(true);
  });

  it("rotates the blind pass onto the LEAST-recently-attended pack, never-attended first (bug_0128)", () => {
    const loopState = join(process.cwd(), "AI_LOOP_STATE.md");
    if (!existsSync(loopState)) return; // rotation is a no-op without the log
    const offsets = parseAttendanceOffsets(readFileSync(loopState, "utf8"));
    const reviews = a.candidates.filter((c) => c.id.startsWith("playtest-"));
    if (reviews.length < 2) return;
    const actual = reviews.map((c) => c.target);
    // The SEMANTIC property, computed independently of the implementation: a pack
    // never attended (no mention) sorts first; otherwise the one whose most-recent
    // mention is OLDEST (largest offset in this newest-first log) sorts first; id asc
    // breaks exact ties. Earlier this test mirrored the production sort expression, so
    // it could not catch a wrong sort DIRECTION — it now states the property outright.
    const rank = (target: string): number => {
      const off = offsets.get(packStem(target));
      return off === undefined ? Number.MIN_SAFE_INTEGER : -off;
    };
    const expected = [...reviews]
      .sort((x, y) => rank(x.target) - rank(y.target) || x.id.localeCompare(y.id))
      .map((c) => c.target);
    expect(actual).toEqual(expected);
    // And concretely: the first-nominated pack must NOT be more recently attended
    // than the last-nominated one (the lock-in symptom was the reverse).
    const firstOff = offsets.get(packStem(actual[0]!));
    const lastOff = offsets.get(packStem(actual[actual.length - 1]!));
    if (firstOff !== undefined && lastOff !== undefined) {
      expect(firstOff).toBeGreaterThanOrEqual(lastOff); // larger offset = less recent
    }
  });
});

describe("isSaturated — the saturation-triggered ultraplan signal", () => {
  const candidate = (score: number): ImprovementCandidate => ({
    id: "c",
    category: "content_fix",
    target: "content/cyoa/pack/x.yaml",
    title: "t",
    rationale: "r",
    evidence: ["e"],
    impact: 1,
    effort: "M",
    score,
  });
  const withTop = (top: ImprovementCandidate | null): Assessment => ({
    packsByMode: {},
    packs: [],
    candidates: top ? [top] : [],
    top,
  });

  it("is saturated when the top candidate sits at/below the 0.5 floor", () => {
    expect(isSaturated(withTop(candidate(SATURATION_FLOOR)))).toBe(true);
    expect(isSaturated(withTop(candidate(0.4)))).toBe(true);
  });

  it("is saturated when there is no candidate at all", () => {
    expect(isSaturated(withTop(null))).toBe(true);
  });

  it("is NOT saturated when a higher-value lever is present", () => {
    expect(isSaturated(withTop(candidate(0.51)))).toBe(false);
    expect(isSaturated(withTop(candidate(1.067)))).toBe(false); // e.g. the frontier benchmark lever
  });

  it("agrees with the real repo's top score", () => {
    expect(isSaturated(a)).toBe(a.top !== null && a.top.score <= SATURATION_FLOOR);
  });
});
