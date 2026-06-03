/**
 * Mode-agnostic exhaustive ending-reachability solver (shared by the CYOA and parser
 * structural-verification suites — bug_0121 and its parser extension).
 *
 * The engine (src/core/engine.ts) is content-free: it asks a `Rules` resolver for the
 * legal-action set of a state and for what each action means. `rules.legalActions(state)`
 * is, by the engine's own contract, the GROUND TRUTH legality set — the exact set
 * `makeStep` validates an action against — so a breadth-first search that, from each
 * reachable state, steps the legal actions and dedupes on a total state fingerprint
 * explores the concrete reachable region of a pack, regardless of mode (CYOA choices,
 * parser verb×object commands — both surface here as `Action`s). This is the dynamic
 * ground truth the validators' conservative static reachability check only approximates
 * (see cyoa_all_endings_reachable.test.ts for the full rationale).
 *
 * Soundness rests on three properties of the modes this serves:
 *   1. DETERMINISM — `resolve` is pure (same state + action ⇒ same result). CYOA and the
 *      parser stage have NO randomness, so one step per (state, action) explores every
 *      transition. RPG's seeded combat/skill rolls would defeat a single-rules BFS (one
 *      fingerprint can transition many ways), so the RPG caller uses `exhaustiveEndingsMulti`
 *      with two rule sets that bracket the player's best/worst rolls — see that function's
 *      doc and rpg_all_endings_reachable.test.ts. (RPG winnability under WORST rolls stays
 *      proven separately by the combat-bound checks, src/validate/rpg_validator.ts; this
 *      proves ROUTE EXISTENCE — every declared ending is reachable under SOME play.)
 *   2. FINITENESS — the fingerprint collapses interchangeable states, and every shipped
 *      pack's vars are bounded (CYOA's deadline counters, the parser `score`, both capped
 *      by gating), so the visited set is finite and the BFS terminates. The MAX_STATES
 *      caller-supplied cap is only a backstop: a future unbounded-var pack trips it and
 *      the caller FAILS on `cappedOut`, so the search can never silently pass by
 *      truncating an unexplored region.
 *   3. MONOTONE ACTION RESTRICTION — the parser verb×object space is dominated by
 *      REVERSIBLE / inert moves (drop an item, close a door, look around) that explode the
 *      state count (an item dropped in each of N rooms, every inventory subset) without
 *      ever being NEEDED to reach an ending. The search therefore steps only "progress"
 *      actions (see `isProgressAction`), skipping drop/close and the pure-observation
 *      verbs. This is sound for a REACHABILITY proof because restricting the action set is
 *      monotone: any ending still reached is reached by a real, legal playthrough using a
 *      SUBSET of the game's actions, so it is genuinely reachable in the full game. The
 *      only thing a restriction can do is HIDE an ending that truly requires a dropped/
 *      closed item — and that surfaces as a declared ending going unreached, i.e. a LOUD
 *      test failure, never a silent pass. (Shipped packs gate every transition on
 *      has_item / visited / flags / is_unlocked; `not_item`/drop appear only in reactive
 *      prose `when:` variants, never on a route — so no ending needs a drop.) The filter
 *      is a no-op for CYOA, whose only action is CHOOSE, so the CYOA census stays complete.
 */
import { makeStep, type Rules } from "../../../src/core/engine.js";
import type { GameState } from "../../../src/core/state.js";
import type { Action } from "../../../src/api/types.js";

/**
 * Action types the search never needs to step: purely REVERSIBLE world edits (DROP undoes
 * TAKE, CLOSE undoes OPEN) and pure OBSERVATIONS (LOOK/INVENTORY/READ/INSPECT change no
 * game state — they only emit narration, so stepping them yields an identical fingerprint
 * anyway). Excluding them keeps the parser verb×object search tractable without affecting
 * which endings are reachable (see the MONOTONE ACTION RESTRICTION note above). Every
 * other Action type — MOVE, TAKE, OPEN, UNLOCK, USE, TALK, ASK, GIVE, ATTACK, CHOOSE — is
 * a potential route step and is always explored.
 */
const SKIPPED_ACTIONS: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "READ",
  "INSPECT",
]);

function isProgressAction(a: Action): boolean {
  return !SKIPPED_ACTIONS.has(a.type);
}

/**
 * A total, order-independent fingerprint of a game state, covering EVERY field a
 * `Condition`/`Effect` can read or a win can turn on — so two states with the same
 * fingerprint are genuinely interchangeable for reachability and the BFS can dedupe one
 * away without ever pruning a still-distinct branch:
 *   - `current`     — the scene/room the player stands in.
 *   - `visited`     — the set of places seen (parser wins gate on `{visited: room}`).
 *   - `flags`       — boolean switches.
 *   - `inventory`   — carried object ids.
 *   - `vars`        — every numeric var (CYOA's `ticks`, the parser `score`).
 *   - `objectState` — per-object open/locked/contents/location (a parser puzzle's whole
 *                     point: an opened chest is a DIFFERENT state from a closed one even
 *                     when flags/inventory are untouched — omitting this collapses the
 *                     two and the BFS can never explore "the chest is now open").
 *   - `questStage`  — Stage-3 quest progress, readable by conditions.
 *   - `ended`/`endingId` — distinguishes terminal states (and which ending fired).
 *
 * Deliberately EXCLUDED: `step` (a monotonic action counter — including it would make
 * every state unique and defeat dedupe entirely; it affects nothing in the deterministic
 * CYOA/parser modes this serves, and the RNG-bearing RPG mode is out of scope) and
 * `journal` (append-only player-facing narration that no condition reads, and which is
 * path-dependent, so including it would likewise prevent all dedupe).
 */
export function stateKey(s: GameState): string {
  const trueKeys = (rec: Record<string, boolean>): string =>
    Object.entries(rec)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort()
      .join(",");
  const flags = trueKeys(s.flags);
  const visited = trueKeys(s.visited);
  const inv = [...s.inventory].sort().join(",");
  const vars = Object.entries(s.vars)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  const objects = Object.entries(s.objectState)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, o]) => {
      const contents = o.contents ? [...o.contents].sort().join("+") : "";
      return `${id}:${o.open ? 1 : 0}${o.locked ? 1 : 0}:${o.takenBy ?? ""}:${o.room ?? ""}:${contents}`;
    })
    .join(";");
  const quests = Object.entries(s.questStage)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${s.current}|${visited}|${flags}|${inv}|${vars}|${objects}|${quests}|${s.ended ? "E" : ""}${s.endingId ?? ""}`;
}

export type ExhaustiveResult = {
  /** Every ending id an actual playthrough can terminate at (over the progress-action set). */
  reached: Set<string>;
  /** Distinct states explored (for the verified-live record / cap diagnostics). */
  states: number;
  /** True iff the search hit `maxStates` before exhausting — an UNPROVEN result. */
  cappedOut: boolean;
};

/**
 * Optional knobs on the search, all defaulting to the reachability-tuned behaviour so
 * every existing caller is byte-for-byte unchanged:
 *   - `explore` — the action policy: which legal actions the BFS steps. Defaults to
 *     `isProgressAction` (skip reversible/observation moves), the MONOTONE restriction
 *     that is sound for the every-ending-reachable PROOF (restricting actions can only
 *     HIDE an ending → a loud failure, never invent one). That restriction is NOT sound
 *     for a LIVENESS proof, where skipping a state that displays a variant would FALSELY
 *     call the variant dead (a false positive). The parser variant-liveness caller
 *     therefore widens the policy to step every action EXCEPT those that provably cannot
 *     gate a variant (the pure-observation verbs and DROP — see that test's header), so
 *     a variant is called dead only when the reachable region genuinely never displays
 *     it. (READ in particular carries interaction `effects` — e.g. a `read_recipe` flag —
 *     so it is NOT pure narration and a liveness search must step it; the reachability
 *     search skips it soundly only because no ROUTE gates on a read flag, just reactive
 *     prose. This is the exact caveat the bug_0145 next-focus named.)
 *   - `key` — the dedupe fingerprint. Defaults to `stateKey`.
 *   - `onEdge` — observe every TRANSITION the search produces, as a `(fromKey, toKey)`
 *     pair of state fingerprints, INCLUDING edges into already-seen states (which the BFS
 *     would otherwise drop on the dedupe check). Lets a caller reconstruct the full
 *     reachable transition graph — e.g. to run a backward-liveness fixpoint proving every
 *     reachable state can still reach a terminal (no dynamic soft-lock pocket — see
 *     no_dead_pocket.test.ts). Default undefined: when omitted NO edge work is done and the
 *     search is byte-for-byte the original BFS, so every existing caller is unchanged.
 */
export type SearchOpts = {
  explore?: (a: Action) => boolean;
  key?: (s: GameState) => string;
  onEdge?: (fromKey: string, toKey: string) => void;
};

/**
 * Exhaustively explore a pack from `start` through its own `Rules` over the progress-action
 * set; return every ending id reachable by concrete play. Mode-agnostic: the caller
 * supplies the mode's compiled rules and initial state. A rejected action does not change
 * state and is skipped. When `cappedOut` is false the frontier emptied, so `reached` is the
 * complete set of endings reachable via progress actions — a declared ending NOT in it is
 * unreachable (a route is severed), and any ending in it but undeclared is a dangling end
 * target. When `cappedOut` is true the result is unproven and the caller must FAIL.
 */
export function exhaustiveEndings(
  rules: Rules,
  start: GameState,
  maxStates: number,
  onState?: (s: GameState) => void,
  opts?: SearchOpts,
): ExhaustiveResult {
  return exhaustiveEndingsMulti([rules], start, maxStates, onState, opts);
}

/**
 * The generalization that backs `exhaustiveEndings` and lifts the search into the RPG mode.
 *
 * CYOA and the parser stage are fully DETERMINISTIC, so one `Rules` whose `resolve` is pure
 * suffices: stepping each legal action explores every transition. RPG breaks that — its
 * ATTACK rounds and skill checks draw a seeded die, so a single (state, action) can resolve
 * many ways and one `Rules` can't enumerate the outcomes. The fix is to step each action
 * under SEVERAL rule sets that differ ONLY in the rolls their combat/skill resolver draws.
 * The RPG caller passes two: one forcing the player's BEST rolls (max strike, min damage
 * taken, max skill roll), one their WORST. Because the only routing-relevant consequence of
 * a round is monotonic in the roll — did the enemy reach 0 HP, did the player reach 0 HP,
 * did the d20 meet the difficulty — those two extremes bracket every outcome a middle roll
 * could produce, so any ending reachable under SOME rolls is reached here (and conversely
 * every state visited is a real, legal playthrough on real die values, so nothing spurious
 * is reached). See rpg_all_endings_reachable.test.ts for the full soundness argument and the
 * load-bearing assumption it guards (no ending gates on a raw HP value).
 *
 * `legalActions` does NOT depend on the roll (legality is rng-independent in every mode), so
 * the legal set is taken from the first rule set and each action is stepped under all of
 * them; a rejected step (e.g. an action a regime makes unavailable) is simply skipped. For a
 * single deterministic rule set this is identical to the original single-rules BFS — the
 * second-and-later steps just reproduce the first and dedupe away — so CYOA/parser behaviour
 * is unchanged.
 */
export function exhaustiveEndingsMulti(
  ruleSets: Rules[],
  start: GameState,
  maxStates: number,
  onState?: (s: GameState) => void,
  opts?: SearchOpts,
): ExhaustiveResult {
  const primary = ruleSets[0];
  if (!primary) throw new Error("exhaustiveEndingsMulti requires at least one rule set");
  const explore = opts?.explore ?? isProgressAction;
  const key = opts?.key ?? stateKey;
  const onEdge = opts?.onEdge;
  const steps = ruleSets.map((r) => makeStep(r));
  const reached = new Set<string>();
  const seen = new Set<string>();
  const queue: GameState[] = [start];
  seen.add(key(start));

  while (queue.length > 0) {
    if (seen.size > maxStates) return { reached, states: seen.size, cappedOut: true };
    const s = queue.shift()!;
    // Observe every DISTINCT reachable state exactly once (each is enqueued once,
    // dequeued once). Lets a caller mine the full reachable region — e.g. which
    // reactive scene/ending variant is the first match in each viewing context —
    // without the generic BFS needing any mode-specific knowledge. Called for the
    // start, terminal, and interior states alike.
    if (onState) onState(s);
    if (s.ended) {
      if (s.endingId) reached.add(s.endingId);
      continue; // a terminal state offers no further actions (a graph sink)
    }
    // Only fingerprint the source state when a caller is collecting edges.
    const fromKey = onEdge ? key(s) : "";
    for (const a of primary.legalActions(s)) {
      if (!explore(a)) continue; // outside the caller's action policy (default: progress-only)
      for (const step of steps) {
        const r = step(s, a);
        if (!r.ok) continue; // a rejected action does not change state
        const k = key(r.state);
        // Surface the transition BEFORE the dedupe check, so edges into an already-seen
        // state (a join in the graph) are reported too — a backward-liveness fixpoint needs
        // every edge, not just tree edges.
        if (onEdge) onEdge(fromKey, k);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push(r.state);
      }
    }
  }
  return { reached, states: seen.size, cappedOut: false };
}
