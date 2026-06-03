/**
 * Structural verification (§15) for bug_0153 — across the COMPLETE reachable state
 * region of every shipped CYOA pack, the offered action menu is WELL-FORMED: no two
 * actions in any one observation ever share an `id`. The CYOA leg of the menu-integrity
 * trilogy, completing bug_0151 (parser, runtime proof) + bug_0152 (RPG, runtime proof).
 *
 * ── Why this is a load-bearing contract (not a cosmetic nicety) ──────────────────────
 * The MCP/UI layer resolves a player's chosen action by its id with a FIRST-MATCH lookup:
 *
 *   // src/mcp/tools.ts — actionForId()
 *   return obs.available_actions.find((a) => a.id === id)?.action ?? null;
 *
 * `Array.prototype.find` returns the FIRST element it matches. So if an observation ever
 * offered two actions with the same id, the SECOND would be permanently UNSELECTABLE — a
 * player (or the coverage bot) who picked it would silently always get the first: a phantom
 * menu entry that does nothing the menu implies.
 *
 * ── Why this leg needs a RUNTIME proof, not just the "by construction" argument ──────
 * bug_0152 closed the CYOA leg with prose: a CYOA observation's action ids ARE the scene's
 * declared choice ids (src/cyoa/observation.ts buildObservation:
 *   `available = scene.choices.filter(cond).map((c) => ({ id: c.id, text: c.text }))`),
 * cyoa_validator already dup-checks choice ids WITHIN each scene (DUPLICATE_ID,
 * cyoa_validator.ts dupCheck over `scene.choices.map((c) => c.id)`), and a condition-filtered
 * SUBSET of statically-unique ids is unique. That argument is sound TODAY, but it rests on an
 * UNTESTED COUPLING: that `buildObservation` never injects an action id beyond one scene's
 * declared choices (no synthetic/global "restart"/meta option, no cross-scene merge). Nothing
 * enforces that coupling. If a future change to observation.ts ever injected such an id, it
 * could collide with a scene's own choice id and the menu would carry a phantom entry — and NO
 * static check would catch it, because cyoa_validator only ever sees the STATIC per-scene
 * choices, never the RUNTIME observation menu the player actually picks from. This is the exact
 * class bug_0151/0152 close for parser/RPG (the static validators check declared ids but never
 * the runtime-enumerated menu); for those two modes the enumerator MINTS new ids, for CYOA the
 * menu MERELY reflects the choices today — but "merely reflects" is itself the invariant worth
 * locking. This test asserts it directly against the engine's own observation builder.
 *
 * ── How it is proven (sound + exhaustive) ───────────────────────────────────────────
 * For each auto-discovered CYOA pack it runs the shared exhaustive concrete BFS
 * (support/exhaustive_endings.ts — the same bug_0121 solver that backs every-ending
 * reachability and bug_0145 variant-liveness). CYOA's only action is CHOOSE, so the default
 * progress-action policy explores the COMPLETE reachable region (no liveness/roll widening is
 * needed, unlike parser/RPG). At EVERY distinct reachable non-terminal state it calls the
 * engine's own `buildObservation` and asserts the `available_actions` ids are pairwise
 * distinct — i.e. exactly the menu the MCP/UI would resolve a pick against. The search FAILS on
 * `cappedOut`, so it can never pass by truncating an unexplored region. Packs are
 * auto-discovered, so a new CYOA pack is covered the moment it ships (bug_0096).
 *
 * Scope: CYOA. Together with bug_0151 (parser) and bug_0152 (RPG) this closes the find-by-id
 * menu-integrity contract (src/mcp/tools.ts actionForId) across all three modes — now a uniform
 * RUNTIME proof in each, no leg resting on a by-construction argument alone. See
 * [[cyoa-exhaustive-solver]].
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { loadPackFile, compilePack } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack, type CyoaIndex } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { exhaustiveEndings } from "./support/exhaustive_endings.js";

const PACK_DIR = "content/cyoa/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same safety bound as the every-ending-reachable / variant-liveness proofs. The shipped
// packs settle well under this; the ceiling exists only so a future combinatorial blowup
// fails LOUDLY (cap hit) rather than truncating an unexplored region into a silent pass.
const MAX_STATES = 200_000;

// watchtower_road's full reachable CYOA region is the largest shipped pack (tens of thousands
// of distinct states — see no_dead_pocket.test.ts); its BFS completes in ~2s standalone but
// can nudge past vitest's 5s DEFAULT under parallel suite load. Give the per-pack walk a
// generous explicit ceiling, matching cyoa_variant_liveness's TEST_TIMEOUT_MS: this guards
// ONLY against a wall-clock FLAKE — a genuine non-termination still trips the MAX_STATES cap
// (a loud `cappedOut` failure), not the wall clock.
const TEST_TIMEOUT_MS = 60_000;

type MenuReport = {
  /** Human-readable descriptions of every state whose menu contained a duplicate id. */
  collisions: string[];
  /** Distinct non-terminal reachable states whose menu was inspected (anti-vacuity). */
  statesChecked: number;
  /** Total action options inspected across all those states (anti-vacuity). */
  actionsSeen: number;
  cappedOut: boolean;
};

/** Walk the full reachable region and inspect every offered observation menu for duplicate ids. */
function analyze(index: CyoaIndex): MenuReport {
  const collisions: string[] = [];
  let statesChecked = 0;
  let actionsSeen = 0;

  const rules = buildRules(index);
  const result = exhaustiveEndings(rules, initStateForPack(index, 7), MAX_STATES, (s) => {
    // Terminal states offer no menu (buildObservation returns [] when ended / on an ending
    // scene), so they carry no find-by-id contract to violate.
    if (s.ended) return;
    const obs = buildObservation(index, s);
    if (obs.available_actions.length === 0) return;
    statesChecked++;
    actionsSeen += obs.available_actions.length;
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const a of obs.available_actions) {
      if (seen.has(a.id)) dup.add(a.id);
      seen.add(a.id);
    }
    if (dup.size > 0) {
      collisions.push(`scene "${s.current}": duplicate action id(s) ${[...dup].sort().join(", ")}`);
    }
  });

  return { collisions, statesChecked, actionsSeen, cappedOut: result.cappedOut };
}

describe("bug_0153 — every reachable action menu of every CYOA pack has unique action ids", () => {
  it("discovers the shipped CYOA packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of packFiles) {
    it(
      `${file}: no reachable state ever offers two actions with the same id`,
      () => {
        const loaded = loadPackFile(`${PACK_DIR}/${file}`);
        expect(loaded.ok).toBe(true);
        if (!loaded.ok) return;
        const { collisions, statesChecked, actionsSeen, cappedOut } = analyze(
          indexPack(loaded.compiled.pack),
        );
        // The search must have exhausted the reachable region, else "no duplicate" is
        // unproven (a collision could lie in the truncated tail).
        expect(cappedOut).toBe(false);
        // Anti-vacuity: we must have actually inspected real menus, not zero states.
        expect(statesChecked).toBeGreaterThan(0);
        expect(actionsSeen).toBeGreaterThan(statesChecked); // every non-terminal scene offers ≥1 choice
        expect(collisions).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  }

  it("FAILS on a planted duplicate action id (guards against the check silently passing)", () => {
    // Two choices in the SAME scene share the id `go`. `compilePack` runs only the Zod schema
    // (src/cyoa/pack.ts) — the structural DUPLICATE_ID check lives in the SEPARATE cyoa_validator
    // (a distinct bar step), so this pack compiles and `buildObservation` surfaces BOTH options.
    // The runtime menu then carries a duplicate id the compile step does not reject — the same
    // class a future synthetic-action injection would create, which no static check sees. The
    // dynamic check must catch it: the negative control for the whole proof.
    const src = `
meta: { id: t, title: T, start: a }
scenes:
  - id: a
    title: A
    text: "base"
    choices:
      - { id: go, text: "left", next: b }
      - { id: go, text: "right", next: c }
  - id: b
    title: B
    text: "B"
    is_ending: true
  - id: c
    title: C
    text: "C"
    is_ending: true
endings: []
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions, statesChecked } = analyze(indexPack(r.compiled.pack));
    expect(statesChecked).toBeGreaterThan(0);
    expect(collisions.some((c) => c.includes("go"))).toBe(true);
  });

  it("PASSES a clean twin (same shape, distinct ids) — no false alarm", () => {
    // The same pack with the two choices given DISTINCT ids carries no collision — proving the
    // control above bites on the duplication itself, not on the pack's shape.
    const src = `
meta: { id: t, title: T, start: a }
scenes:
  - id: a
    title: A
    text: "base"
    choices:
      - { id: go_left, text: "left", next: b }
      - { id: go_right, text: "right", next: c }
  - id: b
    title: B
    text: "B"
    is_ending: true
  - id: c
    title: C
    text: "C"
    is_ending: true
endings: []
`;
    const r = compilePack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions } = analyze(indexPack(r.compiled.pack));
    expect(collisions).toEqual([]);
  });
});
