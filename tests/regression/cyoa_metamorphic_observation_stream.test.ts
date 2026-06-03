/**
 * Metamorphic observation-stream oracle (§15) — the ADVERSARIAL STRENGTHENING of the
 * bug_0209 metamorphic relabel oracle named as bug_0212's next-focus #1.
 *
 * WHAT THE EXISTING ORACLE PROVES, AND THE GAP IT LEAVES. bug_0209 proves a pack and
 * its identifier-relabeled twin are isomorphic on three TERMINAL/AGGREGATE artefacts:
 * the exhaustive ending-reachability census, the distinct-state COUNT, and the
 * validator's finding-code multiset. Those are end-of-run summaries. They would still
 * pass if the engine produced subtly DIFFERENT player-facing observations along the way
 * — a scene's text, the enumerated choices, the surfaced flags/vars/inventory — as long
 * as the same endings stayed reachable and the state graph kept the same size. The
 * benchmark's contamination story rests on something stronger: that the EXACT window a
 * model plays through — every observation, turn by turn — is a pure function of the
 * pack's STRUCTURE, identical (modulo the bijection) on the twin. A model that memorised
 * the original's id strings must gain nothing not just at the final ending but at EVERY
 * intermediate observation it reasons over.
 *
 * WHAT THIS ORACLE ADDS. For each shipped CYOA pack it walks the ENTIRE reachable state
 * graph in LOCK-STEP on the original and its relabeled twin: from corresponding states it
 * takes corresponding (bijection-mapped) actions and, at every single state, asserts the
 * twin's `buildObservation` equals the original's observation pushed through the
 * relabeling — `scene_id`, the available-action `id`s, and the surfaced flag/var/inventory
 * names all mapped through the bijection; the prose (title, scene/ending text, choice
 * text, journal) byte-identical. This is a PER-STEP isomorphism witness: a deeper,
 * intermediate-state-aware companion to bug_0209's terminal census. If any engine/runner
 * change ever made an OBSERVATION depend on a literal id — a scene id leaking into
 * rendered text, a choice ordered by id, a flag surfaced by name — bug_0209 could still
 * pass while THIS diverges loudly at the first affected step.
 *
 * SOUNDNESS OF THE LOCK-STEP WALK. Both the original and the twin are FULLY
 * DETERMINISTIC (CYOA has no randomness), and the relabel is a bijection, so at every pair
 * of corresponding states the legal-action sets correspond under the map and stepping
 * corresponding actions yields corresponding successor states — the two walks stay in
 * exact correspondence by construction. We dedupe on the ORIGINAL state fingerprint
 * (`stateKey`), so each distinct original state has its observation checked exactly once;
 * by determinism the twin state paired with a given original state is path-independent, so
 * single-visit dedupe is sound (the same argument the bug_0121/0209 BFS relies on). We
 * ALSO assert ok-parity on every step (a legal original action maps to a legal twin action
 * and vice versa), so a relabeling that broke legality surfaces immediately.
 *
 * NON-VACUITY is asserted explicitly: the bijection actually renamed ids (non-empty, no id
 * maps to itself); the RAW start observations of original and twin DIFFER (so we are not
 * comparing a pack to itself — only AFTER relabeling do they match); and more than one
 * state is compared. A missed relabel site (an incomplete relabeler) leaves an id that
 * `mapId` keeps as itself, which then mismatches the twin's relabeled id — a loud failure,
 * never a silently-minted matching token.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, type CyoaIndex } from "../../src/cyoa/runner.js";
import { buildObservation, type CyoaObservation } from "../../src/cyoa/observation.js";
import { makeStep, type Rules } from "../../src/core/engine.js";
import { stateKey } from "./support/exhaustive_endings.js";
import { relabelCyoaPack, type Relabeler } from "./support/relabel_cyoa.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

const SEED = 7;
// Matches the sibling census oracle's bound (the largest shipped CYOA pack settles well
// under this; the cap only guards a future unbounded-var loop, surfacing as a loud
// failure rather than a hang). We walk the graph twice-in-lock-step per pack.
const MAX_STATES = 200_000;
const TEST_TIMEOUT_MS = 90_000;

/**
 * A NON-MUTATING bijection lookup. An id the relabeler never mapped (i.e. a relabeler
 * incompleteness bug) is kept as ITSELF, so it then mismatches the twin's relabeled id —
 * a loud divergence. Using `relabeler.r` here would instead MINT a fresh token and could
 * mask such a bug, so we deliberately read the frozen `map`.
 */
function mapIdFn(relabeler: Relabeler): (id: string) => string {
  return (id: string) => relabeler.map.get(id) ?? id;
}

/** Push an original observation through the bijection to its expected twin form. */
function relabelObservation(o: CyoaObservation, mapId: (id: string) => string): CyoaObservation {
  return {
    mode: o.mode,
    scene_id: mapId(o.scene_id),
    title: o.title, // prose — byte-identical
    text: o.text, // prose — byte-identical
    state: {
      // `visibleFlags` sorts the ORIGINAL names; relabeled tokens sort differently, and
      // the twin sorts its OWN relabeled names, so re-sort after mapping to match.
      flags: o.state.flags.map(mapId).sort(),
      vars: Object.fromEntries(Object.entries(o.state.vars).map(([k, v]) => [mapId(k), v])),
      // Inventory is INSERTION-ORDERED, not sorted; the twin's identical add-sequence
      // yields the same order, so map WITHOUT re-sorting — an order divergence is caught.
      inventory: o.state.inventory.map(mapId),
      journal: [...o.state.journal], // prose — byte-identical
    },
    available_actions: o.available_actions.map((a) => ({ id: mapId(a.id), text: a.text })),
    ended: o.ended,
    ending_id: o.ending_id === null ? null : mapId(o.ending_id),
  };
}

/**
 * CYOA's only Action is CHOOSE; map its `choiceId` through the bijection. Throwing on any
 * other type keeps the oracle honest if the CYOA action surface ever widens (a new action
 * kind would otherwise be relabeled as a silent no-op).
 */
function relabelAction(a: Action, mapId: (id: string) => string): Action {
  if (a.type === "CHOOSE") return { type: "CHOOSE", choiceId: mapId(a.choiceId) };
  throw new Error(`unexpected CYOA action type "${a.type}" — extend relabelAction`);
}

type WalkResult = { compared: number; cappedOut: boolean };

function walkInLockStep(
  origIndex: CyoaIndex,
  twinIndex: CyoaIndex,
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

    const origObs = buildObservation(origIndex, o);
    const twinObs = buildObservation(twinIndex, t);
    expect(
      relabelObservation(origObs, mapId),
      `observation must be isomorphic under relabeling at original state\n${ko}`,
    ).toEqual(twinObs);
    compared++;

    if (o.ended) continue;
    for (const a of origRules.legalActions(o)) {
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

describe("bug_0213 — CYOA per-step observation stream is invariant under a consistent identifier relabeling", () => {
  it("discovers the shipped CYOA packs", () => {
    expect(packFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of packFiles) {
    it(
      `${file}: every observation along the whole reachable graph is isomorphic on the relabeled twin`,
      () => {
        const path = join(PACK_DIR, file);
        const loaded = loadPackFile(path);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const original = loaded.compiled.pack;

        const { pack: twin, relabeler } = relabelCyoaPack(original);
        const mapId = mapIdFn(relabeler);

        // NON-VACUITY (1): the relabel actually renamed things — no id maps to itself.
        expect(relabeler.map.size).toBeGreaterThan(0);
        for (const [oldId, newId] of relabeler.map) {
          expect(newId, `id "${oldId}" must be renamed, not left as itself`).not.toBe(oldId);
        }

        const origIndex = indexPack(original);
        const twinIndex = indexPack(twin);
        const origRules = buildRules(origIndex);
        const twinRules = buildRules(twinIndex);
        const origStart = initStateForPack(origIndex, SEED);
        const twinStart = initStateForPack(twinIndex, SEED);

        // NON-VACUITY (2): the RAW start observations differ (the twin is genuinely a
        // relabeled game — its scene_id at least is a different string), so the per-step
        // equality below is a real metamorphic relation, not a pack compared to itself.
        const rawOrig = buildObservation(origIndex, origStart);
        const rawTwin = buildObservation(twinIndex, twinStart);
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
