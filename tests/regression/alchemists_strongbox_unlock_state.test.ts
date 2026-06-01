/**
 * Regression (§15) for bug_0033 — the Cluttered Study (and the strongbox on examine)
 * no longer reads "A LOCKED iron strongbox" in the unlocked-but-not-yet-emptied window.
 *
 * A blind MCP playtester of The Alchemist's Tower (seed 51,
 * ai-runs/2026-06-01T10-45-49-483Z/playtest.md, report §5.1) hit the only on-screen
 * defect in the pack: immediately after "You unlock the iron strongbox," the ROOM still
 * read "A locked iron strongbox sits on the desk" — the text only corrected itself once
 * the iron key was TAKEN.
 *
 * ROOT CAUSE (architectural, called out by name in bug_0024): the reactive-`variants`
 * system runs on the PURE condition DSL (src/core/conditions.ts), which had NO predicate
 * for a container's runtime open/locked state. So every prior reactive fix (bug_0012 room,
 * bug_0023/0024 object examine) used a `has_item iron_key` PROXY that only flips once the
 * box is EMPTIED, leaving the lockbox lifecycle locked → unlocked → opened → emptied with
 * a stale "locked" middle.
 *
 * THE FIX (generic ENGINE capability + content opt-in):
 *   - conditions.ts gains two pure runtime object-state predicates, `is_open` and
 *     `is_unlocked`, reading GameState.objectState[id].open / .locked (default false).
 *   - alchemists_tower's study room adds an `is_unlocked: strongbox` variant (lock-
 *     focused: "sits unlocked … brass lock sprung"), and the strongbox examine adds
 *     `is_open` (opened, key still inside) and `is_unlocked` (unlocked, lid shut)
 *     variants. First-match-wins keeps the emptied (has_item iron_key) variant primary.
 *   - Variant-only change: no flag/item/score/exit/interaction/gating/reachable-ending
 *     change; the validator never analyzes variant `when` clauses.
 *
 * Locked here:
 *   (1) the ROOM tracks the full lifecycle — base "locked" before unlock, "sits unlocked"
 *       after the brass key throws the lock (key still inside), "open and empty" after the
 *       key is taken — and NEVER reads "locked iron strongbox" once the lock is sprung;
 *   (2) the EXAMINE tracks the same lifecycle (base → unlocked-closed → open-with-key →
 *       emptied), never reading "with a brass lock" once unlocked;
 *   (3) the new predicates are inert until their effect fires (a fresh box reads as base);
 *   (4) reachability/score unchanged: the canonical brew route still reaches ending_cured
 *       at full score (variant-only).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { roomDescription } from "../../src/parser/model.js";
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

/** The room body text the player actually sees (the observation builder uses the same
 *  pure roomDescription helper as the LOOK action). */
function roomText(s: GameState): string {
  return roomDescription(index.rooms.get(s.current)!, s);
}

/** The narrate text an `examine <target>` (LOOK target) emits in this state. */
function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

describe("bug_0033 — the Study/strongbox stop reading 'locked' once the lock is sprung", () => {
  it("the ROOM tracks locked → unlocked → emptied and never re-asserts 'locked' once sprung", () => {
    let s = play(initStateForParserPack(index, 51), [
      "go_east",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
    ]);
    expect(s.current).toBe("study");

    // Locked & untouched: base text names a LOCKED box.
    expect(roomText(s)).toContain("locked iron strongbox");

    // Unlock it — the very moment the blind playtester saw "locked" wrongly persist.
    s = play(s, ["unlock_strongbox"]);
    expect(s.objectState["strongbox"]?.locked).toBe(false);
    expect(s.inventory).not.toContain("iron_key");
    const unlocked = roomText(s);
    expect(unlocked).toContain("sits unlocked");
    expect(unlocked).not.toContain("locked iron strongbox");

    // Open it (key still inside): still not "locked".
    s = play(s, ["open_strongbox"]);
    expect(s.inventory).not.toContain("iron_key");
    expect(roomText(s)).not.toContain("locked iron strongbox");

    // Take the key: the emptied variant (has_item iron_key) takes precedence.
    s = play(s, ["take_iron_key"]);
    const emptied = roomText(s);
    expect(emptied).toContain("open and empty");
    expect(emptied).not.toContain("locked iron strongbox");
  });

  it("the EXAMINE tracks the same lifecycle and never reads 'with a brass lock' once unlocked", () => {
    let s = play(initStateForParserPack(index, 51), [
      "go_east",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
    ]);

    // Base: a brass-locked box.
    expect(examineNarration(s, "strongbox")).toBe("A squat iron strongbox with a brass lock.");

    // Unlocked, lid still shut.
    s = play(s, ["unlock_strongbox"]);
    const exUnlocked = examineNarration(s, "strongbox");
    expect(exUnlocked).toContain("hangs sprung");
    expect(exUnlocked).not.toContain("with a brass lock");

    // Opened, key still inside.
    s = play(s, ["open_strongbox"]);
    const exOpen = examineNarration(s, "strongbox");
    expect(exOpen).toContain("stands open");
    expect(exOpen).toContain("key still rests");
    expect(exOpen).not.toContain("with a brass lock");

    // Emptied.
    s = play(s, ["take_iron_key"]);
    const exEmpty = examineNarration(s, "strongbox");
    expect(exEmpty).toContain("open and empty");
    expect(exEmpty).not.toContain("with a brass lock");
  });

  it("the predicates are inert until their effect fires (a fresh strongbox reads as base)", () => {
    const s = play(initStateForParserPack(index, 51), [
      "go_east",
      "take_brass_key",
      "go_west",
      "go_north",
      "go_up",
    ]);
    // No objectState override yet ⇒ is_open / is_unlocked both false ⇒ base prose.
    expect(s.objectState["strongbox"]).toBeUndefined();
    expect(roomText(s)).toContain("locked iron strongbox");
    expect(examineNarration(s, "strongbox")).toBe("A squat iron strongbox with a brass lock.");
  });

  it("reachability/score unchanged: the canonical brew route still reaches ending_cured at full score", () => {
    const won = play(initStateForParserPack(index, 1), [
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
      "use_iron_key_on_cellar_door",
      "go_down",
      "take_water_vial",
      "go_up",
      "go_north",
      "use_herb_on_cauldron",
      "use_water_vial_on_cauldron",
      "go_up",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, won).score).toBe(alch.compiled.pack.meta.max_score);
  });
});
