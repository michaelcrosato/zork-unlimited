/**
 * Structural verification (§15) for bug_0146 — every declared reactive `variant` of
 * every shipped PARSER pack is LIVE: there is a concretely-reachable state in which
 * that variant is the FIRST match AND the thing it describes is in view (the room you
 * stand in, or an object present to examine) — exactly the text a real player sees.
 * The parser half of bug_0145's CYOA liveness proof, and the DYNAMIC complement to
 * bug_0091's static `parser_variant_shadowing` check.
 *
 * The defect class — "dead reactive prose" — has two causes; the two checks together
 * close both for the parser mode, mirroring the CYOA pair (bug_0085 + bug_0145):
 *   - SHADOWING (parser_variant_shadowing, static): a later sibling whose `when` is
 *     PROVABLY ENTAILED by an earlier one can never be first match. Sound but partial —
 *     it reasons only over pure literal/var-bound conjunctions, never the pack's real
 *     gating, so it cannot see the other cause:
 *   - UNREACHABLE GUARD (here, dynamic): a variant whose `when` no reachable state at
 *     its viewing context can satisfy — a flag set only on a branch that never returns,
 *     a var threshold the gating never reaches, a forbidden flag pair. Such a variant is
 *     not shadowed; its guard is simply unreachable, so its text is dead and no blind
 *     playtest is guaranteed to surface it (the prose just never appears).
 *
 * This proves the live half directly, against ground truth: for each pack it runs the
 * shared exhaustive concrete BFS (support/exhaustive_endings.ts — the bug_0121 solver)
 * and, at EVERY distinct reachable state, records which room/object variant is the first
 * match (computed with the engine's own `evalConditions`/`roomDescription`/
 * `objectDescription` semantics, identical to what the runner displays). A declared
 * variant that is the first match in NO reachable viewing state is dead content and
 * fails here. Packs are auto-discovered, so a new parser pack is covered the moment it
 * ships (the health-covers-all-packs bar, bug_0096).
 *
 * ── SOUNDNESS: the action policy (the exact caveat bug_0145's next-focus named) ──────
 * For the every-ending-reachable PROOF the shared BFS steps only "progress" actions and
 * skips reversible/observation moves (support's `isProgressAction`). That restriction is
 * MONOTONE and so sound for reachability — restricting actions can only HIDE an ending,
 * a loud failure, never invent one. It is NOT sound for a LIVENESS proof: skipping a
 * state that displays a variant would FALSELY call that variant dead. The reachability
 * search in particular skips READ — but in the parser READ is NOT pure narration: a READ
 * interaction can carry `effects` (alchemists_tower's spellbook READ sets `read_recipe`,
 * and two variants gate on that flag). The reachability search may skip it soundly only
 * because no ROUTE gates on a read flag, just reactive prose — exactly the liveness gap.
 *
 * So this search widens the action policy to step every action EXCEPT the ones that
 * provably cannot gate a variant:
 *   - LOOK / INVENTORY / INSPECT — narrate-only (resolveParserAction returns only a
 *     `narrate` effect, or no resolver case at all), so they mutate NO state field any
 *     `Condition` reads; stepping them yields an identical fingerprint anyway.
 *   - CLOSE — has no resolver case, so it is never a legal action.
 *   - DROP — see the boundary note below.
 * READ and every genuine progress action (MOVE/TAKE/OPEN/UNLOCK/USE/TALK/ASK) ARE
 * stepped, so read-flag states and every gating state are visited. The search FAILS on
 * `cappedOut`, so it can never pass by truncating an unexplored region.
 *
 * ── The DROP boundary (documented, and it fails LOUD, never silent) ──────────────────
 * DROP is the one skipped action that still mutates state, so why skip it? Two reasons.
 * (1) Tractability: stepping DROP places an item in the current room, and the inventory-
 * subset × drop-location product explodes the state space past the cap (measured: both
 * shipped packs blow the 200k cap with DROP enabled, vs ~6k/~10k states without — the
 * exact combinatorial blowup the progress restriction exists to avoid). (2) DROP's only
 * variant-OBSERVABLE effect is `not_item: X` (inventory reduction): its other effect,
 * `place_object`, sets the object's room, and NO condition in the closed DSL reads object
 * location (conditions.ts has only is_open/is_unlocked for object state) — so a dropped
 * item's whereabouts is invisible to every `when`. The residual gap is therefore narrow:
 * a variant whose `when` is satisfiable ONLY by taking X and then dropping it (X is force-
 * held everywhere its display context is reachable). That is an anti-pattern — gating
 * reactive prose on a put-it-back state — and NO shipped variant does it: every shipped
 * `not_item: X` variant is satisfiable on the natural pre-acquisition / post-consumption
 * route, so all are found live here. If a future pack ever introduced one, this check
 * would mark it not-displayed and FAIL LOUDLY (a false alarm to investigate), never
 * silently PASS dead prose — the safe failure direction. The negative control below
 * proves the check bites on a genuinely dead guard.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { compileParserPack, loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  initStateForParserPack,
  visibleObjectIds,
  type ParserIndex,
} from "../../src/parser/model.js";
import { evalConditions } from "../../src/core/conditions.js";
import type { GameState } from "../../src/core/state.js";
import type { RoomVariant, ObjectVariant, ParserEndingVariant } from "../../src/parser/schema.js";
import type { Action } from "../../src/api/types.js";
import { exhaustiveEndingsMulti } from "./support/exhaustive_endings.js";
import { parserRollRuleSets } from "./support/parser_rolls.js";

const PACK_DIR = "content/parser/pack";
const packFiles = readdirSync(PACK_DIR)
  .filter((f) => f.endsWith(".yaml"))
  .sort();

// Same safety bound as the every-ending-reachable / CYOA-liveness proofs. The shipped
// packs settle well under this with the liveness action policy (measured ~6k / ~10k
// states); the ceiling exists only so a future combinatorial blowup fails LOUDLY (cap
// hit) rather than truncating an unexplored region into a silent pass.
const MAX_STATES = 200_000;

/**
 * The liveness action policy: step every legal action EXCEPT the ones that provably
 * cannot gate a variant — the pure-observation verbs (narrate-only / never legal) and
 * DROP (see the DROP boundary note in the file header). Crucially this DOES step READ,
 * which the reachability search skips but which carries sticky interaction effects.
 */
const LIVENESS_SKIP: ReadonlySet<Action["type"]> = new Set([
  "DROP",
  "CLOSE",
  "LOOK",
  "INVENTORY",
  "INSPECT",
]);
const livenessExplore = (a: Action): boolean => !LIVENESS_SKIP.has(a.type);

/** The index of the first variant whose `when` holds in `state` (first-match-wins,
 *  identical to model.ts roomDescription/objectDescription), or -1 for the base text. */
function firstMatch(
  variants: readonly (RoomVariant | ObjectVariant | ParserEndingVariant)[],
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

function analyze(index: ParserIndex): Liveness {
  const displayed = new Set<string>();
  const record = (kind: "room" | "object" | "ending", id: string, idx: number): void => {
    if (idx >= 0) displayed.add(`${kind}:${id}#${idx}`);
  };

  const result = exhaustiveEndingsMulti(
    parserRollRuleSets(index),
    initStateForParserPack(index, 7),
    MAX_STATES,
    (s) => {
      // At a terminal the player sees the ending's epilogue — credit the reactive ending
      // variant that fired (first-match-wins, exactly what model.ts endingText displays).
      if (s.ended) {
        const ending = s.endingId ? index.pack.endings.find((e) => e.id === s.endingId) : undefined;
        if (ending?.variants?.length) record("ending", ending.id, firstMatch(ending.variants, s));
        return;
      }
      // The room you stand in: its description is always shown.
      const room = index.rooms.get(s.current);
      if (room?.variants?.length) record("room", room.id, firstMatch(room.variants, s));
      // Objects are shown on examine — credit a variant only when the object is actually
      // PRESENT (visible in the room or held), i.e. examinable in this very state. This is
      // the parser analogue of the CYOA check's "current scene" requirement: a variant is
      // live only where a player could really see it.
      for (const oid of [...visibleObjectIds(index, s, s.current), ...s.inventory]) {
        const obj = index.objects.get(oid);
        if (obj?.variants?.length) record("object", oid, firstMatch(obj.variants, s));
      }
    },
    { explore: livenessExplore },
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

describe("bug_0146 — every reactive variant of every PARSER pack is reachable as displayed text", () => {
  it("discovers the shipped parser packs", () => {
    // Guard against a vacuous pass if the glob ever yields nothing.
    expect(packFiles.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of packFiles) {
    it(`${file}: every declared variant is the first match in some viewing state`, () => {
      const loaded = loadParserPackFile(join(PACK_DIR, file));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const { displayed, declared, cappedOut } = analyze(indexParserPack(loaded.compiled.pack));
      // The search must have exhausted the reachable region, else "not displayed" is
      // unproven (it could lie in the truncated tail).
      expect(cappedOut).toBe(false);
      // The shipped parser packs are reactive by design — guard against a vacuous pass.
      expect(declared.length).toBeGreaterThan(0);
      const dead = declared.filter((d) => !displayed.has(d.key)).map((d) => d.where);
      expect(dead).toEqual([]);
    });
  }

  it("FAILS on a planted dead variant (guards against the check silently passing)", () => {
    // A room variant guarded on a flag the pack never sets is dead prose. The check must
    // catch it — the negative control for the whole proof.
    const src = `
meta: { id: t, title: T, start_room: a }
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
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexParserPack(r.compiled.pack);
    const { displayed } = analyze(index);
    expect(displayed.has("room:a#0")).toBe(false);
  });

  it("CREDITS a variant only reachable by stepping READ (read-flag liveness)", () => {
    // The soundness crux: a variant gated on a flag a READ interaction sets is LIVE, and
    // the search proves it only because it steps READ (which the reachability search
    // skips). A negative twin — the same pack with READ excluded from the policy — must
    // FAIL to credit it, demonstrating that stepping READ is load-bearing here.
    const src = `
meta: { id: t, title: T, start_room: a }
rooms:
  - id: a
    name: A
    description: "base"
    objects: [note]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: note
    name: note
    description: "a folded note"
    read_text: "It says: turn the page."
    variants:
      - when: [{ has_flag: read_note }]
        text: "the note, now read, is creased open"
    interactions:
      - verb: READ
        target: note
        conditions: [{ not_flag: read_note }]
        effects: [{ set_flag: read_note }]
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
`;
    const r = compileParserPack(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const index = indexParserPack(r.compiled.pack);

    // With READ stepped (the real liveness policy), the read-flag variant is credited.
    expect(analyze(index).displayed.has("object:note#0")).toBe(true);

    // Control: exclude READ from the policy — the same variant is now (wrongly) dead,
    // proving the read-flag state is reachable ONLY by stepping READ.
    const displayedNoRead = new Set<string>();
    exhaustiveEndingsMulti(
      parserRollRuleSets(index),
      initStateForParserPack(index, 7),
      MAX_STATES,
      (s) => {
        if (s.ended) return;
        for (const oid of [...visibleObjectIds(index, s, s.current), ...s.inventory]) {
          const obj = index.objects.get(oid);
          if (obj?.variants?.length) {
            const idx = firstMatch(obj.variants, s);
            if (idx >= 0) displayedNoRead.add(`object:${oid}#${idx}`);
          }
        }
      },
      { explore: (a: Action) => livenessExplore(a) && a.type !== "READ" },
    );
    expect(displayedNoRead.has("object:note#0")).toBe(false);
  });
});
