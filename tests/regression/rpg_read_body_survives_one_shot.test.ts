/**
 * Regression (§15) — a one-shot READ interaction retires ITSELF, not the document.
 *
 * The shipped authoring idiom for a readable prop is `read_text` on the object (the
 * document BODY) plus one READ interaction gated `not_flag: X` whose effects
 * `set_flag: X` (the one-time payload: score, a quest stage, a journal line). The READ
 * resolver used to AND every interaction's conditions into the ACTION's conditions —
 * deliberately unlike INSPECT/OPEN/CLOSE, which fire per-interaction via
 * `firingInteractions`. So the moment the payload's own flag was set, the whole row
 * failed `option()` and disappeared: the charter's inheritance clause, the Barfleur
 * Memorandum's list of names, the tally the player is meant to quote back at a hearing
 * all became unreadable for the rest of the game after a single READ. Every one of the
 * 16 shipped objects that carries a READ interaction had this shape.
 *
 * The fix fires READ interactions per-interaction and keeps only the gates that decide
 * whether the object can be read AT ALL. The distinction matters in both directions,
 * so both are locked here:
 *
 *   (1) a self-retiring flag gate (`not_flag: X` whose own effects `set_flag: X`) is
 *       stripped from the action, so the body stays readable and the payload fires once;
 *   (2) a genuinely environmental gate is NOT stripped — the printers' memorandum needs
 *       `has_item: dark_lantern`, and reading it in the dark must stay impossible before
 *       AND after the one-shot payload has fired;
 *   (3) structurally, across every shipped pack: for each object carrying both
 *       `read_text` and a READ interaction, the body is still narrated once that
 *       interaction has retired.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Condition } from "../../src/core/conditions.js";
import { evalConditions } from "../../src/core/conditions.js";
import type { Effect } from "../../src/core/effects.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { resolveRpgAction } from "../../src/rpg/legal_actions.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { compileRpgSource, loadRpgSourceFile } from "../../src/rpg/source.js";

const QUEST_DIR = "content/rpg/quests";

/** The one-shot charter idiom, isolated: body + a `not_flag`/`set_flag` payload. */
const charterPack = `
meta: { id: t, title: T, start_room: a, max_score: 5 }
rooms:
  - id: a
    name: A
    description: "A muniment room."
    objects: [charter]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: charter
    name: charter
    description: "A rolled charter in an oiled sleeve."
    read_text: "The charter grants Walter Holm and his lawful heirs a permanent exemption."
    interactions:
      - verb: READ
        target: charter
        conditions: [{ not_flag: charter_read }]
        effects:
          - set_flag: charter_read
          - inc_var: { name: score, by: 5 }
          - narrate: "You note the exemption clause. (+5 score)"
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
enemies: []
`;

/** The same idiom PLUS a real environmental precondition (light to read by). */
const darkPack = `
meta: { id: t, title: T, start_room: a, max_score: 5 }
rooms:
  - id: a
    name: A
    description: "An unlit print shop."
    objects: [lantern, memorandum]
    exits: [{ direction: north, to: b }]
  - id: b
    name: B
    description: "B"
    exits: [{ direction: south, to: a }]
objects:
  - id: lantern
    name: lantern
    description: "A shuttered dark lantern."
    takeable: true
  - id: memorandum
    name: memorandum
    description: "A printed proof sheet."
    read_text: "The memorandum lists fifteen pressed sailors denied nine days' wages."
    interactions:
      - verb: READ
        target: memorandum
        conditions: [{ has_item: lantern }, { not_flag: proof_read }]
        effects:
          - set_flag: proof_read
          - inc_var: { name: score, by: 5 }
win_conditions: [{ id: w, conditions: [{ visited: b }], ending: e }]
endings: [{ id: e, title: E, text: "done" }]
enemies: []
`;

const compile = (src: string) => {
  const r = compileRpgSource(src);
  if (!r.ok) throw new Error(`fixture must compile: ${r.error.message}`);
  return r.compiled.pack;
};

const advance = (
  index: ReturnType<typeof indexRpgPack>,
  state: GameState,
  id: string,
): { state: GameState; narration: string } => {
  const option = enumerateRpgActions(index, state).find((o) => o.id === id);
  if (!option) throw new Error(`no legal action ${id}`);
  const result = makeStep(buildRpgRules(index))(state, option.action);
  if (!result.ok) throw new Error(`step ${id} rejected: ${result.rejectionReason}`);
  return {
    state: result.state,
    narration: result.events
      .filter((e): e is Extract<typeof e, { type: "narration" }> => e.type === "narration")
      .map((e) => e.text)
      .join("\n"),
  };
};

describe("READ: a one-shot payload retires itself, not the document body", () => {
  it("(1) the body stays readable after the payload has fired, and the payload fires once", () => {
    const index = indexRpgPack(compile(charterPack));
    const body = "The charter grants Walter Holm and his lawful heirs a permanent exemption.";

    const first = advance(index, initStateForRpgPack(index, 1), "read_charter");
    expect(first.narration).toContain(body);
    expect(first.narration).toContain("+5 score");
    expect(first.state.vars["score"]).toBe(5);
    expect(first.state.flags["charter_read"]).toBe(true);

    // The row is still offered — this is the whole defect: it used to vanish here.
    expect(enumerateRpgActions(index, first.state).map((o) => o.id)).toContain("read_charter");

    const second = advance(index, first.state, "read_charter");
    expect(second.narration).toContain(body); // the clause is still quotable
    expect(second.narration).not.toContain("+5 score"); // ...but the award does not repeat
    expect(second.state.vars["score"]).toBe(5);
  });

  it("(2) an environmental gate is NOT stripped: no reading in the dark, before or after", () => {
    const index = indexRpgPack(compile(darkPack));
    const dark = initStateForRpgPack(index, 1);
    const readIds = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.id);

    expect(readIds(dark)).not.toContain("read_memorandum");

    const lit = advance(index, dark, "take_lantern").state;
    expect(readIds(lit)).toContain("read_memorandum");

    const afterRead = advance(index, lit, "read_memorandum").state;
    expect(afterRead.vars["score"]).toBe(5);
    expect(readIds(afterRead)).toContain("read_memorandum");

    // Set the lantern down and the memorandum goes dark again, retired payload or not.
    const dropped = advance(index, afterRead, "drop_lantern").state;
    expect(readIds(dropped)).not.toContain("read_memorandum");
  });
});

/** Every `has_item` a condition tree insists on, so a synthetic state can satisfy it. */
function requiredItems(conditions: readonly Condition[]): string[] {
  const out: string[] = [];
  for (const condition of conditions) {
    if ("has_item" in condition) out.push(condition.has_item);
    else if ("all_of" in condition) out.push(...requiredItems(condition.all_of));
  }
  return out;
}

const flagsSetBy = (effects: readonly Effect[]): string[] =>
  effects.flatMap((effect) => ("set_flag" in effect ? [effect.set_flag] : []));

describe("READ: shipped packs keep every document body reachable after its one-shot", () => {
  const packs = readdirSync(QUEST_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  it("auto-discovers the shipped quest packs", () => {
    expect(packs.length).toBeGreaterThan(0);
  });

  for (const file of packs) {
    it(`${file}: read_text survives its READ interaction retiring`, () => {
      const loaded = loadRpgSourceFile(join(QUEST_DIR, file));
      if (!loaded.ok) throw new Error(`${file} must compile`);
      const index = indexRpgPack(loaded.compiled.pack);
      const documents = loaded.compiled.pack.objects.filter(
        (o) => o.read_text !== undefined && o.interactions.some((it) => it.verb === "READ"),
      );

      for (const object of documents) {
        const reads = object.interactions.filter((it) => it.verb === "READ");
        // A state in which every read has already happened: its flags are set, and the
        // player holds the document plus whatever the authored gate requires.
        const retired: GameState = {
          ...initStateForRpgPack(index, 1),
          inventory: [object.id, ...reads.flatMap((it) => requiredItems(it.conditions))],
          flags: Object.fromEntries(
            reads.flatMap((it) => flagsSetBy(it.effects)).map((flag) => [flag, true]),
          ),
        };
        for (const it of reads) {
          expect(evalConditions(it.conditions, retired)).toBe(false); // truly retired
        }

        const resolution = resolveRpgAction(index, retired, { type: "READ", target: object.id });
        expect(resolution, `${object.id} offers no READ once its one-shot retired`).not.toBeNull();
        expect(evalConditions(resolution!.conditions, retired)).toBe(true);
        expect(
          resolution!.effects.some(
            (effect) => "narrate" in effect && effect.narrate === object.read_text,
          ),
          `${object.id} no longer narrates its read_text`,
        ).toBe(true);
      }
    });
  }
});
