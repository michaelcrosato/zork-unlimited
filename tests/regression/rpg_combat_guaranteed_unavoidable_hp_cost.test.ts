/**
 * Regression for the validate-subsystem audit finding "the combat_guaranteed promise
 * is computed from an HP ceiling that ignores every authored hp cost".
 *
 * `validateRpg` derives the player's HP from `statCeiling`, which sums `vars_init`
 * plus every POSITIVE `inc_var` and consults nothing else — no `dec_var`, no
 * `set_var`. Over-crediting HP is the SOUND direction for `COMBAT_UNWINNABLE`
 * (a route-EXISTENCE proof: crediting too much can only withdraw a false
 * "impossible"), but it is the UNSOUND direction for the `meta.combat_guaranteed`
 * safety promises, which are upper bounds: they certified "no roll can fell a
 * best-prepared player" against health the pack had already taken away. Measured
 * before the fix, on the real runtime: shipped dawn_beacon (hp 26, cumulative
 * worst-case gauntlet damage 21, `combat_guaranteed: true`) with an unconditional
 * `{dec_var: {name: hp, by: 20}}` — or `{set_var: {name: hp, value: 1}}` — pushed
 * onto its START ROOM's on_enter returned ok=true with ZERO findings. The promise is
 * spoken aloud to the player in-game, so a false guarantee is player-visible.
 *
 * The guarantee bounds now measure against GUARANTEED HP: reachable HP less the
 * unavoidable opening cost. "Unavoidable" is deliberately narrow — the start room's
 * `on_enter` is the one effect list every playthrough runs, applied at init before
 * the player makes a single choice. Costs on any other path are AVOIDABLE by the
 * "best-prepared player" these bounds are written against (the same standard that
 * credits every reachable buff), and charging them would reject legitimate content.
 * This test pins both halves — the cost that must count, and the ones that must not.
 */
import { describe, it, expect } from "vitest";
import { compileRpgSource } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

type PackOptions = {
  /** Effects on the START room's on_enter — unavoidable, applied at init. */
  opening?: string;
  /** Effects on a SIDE room's on_enter — reachable, but the player may never go. */
  detour?: string;
  /** Effects on an optional object interaction in the side room. */
  flask?: string;
  /** Whether the pack promises fair fights. */
  guaranteed?: boolean;
};

/**
 * One fight against `brute` (hp18/atk7/def2) that a player at hp20/atk6/def8 CLEARS
 * on every roll, so the base pack is a sound guarantee:
 *   worst case — player damage max(1, 1+6-2) = 5 ⇒ rounds ceil(18/5) = 4; enemy
 *   damage max(1, 6+7-8) = 5 ⇒ 5 * (4-1) = 15 total, and 15 < 20 HP.
 * An unavoidable cost of 6 drops the player to 14 and breaks exactly that margin.
 */
const PACK = (options: PackOptions = {}): string => `
meta:
  id: guaranteed_opening_cost_v1
  title: "Opening Cost"
  start_room: arena
  vars_init: { hp: 20, attack: 6, defense: 8, might: 3 }
  flags_init: []
  max_score: 0${options.guaranteed === false ? "" : "\n  combat_guaranteed: true"}
rooms:
  - id: arena
    name: "The Arena"
    description: "A pit of sand. A brute blocks the way down; the alcove lies north."
    objects: [wall]
    on_enter: [${options.opening ?? ""}]
    exits:
      - { direction: north, to: alcove }
  - id: alcove
    name: "The Alcove"
    description: "A dry niche off the pit floor, with a flask on a ledge."
    objects: [flask]
    on_enter: [${options.detour ?? ""}]
    exits:
      - { direction: south, to: arena }
enemies:
  - id: brute
    name: "brute"
    description: "A heavy slab of muscle."
    room: arena
    hp: 18
    attack: 7
    defense: 2
    defeat_flag: brute_slain
    death_ending: ending_fallen
    on_defeat:
      - add_journal: "The brute drops."
win_conditions:
  - id: survive
    conditions: [ { has_flag: brute_slain } ]
    ending: ending_won
objects:
  - id: wall
    name: "pit wall"
    aliases: [wall]
    description: "Scarred sandstone."
    takeable: false
  - id: flask
    name: "clay flask"
    aliases: [flask]
    description: "A stoppered flask of bitter tonic."
    takeable: false
    interactions:
      - verb: USE
        target: flask
        effects: [${options.flask ?? '{ add_journal: "The tonic is bitter." }'}]
endings:
  - id: ending_won
    title: "Standing"
    text: "The brute falls and you stand."
    death: false
  - id: ending_fallen
    title: "Down"
    text: "You fall among the sand."
    death: true
`;

function report(options: PackOptions = {}) {
  const loaded = compileRpgSource(PACK(options));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error("fixture must compile — it is unsound, not malformed");
  return validateRpg(loaded.compiled.pack);
}

const codes = (options: PackOptions = {}): string[] =>
  report(options).findings.map((finding) => finding.code);

describe("combat_guaranteed is measured against HP the pack cannot take away", () => {
  it("the base pack is a sound guarantee (differential anchor)", () => {
    const base = report();
    expect(base.ok).toBe(true);
    expect(base.findings.map((finding) => finding.code)).not.toContain("COMBAT_NOT_GUARANTEED");
  });

  it("REJECTS a guarantee undercut by an unavoidable dec_var on hp", () => {
    // 20 reachable HP, 6 deducted before the player can act ⇒ 14 vs 15 worst-case damage.
    const found = codes({ opening: "{ dec_var: { name: hp, by: 6 } }" });
    expect(found).toContain("COMBAT_NOT_GUARANTEED");
    expect(report({ opening: "{ dec_var: { name: hp, by: 6 } }" }).ok).toBe(false);
  });

  it("REJECTS a guarantee undercut by an unavoidable set_var on hp", () => {
    // The sharper case: hp is already a normal `set_var` target (combat writes it),
    // so an authored reset is an expected authoring shape, not an exotic one.
    expect(codes({ opening: "{ set_var: { name: hp, value: 1 } }" })).toContain(
      "COMBAT_NOT_GUARANTEED",
    );
  });

  it("names the guaranteed HP, not the reachable ceiling, in the diagnostic", () => {
    const finding = report({ opening: "{ dec_var: { name: hp, by: 6 } }" }).findings.find(
      (candidate) => candidate.code === "COMBAT_NOT_GUARANTEED",
    );
    expect(finding?.message).toContain("14 guaranteed HP");
    expect(finding?.message).toContain("20 reachable");
    expect(finding?.message).toContain("6 unavoidable opening cost");
  });

  it("still credits a reachable heal against the opening cost", () => {
    // The bound is a floor on health, not a ban on hp costs: a buff the player can
    // reach pays the opening cost back, exactly as the ceiling credits attack wards.
    const found = codes({
      opening: "{ dec_var: { name: hp, by: 6 } }",
      flask: "{ inc_var: { name: hp, by: 6 } }",
    });
    expect(found).not.toContain("COMBAT_NOT_GUARANTEED");
  });

  it("does NOT charge the promise for an AVOIDABLE cost off the required path", () => {
    // A side room the player need not enter, and an interaction they need not use,
    // are both dodgeable by a best-prepared player. Charging them would reject a
    // legitimate trap corridor; proving they are unavoidable needs per-fight
    // reachability, which is a different analysis, not a wider ceiling.
    expect(codes({ detour: "{ dec_var: { name: hp, by: 6 } }" })).not.toContain(
      "COMBAT_NOT_GUARANTEED",
    );
    expect(codes({ flask: "{ dec_var: { name: hp, by: 6 } }" })).not.toContain(
      "COMBAT_NOT_GUARANTEED",
    );
  });

  it("stays OPT-IN: the same unavoidable cost is no error without the promise", () => {
    const found = codes({ opening: "{ set_var: { name: hp, value: 1 } }", guaranteed: false });
    expect(found).not.toContain("COMBAT_NOT_GUARANTEED");
    expect(found).not.toContain("COMBAT_GAUNTLET_NOT_GUARANTEED");
  });

  it("leaves the COMBAT_UNWINNABLE lower bound on the reachable ceiling", () => {
    // Asymmetry on purpose. The lower bound is a route-EXISTENCE proof, where
    // under-crediting HP would forbid a legitimate gamble — the unsound direction
    // there. It keeps `statCeiling`; only the guarantee bounds took the floor.
    expect(codes({ opening: "{ set_var: { name: hp, value: 1 } }" })).not.toContain(
      "COMBAT_UNWINNABLE",
    );
  });
});
