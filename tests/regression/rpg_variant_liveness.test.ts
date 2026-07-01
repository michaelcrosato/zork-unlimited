/**
 * Structural verification (§15) — every declared reactive `variant` of every shipped
 * RPG pack is LIVE: there is a concretely-reachable state in which that variant is the
 * FIRST match AND the thing it describes is in view (the room you stand in, or an object
 * present to examine) — exactly the text a real player sees. The RPG completion of the
 * dead-reactive-prose liveness trilogy: CYOA (bug_0145) + parser (bug_0146) closed the
 * two deterministic modes; this closes the last, genuinely-harder mode. Together with the
 * static shadowing checks the
 * "dead reactive prose" defect class is now closed across all three modes.
 *
 * The defect class has two causes; this proves the LIVE half directly against ground
 * truth, the complement to the static shadowing check:
 *   - SHADOWING (static): a later sibling whose `when` is PROVABLY ENTAILED by an earlier
 *     one can never be first match. Sound but partial — reasons only over pure literal/
 *     var-bound conjunctions, never the pack's real gating.
 *   - UNREACHABLE GUARD (here, dynamic): a variant whose `when` no reachable state at its
 *     viewing context can satisfy — a flag set only on a branch that never returns, a var
 *     threshold the gating never reaches, an enemy never defeated. Not shadowed; its guard
 *     is simply unreachable, so its text is dead and no blind playtest is guaranteed to
 *     surface it. RPG rooms/objects and endings carry reactive variants, so room + object
 *     variants are the whole scope, exactly as in the parser proof.
 *
 * ── Why RPG is the harder mode, and how this stays SOUND ─────────────────────────────
 * CYOA and the parser stage are fully DETERMINISTIC, so a single-`Rules` BFS that steps
 * each legal action explores every transition, and bug_0145/bug_0146 mine variant display
 * from that one search. RPG adds the engine's only randomness: an ATTACK round draws a d6
 * for the player's strike and a d6 for the enemy's reply, and a skill check draws a d20
 * (src/rpg/combat.ts). A single seeded draw per (state, action) would explore just ONE of
 * the outcomes, so a naive single-rules liveness search could FALSELY call a variant dead
 * when only the OTHER combat/skill outcome reaches its display state.
 *
 * So this reuses the same fix the every-ending RPG proof uses (bug_0124,
 * rpg_all_endings_reachable.test.ts): drive `exhaustiveEndingsMulti` under TWO rule sets
 * that differ only in the rolls their combat/skill resolver draws — one forcing the
 * player's BEST rolls (max strike, min damage taken, max skill roll), one their WORST.
 * Because the only routing-relevant consequence of a round is MONOTONE in the roll (did
 * the enemy reach 0 HP, did the player reach 0 HP, did d20+skill meet the difficulty),
 * those two extremes bracket every outcome a middle roll could produce. Every successor is
 * a real `makeStep` on a legal die face (1/6 for d6, 1/20 for d20), so nothing spurious is
 * visited; and every reachable post-combat / post-check configuration is reached under one
 * of the two regimes, so no live variant is missed.
 *
 * ── The roll-bracket caveat (the exact crux bug_0146's next-focus named), resolved ──────
 * The bracket is complete for VARIANT LIVENESS only if no variant's `when` reads a
 * roll-dependent TRANSIENT the best/worst extremes skip over — i.e. a raw HP value (a
 * middle roll can land an intermediate HP the two extremes never visit). RPG variants gate
 * on flags / items / non-HP vars / object state / visited — all of which evolve either by
 * roll-independent actions or by MONOTONE combat consequences (an enemy's `defeat_flag` and
 * `on_defeat` fire when it dies; a skill check's `on_success`/`on_failure` fire on the
 * best/worst roll), so the bracket reaches them. The one way this could break is a variant
 * gated on a raw HP var, so the suite ASSERTS no pack condition reads an HP var (player `hp`
 * or a hidden `__enemy_hp_*`) — the SAME load-bearing guard rpg_all_endings_reachable makes,
 * here covering variant `when`s as a subset of all pack conditions. A pack that violates it
 * trips a loud, explained failure (branch the HP in the solver) rather than silently
 * under-crediting a variant. Both shipped packs pass it today.
 *
 * ── The action policy (shared with the parser liveness proof) ───────────────────────────
 * The shared BFS defaults to a MONOTONE progress-only policy (skip reversible/observation
 * moves) that is sound for the every-ending PROOF but NOT for liveness — skipping a state
 * that displays a variant would FALSELY call it dead. So, exactly as bug_0146 does, this
 * widens the policy to step every action EXCEPT those that provably cannot gate a variant:
 * LOOK/INVENTORY/INSPECT (narrate-only / never legal → mutate no field any `Condition`
 * reads), CLOSE (no resolver case → never legal), and DROP (the documented boundary — its
 * only variant-observable effect is `not_item: X`, and no shipped variant gates on a
 * put-it-back state; a future one would FAIL LOUD here, never silently pass dead prose).
 * READ and every progress action — including ATTACK and the skill-check USE — ARE stepped,
 * so read-flag, post-combat, and skill-outcome display states are all visited. The search
 * FAILS on `cappedOut`, so it can never pass by truncating an unexplored region.
 *
 * Packs are auto-discovered from content/rpg/pack, so a new RPG pack is covered the moment
 * it ships (the health-covers-all-packs bar, bug_0096). The negative controls below prove
 * the check bites on a genuinely dead guard AND that stepping combat is load-bearing.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileRpgPack, loadRpgPackFile } from "../../src/rpg/pack.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { HP_VAR } from "../../src/rpg/schema.js";
import { visibleObjectIds } from "../../src/rpg/model.js";
import { evalConditions } from "../../src/core/conditions.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import type { RoomVariant, ObjectVariant, EndingVariant } from "../../src/rpg/schema.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/rpg/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same backstop as the CYOA/parser liveness proofs and the every-ending RPG proof. The
// liveness policy widens the progress-only policy by READ only (and the combat lattice is
// already present in the every-ending RPG search, which settles well under this); the cap
// exists only so a future blowup fails LOUD (cap hit) rather than truncating a region into
// a silent pass.
const MAX_STATES = 200_000;

/**
 * The liveness action policy (identical to the parser proof): step every legal action
 * EXCEPT the ones that provably cannot gate a variant — the pure-observation verbs
 * (narrate-only / never legal) and DROP (see the file header). Crucially this DOES step
 * READ (sticky interaction effects), ATTACK, and the skill-check USE.
 */
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (a: Action): boolean => !LIVENESS_SKIP.has(a.type);

/**
 * A fixed-sequence PRNG (copied from rpg_all_endings_reachable): each draw consumes the
 * next fraction (the last repeats once exhausted). `int(min,max)` maps the fraction the
 * way mulberry32 does, so HIGH→max face, 0→min face. resolveAttack draws player strike
 * then enemy reply; resolveSkillCheck draws once.
 */
const HIGH = 0.999999;
const LOW = 0;
function fixedSeqRng(fracs: number[]): Rng {
  let i = 0;
  const next = (): number => {
    const f = fracs[Math.min(i, fracs.length - 1)] ?? 0;
    i += 1;
    return f;
  };
  return {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
}
// BEST for the player: own strike max, damage taken min, skill roll max → [HIGH, LOW].
// WORST for the player: own strike min, damage taken max, skill roll min → [LOW, HIGH].
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

/** True for the player HP var and any hidden per-enemy HP var (`__enemy_hp_*`). */
function isHpVar(name: string): boolean {
  return name === HP_VAR || name.startsWith("__enemy_hp_");
}

/**
 * Recursively scan a compiled pack for any CONDITION (var_gte/var_lte/var_eq) that gates
 * on an HP var — the load-bearing assumption the best/worst-roll bracket rests on (see the
 * header). Effect writes (set_var/inc_var) are not condition kinds and never match, so this
 * flags exactly variant/route gating on a raw HP value. Mirrors rpg_all_endings_reachable.
 */
function readsHpInCondition(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(readsHpInCondition);
  if (node && typeof node === "object") {
    for (const k of ["var_gte", "var_lte", "var_eq"] as const) {
      const cmp = (node as Record<string, unknown>)[k];
      if (
        cmp &&
        typeof cmp === "object" &&
        typeof (cmp as { name?: unknown }).name === "string" &&
        isHpVar((cmp as { name: string }).name)
      ) {
        return true;
      }
    }
    return Object.values(node as Record<string, unknown>).some(readsHpInCondition);
  }
  return false;
}

/** The index of the first variant whose `when` holds in `state` (first-match-wins,
 *  identical to model.ts roomDescription/objectDescription), or -1 for the base text. */
function firstMatch(
  variants: readonly (RoomVariant | ObjectVariant | EndingVariant)[],
  state: GameState,
): number {
  for (let i = 0; i < variants.length; i++) {
    if (evalConditions(variants[i]!.when, state)) return i;
  }
  return -1;
}

type Liveness = {
  /** "room:<id>#<i>" / "object:<id>#<i>" / "ending:<id>#<i>" keys first-matched in some state. */
  displayed: Set<string>;
  /** Every declared variant key that must therefore be displayed somewhere. */
  declared: { key: string; where: string }[];
  cappedOut: boolean;
};

/** Run the best/worst-roll bracket under the liveness policy and mine displayed variants. */
function analyze(index: RpgIndex, explore: (a: Action) => boolean = livenessExplore): Liveness {
  const displayed = new Set<string>();
  const record = (kind: "room" | "object" | "ending", id: string, idx: number): void => {
    if (idx >= 0) displayed.add(`${kind}:${id}#${idx}`);
  };

  const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
  const result = exhaustiveEndingsMulti(
    ruleSets,
    initStateForRpgPack(index, 7),
    MAX_STATES,
    (s) => {
      // At a terminal the player sees the ending's epilogue — credit the reactive ending
      // variant that fired (first-match-wins, exactly what model.ts endingText displays).
      if (s.ended) {
        const ending = s.endingId ? index.pack.endings.find((e) => e.id === s.endingId) : undefined;
        if (ending?.variants?.length) record("ending", ending.id, firstMatch(ending.variants, s));
        return;
      }
      const room = index.rooms.get(s.current);
      if (room?.variants?.length) record("room", room.id, firstMatch(room.variants, s));
      // Objects are shown on examine — credit a variant only when the object is actually
      // PRESENT (visible in the room or held), i.e. examinable in this very state.
      for (const oid of [...visibleObjectIds(index, s, s.current), ...s.inventory]) {
        const obj = index.objects.get(oid);
        if (obj?.variants?.length) record("object", oid, firstMatch(obj.variants, s));
      }
    },
    { explore },
  );

  const declared: { key: string; where: string }[] = [];
  for (const room of index.pack.rooms) {
    (room.variants ?? []).forEach((_, i) =>
      declared.push({ key: `room:${room.id}#${i}`, where: `room "${room.id}" variant #${i}` }),
    );
  }
  for (const obj of index.pack.objects) {
    (obj.variants ?? []).forEach((_, i) =>
      declared.push({ key: `object:${obj.id}#${i}`, where: `object "${obj.id}" variant #${i}` }),
    );
  }
  for (const e of index.pack.endings) {
    (e.variants ?? []).forEach((_, i) =>
      declared.push({ key: `ending:${e.id}#${i}`, where: `ending "${e.id}" variant #${i}` }),
    );
  }

  return { displayed, declared, cappedOut: result.cappedOut };
}

describe("bug_0147 — every reactive variant of every RPG pack is reachable as displayed text", () => {
  it("discovers the shipped RPG packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(`${file}: every declared variant is the first match in some viewing state`, () => {
      const loaded = loadRpgPackFile(join(PACK_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;

      // The caveat guard: the best/worst-roll bracket credits variant display soundly only
      // when no variant (no condition at all) gates on a raw HP value the extremes skip.
      expect(
        readsHpInCondition(pack),
        `pack gates a condition on an HP var — the best/worst-roll bracket assumes no ` +
          `HP-gated variant guard; branch the HP in the solver before trusting liveness here`,
      ).toBe(false);

      const { displayed, declared, cappedOut } = analyze(indexRpgPack(pack));
      // The search must have exhausted the reachable region, else "not displayed" is
      // unproven (it could lie in the truncated tail).
      expect(cappedOut).toBe(false);
      // The shipped RPG packs are reactive by design — guard against a vacuous pass.
      expect(declared.length).toBeGreaterThan(0);
      const dead = declared.filter((d) => !displayed.has(d.key)).map((d) => d.where);
      expect(dead).toEqual([]);
    });
  }

  it("FAILS on a planted dead variant (guards against the check silently passing)", () => {
    // A room variant guarded on a flag the pack never sets is dead prose. The check must
    // catch it — the negative control for the whole proof.
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 3, defense: 1 } }
rooms:
  - id: a
    name: A
    description: "base"
    variants:
      - when: [{ has_flag: never_set }, { has_flag: also_never }]
        text: "dead — no path sets these"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileRpgPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { displayed } = analyze(indexRpgPack(r.compiled.pack));
    expect(displayed.has("room:a#0")).toBe(false);
  });

  it("CREDITS a variant reachable only by WINNING a fight (the best-roll regime is load-bearing)", () => {
    // The RPG soundness crux: a variant gated on an enemy's `defeat_flag` is LIVE, and the
    // bracket proves it only because the BEST-roll regime drives the fight to the enemy's
    // death. The enemy is tuned so the player WINS under best rolls but DIES under worst —
    // so the post-defeat display state is reachable ONLY via the best regime. A negative
    // twin (worst regime alone) must FAIL to credit it, demonstrating the best-roll regime
    // is load-bearing — the combat analogue of the parser READ-load-bearing control.
    //   best  (strike d6=6, reply d6=1): R1 player 6+2=8 → ogre 12→4, ogre 1+8=9 → hero 10→1;
    //                                     R2 player 8 → ogre 4→0 dies, defeat_flag set, hero lives at 1.
    //   worst (strike d6=1, reply d6=6): R1 player 1+2=3 → ogre 12→9, ogre 6+8=14 → hero dies (death_ending).
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 2, defense: 0 } }
rooms:
  - id: a
    name: A
    description: "an ogre blocks the way"
    variants:
      - when: [{ has_flag: ogre_slain }]
        text: "the ogre lies dead; the way is clear"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
enemies:
  - id: ogre
    name: ogre
    description: "a hulking ogre"
    room: a
    hp: 12
    attack: 8
    defense: 0
    defeat_flag: ogre_slain
    death_ending: dead
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings:
  - { id: e, title: E, text: "you live" }
  - { id: dead, title: D, text: "the ogre kills you" }
`;
    const r = compileRpgPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexRpgPack(r.compiled.pack);

    // With the full best/worst bracket the post-defeat variant is credited (best regime wins).
    expect(analyze(index).displayed.has("room:a#0")).toBe(true);

    // Control: drive the SAME pack under the WORST regime alone — the player dies before the
    // ogre falls, the defeat flag is never set, and the variant is (correctly) never displayed.
    const displayedWorst = new Set<string>();
    exhaustiveEndingsMulti(
      [buildRpgRules(index, worstRng)],
      initStateForRpgPack(index, 7),
      MAX_STATES,
      (s) => {
        if (s.ended) return;
        const room = index.rooms.get(s.current);
        if (room?.variants?.length) {
          const idx = firstMatch(room.variants, s);
          if (idx >= 0) displayedWorst.add(`room:${room.id}#${idx}`);
        }
      },
      { explore: livenessExplore },
    );
    expect(displayedWorst.has("room:a#0")).toBe(false);
  });
});
