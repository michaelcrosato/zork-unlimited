/**
 * Structural verification (§15) for bug_0151 — across the COMPLETE reachable state
 * region of every shipped PARSER pack, the offered action menu is WELL-FORMED: no two
 * actions in any one observation ever share an `id`. A menu-integrity invariant, the
 * action-set analogue of the variant-liveness / score-economy proofs over the same BFS.
 *
 * ── Why this is a load-bearing contract (not a cosmetic nicety) ──────────────────────
 * The MCP/UI layer resolves a player's chosen action by its id with a FIRST-MATCH lookup:
 *
 *   // src/mcp/tools.ts — actionForId()
 *   return obs.available_actions.find((a) => a.id === id)?.action ?? null;
 *
 * `Array.prototype.find` returns the FIRST element it matches. So if an observation ever
 * offered two actions with the same id, the SECOND would be permanently UNSELECTABLE — a
 * player (or the coverage bot) who picked it would silently always get the first. The
 * action list a player sees would contain a phantom entry that does nothing the menu
 * implies. This is the latent defect a blind tester's "why is `examine_herb` still here
 * after I took the herb?" reaction gestures at: the worry is that an examine action has
 * been DUPLICATED (offered both as a room object and as a held one). It has not — the
 * lingering examine is a single, unique, held-object examine (you can examine what you
 * carry, and `visibleObjectIds` excludes held objects so a taken item is never in both
 * loops, src/parser/model.ts) — and this proof certifies that uniqueness holds at EVERY
 * reachable state, not just the one the tester happened to look at.
 *
 * ── Why nothing already covers it ───────────────────────────────────────────────────
 *   - `enumerateActions` builds each option through `option()`, which calls
 *     `resolveParserAction` + `evalConditions` and returns null when an action is
 *     structurally impossible — so "every offered action resolves" is true BY
 *     CONSTRUCTION (vacuous to assert). Uniqueness is the orthogonal property: two
 *     DISTINCT, individually-resolvable options can still collide on their id string.
 *   - The validators check duplicate ROOM/OBJECT/ENDING ids (parser_validator.ts
 *     DUPLICATE_ID), never the RUNTIME action ids the enumerator mints from templates
 *     (`go_<dir>`, `examine_<oid>`, `use_<item>_on_<target>`, ...). Two exits sharing a
 *     direction, or a future template collision, mint a duplicate `id` the static check
 *     cannot see — the negative control below plants exactly that.
 *   - The every-ending / variant-liveness / score-economy proofs (bug_0121/0146/0148)
 *     reason about CONTENT reachability over this same BFS; none inspects the action
 *     MENU's internal well-formedness.
 *
 * ── How it is proven (sound + exhaustive) ───────────────────────────────────────────
 * For each auto-discovered parser pack it runs the shared exhaustive concrete BFS
 * (support/exhaustive_endings.ts — the bug_0121 solver) under the bug_0146 LIVENESS
 * action policy (step every action except DROP/CLOSE and the pure-observation verbs — the
 * widest tractable region, visiting read-flag states too), and at EVERY distinct
 * reachable non-terminal state calls the engine's own `enumerateActions` and asserts its
 * option ids are pairwise distinct. The menu inspected at each state is independent of
 * which actions the BFS chooses to STEP, so the policy only widens the set of states
 * (menus) examined — strictly more thorough, never less. Terminal states offer no menu
 * (`enumerateActions` returns [] when `state.ended`), so they are skipped. The search
 * FAILS on `cappedOut`, so it can never pass by truncating an unexplored region. Packs
 * are auto-discovered, so a new parser pack is covered the moment it ships (bug_0096).
 *
 * Scope: PARSER (the mode of the cycle's finding — alchemists_tower). RPG reuses the
 * parser enumerator (so it inherits the same templates) but adds seeded combat actions
 * and needs the best/worst-roll bracket; CYOA mints `CHOOSE` ids from scene choice ids.
 * Extending the same menu-integrity assertion to those two modes is the natural follow-on.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  initStateForParserPack,
  type ParserIndex,
} from "../../src/parser/model.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { parserRollRuleSets } from "./support/parser_rolls.js";

const PACK_DIR = "content/parser/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same safety bound as the every-ending-reachable / variant-liveness proofs. The shipped
// packs settle well under this with the liveness action policy; the ceiling exists only so
// a future combinatorial blowup fails LOUDLY (cap hit) rather than truncating an unexplored
// region into a silent pass.
const MAX_STATES = 200_000;

// The bug_0146 liveness action policy: step every legal action EXCEPT the ones that cannot
// usefully widen the reachable region (DROP — the inventory×location blowup — plus the
// pure-observation verbs / never-legal CLOSE). DOES step READ (sticky interaction effects),
// so read-flag states and their menus are inspected too.
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (a: Action): boolean => !LIVENESS_SKIP.has(a.type);

type MenuReport = {
  /** Human-readable descriptions of every state whose menu contained a duplicate id. */
  collisions: string[];
  /** Distinct non-terminal reachable states whose menu was inspected (anti-vacuity). */
  statesChecked: number;
  /** Total action options inspected across all those states (anti-vacuity). */
  actionsSeen: number;
  cappedOut: boolean;
};

/** Walk the full reachable region and inspect every offered action menu for duplicate ids. */
function analyze(index: ParserIndex): MenuReport {
  const collisions: string[] = [];
  let statesChecked = 0;
  let actionsSeen = 0;

  const result = exhaustiveEndingsMulti(
    parserRollRuleSets(index),
    initStateForParserPack(index, 7),
    MAX_STATES,
    (s) => {
      // Terminal states offer no menu (enumerateActions returns [] when ended).
      if (s.ended) return;
      const opts = enumerateActions(index, s);
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
    { explore: livenessExplore },
  );

  return { collisions, statesChecked, actionsSeen, cappedOut: result.cappedOut };
}

describe("bug_0151 — every reachable action menu of every PARSER pack has unique action ids", () => {
  it("discovers the shipped parser packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(`${file}: no reachable state ever offers two actions with the same id`, () => {
      const loaded = loadParserPackFile(join(PACK_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const { collisions, statesChecked, actionsSeen, cappedOut } = analyze(
        indexParserPack(loaded.compiled.pack),
      );
      // The search must have exhausted the reachable region, else "no duplicate" is
      // unproven (a collision could lie in the truncated tail).
      expect(cappedOut).toBe(false);
      // Anti-vacuity: we must have actually inspected real menus, not zero states.
      expect(statesChecked).toBeGreaterThan(0);
      expect(actionsSeen).toBeGreaterThan(statesChecked); // every state offers ≥1 action
      expect(collisions).toEqual([]);
    }, 30_000);
  }

  it("FAILS on a planted duplicate action id (guards against the check silently passing)", () => {
    // Two exits in the SAME direction both mint the option id `go_north` — a real runtime
    // duplicate the static DUPLICATE_ID validator (which checks room/object/ending ids,
    // not enumerator-minted action ids) does not catch. The dynamic check must catch it —
    // the negative control for the whole proof.
    const src = `
meta: { id: t, title: T, start_room: a }
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
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions, statesChecked } = analyze(indexParserPack(r.compiled.pack));
    expect(statesChecked).toBeGreaterThan(0);
    expect(collisions.some((c) => c.includes("go_north"))).toBe(true);
  });

  it("PASSES a clean twin (same shape, distinct directions) — no false alarm", () => {
    // The same pack with the two exits given DISTINCT directions mints `go_north` and
    // `go_east`, no collision — proving the control above bites on the duplication itself,
    // not on the pack's shape.
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
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
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { collisions } = analyze(indexParserPack(r.compiled.pack));
    expect(collisions).toEqual([]);
  });
});
