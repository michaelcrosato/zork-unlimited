/**
 * Metamorphic observation-stream oracle (§15) for the PARSER mode — bug_0214, the
 * parser extension of the CYOA per-step oracle bug_0213 introduced
 * (cyoa_metamorphic_observation_stream.test.ts). This is the deferred "extend THIS
 * per-step observation-stream witness to PARSER" lever named verbatim as bug_0213's
 * next-focus #1, following the exact CYOA → parser → rpg growth path the bug_0121
 * reachability oracle and the bug_0209/0211/0212 metamorphic-census oracle both took.
 * (RPG is deferred: its observation stream is not a single deterministic lock-step
 * walk — the seeded combat/skill rolls fan one state out many ways, so it must BRACKET
 * the rolls exactly as exhaustiveEndingsMulti does. Land parser first.)
 *
 * WHAT THE CENSUS ORACLE PROVES, AND THE GAP IT LEAVES. bug_0211 proves a parser pack
 * and its identifier-relabeled twin are isomorphic on three TERMINAL/AGGREGATE artefacts:
 * the exhaustive ending-reachability census, the distinct-state COUNT, and validateParser's
 * finding-code multiset. Those are end-of-run summaries. They would still pass if the
 * engine produced subtly DIFFERENT player-facing observations along the way — a room's
 * description, the enumerated commands, the surfaced flags/vars/inventory, the
 * blocked-exit hints — as long as the same endings stayed reachable and the state graph
 * kept the same size. The benchmark's contamination story rests on something stronger:
 * that the EXACT window a model plays through — every observation, turn by turn — is a
 * pure function of the pack's STRUCTURE, identical (modulo the bijection) on the twin. A
 * model that memorised the original's id strings must gain nothing not just at the final
 * ending but at EVERY intermediate observation it reasons over.
 *
 * WHAT THIS ORACLE ADDS. For each shipped PARSER pack it walks the ENTIRE reachable state
 * graph in LOCK-STEP on the original and its relabeled twin: from corresponding states it
 * takes corresponding (bijection-mapped) actions and, at every single state, asserts the
 * twin's `buildParserObservation` equals the original's observation pushed through the
 * relabeling — `room`, `visible_objects[].id`, `npcs_present[].id`, `exits[].to`,
 * `inventory`, the surfaced flag/var names, the `dialogue.npc`, the `ending`/`ending_id`,
 * and every `available_actions` entry's structured `action` ids and its derived `id` all
 * mapped through the bijection; the prose (room/object name + description, variant text,
 * `npc_text`, journal, ending title/text, blocked-exit `message`) and the command
 * VOCABULARY (each action's human `command` string, built from names + directions) left
 * byte-identical. This is a PER-STEP isomorphism witness: a deeper, intermediate-state-
 * aware companion to bug_0211's terminal census. If any engine/runner change ever made an
 * OBSERVATION depend on a literal id — a room id leaking into rendered text, a command
 * ordered or named by id, a flag surfaced by raw name — bug_0211 could still pass while
 * THIS diverges loudly at the first affected step.
 *
 * ORDER NORMALISATION (and why it is sound). Three observation arrays are emitted in an
 * id-SORTED order by the production builder — `visible_objects` and the enumerated
 * `available_actions` (both keyed off `visibleObjectIds`, which `.sort()`s by id, and the
 * inventory, also `.sort()`ed) and the `inventory`/`state.flags` lists. The relabel
 * replaces ids with opaque `mx_<n>` tokens that sort DIFFERENTLY from the originals, so
 * these arrays legitimately appear in a different ORDER on the twin even though they hold
 * the same elements. We therefore compare them as SETS: a `canonical()` pass re-sorts each
 * of those arrays by id on BOTH sides before `toEqual`. This is sound because element
 * order in these lists is a pure rendering artefact of id-sorting, carries no semantics
 * (the player may act on any listed command), and the SAME normalisation is applied to
 * both observations — so a genuine divergence in CONTENT still fails. Order-bearing fields
 * (`state.journal`, the exits already sorted by the relabel-invariant `direction`) are
 * left untouched and compared in order.
 *
 * EXPLORATION POLICY. We discover states by stepping the LIVENESS action set —
 * `{DROP, CLOSE, LOOK, INVENTORY, INSPECT}` skipped, everything else (incl. READ) stepped —
 * the exact policy the parser variant-liveness oracle uses (parser_variant_liveness.test.ts).
 * This is WIDER than the reachability census's `isProgressAction` (which also skips READ): a
 * read with sticky interaction effects (e.g. lamplighters' notice sets `read_notice` + score,
 * driving reactive lamp/scene variants) DOES open new observation states, and those reactive
 * intermediate states are exactly what a per-step observation oracle most wants to check. It
 * stays NARROWER than "step every action": stepping DROP into every room is the combinatorial
 * blow-up that pushes the larger packs past the state cap, and a DROP/CLOSE/observation verb
 * is purely reversible or narrate-only, so skipping it as an EXPLORATION edge loses no
 * distinct observation we wouldn't reach another way. The skipped verbs are still CHECKED:
 * the full `available_actions` list at every visited state includes their (relabeled)
 * options, so their per-state isomorphism is asserted even though we don't step them to
 * recurse. The policy depends only on action TYPE, which the relabel preserves, so it selects
 * corresponding edges on the original and the twin.
 *
 * SOUNDNESS OF THE LOCK-STEP WALK. Both the original and the twin are FULLY DETERMINISTIC
 * (the shipped parser packs carry no skill-check randomness on the reachable graph — the
 * census BFS treats each as deterministic), and the relabel is a bijection, so at every
 * pair of corresponding states the legal-action sets correspond under the map and stepping
 * corresponding actions yields corresponding successor states — the two walks stay in
 * exact correspondence by construction. We dedupe on the ORIGINAL state fingerprint
 * (`stateKey`), so each distinct original state has its observation checked exactly once;
 * by determinism the twin state paired with a given original state is path-independent, so
 * single-visit dedupe is sound (the same argument the bug_0121/0211 BFS relies on). We
 * ALSO assert ok-parity on every explored step (a legal original action maps to a legal
 * twin action and vice versa), so a relabeling that broke legality surfaces immediately.
 *
 * NON-VACUITY is asserted explicitly: the bijection actually renamed ids (non-empty, no id
 * maps to itself); the RAW start observations of original and twin DIFFER (so we are not
 * comparing a pack to itself — only AFTER relabeling do they match); more than one state is
 * compared; and the local `optionId` id-derivation is cross-checked against the PRODUCTION
 * enumerator on every original observation (so a drift between this test's id formula and
 * `enumerateActions` fails here rather than masking a real divergence). A missed relabel
 * site (an incomplete relabeler) leaves an id that `mapId` keeps as itself, which then
 * mismatches the twin's relabeled id — a loud failure, never a silently-minted token.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  initStateForParserPack,
  type ParserIndex,
} from "../../src/parser/model.js";
import { buildParserRules } from "../../src/parser/runner.js";
import { buildParserObservation, type ParserObservation } from "../../src/parser/observation.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import { stateKey } from "./support/exhaustive_endings.js";
import { relabelParserPack, type ParserRelabeler } from "./support/relabel_parser.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const PACK_DIR = "content/parser/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

const SEED = 7;
// The liveness exploration policy (parser_variant_liveness.test.ts): step every legal
// action EXCEPT the purely reversible / narrate-only verbs — crucially STEPPING READ,
// which carries sticky interaction effects (flags/score) and so opens new observation
// states. Skipped verbs are still observation-CHECKED at every state (their options appear
// in `available_actions`); they are only excluded as recursion EDGES, which keeps the
// parser verb×object×room graph under the state cap. See the file header.
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const explore = (a: Action): boolean => !LIVENESS_SKIP.has(a.type);
// Matches the sibling parser census oracle's bound; the largest shipped parser pack
// settles well under it. We walk the graph twice-in-lock-step per pack; a cap-out
// surfaces as a loud failure rather than a hang.
const MAX_STATES = 200_000;
const TEST_TIMEOUT_MS = 90_000;

/**
 * A NON-MUTATING bijection lookup. An id the relabeler never mapped (a relabeler
 * incompleteness bug) is kept as ITSELF, so it then mismatches the twin's relabeled id —
 * a loud divergence. The reserved `score` var is never entered into the map, so it too is
 * a fixed point here (`map.get("score") ?? "score"` === "score"), exactly as the relabeler
 * holds it fixed. Reading the frozen `map` (not the minting `r`) keeps an incompleteness
 * bug loud instead of masking it with a freshly-minted matching token.
 */
function mapIdFn(relabeler: ParserRelabeler): (id: string) => string {
  return (id: string) => relabeler.map.get(id) ?? id;
}

/**
 * Derive the enumerated action `id` a parser observation gives an action — the SAME
 * formula `enumerateActions` (src/parser/legal_actions.ts) uses. Applied to an ORIGINAL
 * action it must reproduce the production id (cross-checked in the walk); applied to a
 * bijection-MAPPED action it yields the corresponding twin id. Only the action kinds the
 * parser enumerator actually emits are reachable; the rest throw so a future enumerator
 * addition can't be silently mis-mapped.
 */
function optionId(a: Action): string {
  switch (a.type) {
    case "LOOK":
      return a.target === undefined ? "look_around" : `examine_${a.target}`;
    case "READ":
      return `read_${a.target}`;
    case "TAKE":
      return `take_${a.item}`;
    case "OPEN":
      return `open_${a.target}`;
    case "UNLOCK":
      return `unlock_${a.target}`;
    case "DROP":
      return `drop_${a.item}`;
    case "USE":
      return a.item === a.target ? `use_${a.item}` : `use_${a.item}_on_${a.target}`;
    case "MOVE":
      return `go_${a.direction}`;
    case "TALK":
      return `talk_${a.npc}`;
    case "ASK":
      return `ask_${a.topic}`;
    case "INVENTORY":
      return "inventory";
    case "CHOOSE":
    case "CLOSE":
    case "GIVE":
    case "INSPECT":
    case "ATTACK":
      throw new Error(`action type "${a.type}" is not enumerated by the parser runner`);
  }
}

/** Map a structured parser action through the bijection: object/npc/topic/ending ids go
 *  through `mapId`; the MOVE `direction` is command vocabulary and stays byte-identical
 *  (the relabeler leaves exit directions untouched). Throwing on the non-parser kinds keeps
 *  the oracle honest if the action surface ever widens. */
function relabelAction(a: Action, mapId: (id: string) => string): Action {
  switch (a.type) {
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
      return { type: "USE", item: mapId(a.item), target: mapId(a.target) };
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
    case "CHOOSE":
    case "ATTACK":
      throw new Error(`unexpected parser action type "${a.type}" — extend relabelAction`);
  }
}

/** Push an original parser observation through the bijection to its expected twin form.
 *  Ids are mapped; prose and the per-action `command` vocabulary stay byte-identical; each
 *  action's `id` is RE-DERIVED from its mapped structured action (so it carries the twin's
 *  ids). Order normalisation is applied separately by `canonical`. */
function relabelObservation(
  o: ParserObservation,
  mapId: (id: string) => string,
): ParserObservation {
  return {
    mode: o.mode,
    room: mapId(o.room),
    title: o.title, // prose
    description: o.description, // prose (incl. the appended "Final score" tally — same numbers)
    visible_objects: o.visible_objects.map((v) => ({ id: mapId(v.id), name: v.name })),
    npcs_present: o.npcs_present.map((n) => ({ id: mapId(n.id), name: n.name })),
    exits: o.exits.map((e) =>
      e.to === undefined ? { direction: e.direction } : { direction: e.direction, to: mapId(e.to) },
    ),
    blocked_exits: o.blocked_exits.map((b) => ({ direction: b.direction, message: b.message })),
    inventory: o.inventory.map(mapId),
    state: {
      flags: o.state.flags.map(mapId),
      // Var keys: `score` is a relabel fixed point (never in the map → stays itself); any
      // author var IS in the map → mapped. Object key order is irrelevant to `toEqual`.
      vars: Object.fromEntries(Object.entries(o.state.vars).map(([k, v]) => [mapId(k), v])),
      journal: [...o.state.journal], // prose — order-bearing, byte-identical
    },
    dialogue: o.dialogue ? { npc: mapId(o.dialogue.npc), npc_text: o.dialogue.npc_text } : null,
    available_actions: o.available_actions.map((a) => {
      const action = relabelAction(a.action, mapId);
      return { id: optionId(action), command: a.command, action };
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
 *  observations are compared as SETS on those fields. See the file header. Applied
 *  identically to both sides, so a real content divergence still fails. */
function canonical(o: ParserObservation): ParserObservation {
  const byId = (a: { id: string }, b: { id: string }): number => a.id.localeCompare(b.id);
  return {
    ...o,
    visible_objects: [...o.visible_objects].sort(byId),
    npcs_present: [...o.npcs_present].sort(byId),
    inventory: [...o.inventory].sort(),
    state: { ...o.state, flags: [...o.state.flags].sort() },
    available_actions: [...o.available_actions].sort(byId),
  };
}

type WalkResult = { compared: number; cappedOut: boolean };

function walkInLockStep(
  origIndex: ParserIndex,
  twinIndex: ParserIndex,
  origRules: Rules,
  twinRules: Rules,
  origStart: GameState,
  twinStart: GameState,
  mapId: (id: string) => string,
): WalkResult {
  const origStep = makeStep(origRules);
  const twinStep = makeStep(twinRules);
  const seen = new Set<string>();
  const stack: { o: GameState; t: GameState }[] = [{ o: origStart, t: twinStart }];
  let compared = 0;

  while (stack.length > 0) {
    if (seen.size > MAX_STATES) return { compared, cappedOut: true };
    const { o, t } = stack.pop()!;
    const ko = stateKey(o);
    if (seen.has(ko)) continue;
    seen.add(ko);

    const origObs = buildParserObservation(origIndex, o);
    const twinObs = buildParserObservation(twinIndex, t);

    // Cross-check the local id formula against the PRODUCTION enumerator on the real
    // original observation: `optionId` must reproduce each emitted action id. This keeps
    // the re-derived twin ids honest — if this test's formula ever drifts from
    // `enumerateActions`, it fails HERE rather than masking a real divergence below.
    for (const a of origObs.available_actions) {
      expect(optionId(a.action), `optionId must match the production action id at\n${ko}`).toBe(
        a.id,
      );
    }

    expect(
      canonical(relabelObservation(origObs, mapId)),
      `observation must be isomorphic under relabeling at original state\n${ko}`,
    ).toEqual(canonical(twinObs));
    compared++;

    if (o.ended) continue;
    for (const a of origRules.legalActions(o)) {
      if (!explore(a)) continue; // discovered via the full available_actions check, not stepped
      const ra = relabelAction(a, mapId);
      const ro = origStep(o, a);
      const rt = twinStep(t, ra);
      // ok-parity: a legal/illegal original action must be legal/illegal on the twin too.
      expect(rt.ok, `twin step ok-parity for action ${JSON.stringify(a)} at\n${ko}`).toBe(ro.ok);
      if (ro.ok && rt.ok) stack.push({ o: ro.state, t: rt.state });
    }
  }
  return { compared, cappedOut: false };
}

describe("bug_0214 — PARSER per-step observation stream is invariant under a consistent identifier relabeling", () => {
  it("discovers the shipped parser packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(
      `${file}: every observation along the whole reachable graph is isomorphic on the relabeled twin`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadParserPackFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const original = loaded.compiled.pack;

        const { pack: twin, relabeler } = relabelParserPack(original);
        const mapId = mapIdFn(relabeler);

        // NON-VACUITY (1): the relabel actually renamed things — no id maps to itself.
        expect(relabeler.map.size).toBeGreaterThan(0);
        for (const [oldId, newId] of relabeler.map) {
          expect(newId, `id "${oldId}" must be renamed, not left as itself`).not.toBe(oldId);
        }

        const origIndex = indexParserPack(original);
        const twinIndex = indexParserPack(twin);
        const origRules = buildParserRules(origIndex);
        const twinRules = buildParserRules(twinIndex);
        const origStart = initStateForParserPack(origIndex, SEED);
        const twinStart = initStateForParserPack(twinIndex, SEED);

        // NON-VACUITY (2): the RAW start observations differ (the twin is genuinely a
        // relabeled game — its room id at least is a different string), so the per-step
        // equality below is a real metamorphic relation, not a pack compared to itself.
        const rawOrig = buildParserObservation(origIndex, origStart);
        const rawTwin = buildParserObservation(twinIndex, twinStart);
        expect(rawTwin, "raw twin start observation must differ from the original's").not.toEqual(
          rawOrig,
        );

        const { compared, cappedOut } = walkInLockStep(
          origIndex,
          twinIndex,
          origRules,
          twinRules,
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
