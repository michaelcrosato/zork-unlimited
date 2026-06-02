/**
 * Regression (§15) for bug_0074 — a self-USE consume action read with the wrong verb.
 *
 * Two independent blind MCP playtesters of The Alchemist's Tower (seed 13 / bug_0009,
 * seed 29 / bug_0074, ai-runs/2026-06-01T19-46-49-405Z) flagged the same legibility
 * gap: the recipe and the phial's own prose say "drink" ("Do not DRINK it", "never
 * brewed to be DRUNK"), but the only offered action to consume it read "use black
 * phial" and the natural command "drink phial" was not understood. The verb the game
 * SHOWS didn't match the verb the prose PRIMES.
 *
 * The fix is a generic engine feature: an interaction may declare a natural
 * `command_verb` for the self-USE (consume-this-thing) pattern. When set:
 *   - the legal-action set lists the command as "<verb> <obj>" (e.g. "drink black
 *     phial"), while the action id stays verb-agnostic (`use_<obj>`);
 *   - the controlled command parser ALSO accepts "<verb> <obj>" ("drink phial");
 *   - the bare "use <obj>" path still works (backward compatible).
 * The schema confines `command_verb` to self-USE interactions (item === target) and
 * forbids it from shadowing a builtin parser verb.
 *
 * Locked here:
 *   (1) the held black phial is listed as id `use_black_phial`, command "drink black
 *       phial" — never the generic "use black phial" wording, never a self-on-self form;
 *   (2) the parser maps "drink black phial" AND "drink phial" → USE(black_phial,
 *       black_phial), which still fires ending_poisoned;
 *   (3) backward compat: "use black phial" still parses to the same self-USE;
 *   (4) schema guards: command_verb only on self-USE, never shadows a builtin verb,
 *       must be a single lowercase word; and an interaction without it round-trips with
 *       command_verb === undefined (absent ⇒ byte-identical compile, content hash safe);
 *   (5) the full win route still reaches ending_cured at 35/35 (feature is additive).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { InteractionSchema } from "../../src/parser/schema.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const index = indexParserPack(alch.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

// Reach the laboratory holding the black phial (one step from drinking it).
const TO_PHIAL = [
  "go_west",
  "read_spellbook",
  "go_east",
  "go_east",
  "take_herb",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
  "unlock_cellar_door",
  "go_down",
  "take_water_vial",
  "go_up",
  "go_north",
  "take_black_phial",
];

// The full canonical win route (brew the antidote, administer it) — mirrors the
// stage3_alchemist acceptance BREW sequence; the brew adds the antidote to inventory,
// so the climax is the deliberate cure in the spire (bug_0057).
const WIN_ROUTE = [
  "go_west",
  "read_spellbook",
  "go_east",
  "go_east",
  "take_herb",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
  "unlock_cellar_door",
  "go_down",
  "take_water_vial",
  "go_up",
  "go_north",
  "use_herb_on_cauldron",
  "use_water_vial_on_cauldron",
  "go_up",
  "use_antidote_on_master",
];

describe("bug_0074 — a self-USE consume action carries its natural verb (command_verb)", () => {
  it("lists the phial as `use_black_phial` / 'drink black phial' (the prose's verb, not 'use')", () => {
    const s = play(initStateForParserPack(index, 1), TO_PHIAL);
    const actions = enumerateActions(index, s);
    const phial = actions.find(
      (a) =>
        a.action.type === "USE" &&
        a.action.item === "black_phial" &&
        a.action.target === "black_phial",
    );
    expect(phial).toBeDefined();
    expect(phial!.id).toBe("use_black_phial"); // id stays verb-agnostic
    expect(phial!.command).toBe("drink black phial");
    expect(actions.some((a) => a.command === "use black phial")).toBe(false);
    expect(actions.some((a) => a.command.includes("on black phial"))).toBe(false);
  });

  it("the parser accepts the natural verb ('drink black phial' and 'drink phial'), firing the death ending", () => {
    for (const cmd of ["drink black phial", "drink phial", "drink the phial"]) {
      const s = play(initStateForParserPack(index, 1), TO_PHIAL);
      const parsed = parseCommand(index, s, cmd);
      expect(parsed).toEqual({
        ok: true,
        action: { type: "USE", item: "black_phial", target: "black_phial" },
      });
      const r = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
      expect(r.ok).toBe(true);
      expect(r.state.ended).toBe(true);
      expect(r.state.endingId).toBe("ending_poisoned");
    }
  });

  it("backward compatible: the bare 'use black phial' still parses to the same self-USE", () => {
    const s = play(initStateForParserPack(index, 1), TO_PHIAL);
    expect(parseCommand(index, s, "use black phial")).toEqual({
      ok: true,
      action: { type: "USE", item: "black_phial", target: "black_phial" },
    });
  });

  it("a custom verb naming no such object / wrong object is still 'not understood'", () => {
    const s = play(initStateForParserPack(index, 1), TO_PHIAL);
    expect(parseCommand(index, s, "drink").ok).toBe(false); // no object
    expect(parseCommand(index, s, "drink herb").ok).toBe(false); // herb has no drink self-USE
  });

  it("the full win route is unaffected — still reaches ending_cured at full score (40/40 after bug_0104)", () => {
    const s = play(initStateForParserPack(index, 1), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_cured");
    expect(s.vars["score"]).toBe(alch.compiled.pack.meta.max_score);
    expect(s.vars["score"]).toBe(40);
  });

  describe("schema guards", () => {
    const base = {
      verb: "USE" as const,
      item: "x",
      target: "x",
      effects: [{ narrate: "y" }],
    };

    it("accepts command_verb on a self-USE (item === target)", () => {
      const r = InteractionSchema.safeParse({ ...base, command_verb: "drink" });
      expect(r.success).toBe(true);
    });

    it("an interaction without command_verb round-trips with it undefined (absent ⇒ hash-safe)", () => {
      const r = InteractionSchema.safeParse(base);
      expect(r.success).toBe(true);
      expect(r.success && r.data.command_verb).toBeUndefined();
    });

    it("accepts command_verb on an item-on-target USE (item !== target) — bug_0078 widening", () => {
      const r = InteractionSchema.safeParse({
        ...base,
        target: "well",
        command_verb: "tie",
        command_template: "tie {item} to {target}",
      });
      expect(r.success).toBe(true);
    });

    it("rejects a command_template that omits a placeholder, mis-leads the verb, or sits on a self-USE", () => {
      // missing {target}
      expect(
        InteractionSchema.safeParse({
          ...base,
          target: "well",
          command_verb: "tie",
          command_template: "tie {item} to it",
        }).success,
      ).toBe(false);
      // template's first word must equal command_verb
      expect(
        InteractionSchema.safeParse({
          ...base,
          target: "well",
          command_verb: "tie",
          command_template: "fasten {item} to {target}",
        }).success,
      ).toBe(false);
      // a template needs a command_verb
      expect(
        InteractionSchema.safeParse({
          ...base,
          target: "well",
          command_template: "tie {item} to {target}",
        }).success,
      ).toBe(false);
      // a self-USE (item === target) shows a single noun, so a two-noun template is invalid
      expect(
        InteractionSchema.safeParse({
          ...base,
          command_verb: "drink",
          command_template: "drink {item} from {target}",
        }).success,
      ).toBe(false);
    });

    it("rejects command_verb on a non-USE verb", () => {
      const r = InteractionSchema.safeParse({
        verb: "READ",
        target: "x",
        command_verb: "peruse",
        effects: [],
      });
      expect(r.success).toBe(false);
    });

    it("rejects a command_verb that shadows a builtin parser verb (e.g. 'open', 'use', 'take')", () => {
      for (const v of ["open", "use", "take", "read", "go", "look"]) {
        const r = InteractionSchema.safeParse({ ...base, command_verb: v });
        expect(r.success, `"${v}" must be rejected`).toBe(false);
      }
    });

    it("rejects a command_verb that is not a single lowercase word", () => {
      for (const v of ["Drink", "drink it", "drink-it", "drink2", ""]) {
        const r = InteractionSchema.safeParse({ ...base, command_verb: v });
        expect(r.success, `"${v}" must be rejected`).toBe(false);
      }
    });
  });
});
