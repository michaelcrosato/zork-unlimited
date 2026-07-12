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
 *     room. Two id families, two collision surfaces, neither checked anywhere:
 *       • the parser templates (`go_<dir>`, `examine_<oid>`, `use_<item>_on_<target>`, ...)
 *         — bug_0151 proves these unique over PARSER packs, but never over RPG packs (a
 *         different pack set, a different reachable region: combat opens post-defeat states
 *         the parser BFS can't reach). Two exits sharing a direction mint a duplicate
 *         `go_<dir>` the static DUPLICATE_ID validator (rooms/objects/npcs only) cannot see.
 *       • `attack_<enemy.id>` — the RPG-only family. The parser validator dup-checks
 *         room/object/npc ids; the RPG validator adds enemy room/death_ending checks but NO
 *         enemy-id uniqueness check, so two enemies sharing an id in one room mint two
 *         identical `attack_<id>` options the static layer is blind to. The negative control
 *         below plants exactly that.
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
 * gates on a raw HP value the extremes skip (a middle roll can land an intermediate HP). So,
 * exactly as rpg_all_endings_reachable / rpg_variant_liveness do, the suite ASSERTS no pack
 * condition reads an HP var — a future HP-gated route would FAIL LOUD (branch the HP in the
 * solver) rather than let an unvisited state hide a colliding menu behind a false pass.
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
import { HP_VAR } from "../../src/rpg/schema.js";
import type { GameState } from "../../src/core/state.js";
import type { Rng } from "../../src/core/rng.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// The route-rich Wolf-Winter graph exhausts at 665,101 states under this
// liveness policy (measured 2026-07-11). Keep the same finite headroom ratio above that
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

/** True for the player HP var and any hidden per-enemy HP var (`__enemy_hp_*`). */
function isHpVar(name: string): boolean {
  return name === HP_VAR || name.startsWith("__enemy_hp_");
}

/**
 * Recursively scan a compiled pack for any CONDITION (var_gte/var_lte/var_eq) that gates on
 * an HP var — the load-bearing assumption the best/worst-roll bracket rests on (see header).
 * Effect writes (set_var/inc_var) are not condition kinds and never match. Mirrors
 * rpg_all_endings_reachable / rpg_variant_liveness.
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

  const ruleSets = [buildRpgRules(index, bestRng), buildRpgRules(index, worstRng)];
  const result = exhaustiveEndingsMulti(
    ruleSets,
    initStateForRpgPack(index, 7),
    MAX_STATES,
    (s: GameState) => {
      // Terminal states offer no live menu (the BFS stops at `s.ended`).
      if (s.ended) return;
      const opts = enumerateRpgActions(index, s);
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

      // The bracket reaches every routing-relevant state soundly only when no route gates
      // on a raw HP value the best/worst extremes skip — else a colliding menu could hide in
      // an unvisited state behind a false pass. Both shipped packs satisfy this today.
      expect(
        readsHpInCondition(pack),
        `pack gates a condition on an HP var — the best/worst-roll bracket assumes no ` +
          `HP-gated route; branch the HP in the solver before trusting menu coverage here`,
      ).toBe(false);

      const { collisions, statesChecked, actionsSeen, cappedOut } = analyze(indexRpgPack(pack));
      // The search must have exhausted the reachable region, else "no duplicate" is unproven
      // (a collision could lie in the truncated tail).
      expect(cappedOut).toBe(false);
      // Anti-vacuity: we must have actually inspected real menus, not zero states.
      expect(statesChecked).toBeGreaterThan(0);
      expect(actionsSeen).toBeGreaterThan(statesChecked); // every state offers ≥1 action
      expect(collisions).toEqual([]);
      // The exact 665,101-state Wolf-Winter graph took 178s in the exhaustive-suite
      // contention run. Wall-clock headroom does not change the bounded state proof.
    }, 240_000);
  }

  it("FAILS on a planted duplicate parser-template id (two same-direction exits → go_north)", () => {
    // Two exits in the SAME direction both mint the option id `go_north` — a real runtime
    // duplicate the static DUPLICATE_ID validator (rooms/objects/npcs, not enumerator-minted
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
    // each mint `attack_guard`. NO static check catches this — the parser validator dup-checks
    // room/object/npc ids, and the RPG validator adds enemy room/death_ending checks but no
    // enemy-id uniqueness check. The dynamic proof must catch it. This is the RPG analogue of
    // the parser two-same-direction-exits control above — a runtime duplicate minted from
    // declared content the static layer is blind to.
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
