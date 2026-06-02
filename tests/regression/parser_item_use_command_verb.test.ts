/**
 * Regression (§15) for bug_0078 — an item-on-target USE puzzle carries its natural
 * verb + phrasing (command_verb + command_template), generalizing bug_0074's self-USE
 * command_verb to the tool-on-thing pattern.
 *
 * bug_0074 let a self-USE declare a natural verb ("drink black phial" instead of the
 * generic "use black phial"), but an item-on-target USE — tie the rope to the well,
 * lever the slab with the bar, lever the slag grate with the pry-bar — still rendered
 * as the generic "use <item> on <target>". A fresh, MCP-only blind playtester of The
 * Sunken Barrow (seed 7, ai-runs/2026-06-01T20-42-17-154Z/playtest.md) flagged exactly
 * this at the Slab Passage: the prose "insistently primes 'lever' ... but the offered
 * command reads 'use iron bar on stone slab'." The same gap sat in sealed_crypt (the
 * well primes "tie") and cold_forge (the grate primes "lever").
 *
 * The fix is a generic engine feature: an item-on-target USE may declare a
 * `command_verb` plus a `command_template` ("tie {item} to {target}", "lever {target}
 * with {item}") so the offered command — and the command the controlled parser
 * accepts — matches the verb AND the word order/preposition the prose primes. The
 * action id is UNCHANGED (`use_<item>_on_<target>`), so every existing route/test that
 * drives the action by id is untouched; the generic "use <item> on <target>" still
 * parses; the parser resolves the two nouns order-independently (template is display
 * only) and also accepts the tool-less single-noun form ("lever slab").
 *
 * Locked here, per pack: the displayed command, the verb-agnostic id, several natural
 * phrasings parsing to the right USE, the generic "use" still parsing (backward compat),
 * a wrong-verb rejection, and — crucially — that executing the NATURAL command actually
 * performs the interaction (drives the same state change as the id-driven action).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";
import type { GameState } from "../../src/core/state.js";

// ── The Sealed Crypt (parser): the well primes "tie". ────────────────────────────
describe("bug_0078 — sealed_crypt: 'tie rope to old well' (item-on-target command_verb)", () => {
  const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
  if (!loaded.ok) throw new Error("sealed_crypt must compile");
  const index = indexParserPack(loaded.compiled.pack);
  const step = makeStep(buildParserRules(index));

  // Route to the Old Well holding the rope (one step from tying it off).
  const TO_WELL = [
    "go_north",
    "go_up",
    "take_rope",
    "go_down",
    "go_west",
    "read_headstone",
    "go_north",
    "open_stone_coffer",
    "take_brass_key",
    "go_south",
    "go_east",
    "go_east",
  ];
  function atWell(): GameState {
    let s = initStateForParserPack(index, 1);
    for (const id of TO_WELL) {
      const opt = enumerateActions(index, s).find((o) => o.id === id);
      if (!opt) throw new Error(`"${id}" not legal in ${s.current}`);
      s = step(s, opt.action).state;
    }
    expect(s.current).toBe("old_well");
    expect(s.inventory).toContain("rope");
    return s;
  }

  it("offers the command 'tie coil of rope to old well' with the verb-agnostic id", () => {
    const s = atWell();
    const tie = enumerateActions(index, s).find(
      (a) => a.action.type === "USE" && a.action.item === "rope" && a.action.target === "old_well",
    );
    expect(tie).toBeDefined();
    expect(tie!.id).toBe("use_rope_on_old_well"); // id unchanged — routes/tests by id intact
    expect(tie!.command).toBe("tie coil of rope to old well");
    // The generic "use rope on ..." wording is no longer the offered string.
    expect(
      enumerateActions(index, s).some((a) => a.command === "use coil of rope on old well"),
    ).toBe(false);
  });

  it("the parser accepts the natural phrasings AND the generic 'use rope on old well'", () => {
    const s = atWell();
    const want = { type: "USE", item: "rope", target: "old_well" };
    for (const cmd of [
      "tie rope to old well",
      "tie rope to well",
      "tie coil to well",
      "use rope on old well", // backward compatible
    ]) {
      expect(parseCommand(index, s, cmd), cmd).toEqual({ ok: true, action: want });
    }
    // A verb that is NOT this interaction's command_verb is still not understood.
    expect(parseCommand(index, s, "lever rope to well").ok).toBe(false);
  });

  it("executing the NATURAL command ties the rope off (spends it, +10, opens the descent)", () => {
    const s = atWell();
    const parsed = parseCommand(index, s, "tie rope to well");
    expect(parsed.ok).toBe(true);
    const r = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(r.ok).toBe(true);
    expect(r.state.flags["rope_attached_to_well"]).toBe(true);
    expect(r.state.inventory).not.toContain("rope"); // spent, per bug_0034
    expect(r.state.vars["score"]).toBe(15); // +5 headstone +10 well
    expect(enumerateActions(index, r.state).some((o) => o.id === "go_down")).toBe(true);
  });
});

// ── The Sunken Barrow (RPG): the slab primes "lever". ────────────────────────────
describe("bug_0078 — sunken_barrow: 'lever stone slab with iron bar'", () => {
  const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
  if (!loaded.ok) throw new Error("sunken_barrow must compile");
  const index = indexRpgPack(loaded.compiled.pack);
  const step = makeStep(buildRpgRules(index));

  /** Reach the slab passage (bar in hand, wight slain, slab not moved) at seed 1. */
  function atSlab(): GameState {
    let s = initStateForRpgPack(index, 1);
    for (const a of [
      { type: "MOVE", direction: "down" },
      { type: "TAKE", item: "iron_bar" },
      { type: "MOVE", direction: "north" },
    ] as Action[]) {
      s = step(s, a).state;
    }
    for (let i = 0; i < 40 && !s.ended && !s.flags["wight_slain"]; i++) {
      s = step(s, { type: "ATTACK", enemy: "barrow_wight" }).state;
    }
    s = step(s, { type: "MOVE", direction: "east" }).state;
    expect(s.current).toBe("slab_passage");
    expect(s.questStage["barrow"]).not.toBe("slab_moved");
    return s;
  }

  it("offers 'lever stone slab with iron bar' with the verb-agnostic id", () => {
    const s = atSlab();
    const lever = enumerateRpgActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "iron_bar" && a.action.target === "stone_slab",
    );
    expect(lever).toBeDefined();
    expect(lever!.id).toBe("use_iron_bar_on_stone_slab");
    expect(lever!.command).toBe("lever stone slab with iron bar");
  });

  it("the parser accepts the natural phrasings (incl. tool-less) AND the generic 'use'", () => {
    const s = atSlab();
    const want = { type: "USE", item: "iron_bar", target: "stone_slab" };
    for (const cmd of [
      "lever stone slab with iron bar",
      "lever slab with bar",
      "lever slab", // tool-less single noun → the unique 'lever' interaction
      "use iron bar on stone slab", // backward compatible
    ]) {
      expect(parseCommand(index, s, cmd), cmd).toEqual({ ok: true, action: want });
    }
    // "tie" is not the slab's command_verb.
    expect(parseCommand(index, s, "tie slab with bar").ok).toBe(false);
  });

  it("executing the NATURAL command levers the slab (seed 1 success → slab_moved)", () => {
    const s = atSlab();
    const parsed = parseCommand(index, s, "lever slab with bar");
    expect(parsed.ok).toBe(true);
    const r = step(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(r.ok).toBe(true);
    expect(r.state.questStage["barrow"]).toBe("slab_moved");
  });
});

// ── The Cold Forge (RPG): the slag grate primes "lever". ─────────────────────────
describe("bug_0078 — cold_forge: 'lever slag grate with iron pry-bar'", () => {
  const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
  if (!loaded.ok) throw new Error("cold_forge must compile");
  const index = indexRpgPack(loaded.compiled.pack);
  const step = makeStep(buildRpgRules(index));

  /** Reach the forge heart (pry-bar in hand, sentinel slain, grate not levered).
   *  Takes the lantern-spirit's +2-attack counsel first: since bug_0101 retuned the
   *  sentinel for real teeth, an under-armed thief dies on seed 1, so the buffed
   *  route is how a player reliably reaches the grate. This describe-block's concern
   *  is the grate's "lever" command verb, not the fight. */
  function atGrate(): GameState {
    let s = initStateForRpgPack(index, 1);
    s = step(s, { type: "MOVE", direction: "down" }).state;
    s = step(s, { type: "TAKE", item: "pry_bar" }).state;
    s = step(s, { type: "TALK", npc: "lantern_spirit" }).state;
    s = step(s, { type: "ASK", npc: "lantern_spirit", topic: "ask_sentinel" }).state; // +2 attack
    s = step(s, { type: "ASK", npc: "lantern_spirit", topic: "sentinel_back" }).state;
    s = step(s, { type: "ASK", npc: "lantern_spirit", topic: "leave_spirit" }).state;
    s = step(s, { type: "MOVE", direction: "north" }).state;
    for (let i = 0; i < 40 && !s.ended && !s.flags["sentinel_stilled"]; i++) {
      s = step(s, { type: "ATTACK", enemy: "slag_sentinel" }).state;
    }
    s = step(s, { type: "MOVE", direction: "east" }).state;
    expect(s.current).toBe("forge_heart");
    expect(s.questStage["forge"]).not.toBe("grate_open");
    return s;
  }

  it("offers 'lever slag grate with iron pry-bar' with the verb-agnostic id", () => {
    const s = atGrate();
    const lever = enumerateRpgActions(index, s).find(
      (a) =>
        a.action.type === "USE" && a.action.item === "pry_bar" && a.action.target === "stone_grate",
    );
    expect(lever).toBeDefined();
    expect(lever!.id).toBe("use_pry_bar_on_stone_grate");
    expect(lever!.command).toBe("lever slag grate with iron pry-bar");
  });

  it("the parser accepts the natural phrasings (incl. tool-less) AND the generic 'use'", () => {
    const s = atGrate();
    const want = { type: "USE", item: "pry_bar", target: "stone_grate" };
    for (const cmd of [
      "lever slag grate with iron pry-bar",
      "lever grate with bar",
      "lever grate", // tool-less single noun
      "use iron pry-bar on slag grate", // backward compatible
    ]) {
      expect(parseCommand(index, s, cmd), cmd).toEqual({ ok: true, action: want });
    }
    expect(parseCommand(index, s, "tie grate with bar").ok).toBe(false);
  });

  it("executing the NATURAL command levers the grate (seed 1 success → grate_open)", () => {
    let s = atGrate();
    // seed 1 levers on the first heave (per bug_0048's canonical route), but guard a
    // failure-then-retry in case the seed shifts: re-issue the same natural command.
    for (let i = 0; i < 5 && s.questStage["forge"] !== "grate_open"; i++) {
      const parsed = parseCommand(index, s, "lever grate with bar");
      expect(parsed.ok).toBe(true);
      s = step(s, parsed.ok ? parsed.action : { type: "LOOK" }).state;
    }
    expect(s.questStage["forge"]).toBe("grate_open");
  });
});
