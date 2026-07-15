/**
 * Metamorphic observation-stream oracle (§15) for the RPG mode — bug_0215, the RPG
 * extension that COMPLETES the per-step observation-stream trilogy begun by the CYOA
 * oracle (bug_0213, cyoa_metamorphic_observation_stream.test.ts) and the PARSER oracle
 * (bug_0214, parser_metamorphic_observation_stream.test.ts). This is the deferred
 * "extend THIS per-step observation-stream witness to RPG (the last mode)" lever named
 * verbatim as bug_0214's next-focus #1, following the exact CYOA → parser → rpg growth
 * path the bug_0121 reachability oracle and the bug_0209/0211/0212 metamorphic-census
 * oracle both took.
 *
 * WHAT THE CENSUS ORACLE PROVES, AND THE GAP IT LEAVES. bug_0212
 * (rpg_metamorphic_relabel.test.ts) proves an RPG pack and its identifier-relabeled twin
 * are isomorphic on three TERMINAL/AGGREGATE artefacts: the best/worst-roll
 * ending-reachability census, the distinct-state COUNT, and validateRpg's finding-code
 * multiset. Those are end-of-run summaries. They would still pass if the engine produced
 * subtly DIFFERENT player-facing observations ALONG THE WAY — a room's description, the
 * enumerated commands, the surfaced flags/vars/inventory, the blocked-exit hints, and the
 * RPG-only surfaces the census never inspects at all: the ENEMIES standing here (id, name,
 * and the live combat HP that ticks down a fight) and the player's STATS (hp/attack/
 * defense) — as long as the same endings stayed reachable and the state graph kept the
 * same size. The benchmark's contamination story rests on something stronger: that the
 * EXACT window a model plays through — every observation, turn by turn, mid-fight HP and
 * all — is a pure function of the pack's STRUCTURE, identical (modulo the bijection) on
 * the twin. A model that memorised the original's id strings (enemy ids, defeat flags)
 * must gain nothing not just at the final ending but at EVERY intermediate observation it
 * reasons over.
 *
 * WHAT THIS ORACLE ADDS. For each shipped RPG pack it walks the reachable state graph in
 * LOCK-STEP on the original and its relabeled twin, and at every single state asserts the
 * twin's `buildRpgObservation` equals the original's observation pushed through the
 * relabeling — `room`, `visible_objects[].id`, `npcs_present[].id`, `exits[].to`,
 * `inventory`, the surfaced flag/var names, the `dialogue.npc`, the `ending`/`ending_id`,
 * every `available_actions` entry's structured `action` ids (INCLUDING the RPG-only
 * `ATTACK.enemy` id and its derived `attack_<enemy>` id) and, the RPG additions, the
 * `enemies_present[].id` all mapped through the bijection; the prose (room/object name +
 * description, variant text, `npc_text`, journal, ending title/text, blocked-exit message,
 * enemy name) and the command VOCABULARY (each action's human `command` string) left
 * byte-identical; and the NUMBERS — `enemies_present[].hp`, `stats.{hp,attack,defense}`,
 * `score` — left equal (a consistent relabel must not perturb a single combat number). The
 * mid-fight enemy HP is the distinctive RPG surface: it is read from the synthesised
 * `__enemy_hp_<id>` var (combat.ts), which follows the relabeled enemy id, so a twin that
 * reported a different remaining HP — or surfaced the wrong enemy under its id — diverges
 * loudly here while bug_0212's terminal census stays green.
 *
 * RPG-SPECIFIC SHAPE — THE BRACKETED LOCK-STEP WALK. Unlike CYOA/parser, RPG is NOT fully
 * deterministic: an ATTACK round and a skill check draw from the seeded PRNG, so a single
 * (state, action) resolves many ways and a single-rules lock-step DFS (the parser oracle's
 * shape) is unsound — one state fingerprint transitions to several. So, exactly like the
 * RPG reachability oracle (rpg_all_endings_reachable.test.ts) and the RPG census oracle
 * (bug_0212), the walk is computed over the BEST/WORST-roll BRACKET: from each state-pair
 * it steps every explored action under BOTH a best-roll and a worst-roll regime. Because
 * the only routing-relevant consequence of a round is monotone in the roll (did the enemy
 * reach 0 HP, did the player reach 0 HP, did the d20 meet the difficulty), those two
 * extremes bracket every middle outcome, so every distinct reachable state — and hence
 * every distinct observation — is visited. The legal-action set is rng-INDEPENDENT in every
 * mode, so it is taken from one regime and each action stepped under both, exactly as
 * `exhaustiveEndingsMulti` does.
 *
 * SOUNDNESS OF THE PAIRED WALK. We BFS over PAIRS `{o, t}` (original state, twin state),
 * deduping on the ORIGINAL fingerprint `stateKey(o)` — which covers every condition-
 * readable field INCLUDING the `__enemy_hp_<id>` vars, so two states with the same key are
 * genuinely interchangeable (same combat progress and all). The twin paired with a given
 * original state is path-independent: the relabel is a bijection and we step corresponding
 * (bijection-mapped) actions under corresponding regimes, so the twin state is always the
 * relabeled image of the original — single-visit dedupe is sound (the same argument the
 * bug_0121/0211/0212 searches rest on). Within each visited pair the two states were
 * stepped in lock-step, so their order-bearing journals are byte-identical by construction;
 * dedupe only governs which fingerprints we CHECK, never a cross-path comparison. We ALSO
 * assert ok-parity on every explored step under every regime (a legal/illegal original step
 * maps to a legal/illegal twin step), so a relabeling that broke legality surfaces at once.
 *
 * EXPLORATION POLICY. We discover states by stepping the LIVENESS action set: reversible
 * and inert observations are skipped, while READ, USE skill-checks, ATTACK, and target
 * LOOKs backed by authored INSPECT interactions are stepped. This explores sticky clue
 * effects and combat states without recursing through every reread. Skipped verbs are still
 * observation-CHECKED at every visited state (their options appear in `available_actions`).
 * The authored-inspect predicate is preserved by the pack relabeling.
 *
 * ORDER NORMALISATION (sound, identical to the parser oracle). The builder emits several
 * arrays in an id-SORTED order (`visible_objects`, `available_actions`, `inventory`,
 * `state.flags`); the relabel replaces ids with opaque `mx_<n>` tokens that sort
 * DIFFERENTLY, so those arrays legitimately appear in a different ORDER on the twin while
 * holding the same elements. We compare them as SETS via a `canonical()` re-sort-by-id
 * applied identically to BOTH sides (`enemies_present` is added to that set normalisation —
 * the builder emits it in pack-declaration order, relabel-invariant, but sorting is robust
 * and consistent post-relabel). Order-bearing fields (`state.journal`, the
 * direction-sorted exits) are left in order. A genuine CONTENT divergence still fails.
 *
 * NON-VACUITY is asserted explicitly: the bijection actually renamed ids (non-empty, no id
 * maps to itself); the RAW start observations of original and twin DIFFER (so we are not
 * comparing a pack to itself — only AFTER relabeling do they match); more than one state is
 * compared; and the local `rpgOptionId` id-derivation is cross-checked against the
 * PRODUCTION `enumerateRpgActions` ids on every original observation (so a drift between
 * this test's id formula and the runner fails here rather than masking a real divergence).
 * A missed relabel site leaves an id that `mapId` keeps as itself, which then mismatches
 * the twin's relabeled id — a loud failure, never a silently-minted token. (Behavioural
 * witness: temporarily appending " [SABOTAGE]" to the room description in
 * buildRpgObservation when `!state.current.startsWith("mx_")` — firing only on original,
 * non-relabeled room ids — fails every RPG pack at the first state; reverted → green.)
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { buildRpgObservation, type RpgObservation } from "../../src/rpg/observation.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { StepResult } from "../../src/api/types.js";
import { stateKey } from "./support/exhaustive_endings.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";
import type { RpgRelabeler } from "./support/relabel_rpg.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";
import { isAuthoredInspectAction } from "../../src/rpg/legal_actions.js";

const PACK_DIR = "content/rpg/quests";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

const SEED = 7;
// The liveness exploration policy (parser_metamorphic_observation_stream.test.ts): step
// every legal action EXCEPT reversible / inert observation verbs. Authored INSPECT
// interactions ride on LOOK and may carry sticky effects, so those target looks are
// restored alongside READ, USE (skill-checks), and ATTACK. Skipped verbs are still
// observation-CHECKED at every state.
const LIVENESS_SKIP: ReadonlySet<RpgAction["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const explore = (index: RpgIndex, action: RpgAction): boolean =>
  isAuthoredInspectAction(index, action) || !LIVENESS_SKIP.has(action.type);
// The route-rich Wolf-Winter graph exhausts at 630,199 states under this policy
// (measured 2026-07-14). The 800k ceiling leaves bounded headroom for that verified graph
// while preserving a loud cap-out rather than truncating a future blowup.
const MAX_STATES = 800_000;
// Generous per-test budget. The final-hash 630,199-state callback-free census took ~114s;
// observation comparisons and sibling files competing for shared CI vCPUs add substantial
// overhead. This headroom absorbs that variance without loosening correctness:
// MAX_STATES, not the clock, bounds the work, so a genuine graph blowup still fails
// loudly. (Same rationale as vitest.config.ts's testTimeout.)
const TEST_TIMEOUT_MS = 900_000;

// Best/worst-roll PRNGs, identical to rpg_all_endings_reachable / rpg_metamorphic_relabel.
// resolveAttack draws player strike first, enemy reply second; resolveSkillCheck draws once.
// BEST for the player: own strike max, damage taken min, skill roll max → [HIGH, LOW].
// WORST for the player: own strike min, damage taken max, skill roll min → [LOW, HIGH].
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
const bestRng = (): Rng => fixedSeqRng([HIGH, LOW]);
const worstRng = (): Rng => fixedSeqRng([LOW, HIGH]);

/**
 * A NON-MUTATING bijection lookup. An id the relabeler never mapped (a relabeler
 * incompleteness bug) is kept as ITSELF, so it then mismatches the twin's relabeled id —
 * a loud divergence. The reserved vars `score`/`hp`/`attack`/`defense` are never entered
 * into the map, so they are fixed points here exactly as the relabeler holds them fixed.
 */
function mapIdFn(relabeler: RpgRelabeler): (id: string) => string {
  return (id: string) => relabeler.map.get(id) ?? id;
}

/**
 * Derive the enumerated action `id` an RPG observation gives an action — the SAME formula
 * the runner uses: `enumerateRpgActions` (src/rpg/runner.ts) appends `attack_<enemy>` to
 * the parser `enumerateActions` set (src/parser/legal_actions.ts). Applied to an ORIGINAL
 * action it must reproduce the production id (cross-checked in the walk); applied to a
 * bijection-MAPPED action it yields the corresponding twin id.
 */
function rpgOptionId(a: RpgAction): string {
  switch (a.type) {
    case "ATTACK":
      return `attack_${a.enemy}`;
    case "MANEUVER":
      return `maneuver_${a.enemy}_${a.maneuver}`;
    case "LOOK":
      return a.target === undefined ? "look_around" : `examine_${a.target}`;
    case "READ":
      return `read_${a.target}`;
    case "TAKE":
      return `take_${a.item}`;
    case "OPEN":
      return `open_${a.target}`;
    case "CLOSE":
      return `close_${a.target}`;
    case "UNLOCK":
      return `unlock_${a.target}`;
    case "DROP":
      return `drop_${a.item}`;
    case "USE":
      return a.item === undefined
        ? `use_${a.target}`
        : a.item === a.target
          ? `use_${a.item}`
          : `use_${a.item}_on_${a.target}`;
    case "MOVE":
      return `go_${a.direction}`;
    case "TALK":
      return `talk_${a.npc}`;
    case "ASK":
      return `ask_${a.topic}`;
    case "INVENTORY":
      return "inventory";
    case "GIVE":
    case "INSPECT":
      throw new Error(`action type "${a.type}" is not enumerated by the RPG runner`);
  }
}

/** Map a structured RPG action through the bijection: object/npc/topic/ending/enemy ids go
 *  through `mapId`; the MOVE `direction` is command vocabulary and stays byte-identical.
 *  Throwing on the kinds the RPG runner never emits keeps the oracle honest if the action
 *  surface ever widens. */
function relabelAction(a: RpgAction, mapId: (id: string) => string): RpgAction {
  switch (a.type) {
    case "ATTACK":
      return { type: "ATTACK", enemy: mapId(a.enemy) };
    case "MANEUVER":
      return { type: "MANEUVER", enemy: mapId(a.enemy), maneuver: mapId(a.maneuver) };
    case "LOOK":
      return a.target === undefined ? { type: "LOOK" } : { type: "LOOK", target: mapId(a.target) };
    case "READ":
      return { type: "READ", target: mapId(a.target) };
    case "TAKE":
      return { type: "TAKE", item: mapId(a.item) };
    case "DROP":
      return { type: "DROP", item: mapId(a.item) };
    case "OPEN":
      return { type: "OPEN", target: mapId(a.target) };
    case "CLOSE":
      return { type: "CLOSE", target: mapId(a.target) };
    case "UNLOCK":
      return { type: "UNLOCK", target: mapId(a.target), with: mapId(a.with) };
    case "USE":
      return a.item === undefined
        ? { type: "USE", target: mapId(a.target) }
        : { type: "USE", item: mapId(a.item), target: mapId(a.target) };
    case "MOVE":
      return { type: "MOVE", direction: a.direction }; // vocabulary — untouched
    case "TALK":
      return { type: "TALK", npc: mapId(a.npc) };
    case "ASK":
      return { type: "ASK", npc: mapId(a.npc), topic: mapId(a.topic) };
    case "GIVE":
      return { type: "GIVE", item: mapId(a.item), npc: mapId(a.npc) };
    case "INSPECT":
      return { type: "INSPECT", target: mapId(a.target) };
    case "INVENTORY":
      return { type: "INVENTORY" };
  }
}

/** Re-derive a blocked USE id from its authored interaction. The public blocked
 * row intentionally carries no reducer action or condition payload, so the
 * metamorphic oracle consults the trusted source index rather than parsing a
 * composite id or weakening the comparison to the twin's observed value. */
function relabelBlockedActionId(
  id: string,
  index: RpgIndex,
  mapId: (id: string) => string,
): string {
  for (const object of index.objectsWithUseInteractions) {
    for (const interaction of object.interactions) {
      if (!interaction.blocked_hint || interaction.target === undefined) continue;
      const action: RpgAction =
        interaction.item === undefined
          ? { type: "USE", target: interaction.target }
          : { type: "USE", item: interaction.item, target: interaction.target };
      if (rpgOptionId(action) === id) return rpgOptionId(relabelAction(action, mapId));
    }
  }
  throw new Error(`blocked action id "${id}" has no authored blocked USE interaction`);
}

/** Push an original RPG observation through the bijection to its expected twin form. Ids
 *  are mapped; prose and the per-action `command` vocabulary stay byte-identical; numbers
 *  (enemy/player HP, stats, score) stay equal; each action's `id` is RE-DERIVED from its
 *  mapped structured action. Order normalisation is applied separately by `canonical`. */
function relabelObservation(
  o: RpgObservation,
  index: RpgIndex,
  mapId: (id: string) => string,
): RpgObservation {
  return {
    mode: o.mode,
    room: mapId(o.room),
    title: o.title, // prose
    description: o.description, // prose (incl. the appended "Final score" tally — same numbers)
    visible_objects: o.visible_objects.map((v) => ({ id: mapId(v.id), name: v.name })),
    npcs_present: o.npcs_present.map((n) => ({ id: mapId(n.id), name: n.name })),
    enemies_present: o.enemies_present.map((e) => ({ id: mapId(e.id), name: e.name, hp: e.hp })),
    stats: { hp: o.stats.hp, attack: o.stats.attack, defense: o.stats.defense },
    exits: o.exits.map((e) =>
      e.to === undefined ? { direction: e.direction } : { direction: e.direction, to: mapId(e.to) },
    ),
    blocked_exits: o.blocked_exits.map((b) => ({ direction: b.direction, message: b.message })),
    blocked_actions: o.blocked_actions.map((action) => ({
      id: relabelBlockedActionId(action.id, index, mapId),
      command: action.command,
      reason: action.reason,
    })),
    inventory: o.inventory.map(mapId),
    ...(o.pressure_tracks
      ? {
          pressure_tracks: o.pressure_tracks.map((track) => ({
            id: mapId(track.id),
            title: track.title,
            var: mapId(track.var),
            value: track.value,
            band: { ...track.band },
            next: track.next === null ? null : { ...track.next },
          })),
        }
      : {}),
    state: {
      flags: o.state.flags.map(mapId),
      // Var keys: `score`/`hp`/`attack`/`defense` are relabel fixed points (never in the
      // map → stay themselves); any author skill var (e.g. `might`) IS in the map → mapped.
      vars: Object.fromEntries(Object.entries(o.state.vars).map(([k, v]) => [mapId(k), v])),
      journal: [...o.state.journal], // prose — order-bearing, byte-identical
    },
    dialogue: o.dialogue ? { npc: mapId(o.dialogue.npc), npc_text: o.dialogue.npc_text } : null,
    available_actions: o.available_actions.map((a) => {
      const action = relabelAction(a.action, mapId);
      // The surfaced skill name is an author var (e.g. `might`) → it IS in the bijection
      // and must map through, exactly like the var keys in `state.vars` above (bug_0274).
      return {
        id: rpgOptionId(action),
        command: a.command,
        action,
        ...(a.skill_check
          ? {
              skill_check: {
                skill: mapId(a.skill_check.skill),
                difficulty: a.skill_check.difficulty,
                die: a.skill_check.die, // die is label-invariant ("d20")
              },
            }
          : {}),
        ...(a.combat ? { combat: { ...a.combat } } : {}),
        ...(a.resources
          ? {
              resources: {
                gains: a.resources.gains.map(mapId),
                costs: a.resources.costs.map(mapId),
              },
            }
          : {}),
      };
    }),
    score: o.score,
    max_score: o.max_score,
    ended: o.ended,
    ending_id: o.ending_id === null ? null : mapId(o.ending_id),
    ending: o.ending
      ? {
          id: mapId(o.ending.id),
          title: o.ending.title,
          text: o.ending.text,
          death: o.ending.death,
        }
      : null,
  };
}

/** Re-sort the id-sorted (hence relabel-order-unstable) arrays by id so the two
 *  observations are compared as SETS on those fields. Applied identically to both sides,
 *  so a real content divergence still fails. See the file header. */
function canonical(o: RpgObservation): RpgObservation {
  const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
  return {
    ...o,
    visible_objects: [...o.visible_objects].sort(byId),
    npcs_present: [...o.npcs_present].sort(byId),
    enemies_present: [...o.enemies_present].sort(byId),
    ...(o.pressure_tracks ? { pressure_tracks: [...o.pressure_tracks].sort(byId) } : {}),
    inventory: [...o.inventory].sort(),
    state: { ...o.state, flags: [...o.state.flags].sort() },
    available_actions: [...o.available_actions].sort(byId),
  };
}

type WalkResult = { compared: number; cappedOut: boolean };
type RpgStep = (state: GameState, action: RpgAction) => StepResult;

/**
 * BFS over state PAIRS, stepping every explored action under BOTH roll regimes (best /
 * worst), deduping on the ORIGINAL fingerprint. The legal-action set is rng-independent, so
 * it is read from the best-roll rules; each action is then stepped under both regimes on
 * both packs in lock-step. See the file header for the soundness argument.
 */
function walkInLockStep(
  origIndex: RpgIndex,
  twinIndex: RpgIndex,
  origRulesBest: Rules<RpgAction>,
  origRulesWorst: Rules<RpgAction>,
  twinRulesBest: Rules<RpgAction>,
  twinRulesWorst: Rules<RpgAction>,
  origStart: GameState,
  twinStart: GameState,
  mapId: (id: string) => string,
): WalkResult {
  const regimes: [RpgStep, RpgStep][] = [
    [makeStep(origRulesBest), makeStep(twinRulesBest)],
    [makeStep(origRulesWorst), makeStep(twinRulesWorst)],
  ];
  const startKey = stateKey(origStart);
  const scheduled = new Set<string>([startKey]);
  const stack: { o: GameState; t: GameState; ko: string }[] = [
    { o: origStart, t: twinStart, ko: startKey },
  ];
  let compared = 0;

  while (stack.length > 0) {
    if (scheduled.size > MAX_STATES) return { compared, cappedOut: true };
    const { o, t, ko } = stack.pop()!;

    const origObs = buildRpgObservation(origIndex, o);
    const twinObs = buildRpgObservation(twinIndex, t);

    // Cross-check the local id formula against the PRODUCTION enumerator on the real
    // original observation: `rpgOptionId` must reproduce each emitted action id. If this
    // test's formula ever drifts from the runner, it fails HERE rather than masking a real
    // divergence below.
    for (const a of origObs.available_actions) {
      const expectedId = rpgOptionId(a.action);
      // Keep Vitest's useful mismatch diagnostic without constructing a matcher for each of
      // the millions of passing action-id checks in the largest shipped graph.
      if (expectedId !== a.id) {
        expect(expectedId, `rpgOptionId must match the production action id at\n${ko}`).toBe(a.id);
      }
    }

    // Compare via a fast native equality that escalates to the authoritative assertion only on
    // a mismatch. `isDeepStrictEqual` is STRICTER than vitest's `toEqual` (it distinguishes an
    // `undefined`-valued field from a missing one), so strict-equal ⟹ loose-equal: a real
    // `toEqual` divergence is necessarily an `isDeepStrictEqual` divergence and is NEVER skipped.
    // On the rare mismatch we re-assert with `toEqual` to recover its forgiving undefined/missing
    // semantics (a mere cosmetic shape delta still passes) AND to surface a readable diff. This
    // keeps the proof exactly as strong while skipping vitest's heavy deep-compare on the 670k
    // states wolf_winter reaches — the heaviest REDUCIBLE cost in this oracle (the engine stepping
    // that drives the walk is irreducible). This oracle is the suite's long pole, and the slow
    // compare was tipping it past its timeout under CI load.
    const expectedTwin = canonical(relabelObservation(origObs, origIndex, mapId));
    const actualTwin = canonical(twinObs);
    if (!isDeepStrictEqual(expectedTwin, actualTwin)) {
      expect(
        expectedTwin,
        `observation must be isomorphic under relabeling at original state\n${ko}`,
      ).toEqual(actualTwin);
    }
    compared++;

    if (o.ended) continue;
    // Legality is rng-independent. The production observation above already enumerated the
    // original legal set and its stable ids, so step those exact actions under both regimes
    // instead of enumerating the same set a second time. The twin observation remains an
    // independent enumeration and is still compared in full above.
    for (const { action: a } of origObs.available_actions) {
      if (!explore(origIndex, a)) continue; // inert actions are checked above, not stepped
      const ra = relabelAction(a, mapId);
      for (const [origStep, twinStep] of regimes) {
        const ro = origStep(o, a);
        const rt = twinStep(t, ra);
        // ok-parity: a legal/illegal original step must be legal/illegal on the twin too.
        // Enter Vitest only on a mismatch; the native boolean comparison is the identical
        // predicate on the millions of passing transitions.
        if (rt.ok !== ro.ok) {
          expect(rt.ok, `twin step ok-parity for action ${JSON.stringify(a)} at\n${ko}`).toBe(
            ro.ok,
          );
        }
        if (ro.ok && rt.ok) {
          const nextKey = stateKey(ro.state);
          // Schedule each original state once instead of retaining duplicate full state
          // pairs until they reach the top of the stack. The original fingerprint is the
          // proof's existing path-independence key; moving the same dedupe from pop to push
          // preserves the reachable set and every per-state assertion while bounding memory
          // and avoiding duplicate state-graph retention under large join-heavy packs.
          if (scheduled.has(nextKey)) continue;
          scheduled.add(nextKey);
          stack.push({ o: ro.state, t: rt.state, ko: nextKey });
        }
      }
    }
  }
  return { compared, cappedOut: false };
}

describe("bug_0215 — RPG per-step observation stream is invariant under a consistent identifier relabeling", () => {
  it("discovers the shipped RPG packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(
      `${file}: every observation across the bracketed reachable graph is isomorphic on the relabeled twin`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadRpgSourceFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const original = loaded.compiled.pack;

        const { pack: twin, relabeler } = relabelRpgPack(original);
        const mapId = mapIdFn(relabeler);

        // NON-VACUITY (1): the relabel actually renamed things — no id maps to itself.
        expect(relabeler.map.size).toBeGreaterThan(0);
        for (const [oldId, newId] of relabeler.map) {
          expect(newId, `id "${oldId}" must be renamed, not left as itself`).not.toBe(oldId);
        }

        const origIndex = indexRpgPack(original);
        const twinIndex = indexRpgPack(twin);
        const origRulesBest = buildRpgRules(origIndex, bestRng);
        const origRulesWorst = buildRpgRules(origIndex, worstRng);
        const twinRulesBest = buildRpgRules(twinIndex, bestRng);
        const twinRulesWorst = buildRpgRules(twinIndex, worstRng);
        const origStart = initStateForRpgPack(origIndex, SEED);
        const twinStart = initStateForRpgPack(twinIndex, SEED);

        // NON-VACUITY (2): the RAW start observations differ (the twin is genuinely a
        // relabeled game — its room id at least is a different string), so the per-step
        // equality below is a real metamorphic relation, not a pack compared to itself.
        const rawOrig = buildRpgObservation(origIndex, origStart);
        const rawTwin = buildRpgObservation(twinIndex, twinStart);
        expect(rawTwin, "raw twin start observation must differ from the original's").not.toEqual(
          rawOrig,
        );

        const { compared, cappedOut } = walkInLockStep(
          origIndex,
          twinIndex,
          origRulesBest,
          origRulesWorst,
          twinRulesBest,
          twinRulesWorst,
          origStart,
          twinStart,
          mapId,
        );

        expect(cappedOut, `lock-step walk hit the ${MAX_STATES} state cap`).toBe(false);
        // NON-VACUITY (3): more than the start state was compared (the walk really ran).
        expect(compared, "the lock-step walk must compare more than one state").toBeGreaterThan(1);
      },
      TEST_TIMEOUT_MS,
    );
  }
});
