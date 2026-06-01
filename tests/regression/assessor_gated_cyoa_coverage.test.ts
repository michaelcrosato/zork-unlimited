/**
 * bug_0032 — the assessor stops chasing the coverage bot's PLANNING limit in
 * gated CYOA packs.
 *
 * For ~12 straight cycles the assessor ranked clockwork_heist_v1 the #1
 * improvement ("3 unreached ending(s), 1 unvisited location(s)", score 2.0)
 * because its planning-free coverage bot reaches only 1/4 endings — yet the blind
 * LLM playtest reaches ALL of them every cycle. The endings sit behind the
 * lockpick chain (ending_rich / ending_truth) and a deliberate ledger-skip
 * (ending_patrol): a PLANNING limit, identical in kind to the parser/RPG puzzle
 * packs the assessor already (correctly) refuses to drive content_fix from.
 *
 * The fix generalizes "bot-coverage is meaningful" from `mode === cyoa` to
 * `ungated cyoa`: a CYOA pack whose choices carry preconditions (item/flag/var/
 * visited/quest gates) is as unreachable-by-bot as a parser/RPG puzzle, so its
 * coverage gap becomes a LOW-priority blind-playtest review, not a phantom
 * high-impact fix. A pure-branching CYOA (no choice conditions) keeps the
 * reliable-bot assumption.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assess, cyoaPackIsGated } from "../../src/afk/assessor.js";
import { compilePackOrThrow } from "../../src/cyoa/pack.js";

const GATED_PACK = `
meta: { id: gated_v1, title: Gated, start: a }
scenes:
  - id: a
    title: A
    text: A room.
    choices:
      - { id: take_key, text: Take the key, effects: [{ add_item: key }], next: a }
      - id: open
        text: Open the gated door
        conditions: [{ has_item: key }]   # <- a precondition the no-lookahead bot can't plan
        next: win
  - id: win
    title: Win
    text: You win.
    is_ending: true
`;

const UNGATED_PACK = `
meta: { id: ungated_v1, title: Ungated, start: a }
scenes:
  - id: a
    title: A
    text: A fork.
    choices:
      - { id: left, text: Go left, next: b }
      - { id: right, text: Go right, next: c }
  - id: b
    title: B
    text: Left ending.
    is_ending: true
  - id: c
    title: C
    text: Right ending.
    is_ending: true
`;

describe("bug_0032 — cyoaPackIsGated (the predicate that decides bot-coverage trust)", () => {
  it("is TRUE when any choice carries a precondition (planning-gated)", () => {
    expect(cyoaPackIsGated(compilePackOrThrow(GATED_PACK).pack)).toBe(true);
  });

  it("is FALSE for a pure-branching pack (no choice conditions ⇒ reliable bot)", () => {
    expect(cyoaPackIsGated(compilePackOrThrow(UNGATED_PACK).pack)).toBe(false);
  });
});

describe("bug_0032 — assess() no longer raises a phantom content_fix for gated CYOA", () => {
  const a = assess(process.cwd());
  const clockwork = "content/cyoa/pack/clockwork_heist.yaml";

  it("clockwork_heist (a gated CYOA the bot can't fully traverse) is gated", () => {
    // Guards the premise of this whole fix: if clockwork ever became pure-branching
    // the bot-coverage signal would legitimately re-arm and this test should be
    // revisited.
    const pack = a.packs.find((p) => p.path === clockwork);
    expect(pack?.mode).toBe("cyoa");
    expect(cyoaPackIsGated(compilePackOrThrow(readFileSync(clockwork, "utf8")).pack)).toBe(true);
  });

  it("raises NO high-impact `fix-` candidate for clockwork (the old false rank-1)", () => {
    expect(a.candidates.find((c) => c.id === `fix-${clockwork}`)).toBeUndefined();
  });

  it("instead keeps clockwork on the radar as a LOW-priority blind-playtest review", () => {
    const review = a.candidates.find((c) => c.id === `playtest-${clockwork}`);
    expect(review).toBeDefined();
    expect(review!.score).toBeLessThan(1); // below any real fix / new-content lever
    expect(review!.evidence.join(" ")).toMatch(/review prompt, not a known flaw/);
  });

  it("no content_fix candidate falsely claims unreached endings on a gated CYOA pack", () => {
    // Every gated-CYOA pack should be a `playtest-` review, never a `fix-` whose
    // title asserts "N unreached ending(s)" — that phrasing must only appear for
    // packs where the bot's reach is trustworthy (ungated CYOA / validator warnings).
    for (const p of a.packs.filter((p) => p.mode === "cyoa" && p.warnings === 0)) {
      expect(a.candidates.find((c) => c.id === `fix-${p.path}`)).toBeUndefined();
    }
  });
});
