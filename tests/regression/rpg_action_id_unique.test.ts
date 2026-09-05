/**
 * Structural verification (§15) for bug_0152 — across the COMPLETE reachable state region
 * of every shipped RPG pack, the offered action menu is WELL-FORMED: no two actions in any
 * one observation ever share an `id`. The RPG completion of bug_0151's parser menu-integrity
 * proof — the action-set analogue of the every-ending / variant-liveness / score-economy
 * proofs over the same shared BFS, now driven through the RPG best/worst-roll bracket.
 *
 * ── Why this is a load-bearing contract (not a cosmetic nicety) ──────────────────────
 * The MCP/UI layer resolves a player's chosen action by its id with a FIRST-MATCH lookup,
 * and so does the RPG runner itself:
 *
 *   // src/mcp/tools.ts — actionForId()
 *   return obs.available_actions.find((a) => a.id === id)?.action ?? null;
 *
 * `Array.prototype.find` returns the FIRST match. So if an observation ever offered two
 * actions with the same id, the SECOND would be permanently UNSELECTABLE — a player (or the
 * coverage bot) who picked it would silently always get the first. The menu would carry a
 * phantom entry that does nothing it implies. bug_0151 proved this never happens for the two
 * shipped PARSER packs; this proves it for the RPG packs, which bug_0151 never touched (it
 * globs `content/parser/pack` only) AND which mint an extra id family the parser enumerator
 * does not.
 *
 * ── Why nothing already covers it for RPG ───────────────────────────────────────────
 *   - `enumerateRpgActions` (src/rpg/runner.ts) returns the FULL parser action set
 *     (`enumerateActions`) PLUS one `attack_<enemy.id>` per living enemy standing in the
 *     room. Two id families, two collision surfaces unchecked when this proof began:
 *       • the parser templates (`go_<dir>`, `examine_<oid>`, `use_<item>_on_<target>`, ...)
 *         — bug_0151 proves these unique over PARSER packs, but never over RPG packs (a
 *         different pack set, a different reachable region: combat opens post-defeat states
 *         the parser BFS can't reach). Two exits sharing a direction mint a duplicate
 *         `go_<dir>` the static DUPLICATE_ID check on authored entity ids cannot see.
 *       • `attack_<enemy.id>` — the RPG-only family. Two enemies sharing an id in one
 *         room mint identical `attack_<id>` options. bug_0598 now rejects duplicate enemy
 *         ids statically as well; the negative control below still plants that invalid
 *         shape directly to prove the enumerator audit independently detects it.
 *   - `enumerateRpgActions` builds each option through the same resolvable-only `option()`
 *     path, so "every offered action resolves" is true BY CONSTRUCTION (vacuous). Uniqueness
 *     is the orthogonal property: two DISTINCT, individually-resolvable options can still
 *     collide on their id string.
 *
 * Parser (bug_0151) and RPG (here) are the modes whose enumerators mint ids the static
 * checks cannot see, so they are the two that need a runtime proof.
 *
 * ── How it is proven (sound + exhaustive) ───────────────────────────────────────────
 * For each auto-discovered RPG pack it runs the shared exhaustive concrete BFS
 * (support/exhaustive_endings.ts) under the SAME best/worst-roll bracket the every-ending
 * and variant-liveness RPG proofs use (`exhaustiveEndingsMulti` over two rule sets that force
 * the player's best vs worst rolls — bug_0124/0147), with the bug_0146 LIVENESS action policy
 * (step every action except DROP/CLOSE and the pure-observation verbs). At EVERY distinct
 * reachable non-terminal state it calls the engine's own `enumerateRpgActions` and asserts its
 * option ids are pairwise distinct. The menu inspected at each state is INDEPENDENT of which
 * actions the BFS steps and of the roll regime (`legalActions`/`enumerateRpgActions` are
 * rng-independent), so the bracket only widens the set of states (menus) examined — strictly
 * more thorough, never less. Terminal states offer no menu (`enumerateRpgActions` returns the
 * bare parser set, then the BFS stops at `s.ended`), so they are skipped. The search FAILS on
 * `cappedOut`, so it can never pass by truncating an unexplored region.
 *
 * ── The roll-bracket soundness guard (shared with the RPG liveness/score proofs) ─────
 * "No collision in any reachable state" is only as complete as the set of states the bracket
 * reaches. The best/worst extremes bracket every middle-roll routing outcome UNLESS a route
 * gates on a raw HP value the extremes skip (a middle roll can land an intermediate HP).
 * The one supported exception is a monotone player `hp <= threshold` route in a
 * `combat_guaranteed` pack whose threshold is at least the maximum possible one-round
 * counterattack: the all-worst regime must cross it alive. Enemy HP, equality/lower-bound,
 * and unsafe player-HP predicates still FAIL LOUD rather than hide a colliding menu.
 *
 * Packs are auto-discovered, so a new RPG pack is covered the moment it ships (bug_0096).
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { isAuthoredInspectAction } from "../../src/rpg/legal_actions.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { hpConditionSupportForPack } from "./support/rpg_hp_condition_support.js";
import {
  seededOpeningTransferFailureMessage,
  seededOpeningTransferSupportForPack,
} from "./support/seeded_opening_transfer.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// The route-rich Wolf-Winter graph exhausts at 630,199 states under this
// liveness policy (measured 2026-07-14). Keep the same finite headroom ratio above that
// verified witness while retaining a loud cap-out for a future combinatorial regression.
const MAX_STATES = 800_000;

// The bug_0146 liveness action policy: step every legal action EXCEPT the ones that cannot
// usefully widen the reachable region (DROP — the inventory×location blowup — plus the
// inert observation verbs / never-legal CLOSE). Authored INSPECT interactions ride on
// LOOK and may mutate state, so their target looks are restored below. READ, ATTACK, and
// skill-check USE remain stepped too.
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (index: RpgIndex, action: Action): boolean =>
  isAuthoredInspectAction(index, action) || !LIVENESS_SKIP.has(action.type);

/**
 * A fixed-sequence PRNG (copied from rpg_all_endings_reachable / rpg_variant_liveness): each
 * draw consumes the next fraction (the last repeats once exhausted). `int(min,max)` maps the
 * fraction the way mulberry32 does, so HIGH→max face, 0→min face. resolveAttack draws player
 * strike then enemy reply; resolveSkillCheck draws once.
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

type MenuReport = {
  /** Human-readable descriptions of every state whose menu contained a duplicate id. */
  collisions: string[];
  /** Distinct non-terminal reachable states whose menu was inspected (anti-vacuity). */
  statesChecked: number;
  /** Total action options inspected across all those states (anti-vacuity). */
  actionsSeen: number;
  cappedOut: boolean;
};

/** Walk the full reachable region (best/worst-roll bracket) and inspect every offered RPG
 *  action menu for duplicate ids. */
function analyze(
  index: RpgIndex,
  explore: (a: Action) => boolean = (action) => livenessExplore(index, action),
): MenuReport {
  const collisions: string[] = [];
  let statesChecked = 0;
  let actionsSeen = 0;

  // The callback below and the solver's primary rule set inspect the same immutable state
  // back-to-back. Keep the exact production options (and their action projection) together
  // so this oracle still inspects what `enumerateRpgActions` emits without building its menu
  // twice per reachable state.
  const menus = new WeakMap<
    GameState,
    { options: ReturnType<typeof enumerateRpgActions>; actions: Action[] }
  >();
  const menuFor = (state: GameState) => {
    const cached = menus.get(state);
    if (cached) return cached;
    const options = enumerateRpgActions(index, state);
    const menu = { options, actions: options.map((option) => option.action) };
    menus.set(state, menu);
    return menu;
  };

  const bestRules = buildRpgRules(index, bestRng);
  const ruleSets = [
    {
      ...bestRules,
      // This is byte-for-byte the production `buildRpgRules().legalActions` projection,
      // only memoized alongside the production option list above.
      legalActions: (state: GameState): Action[] => menuFor(state).actions,
    },
    buildRpgRules(index, worstRng),
  ];
  const result = exhaustiveEndingsMulti(
    ruleSets,
    initStateForRpgPack(index, 7),
    MAX_STATES,
    (s: GameState) => {
      // Terminal states offer no live menu (the BFS stops at `s.ended`).
      if (s.ended) return;
      const opts = menuFor(s).options;
      statesChecked++;
      actionsSeen += opts.length;
      const seen = new Set<string>();
      const dup = new Set<string>();
      for (const o of opts) {
        if (seen.has(o.id)) dup.add(o.id);
        seen.add(o.id);
      }
      if (dup.size > 0) {
        collisions.push(
          `room "${s.current}": duplicate action id(s) ${[...dup].sort().join(", ")}`,
        );
      }
    },
    { explore },
  );

  return { collisions, statesChecked, actionsSeen, cappedOut: result.cappedOut };
}

describe("bug_0152 — every reachable action menu of every RPG pack has unique action ids", () => {
  it("discovers the shipped RPG packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(`${file}: no reachable state ever offers two actions with the same id`, () => {
      const loaded = loadRpgSourceFile(join(PACK_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const pack = loaded.compiled.pack;
      const seededOpeningSupport = seededOpeningTransferSupportForPack(pack);
      expect(
        seededOpeningSupport.unsupported,
        seededOpeningTransferFailureMessage(file, seededOpeningSupport),
      ).toBe(false);

      // Load-bearing assumption guard: only a monotone, safely crossed player-HP upper
      // bound is supported. Every other raw HP route still fails loudly.
      const hpSupport = hpConditionSupportForPack(pack);
      expect(
        hpSupport.unsupported,
        `pack gates a condition on an unsupported HP predicate — only player hp <= threshold ` +
          `at or above the maximum one-round counterattack in a combat_guaranteed pack is supported`,
      ).toBe(false);

      const { collisions, statesChecked, actionsSeen, cappedOut } = analyze(indexRpgPack(pack));
      // The search must have exhausted the reachable region, else "no duplicate" is unproven
      // (a collision could lie in the truncated tail).
      expect(cappedOut).toBe(false);
      // Anti-vacuity: we must have actually inspected real menus, not zero states.
      expect(statesChecked).toBeGreaterThan(0);
      expect(actionsSeen).toBeGreaterThan(statesChecked); // every state offers ≥1 action
      expect(collisions).toEqual([]);
      // The final-hash 630,199-state callback-free census took 114s; per-state collision
      // checks and shared CI contention add material wall time.
      // Wall-clock headroom does not change the bounded state proof.
    }, 720_000);
  }

  it("FAILS on a planted duplicate parser-template id (two same-direction exits → go_north)", () => {
    // Two exits in the SAME direction both mint the option id `go_north` — a real runtime
    // duplicate the static DUPLICATE_ID validator (authored entity ids, not enumerator-minted
    // ids) does not catch, surfaced HERE through the RPG enumerator, which wraps the parser
    // `enumerateActions`. The negative control for the inherited parser-template surface.
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 3, defense: 1 } }
rooms:
  - id: a
    name: A
    description: "base"
    exits:
      - { direction: north, to: b }
      - { direction: north, to: c }
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
  - id: c
    name: C
    description: "C"
    exits: [{ direction: south, to: a }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions, statesChecked } = analyze(indexRpgPack(r.compiled.pack));
    expect(statesChecked).toBeGreaterThan(0);
    expect(collisions.some((c) => c.includes("go_north"))).toBe(true);
  });

  it("FAILS on a planted duplicate RPG-only id (two same-id enemies in one room → attack_<id>)", () => {
    // The RPG-specific collision surface: two enemies sharing an id, both standing in room a,
    // each mint `attack_guard`. Feed this schema-compiled fixture directly to the enumerator:
    // the foundation validator now rejects duplicate enemy ids, but the dynamic proof must
    // independently catch the collision too. This complements the parser control above.
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 10, attack: 3, defense: 1 } }
rooms:
  - id: a
    name: A
    description: "two guards block the way"
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
enemies:
  - { id: guard, name: guard one, description: g1, room: a, hp: 3, attack: 1, defense: 0, death_ending: dead }
  - { id: guard, name: guard two, description: g2, room: a, hp: 3, attack: 1, defense: 0, death_ending: dead }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings:
  - { id: e, title: E, text: "win" }
  - { id: dead, title: D, text: "the guards kill you" }
`;
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions, statesChecked } = analyze(indexRpgPack(r.compiled.pack));
    expect(statesChecked).toBeGreaterThan(0);
    expect(collisions.some((c) => c.includes("attack_guard"))).toBe(true);
  });

  it("PASSES a clean twin (distinct exit directions + distinct enemy ids) — no false alarm", () => {
    // The same shapes as the two negative controls but well-formed: distinct directions mint
    // `go_north`/`go_east`, distinct enemy ids mint `attack_guard_a`/`attack_guard_b`. No
    // collision — proving the controls above bite on the duplication itself, not on the shape.
    const src = `
meta: { id: t, title: T, start_room: a, vars_init: { hp: 30, attack: 6, defense: 3 } }
rooms:
  - id: a
    name: A
    description: "two guards block the way"
    exits:
      - { direction: north, to: b }
      - { direction: east, to: c }
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
  - id: c
    name: C
    description: "C"
    exits: [{ direction: west, to: a }]
enemies:
  - { id: guard_a, name: guard one, description: g1, room: a, hp: 3, attack: 1, defense: 0, death_ending: dead }
  - { id: guard_b, name: guard two, description: g2, room: a, hp: 3, attack: 1, defense: 0, death_ending: dead }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings:
  - { id: e, title: E, text: "win" }
  - { id: dead, title: D, text: "the guards kill you" }
`;
    const r = compileRpgSource(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions } = analyze(indexRpgPack(r.compiled.pack));
    expect(collisions).toEqual([]);
  });
});
