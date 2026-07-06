/**
 * Regression (§15) for bug_0201 — engine/observation: a locked exit's authored
 * `locked_msg` is now surfaced in the structured observation as a `blocked_exits`
 * HINT, bringing the MCP/structured interface to parity with the free-text command surface.
 *
 * TWO independent blind playtests (bug_0197 on breaking_weir, and the sunken_barrow
 * pass of this cycle, ai-runs/2026-06-03T20-14-24-953Z) reported the SAME friction:
 * a room's prose mentions a way out ("an archway east, choked with the cold") but no
 * such exit appears in `available_actions`/`exits`, leaving a blind player hunting
 * for an option that isn't there — unable to tell a gated-but-present way from a
 * non-existent one. Free-text command handling already answered this by printing the
 * exit's `locked_msg` after an attempted blocked move. But the structured observation
 * filtered locked exits out entirely (observation.ts), so the
 * `locked_msg` strings authored across ~10 packs were DEAD in the structured surface.
 *
 * The fix is strictly ADDITIVE and preserves the deliberate "the RpgAction set never
 * spoils HOW to open a locked exit" design: `blocked_exits` is a hint list, NOT a
 * selectable RpgAction and NOT in `exits` — it tells the player a way exists here and
 * WHY it's blocked, never how to clear it (that RpgAction stays hidden until legal).
 * Opt-in per exit: only a locked exit whose author gave it a `locked_msg` appears.
 *
 * Locked here (real packs + a synthetic opt-in fixture, no combat-seed dependence on
 * the observation logic itself):
 *   (1) BLOCKED: at guard_crypt with the barrow-wight alive, the gated east exit is
 *       ABSENT from `exits` (not traversable) yet PRESENT in `blocked_exits` carrying
 *       its exact authored `locked_msg` — the friction the blind tester hit, fixed;
 *   (2) CLEARS: after the wight falls (real engine combat, seed 1 — the seed the
 *       acceptance test proves survivable), the SAME east exit moves INTO `exits` and
 *       OUT of `blocked_exits` — the hint retires exactly when the way opens;
 *   (3) NO FALSE HINTS: a room whose only exit is unconditional (barrow_mouth → down)
 *       has an EMPTY `blocked_exits` — open exits are never mislabelled as blocked;
 *   (4) OPT-IN: a gated exit WITHOUT a `locked_msg` stays silent (absent from BOTH
 *       lists), while a gated exit WITH one is surfaced and an open exit stays in
 *       `exits` — the author controls what is hinted;
 *   (5) a synthetic zero-enemy RPG fixture proves the opt-in rule independently
 *       of shipped content.
 *
 * WITNESS: before this change `blocked_exits` does not exist on the observation, so
 * cases (1) and (4)'s `.blocked_exits` reads are `undefined` and every assertion on
 * them fails — genuine, not vacuous.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { compileRpgSource } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";

const compiled = loadRpgSourceFile("content/rpg/pack/sunken_barrow.yaml");
if (!compiled.ok) throw new Error("sunken_barrow must compile");
const rindex = indexRpgPack(compiled.compiled.pack);
const rstep = makeStep(buildRpgRules(rindex));

const WIGHT_MSG = "The barrow-wight bars the way; you cannot pass while it stands.";

function ract(s: GameState, RpgAction: RpgAction): GameState {
  const r = rstep(s, RpgAction);
  expect(r.ok, `RpgAction ${JSON.stringify(RpgAction)} should resolve in ${s.current}`).toBe(true);
  return r.state;
}

describe("bug_0201 — locked exits surface their locked_msg as a blocked_exits hint", () => {
  it("BLOCKED: guard_crypt's gated east is absent from exits but hinted in blocked_exits", () => {
    let s = initStateForRpgPack(rindex, 1);
    s = ract(s, { type: "MOVE", direction: "down" }); // barrow_mouth → entry_hall
    s = ract(s, { type: "MOVE", direction: "north" }); // entry_hall → guard_crypt
    expect(s.current).toBe("guard_crypt");
    expect(s.flags["wight_slain"]).not.toBe(true); // wight still stands

    const obs = buildRpgObservation(rindex, s);
    expect(obs.exits.some((e) => e.direction === "east")).toBe(false); // not yet traversable
    const east = obs.blocked_exits.find((e) => e.direction === "east");
    expect(east).toBeDefined();
    expect(east!.message).toBe(WIGHT_MSG); // exact authored locked_msg, no spoiler of HOW
  });

  it("CLEARS: once the wight falls the same east exit moves into exits, out of blocked_exits", () => {
    let s = initStateForRpgPack(rindex, 1);
    s = ract(s, { type: "MOVE", direction: "down" });
    s = ract(s, { type: "MOVE", direction: "north" });
    for (let i = 0; i < 30 && !s.flags["wight_slain"] && !s.ended; i++) {
      s = ract(s, { type: "ATTACK", enemy: "barrow_wight" });
    }
    expect(s.flags["wight_slain"], "the hero survives the wight on seed 1").toBe(true);
    expect(s.ended).toBe(false);
    expect(s.current).toBe("guard_crypt"); // attacking does not move you

    const obs = buildRpgObservation(rindex, s);
    expect(obs.exits.some((e) => e.direction === "east")).toBe(true); // now traversable
    expect(obs.blocked_exits.some((e) => e.direction === "east")).toBe(false); // hint retired
  });

  it("NO FALSE HINTS: a room with only unconditional exits has empty blocked_exits", () => {
    const start = buildRpgObservation(rindex, initStateForRpgPack(rindex, 1)); // barrow_mouth
    expect(start.room).toBe("barrow_mouth");
    expect(start.exits.length).toBeGreaterThan(0);
    expect(start.blocked_exits).toEqual([]); // barrow_mouth's lone exit (down) is unconditional
  });

  it("OPT-IN: only a gated exit WITH a locked_msg is hinted; one without stays silent", () => {
    // A locked exit with no `conditions` cannot exist meaningfully, so all three
    // gated exits below are gated by a flag never set. Schema-only compile (no
    // validator), so an intentionally-unwinnable fixture is fine — we never play it.
    const FIXTURE = `
meta:
  id: blocked_exit_fixture_v1
  title: "Blocked Exit Fixture"
  start_room: a
  max_score: 0
rooms:
  - id: a
    name: "Room A"
    description: "The hub."
    exits:
      - { direction: north, to: b }
      - direction: east
        to: c
        conditions: [{ has_flag: never }]
        locked_msg: "A locked door bars the east."
      - direction: west
        to: d
        conditions: [{ has_flag: never }]
  - id: b
    name: "Room B"
    description: "North."
    exits: [{ direction: south, to: a }]
  - id: c
    name: "Room C"
    description: "East."
    exits: [{ direction: west, to: a }]
  - id: d
    name: "Room D"
    description: "West."
    exits: [{ direction: east, to: a }]
objects: []
win_conditions:
  - { id: w, conditions: [{ visited: c }], ending: done }
endings:
  - { id: done, title: "Done", text: "Done." }
enemies: []
`;
    const c = compileRpgSource(FIXTURE);
    if (!c.ok) throw new Error("fixture must compile");
    const pindex = indexRpgPack(c.compiled.pack);
    const obs = buildRpgObservation(pindex, initStateForRpgPack(pindex, 0));

    // Open exit → traversable; gated exits → never traversable.
    expect(obs.exits.map((e) => e.direction)).toEqual(["north"]);
    // Only the gated exit WITH a locked_msg is hinted; the one without is silent.
    expect(obs.blocked_exits.map((e) => e.direction)).toEqual(["east"]);
    expect(obs.blocked_exits[0]!.message).toBe("A locked door bars the east.");
  });
});
