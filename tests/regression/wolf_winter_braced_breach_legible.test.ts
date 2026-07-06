/**
 * Regression (§15) for bug_0256 — The Wolf-Winter: the optional "wedge the
 * paling-rail" skill check (`breach_braced`) must have a LEGIBLE, OBSERVABLE payoff
 * in the fiction, WITHOUT touching a single number of the fair three-fight gauntlet
 * (bug_0189) or the prep-weighted score economy (bug_0239).
 *
 * The 2026-06-04 blind playtest (seed 11) flagged the wedge twice as "a tempting
 * option that appears to do nothing mechanically" / "a mechanically-inert curiosity":
 * the skill check passed, set a flag, and the world never acknowledged it — so the
 * "slow what tries to come through it" affordance over-promised and the invested turn
 * had no visible consequence. The design DELIBERATELY keeps the wedge stat-neutral to
 * protect the cumulative-HP guarantee tuning (atk7/def5/hp30, worst 25 < 30); the cure
 * was therefore NOT a stat/score change but making `breach_braced` drive §7.3 reactive
 * prose on the paling_gap room AND the paling_rail object, so a player who spends the
 * turn SEES the half-shut breach and the one-throat funnel old Cade promised.
 *
 * This pins both halves of that contract:
 *   (1) LEGIBILITY — `breach_braced` reactively rewrites both the room and the rail, and
 *       the four paling_gap variants are ordered most-specific-first so every reachable
 *       (yearling_down × breach_braced) state renders the right text (bug_0147 liveness);
 *   (2) STAT-NEUTRALITY — the wedge's on_success carries NO `inc_var` at all (no score,
 *       attack, defense or hp), proven by driving the REAL resolveSkillCheck on a winning
 *       roll. So the legibility fix cannot have leaked into the guarantee or the economy;
 *       the gauntlet/score pins in wolf_winter_three_fight_gauntlet.test.ts stay valid.
 *
 * Out-of-band teeth: the success effects are read from the real mechanic (combat.ts
 * resolveSkillCheck), and the prose assertions compare the rendered roomDescription /
 * objectDescription across the actual flag combinations — drop a variant, reorder them,
 * or add an inc_var to on_success and a case below flips RED.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { roomDescription, objectDescription } from "../../src/rpg/model.js";
import { resolveSkillCheck } from "../../src/core/skill_check.js";
import { initState } from "../../src/core/state.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";

const PACK_PATH = "content/rpg/pack/wolf_winter.yaml";

function loadPack(): RpgPack {
  const r = loadRpgSourceFile(PACK_PATH);
  expect(r.ok, "wolf_winter must load").toBe(true);
  if (!r.ok) throw new Error("unreachable");
  return r.compiled.pack;
}

/** A fresh start-state with the given flags forced on (the rest false). */
function stateWithFlags(pack: RpgPack, flags: string[]): GameState {
  const s = initState({
    seed: 1,
    start: pack.meta.start_room,
    varsInit: pack.meta.vars_init,
    flagsInit: pack.meta.flags_init,
  });
  return { ...s, flags: { ...s.flags, ...Object.fromEntries(flags.map((f) => [f, true])) } };
}

/** A d20 that always rolls its maximum (20) — a guaranteed skill-check SUCCESS. */
const maxRollRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => max,
});

const palingGap = (pack: RpgPack) => {
  const r = pack.rooms.find((x) => x.id === "paling_gap");
  expect(r, "paling_gap room must exist").toBeTruthy();
  return r!;
};
const palingRail = (pack: RpgPack) => {
  const o = pack.objects.find((x) => x.id === "paling_rail");
  expect(o, "paling_rail object must exist").toBeTruthy();
  return o!;
};
const wedgeCheck = (pack: RpgPack) => {
  const use = palingRail(pack).interactions.find((it) => it.skill_check?.skill === "defense");
  expect(use?.skill_check, "the rail must carry a defense skill_check").toBeTruthy();
  return use!.skill_check!;
};

describe("bug_0256 — The Wolf-Winter: the braced breach has a legible, stat-neutral payoff", () => {
  it("the room reactively acknowledges breach_braced across all four reachable states (ordered, live)", () => {
    const pack = loadPack();
    const room = palingGap(pack);

    const base = roomDescription(room, stateWithFlags(pack, []));
    const bracedOnly = roomDescription(room, stateWithFlags(pack, ["breach_braced"]));
    const deadOnly = roomDescription(room, stateWithFlags(pack, ["yearling_down"]));
    const both = roomDescription(room, stateWithFlags(pack, ["yearling_down", "breach_braced"]));

    // (4) neither flag → base description: the live wolf, the loose rail in the snow.
    expect(base).toContain("first of the pack through");
    expect(base).not.toContain("wedged");

    // (3) braced before the kill → the wolf still holds the gap, but the breach is wedged.
    expect(bracedOnly).toContain("wedged hard across it");
    expect(bracedOnly).toContain("still holds"); // wolf alive
    expect(bracedOnly).not.toContain("dead in the snow");

    // (2) killed without wedging → the existing dead-wolf text, no wedge mentioned.
    expect(deadOnly).toContain("dead in the snow");
    expect(deadOnly).not.toContain("wedged");

    // (1) both → the most-specific variant wins (ordered first): dead wolf AND wedged rail.
    expect(both).toContain("dead in the snow");
    expect(both).toContain("wedged hard across the breach");

    // All four render DISTINCT text — no variant shadows another (liveness, bug_0147).
    expect(new Set([base, bracedOnly, deadOnly, both]).size).toBe(4);
  });

  it("the rail's examine reactively flips to the wedged twin once braced", () => {
    const pack = loadPack();
    const rail = palingRail(pack);
    const loose = objectDescription(rail, stateWithFlags(pack, []));
    const wedged = objectDescription(rail, stateWithFlags(pack, ["breach_braced"]));
    expect(loose).not.toContain("wedged");
    expect(wedged).toContain("wedged hard across the breach");
    expect(loose).not.toBe(wedged);
  });

  it("wedging is STAT-NEUTRAL: a winning roll sets breach_braced and inc_vars NOTHING (guarantee/economy byte-unchanged)", () => {
    const pack = loadPack();
    const check = wedgeCheck(pack);
    expect(check.difficulty).toBe(11);
    const res = resolveSkillCheck(stateWithFlags(pack, []), check, maxRollRng());
    const keys = res.effects.flatMap((e) => Object.keys(e));
    // success branch fires: the flag the reactive prose keys off, plus pure cosmetics.
    expect(keys).toContain("set_flag");
    const flagSet = res.effects.find((e) => "set_flag" in e) as { set_flag?: string } | undefined;
    expect(flagSet?.set_flag).toBe("breach_braced");
    // The load-bearing invariant: NO stat or score change rides the wedge, ever — so the
    // fair-gauntlet tuning and the prep-weighted economy stay exactly as bug_0189/0239 pin.
    expect(keys).not.toContain("inc_var");
    // And the prose the win unlocks is genuinely reachable as displayed text.
    expect(roomDescription(palingGap(pack), stateWithFlags(pack, ["breach_braced"]))).toContain(
      "wedged",
    );
  });
});
