/**
 * Regression (§15) for bug_0197 — blind-playtest polish for The Breaking Weir
 * (content/rpg/pack/breaking_weir.yaml, seed 7). A fresh blind playtester won the
 * pack 50/50 with clarity 5/5 and flagged two ways the prose contradicted the actual
 * game state — both narration-vs-state honesty bugs, neither affecting winnability:
 *
 *  (1) STALE OBJECT NAMES on the winning path. The head-rack and relief-race winch each
 *      carry a reactive examine `variant` (cleared / hauled-open), but their display NAME
 *      stayed frozen at "jammed head-rack" / "seized winch-gate". So `visible_objects` and
 *      every enumerated command kept calling them "jammed"/"seized" after the player had
 *      cleared/opened them — contradicting the variant's own text and the room prose. This
 *      is exactly the bug_0188 reactive-name asymmetry, here on two more objects: the fix
 *      is purely content — each cleared variant now also carries a `name` override.
 *
 *  (2) JOURNAL CREDITING UNHEARD COUNSEL on the gamble path. The storm-walk crossing is
 *      reachable un-counselled (base nerve 3 needing d20>=6 — the declared gamble, proven
 *      by breaking_weir_skill_chain.test.ts). Its SUCCESS journal said "going low and steady
 *      the way Pell told you", asserting advice a reckless player never received. The fix
 *      drops the attribution; the HOW (clipped, low, steady) is the keeper's craft on either
 *      path, so the line stays true whether or not Pell was heeded.
 *
 * Locked here on the REAL pack surfaces:
 *   - reactive names: before/after each flag, on the observation's visible_objects;
 *   - journal honesty: BEHAVIOURALLY, by driving the real resolveSkillCheck on an
 *     UNPREPARED-but-lucky crossing (base nerve 3, max d20) and asserting the success
 *     journal it emits credits no one the player never spoke to.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { resolveSkillCheck } from "../../src/core/skill_check.js";
import { initState } from "../../src/core/state.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgPack } from "../../src/rpg/schema.js";
import type { Rng } from "../../src/core/rng.js";

const PACK_PATH = "content/rpg/pack/breaking_weir.yaml";
const loaded = loadRpgSourceFile(PACK_PATH);
if (!loaded.ok) throw new Error("breaking_weir must compile");
const pack: RpgPack = loaded.compiled.pack;
const index = indexRpgPack(pack);

/** A state standing in `room` with the given flags set — the only inputs the reactive
 *  object names key on (rack_freed / race_open). Built directly rather than fought to:
 *  the skill-check rolls are RNG and this regression is about NAME rendering at a known
 *  flag state, not the play route (reachability is proven by the auto-discovered suite). */
function inRoom(room: string, flags: Record<string, boolean>): GameState {
  const s = initStateForRpgPack(index, 1);
  return { ...s, current: room, flags: { ...s.flags, ...flags } };
}

const objName = (s: GameState, id: string): string | undefined =>
  buildRpgObservation(index, s).visible_objects.find((o) => o.id === id)?.name;

/** A d20 that always rolls its MAXIMUM (20) — a lucky crossing for the unprepared gambler. */
const maxRollRng = (): Rng => ({
  next: () => 0.999999,
  int: (_min: number, max: number) => Math.floor(max),
});

describe("bug_0197 — The Breaking Weir blind-playtest polish (narration-vs-state honesty)", () => {
  it("the head-rack drops 'jammed' from its NAME once it is cleared (reactive name)", () => {
    expect(objName(inRoom("weir_head", {}), "head_rack")).toBe("jammed head-rack");
    const cleared = objName(inRoom("weir_head", { rack_freed: true }), "head_rack");
    expect(cleared).toBe("cleared head-rack");
    expect(cleared).not.toContain("jammed"); // no longer contradicts the cleared prose
  });

  it("the relief-race winch drops 'seized' from its NAME once it is hauled open", () => {
    expect(objName(inRoom("race_house", {}), "race_winch")).toBe("seized winch-gate");
    const open = objName(inRoom("race_house", { race_open: true }), "race_winch");
    expect(open).toBe("open winch-gate");
    expect(open).not.toContain("seized");
  });

  it("the storm-walk success journal credits no counsel the gambler never heard", () => {
    // The walk crossing is reachable UNPREPARED (base nerve 3) on a good roll — the gamble.
    const walk = pack.objects.find((o) => o.id === "walk_span")!;
    const check = walk.interactions.find((it) => it.skill_check?.skill === "nerve")!.skill_check!;
    const base = initState({
      seed: 1,
      start: pack.meta.start_room,
      varsInit: pack.meta.vars_init,
      flagsInit: pack.meta.flags_init,
    });
    expect(base.vars.nerve).toBe(3); // base, Pell never asked
    const res = resolveSkillCheck(base, check, maxRollRng()); // 20 + 3 = 23 >= 9 → success
    const journal = res.effects
      .filter((e): e is { add_journal: string } => "add_journal" in e)
      .map((e) => e.add_journal)
      .join(" ");
    expect(journal).not.toBe(""); // the success branch DOES journal the crossing
    expect(journal).not.toMatch(/Pell/i); // …but credits no one the gambler never spoke to
  });
});

/**
 * Regression (§15) for bug_0225 — blind-pass polish: the storm-walk north-exit locked_msg
 * named no precondition. Since bug_0201 a locked exit's `locked_msg` is surfaced to the
 * player as a `blocked_exits` HINT. The seed-7/23 blind pass found the weir_walk → race_house
 * hint was the one in the pack that named nothing the way was waiting on ("…still ahead of
 * you; the race-house lies beyond it"), so a player who left the life-line in the lodge stood
 * on the awash walk with ominous prose, a blocked north, and no signpost to the missing rope.
 * The fix names the precondition (the life-line clipped to the run-wire) the way the rest of
 * the packs' locked_msgs do, WITHOUT spelling the crossing command (the bug_0201 WHY-not-HOW
 * discipline — the `rig` action still surfaces only once the line is held).
 *
 * Locked BEHAVIOURALLY on the real observation at the exact state the no-line player stands in
 * (weir_walk, rack freed, walk not crossed): the north blocked_exits hint names the
 * precondition and is not the old generic string, while staying free of the command verb.
 */
const NORTH_HINT = (s: GameState): string | undefined =>
  buildRpgObservation(index, s).blocked_exits.find((e) => e.direction === "north")?.message;

describe("bug_0225 — The Breaking Weir storm-walk blocked-north hint names its precondition", () => {
  it("at the uncrossed walk the north hint names the life-line on the run-wire", () => {
    // The exact state the blind tester hit: rack freed (so they reached the walk), walk not
    // yet crossed (so north is still gated) — and, critically, the life-line possibly left
    // behind, which is why the precondition must be legible from the hint alone.
    const hint = NORTH_HINT(inRoom("weir_walk", { rack_freed: true }));
    expect(hint).toBeDefined(); // the gated exit IS surfaced as a hint (bug_0201)
    expect(hint).toMatch(/life-line/i); // names the missing precondition…
    expect(hint).toMatch(/run-wire/i); // …and where it clips
  });

  it("the hint is no longer the generic precondition-less string and spoils no command verb", () => {
    const hint = NORTH_HINT(inRoom("weir_walk", { rack_freed: true }))!;
    // The old generic message named nothing the way was waiting on — regression witness.
    expect(hint).not.toBe(
      "The spillway-walk is still ahead of you, awash and uncrossed; the race-house lies beyond it.",
    );
    // WHY-not-HOW (bug_0201): names the precondition but not the crossing command (`rig`).
    expect(hint).not.toMatch(/\brig\b/i);
  });

  it("once the walk is crossed the north hint retires (the way is open)", () => {
    const obs = buildRpgObservation(
      index,
      inRoom("weir_walk", { rack_freed: true, walk_crossed: true }),
    );
    expect(obs.exits.some((e) => e.direction === "north")).toBe(true); // traversable now
    expect(obs.blocked_exits.some((e) => e.direction === "north")).toBe(false); // hint gone
  });
});
