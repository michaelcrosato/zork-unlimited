/**
 * Regression (§15) for bug_0077 — the Sealed Crypt presented TWO different verbs for
 * the same conceptual act of unlocking a key+lock, and the engine's first-class UNLOCK
 * could not carry the score + narration a climactic unlock needs.
 *
 * Two independent blind MCP playtesters of this pack (seeds 29, 61) flagged it: the
 * Bottom-of-the-Well oak chest is opened with the engine's first-class `UNLOCK <obj>
 * with <key>` verb (driven by `key_id`), while the structurally identical catacombs
 * gate — one room earlier in the player's mind — was opened by a hand-authored
 * `USE iron key on crypt gate` interaction. The seed-61 report ranked it the pack's #1
 * flaw: "made more glaring because the very same game demonstrates the correct UNLOCK
 * grammar one room earlier," and the gate's prose ("its lock shaped for a heavy key")
 * primes UNLOCK, not USE.
 *
 * The reason the gate could NOT already use first-class UNLOCK is that the engine's
 * UNLOCK awarded no score and narrated only "You unlock the X." — but this unlock is
 * the climax: +20 points and a dramatic line. So it had to fall back to a bespoke USE.
 * That same gap is the root cause of the recurring bug_0073-class split. The fix
 * (bug_0077) teaches the engine's first-class UNLOCK to carry optional `unlock_narrate`
 * + `unlock_effects` on a keyed object, then re-models the gate onto it — so both locks
 * now read through the SAME `unlock <obj> with <key>` grammar while the gate keeps its
 * dramatic narration and opened exit. bug_0385 later moved the +20 capstone from the
 * gate unlock onto the sealed relic claim. The unlock-effect feature is opt-in: an
 * object that declares neither field resolves byte-identically to before.
 *
 * Locked here:
 *   (1) the gate is opened by the engine UNLOCK action (id `unlock_crypt_gate`, type
 *       UNLOCK, command "unlock iron catacombs gate with iron key") — NOT a USE
 *       interaction; the old bespoke `use_iron_key_on_crypt_gate` action is gone;
 *   (2) BOTH locks (oak chest + catacombs gate) expose the same "unlock … with …"
 *       grammar and UNLOCK action type — the consistency guarantee;
 *   (3) the typed natural command the prose primes parses to the same UNLOCK action;
 *   (4) unlocking the gate fires its unlock_effects: set_flag catacombs_open, opens the
 *       north exit, AND narrates the custom dramatic line (not the default);
 *   (5) one-shot: after unlocking, the unlock action leaves the legal set (the lock is
 *       sprung, so it can't re-fire and can't be farmed for points);
 *   (6) the game still wins (ending_victory) at 35/35 through the new unlock path;
 *   (7) the engine feature is OPT-IN: the oak chest (no unlock_narrate/unlock_effects)
 *       still resolves to exactly [set_object_locked, default "You unlock …"] — proof
 *       that packs not using the feature are byte-identical;
 *   (8) the schema rejects unlock_narrate/unlock_effects on an object with no key_id.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { ObjectSchema } from "../../src/parser/schema.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
if (!loaded.ok) throw new Error("sealed_crypt must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));
const MAX = loaded.compiled.pack.meta.max_score;

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

const score = (s: GameState): number => buildParserObservation(index, s).score;

// Reach the crypt holding the iron key, gate still locked.
const TO_CRYPT_WITH_IRON_KEY = [
  "go_north", // chapel_yard
  "go_west", // graveyard
  "read_headstone", // +5
  "go_north", // mausoleum
  "open_stone_coffer",
  "take_brass_key",
  "go_south", // graveyard
  "go_east", // chapel_yard
  "go_up", // bell_tower
  "take_rope",
  "go_down", // chapel_yard
  "go_east", // old_well
  "use_rope_on_old_well", // +10
  "go_down", // well_bottom
  "unlock_oak_chest",
  "open_oak_chest",
  "take_iron_key",
  "go_up", // old_well
  "go_west", // chapel_yard
  "go_north", // chapel_nave
  "go_down", // crypt
];

describe("bug_0077 — the catacombs gate and the oak chest share one unlock grammar", () => {
  it("opens the gate with the engine UNLOCK verb, not a bespoke USE interaction", () => {
    const s = play(initStateForParserPack(index, 61), TO_CRYPT_WITH_IRON_KEY);
    expect(s.current).toBe("crypt");

    const actions = enumerateActions(index, s);
    const unlockGate = actions.find((a) => a.id === "unlock_crypt_gate");
    expect(unlockGate, "the gate must expose the engine unlock action").toBeDefined();
    expect(unlockGate!.action.type).toBe("UNLOCK");
    expect(unlockGate!.command).toBe("unlock iron catacombs gate with iron key");

    // The old hand-authored grammar is gone.
    expect(actions.find((a) => a.id === "use_iron_key_on_crypt_gate")).toBeUndefined();
  });

  it("both the oak chest and the catacombs gate use the same UNLOCK grammar", () => {
    // Bottom of the well, holding the brass key: the chest offers the unlock verb.
    const atWell = play(initStateForParserPack(index, 61), [
      "go_north",
      "go_west",
      "go_north",
      "open_stone_coffer",
      "take_brass_key",
      "go_south",
      "go_east",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
      "use_rope_on_old_well",
      "go_down",
    ]);
    const unlockChest = enumerateActions(index, atWell).find((a) => a.id === "unlock_oak_chest");
    expect(unlockChest).toBeDefined();

    const atCrypt = play(initStateForParserPack(index, 61), TO_CRYPT_WITH_IRON_KEY);
    const unlockGate = enumerateActions(index, atCrypt).find((a) => a.id === "unlock_crypt_gate");
    expect(unlockGate).toBeDefined();

    // Same action type and same "unlock <obj> with <key>" command shape.
    expect(unlockChest!.action.type).toBe("UNLOCK");
    expect(unlockGate!.action.type).toBe("UNLOCK");
    const grammar = /^unlock .+ with .+$/;
    expect(unlockChest!.command).toMatch(grammar);
    expect(unlockGate!.command).toMatch(grammar);
  });

  it("the natural typed command the prose primes parses to the gate UNLOCK", () => {
    const s = play(initStateForParserPack(index, 61), TO_CRYPT_WITH_IRON_KEY);
    const pr = parseCommand(index, s, "unlock iron catacombs gate with iron key");
    expect(pr.ok).toBe(true);
    expect(pr.ok && pr.action).toEqual({ type: "UNLOCK", target: "crypt_gate", with: "iron_key" });
  });

  it("unlocking the gate sets the flag, opens north, and narrates the custom line without awarding the relic capstone", () => {
    const s = play(initStateForParserPack(index, 61), TO_CRYPT_WITH_IRON_KEY);
    expect(score(s)).toBe(15); // headstone +5, rope +10

    // Inspect the resolution directly: custom narration + the climax effects.
    const res = resolveParserAction(index, s, {
      type: "UNLOCK",
      target: "crypt_gate",
      with: "iron_key",
    });
    expect(res).not.toBeNull();
    const narr = res!.effects.find((e) => "narrate" in e) as { narrate: string };
    expect(narr.narrate).toContain("The iron key turns with a groan");
    expect(narr.narrate).not.toBe("You unlock the iron catacombs gate."); // NOT the default
    expect(res!.effects.some((e) => "set_flag" in e && e.set_flag === "catacombs_open")).toBe(true);
    expect(res!.effects.some((e) => "inc_var" in e && e.inc_var.name === "score")).toBe(false);

    // Pre-unlock the north exit is closed; post-unlock it opens.
    expect(enumerateActions(index, s).find((a) => a.id === "go_north")).toBeUndefined();
    const after = play(s, ["unlock_crypt_gate"]);
    expect(score(after)).toBe(15);
    expect(after.flags["catacombs_open"]).toBe(true);
    expect(after.objectState["crypt_gate"]?.locked).toBe(false);
    expect(enumerateActions(index, after).find((a) => a.id === "go_north")).toBeDefined();
  });

  it("is one-shot: once sprung the unlock action leaves the legal set (no point-farming)", () => {
    let s = play(initStateForParserPack(index, 61), TO_CRYPT_WITH_IRON_KEY);
    s = play(s, ["unlock_crypt_gate"]);
    expect(enumerateActions(index, s).find((a) => a.id === "unlock_crypt_gate")).toBeUndefined();
    // Re-resolving the action is structurally impossible (lock already sprung).
    expect(
      resolveParserAction(index, s, { type: "UNLOCK", target: "crypt_gate", with: "iron_key" }),
    ).toBeNull();
  });

  it("still completes the game (ending_victory) at 35/35 through the new unlock path", () => {
    const s = play(initStateForParserPack(index, 61), [
      ...TO_CRYPT_WITH_IRON_KEY,
      "unlock_crypt_gate",
      "go_north",
      "take_sealed_relic",
    ]);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_victory");
    expect(score(s)).toBe(MAX);
  });

  it("the engine feature is opt-in: the oak chest (no unlock content) keeps the default unlock", () => {
    const atWell = play(initStateForParserPack(index, 61), [
      "go_north",
      "go_west",
      "go_north",
      "open_stone_coffer",
      "take_brass_key",
      "go_south",
      "go_east",
      "go_up",
      "take_rope",
      "go_down",
      "go_east",
      "use_rope_on_old_well",
      "go_down",
    ]);
    const res = resolveParserAction(index, atWell, {
      type: "UNLOCK",
      target: "oak_chest",
      with: "brass_key",
    });
    expect(res).not.toBeNull();
    // Exactly the two default effects, in order — proof the feature changes nothing
    // for packs that don't declare it.
    expect(res!.effects).toEqual([
      { set_object_locked: { id: "oak_chest", locked: false } },
      { narrate: "You unlock the oak chest." },
    ]);
  });

  it("schema rejects unlock_narrate/unlock_effects on an object with no key_id", () => {
    const bad = ObjectSchema.safeParse({
      id: "x",
      name: "x",
      description: "x",
      unlock_effects: [{ set_flag: "y" }],
    });
    expect(bad.success).toBe(false);

    const ok = ObjectSchema.safeParse({
      id: "x",
      name: "x",
      description: "x",
      locked: true,
      key_id: "k",
      unlock_narrate: "It opens.",
      unlock_effects: [{ set_flag: "y" }],
    });
    expect(ok.success).toBe(true);
  });
});
