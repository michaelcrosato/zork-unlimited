/**
 * Regression (§15) for bug_0276 — The Sunken Barrow's doom ending (ending_woken)
 * carries a REACTIVE epilogue, so it no longer presumes the player heard the shade.
 *
 * A fresh source-blind MCP playtester (seeds 11 & 5,
 * ai-runs/2026-06-05T07-11-45-654Z/playtest.md §5) reached ending_woken — prising the
 * Barrow-Lord's sealed sarcophagus — on a run that SKIPPED the reaver's shade entirely
 * (straight north to the wight, never west to the cell) and flagged the old single
 * epilogue's closing line, "the shade's last counsel rings true after all," as a
 * non-sequitur: it presumes the shade's warning was heard, yet the doom fork is
 * reachable with `heard_lord_lore` UNSET (the shade is optional, bug_0075).
 *
 * This is the reactive-ending-blindness class (bug_0272/0275): a terminal reachable on
 * BOTH an informed and an uninformed path whose single text presumes the informed one.
 * The fix mirrors cold_forge's reactive epilogues (the bug_0275 parser/RPG ending-variant
 * surface): the base `text` drops the shade callback (reads true for a player who never
 * met the shade), and a `heard_lord_lore` variant keeps the callback for the player who
 * DID hear the warning and ignored it. Both paths stay reachable, same ending id,
 * prose-only. This test pins, against the real RPG runner + observation:
 *   - DOOM with heard_lord_lore (heard the shade's warning) → reframed epilogue
 *     ("the shade's last counsel rings true after all").
 *   - DOOM without it (shade skipped) → base epilogue ("some instinct older than
 *     reason"), and crucially NOT the shade callback.
 *   - both routes genuinely reach ending_woken (death) at 25/50 (the doom fork tops out
 *     incomplete, bug_0107), and the player-facing `description` carries the resolved text.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
} from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadRpgSourceFile("content/rpg/quests/sunken_barrow.yaml");
if (!loaded.ok) throw new Error("sunken_barrow must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

const options = (s: GameState) => enumerateRpgActions(index, s);
function act(s: GameState, pred: (a: Action) => boolean): GameState {
  const opt = options(s).find((o) => pred(o.action));
  if (!opt)
    throw new Error(
      `no action; legal=[${options(s)
        .map((o) => o.id)
        .join(", ")}] in ${s.current}`,
    );
  const r = step(s, opt.action);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error("step failed");
  return r.state;
}

const move = (dir: string) => (a: Action) =>
  a.type === "MOVE" && (a as { direction?: string }).direction === dir;
const isTakeBar = (a: Action) => a.type === "TAKE" && (a as { item?: string }).item === "iron_bar";
const isAttack = (a: Action) => a.type === "ATTACK";
const askTopic = (topic: string) => (a: Action) =>
  a.type === "ASK" && (a as { topic?: string }).topic === topic;
const useOn = (target: string) => (a: Action) =>
  a.type === "USE" && (a as { target?: string }).target === target;

/** From the entry hall (bar in hand), kill the wight, lever the slab, descend, and
 *  prise the sarcophagus — the doom fork. Returns the ended state at ending_woken. */
function doomFromEntryHall(s: GameState): GameState {
  s = act(s, move("north")); // → guard_crypt
  let guard = 0;
  while (!s.ended && !s.flags["wight_slain"]) {
    s = act(s, isAttack);
    if (++guard > 40) throw new Error("fight did not resolve");
  }
  expect(s.ended).toBe(false); // survived the wight on these seeds
  s = act(s, move("east")); // → slab_passage
  guard = 0;
  while (s.questStage["barrow"] !== "slab_moved" && !s.ended) {
    s = act(s, useOn("stone_slab")); // lever (might check; retry until it gives)
    if (++guard > 60) throw new Error("slab never moved");
  }
  s = act(s, move("down")); // → relic_chamber
  s = act(s, useOn("sarcophagus")); // prise → ending_woken
  expect(s.endingId).toBe("ending_woken");
  return s;
}

describe("bug_0276 — The Sunken Barrow's doom epilogue reframes on whether the shade was heard", () => {
  it("DOOM with heard_lord_lore (heard the shade's warning) → the reframed epilogue", () => {
    // seed 1: the warded route reliably survives the wight (bug_0113).
    let s = initStateForRpgPack(index, 1);
    s = act(s, move("down")); // → entry_hall
    s = act(s, isTakeBar);
    s = act(s, move("west")); // → reaver_rest
    s = act(s, (a) => a.type === "TALK");
    s = act(s, askTopic("ask_wight")); // +3 defense ward (so the wight is survivable)
    s = act(s, askTopic("wight_back"));
    s = act(s, askTopic("ask_lord")); // sets heard_lord_lore — the warning
    s = act(s, askTopic("lord_back"));
    s = act(s, askTopic("leave_shade"));
    s = act(s, move("east")); // → entry_hall
    s = doomFromEntryHall(s);
    expect(s.flags["heard_lord_lore"]).toBe(true);

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.id).toBe("ending_woken");
    expect(obs.ending!.text).toContain("the shade's last counsel rings true after all");
    expect(obs.ending!.text).not.toContain("some instinct older than reason");
    expect(obs.description).toContain("the shade's last counsel rings true after all");
  });

  it("DOOM without founder knowledge (shade skipped) → the base epilogue, no shade callback", () => {
    // seed 5: unbuffed, but the wight is survivable on this seed (the blind-pass route).
    let s = initStateForRpgPack(index, 5);
    s = act(s, move("down")); // → entry_hall
    s = act(s, isTakeBar); // never goes west — the shade is never met
    s = doomFromEntryHall(s);
    expect(s.flags["heard_lord_lore"]).toBeUndefined();

    const obs = buildRpgObservation(index, s);
    expect(obs.ending!.id).toBe("ending_woken");
    // The non-sequitur the playtester flagged must be GONE on the uninformed path.
    expect(obs.ending!.text).not.toContain("the shade's last counsel");
    expect(obs.ending!.text).toContain("some instinct older than reason");
    expect(obs.description).toContain("some instinct older than reason");
  });

  it("the doom fork is a death ending that tops out at 25/50 on both paths (bug_0107)", () => {
    let informed = initStateForRpgPack(index, 1);
    informed = act(informed, move("down"));
    informed = act(informed, isTakeBar);
    informed = act(informed, move("west"));
    informed = act(informed, (a) => a.type === "TALK");
    informed = act(informed, askTopic("ask_wight"));
    informed = act(informed, askTopic("wight_back"));
    informed = act(informed, askTopic("ask_lord"));
    informed = act(informed, askTopic("lord_back"));
    informed = act(informed, askTopic("leave_shade"));
    informed = act(informed, move("east"));
    informed = doomFromEntryHall(informed);

    let blind = initStateForRpgPack(index, 5);
    blind = act(blind, move("down"));
    blind = act(blind, isTakeBar);
    blind = doomFromEntryHall(blind);

    for (const s of [informed, blind]) {
      const obs = buildRpgObservation(index, s);
      expect(obs.ending!.death).toBe(true);
      expect(s.vars.score).toBe(25); // never took the crown → incomplete
    }
  });
});
