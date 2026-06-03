/**
 * bug_0199 — a VALIDATOR-INDEPENDENT depth oracle for the PARSER generator's v3 depth-3 chain.
 *
 * Background. bug_0198's mode-matched benchmark found the parser curated→held-out gap was INVERTED
 * (−0.058): the procedural parser GENERATOR minted packs the coverage bot found EASIER than the
 * hand-authored parser packs. That is the textbook "environment too easy / spec too weak" reward-
 * hacking signal (EvilGenie, arXiv:2511.21654). The cause was structural: the parser generator had
 * stopped at the single v2 lock tier (bug_0168) while the RPG generator went all the way to v3 — so
 * generated parser packs were shallower than authored. v3 deepens it: a LESSER key (entrance coffer)
 * opens a locked hub strongbox holding a MIDDLE key, which opens a locked inner chest (a new inner
 * room) holding the GREAT key, which opens the goal gate (win) and the hazard (death fork). The
 * obtainability fixpoint is now depth-3 across three rooms.
 *
 * Why a SEPARATE oracle (the DGM lesson, arXiv:2505.22954). Any "depth" the generator STAMPS and a
 * checker READS BACK is gameable: paper-deep, practice-easy. So this suite never trusts a generator
 * field. It recomputes depth from EMITTED CONTENT by the TIER-KNOCKOUT technique — for each enabling
 * TAKE on the win path, remove just that action via the solver's `explore` filter and assert the win
 * becomes UNREACHABLE. Three distinct mandatory ordered state-flips proven load-bearing this way =
 * depth-3, recomputed independently of validateParser and of any generator-written count. This is
 * the same technique parser_generator_two_tier_chain.test.ts pioneered for the v2 tier, extended to
 * the third tier and packaged as a reusable helper so a KNOWN-SHALLOW NEGATIVE CORPUS (forged packs
 * that LOOK deep but chain shallowly, SoundnessBench / bug_0182 pattern) can be run through the SAME
 * oracle and shown to be REJECTED — proving the bar is adversarial-by-construction, not a naive
 * #keys×#locks count a shallow pack could satisfy.
 *
 * Both directions are pinned (the EvilGenie setter-solver feasibility requirement): HARDER (≥3
 * load-bearing tiers; a pinned solver-work floor) AND still SOLVABLE (every declared ending reachable
 * via the bug_0121/0122 exhaustive solver, `cappedOut=false`). Difficulty is never bought by making
 * a pack unsolvable.
 */
import { describe, it, expect } from "vitest";
import { generateParserPack, PARSER_GENERATOR_VERSION } from "../../src/gen/parser_generator.js";
import type { ParserPack } from "../../src/parser/schema.js";
import { ParserPackSchema } from "../../src/parser/schema.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/model.js";
import { buildParserRules } from "../../src/parser/runner.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const SEEDS = Array.from({ length: 12 }, (_, i) => i);
const MAX_STATES = 200_000;
const WIN = "ending_win";
const DOOM = "ending_doom";

// A solver-work LOWER bound captured once from a v3 run over the 12-seed window: the SHALLOWEST seed
// explores 125 distinct states under the default progress-action policy. Pinned as a conservative
// constant (100, comfortably below 125) so a future flattening that shrinks the reachable region
// trips it, without being so tight that an innocuous reorder fails. (For reference, v2 over the same
// window bottomed out near ~40 states — the depth-3 region is materially larger.)
const MIN_STATES_FLOOR = 100;

/**
 * Does the SAME exhaustive solver, but with the given set of TAKE-item ids removed from the action
 * policy, still reach `ending`? This is the tier-knockout primitive: a tier whose key TAKE, once
 * removed, leaves `ending` reachable is NOT load-bearing (the chain has a shortcut around it).
 * Pure: builds rules from `pack` and plays them; never reads a generator field.
 */
function winReachableWithoutTakes(
  pack: ParserPack,
  removedTakeItems: string[],
): {
  reached: Set<string>;
  cappedOut: boolean;
} {
  const removed = new Set(removedTakeItems);
  const index = indexParserPack(pack);
  const rules = buildParserRules(index);
  const explore = (a: Action): boolean =>
    !(a.type === "TAKE" && a.item !== undefined && removed.has(a.item)) &&
    // keep the default reachability restriction (skip reversible/observation moves) so the search
    // stays tractable; TAKE is a progress action so the only thing we remove is the named takes.
    a.type !== "DROP" &&
    a.type !== "CLOSE" &&
    a.type !== "LOOK" &&
    a.type !== "INVENTORY" &&
    a.type !== "READ" &&
    a.type !== "INSPECT";
  const { reached, cappedOut } = exhaustiveEndings(
    rules,
    initStateForParserPack(index, 0),
    MAX_STATES,
    undefined,
    { explore },
  );
  return { reached, cappedOut };
}

/**
 * The validator-INDEPENDENT depth oracle. Given a pack and the ORDERED list of tier-enabling TAKE
 * item ids (lesser → middle → great), it verifies each tier is load-bearing for the WIN by knockout:
 * removing tier k's TAKE (and every later tier's, since later takes are gated behind it anyway) must
 * make the win UNREACHABLE. Returns the number of tiers proven load-bearing. Depth = that count.
 * Recomputed entirely from emitted content + concrete play — never a stamped field.
 */
function loadBearingTierDepth(pack: ParserPack, tierTakeItems: string[]): number {
  let depth = 0;
  for (let k = 0; k < tierTakeItems.length; k++) {
    // Removing tier k's TAKE alone is enough to prove it load-bearing; we also confirm the win is
    // reachable when NOTHING is removed (the positive baseline) elsewhere. A tier is load-bearing
    // iff knocking out its key TAKE severs the win route.
    const { reached, cappedOut } = winReachableWithoutTakes(pack, [tierTakeItems[k]!]);
    if (cappedOut) return depth; // unproven — do not credit the tier
    if (!reached.has(WIN)) depth += 1; // win severed ⇒ this tier is genuinely required
  }
  return depth;
}

describe("bug_0199 — the parser generator emits a validator-independent depth-3 chain", () => {
  it("the generator version is bumped to 3 (the v3 deepening; the corpus is re-sealed to match)", () => {
    expect(PARSER_GENERATOR_VERSION).toBe(3);
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: depth-3 (3 load-bearing tiers), both endings reachable, fully solvable`, () => {
      const pack = generateParserPack(seed);
      const index = indexParserPack(pack);
      const rules = buildParserRules(index);

      // ── POSITIVE / liveness: BOTH endings reachable, no cap-out (the bug_0121/0122 solver). ──
      const live = exhaustiveEndings(rules, initStateForParserPack(index, seed), MAX_STATES);
      expect(live.cappedOut, `seed ${seed}: liveness search hit the state cap`).toBe(false);
      expect(live.reached.has(WIN), `seed ${seed}: win unreachable`).toBe(true);
      expect(live.reached.has(DOOM), `seed ${seed}: death fork unreachable`).toBe(true);

      // ── SOLVER-WORK floor (secondary): the deepened region is genuinely larger. ──────────────
      expect(
        live.states,
        `seed ${seed}: only ${live.states} distinct states (floor ${MIN_STATES_FLOOR}) — region shrank`,
      ).toBeGreaterThanOrEqual(MIN_STATES_FLOOR);

      // ── DEPTH FLOOR, independently recomputed by tier-knockout (NOT a generator field). ──────
      // The three ordered tier-enabling takes on the win path: lesser → middle → great key.
      const depth = loadBearingTierDepth(pack, ["lesser_key", "middle_key", "key"]);
      expect(
        depth,
        `seed ${seed}: only ${depth} load-bearing tier(s) proven by knockout (floor 3)`,
      ).toBeGreaterThanOrEqual(3);

      // Spell out each tier explicitly so a regression names which tier went decorative.
      expect(
        winReachableWithoutTakes(pack, ["lesser_key"]).reached.has(WIN),
        `seed ${seed}: win reachable without the LESSER key — tier 1 is decorative`,
      ).toBe(false);
      expect(
        winReachableWithoutTakes(pack, ["middle_key"]).reached.has(WIN),
        `seed ${seed}: win reachable without the MIDDLE key — tier 2 is decorative`,
      ).toBe(false);
      expect(
        winReachableWithoutTakes(pack, ["key"]).reached.has(WIN),
        `seed ${seed}: win reachable without the GREAT key — tier 3 is decorative`,
      ).toBe(false);
    });
  }

  // ── KNOWN-SHALLOW NEGATIVE CORPUS (SoundnessBench / bug_0182): packs forged to LOOK deep (3 keys,
  //    a 4-room spine) but CHAIN shallow, so the depth oracle MUST reject them. Each keeps all three
  //    quest keys (red against the naive #keys×#locks metric, which still tallies 3) yet BYPASSES one
  //    tier, so the tier-knockout correctly reports depth < 3. These prove the oracle is adversarial —
  //    it measures load-bearing OBTAINABILITY by concrete play, not a self-reported count or a tally.
  //    NB: the v3 generator routes BOTH the lesser tier (its strongbox unlock sets HUB_OPEN, the only
  //    way into the deep cell) and the middle/great tiers through the win, so the lesser key is doubly
  //    load-bearing; the forges below each sever exactly ONE of the THREE tiers and leave the rest. ──
  describe("the depth oracle REJECTS known-shallow forged packs", () => {
    const tierTakes = ["lesser_key", "middle_key", "key"];

    function clone(): ParserPack {
      return ParserPackSchema.parse(structuredClone(generateParserPack(0)));
    }

    // BYPASS THE MIDDLE TIER (tier 3's container): the great key sits FREELY TAKEABLE on the inner-room
    // floor instead of cased in the inner chest, so once you are in the deep cell you grab it without
    // ever needing the middle key. The lesser key is still needed (it sets HUB_OPEN), so true depth
    // drops to 2 — below the floor. Naive #keys×#locks still tallies 3.
    function forgeFreeGreatKey(): ParserPack {
      const pack = clone();
      const innerChest = pack.objects.find((o) => o.id === "inner_chest")!;
      innerChest.contents = [];
      const innerRoom = pack.rooms.find((r) => r.id === "inner")!;
      if (!innerRoom.objects.includes("key")) innerRoom.objects.push("key");
      return ParserPackSchema.parse(pack);
    }

    // BYPASS THE GREAT TIER: re-key the GATE to the MIDDLE key, so the gate (and thus the win) opens
    // with the middle key directly — the inner chest + great key (tier 3) are never needed. True depth
    // drops to 2. Naive #keys×#locks still tallies 3.
    function forgeGateKeyedToMiddle(): ParserPack {
      const pack = clone();
      const gate = pack.objects.find((o) => o.id === "gate")!;
      gate.key_id = "middle_key";
      return ParserPackSchema.parse(pack);
    }

    // BYPASS THE LESSER + MIDDLE TIERS: open the way in from the start (HUB_OPEN pre-set) AND unlock
    // the inner chest, so neither the lesser nor the middle key is needed — only the freely-grabbable
    // great key. True depth drops to 1. Naive #keys×#locks still tallies 3.
    function forgeShortcutToGreat(): ParserPack {
      const pack = clone();
      pack.meta.flags_init = [...new Set([...(pack.meta.flags_init ?? []), "hub_open"])];
      const innerChest = pack.objects.find((o) => o.id === "inner_chest")!;
      innerChest.locked = false;
      delete (innerChest as { key_id?: string }).key_id;
      delete (innerChest as { unlock_effects?: unknown }).unlock_effects;
      return ParserPackSchema.parse(pack);
    }

    it("free great key (middle tier bypassed): depth oracle reports < 3", () => {
      const pack = forgeFreeGreatKey();
      // Sanity: it still LOOKS deep by the naive tally — 3 quest keys.
      expect(
        pack.objects.filter((o) => o.quest_critical).length,
        "forged pack should still have 3 keys (the naive metric is fooled)",
      ).toBe(3);
      const depth = loadBearingTierDepth(pack, tierTakes);
      expect(depth, "free-great-key pack must be rejected (depth < 3)").toBeLessThan(3);
      // Concretely: the win is reachable WITHOUT the middle key — its tier is decorative.
      expect(winReachableWithoutTakes(pack, ["middle_key"]).reached.has(WIN)).toBe(true);
    });

    it("gate re-keyed to the middle key (great tier bypassed): depth oracle reports < 3", () => {
      const pack = forgeGateKeyedToMiddle();
      const depth = loadBearingTierDepth(pack, tierTakes);
      expect(depth, "gate-keyed-to-middle pack must be rejected (depth < 3)").toBeLessThan(3);
      // Concretely: the win is reachable WITHOUT the great key — its tier is decorative.
      expect(winReachableWithoutTakes(pack, ["key"]).reached.has(WIN)).toBe(true);
    });

    it("shortcut to the great key (lesser + middle tiers bypassed): depth oracle reports < 3", () => {
      const pack = forgeShortcutToGreat();
      const depth = loadBearingTierDepth(pack, tierTakes);
      expect(depth, "shortcut-to-great pack must be rejected (depth < 3)").toBeLessThan(3);
      // Concretely: the win is reachable WITHOUT either the lesser OR the middle key — both decorative.
      expect(winReachableWithoutTakes(pack, ["lesser_key"]).reached.has(WIN)).toBe(true);
      expect(winReachableWithoutTakes(pack, ["middle_key"]).reached.has(WIN)).toBe(true);
    });
  });
});
