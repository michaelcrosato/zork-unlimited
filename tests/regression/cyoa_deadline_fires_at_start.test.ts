/**
 * Regression (§15) for bug_0089 — the CYOA validator now flags a `meta.deadline`
 * that fires on the player's FIRST action on every path: a hair-trigger that bricks
 * the game. It is the symmetric opposite of bug_0087's DEADLINE_UNFIREABLE (a
 * deadline that can never fire). The engine's §8.4.5 checkWin runs against the
 * POST-action state (src/core/engine.ts), never at game start, so a deadline whose
 * `when` already holds in the initial state AND can never be falsified ends the game
 * at `deadline.ending` on whatever the player does first — no scene past the start
 * is ever reachable in play. That is unplayable, so it is an ERROR (like
 * START_NOT_SCENE), not the advisory WARNING that a merely-dead deadline gets.
 *
 * Sound & conservative — only fires when firing-at-start is PROVABLE:
 *   (a) the initial state is the engine's own (initStateForPack, start on_enter
 *       applied), evaluated by the engine's own evalConditions; and
 *   (b) un-falsifiability is proven only for a flat conjunction of monotone-stable
 *       atoms (sign-significant var arithmetic; any disjunction/negation bails).
 *
 * Locked here:
 *   (1) the shipped packs are NOT flagged (clockwork's `ticks>=10` is far above its
 *       init 0; watchtower has no deadline);
 *   (2) a deadline already true at init on a monotone-increasing var IS flagged;
 *   (3) a deadline whose threshold is above the init value is NOT flagged (soundness:
 *       the opening scenes are playable before it can fire);
 *   (4) a deadline true at init but ESCAPABLE (the watched var can be decremented
 *       back below the bound) is NOT flagged (soundness: a first move can dodge it);
 *   (5) a deadline gated on a flag that is set at init but later cleared is NOT
 *       flagged (soundness: a first move can falsify it).
 */
import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

function codes(src: string): string[] {
  const r = compilePack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateCyoa(r.compiled.pack).findings.map((f) => f.code);
}

describe("bug_0089 — the validator flags a deadline that fires on the first action", () => {
  it("the shipped packs are NOT flagged (their deadlines are not yet due at start)", () => {
    for (const path of [
      "content/cyoa/pack/clockwork_heist.yaml",
      "content/cyoa/pack/watchtower_road.yaml",
    ]) {
      const r = loadPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = validateCyoa(r.compiled.pack).findings.map((f) => f.code);
      expect(found).not.toContain("DEADLINE_FIRES_AT_START");
    }
  });

  it("flags a deadline already satisfied at init on a monotone-increasing var", () => {
    // ticks init 0, when `ticks >= 0` (true immediately), ticks only ever inc by +1.
    const src = `
meta:
  id: t
  title: T
  start: s
  vars_init: { ticks: 0 }
  deadline: { when: [ { var_gte: { name: ticks, value: 0 } } ], ending: e_over }
scenes:
  - id: s
    title: S
    text: "x"
    on_enter: [ { inc_var: { name: ticks, by: 1 } } ]
    choices:
      - { id: g, text: go, next: e }
endings:
  - { id: e, title: E, text: "done" }
  - { id: e_over, title: O, text: "the hour turns" }
`;
    expect(codes(src)).toContain("DEADLINE_FIRES_AT_START");
  });

  it("does NOT flag a deadline whose threshold is above the init value — soundness", () => {
    // Same shape, but `ticks >= 5`: not due at start, the opening scenes are playable.
    const src = `
meta:
  id: t
  title: T
  start: s
  vars_init: { ticks: 0 }
  deadline: { when: [ { var_gte: { name: ticks, value: 5 } } ], ending: e_over }
scenes:
  - id: s
    title: S
    text: "x"
    on_enter: [ { inc_var: { name: ticks, by: 1 } } ]
    choices:
      - { id: g, text: go, next: e }
endings:
  - { id: e, title: E, text: "done" }
  - { id: e_over, title: O, text: "the hour turns" }
`;
    expect(codes(src)).not.toContain("DEADLINE_FIRES_AT_START");
  });

  it("does NOT flag a deadline true at init but escapable by a first move — soundness", () => {
    // `ticks >= 0` holds at init, but a choice can `dec_var ticks` below 0, so a first
    // move can falsify it — not a provable on-every-path fire.
    const src = `
meta:
  id: t
  title: T
  start: s
  vars_init: { ticks: 0 }
  deadline: { when: [ { var_gte: { name: ticks, value: 0 } } ], ending: e_over }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: rewind, text: rewind, effects: [ { dec_var: { name: ticks, by: 1 } } ], next: e }
endings:
  - { id: e, title: E, text: "done" }
  - { id: e_over, title: O, text: "the hour turns" }
`;
    expect(codes(src)).not.toContain("DEADLINE_FIRES_AT_START");
  });

  it("does NOT flag a flag-gated deadline that a first move can clear — soundness", () => {
    // `doomed` is set at init but a choice clears it, so the deadline is falsifiable.
    const src = `
meta:
  id: t
  title: T
  start: s
  flags_init: [ doomed ]
  deadline: { when: [ { has_flag: doomed } ], ending: e_over }
scenes:
  - id: s
    title: S
    text: "x"
    choices:
      - { id: calm, text: calm, effects: [ { clear_flag: doomed } ], next: e }
endings:
  - { id: e, title: E, text: "done" }
  - { id: e_over, title: O, text: "the hour turns" }
`;
    expect(codes(src)).not.toContain("DEADLINE_FIRES_AT_START");
  });
});
