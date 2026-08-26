/**
 * Regression for preparation-object state in wolf_winter. The jerkin remains a
 * takeable object whose room prose follows it; the rail starts as target-only scenery.
 * A failed wedge may bind its joined lengths into separate non-droppable guard gear,
 * which the flank-wolf consumes rather than leaving stale inventory behind.
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
import { resolveRpgAction } from "../../src/rpg/legal_actions.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const step = makeStep(buildRpgRules(index));

function actById(s: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const options = enumerateRpgActions(index, s);
  const opt = options.find((o) => o.id === id);
  if (!opt) {
    throw new Error(`"${id}" not legal in ${s.current}: [${options.map((o) => o.id).join(", ")}]`);
  }
  const result = step(s, opt.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    s = actById(s, id).state;
  }
  return s;
}

const desc = (s: GameState): string => buildRpgObservation(index, s).description;

const commands = (s: GameState): string[] => enumerateRpgActions(index, s).map((o) => o.command);

function narrations(events: GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join(" ");
}

function lookNarration(s: GameState): string {
  const res = resolveRpgAction(index, s, { type: "LOOK" });
  const effect = res?.effects[0];
  if (!effect || !("narrate" in effect)) throw new Error("LOOK produced no narration");
  return effect.narrate;
}

function expectCommittedLureFeedAvailable(s: GameState): void {
  expect(s.inventory).not.toContain("winter_feed_sack");
  expect(commands(s)).toContain("take Cade's winter-feed sack");
  expect(desc(s)).toContain("TAKE Cade's winter-feed sack");
  expect(desc(s)).toContain("only sack for LURE");
  expect(desc(s)).toContain("feed-hauler's crawlboard");
  expect(desc(s)).not.toContain("padded byre-jerkin hangs beside");
  expect(lookNarration(s)).toBe(desc(s));
}

function expectCommittedLureFeedHeld(s: GameState): void {
  expect(s.inventory).toContain("winter_feed_sack");
  expect(commands(s)).not.toContain("take Cade's winter-feed sack");
  expect(desc(s)).toContain("You carry Cade's winter-feed sack");
  expect(desc(s)).toContain("one LURE attempt past all three wolves");
  expect(desc(s)).toContain("second action");
  expect(desc(s)).not.toContain("padded byre-jerkin hangs beside");
  expect(lookNarration(s)).toBe(desc(s));
}

describe("wolf_winter rooms react to preparation object state", () => {
  it("removes the peg-hung jerkin prose after the byre-jerkin is taken", () => {
    let s = play(initStateForRpgPack(index, 83), ["go_north", "go_west"]);
    const taken = actById(s, "take_byre_jerkin");
    s = taken.state;

    expect(s.inventory).toContain("byre_jerkin");
    expect(s.flags["byre_jerkin_taken"]).toBe(true);
    expect(s.flags["jerkin_donned"]).toBeUndefined();
    expect(s.vars.defense).toBe(3);
    expect(s.vars.score ?? 0).toBe(0);
    expect(narrations(taken.events)).toContain("DON padded byre-jerkin only while offered");
    expect(narrations(taken.events)).toContain("carrying it gives no bonus");
    expect(commands(s)).toContain("don padded byre-jerkin");
    expect(commands(s)).not.toContain("drop padded byre-jerkin");
    expect(desc(s)).toContain("DON padded byre-jerkin only while that action is offered");
    expect(desc(s)).toContain("Carrying it gives no bonus");
    expect(desc(s)).not.toContain("TAKE the padded byre-jerkin from its peg");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("retires the carried-but-unworn jerkin warning after the byre-jerkin is donned", () => {
    let s = play(initStateForRpgPack(index, 83), ["go_north", "go_west", "take_byre_jerkin"]);
    const donned = actById(s, "use_byre_jerkin");
    s = donned.state;

    expect(s.flags["jerkin_donned"]).toBe(true);
    expect(s.vars.defense).toBe(5);
    expect(s.vars.score).toBe(5);
    expect(s.inventory).toContain("byre_jerkin");
    expect(commands(s)).not.toContain("don padded byre-jerkin");
    expect(commands(s)).not.toContain("drop padded byre-jerkin");
    expect(narrations(donned.events)).toContain("don the padded byre-jerkin");
    expect(narrations(donned.events)).not.toContain("off its peg");
    expect(desc(s)).toContain("You already took the padded byre-jerkin from its empty peg");
    expect(desc(s)).not.toContain("Carrying it does not add its defense bonus");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("keeps lure guidance when the jerkin was prepared before commitment", () => {
    let s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "go_west",
      "take_byre_jerkin",
      "use_byre_jerkin",
      "go_east",
      "talk_houndsman",
      "ask_lure",
      "ask_commit_lure",
      "ask_leave",
      "go_west",
    ]);

    expect(s.flags["strategy_lure_committed"]).toBe(true);
    expect(s.flags["jerkin_donned"]).toBe(true);
    expect(s.inventory).toContain("byre_jerkin");
    expect(s.vars.defense).toBe(5);
    expect(desc(s)).toContain("You are wearing the padded byre-jerkin");
    expectCommittedLureFeedAvailable(s);

    s = actById(s, "take_winter_feed_sack").state;
    expectCommittedLureFeedHeld(s);
  });

  it("keeps lure guidance when the jerkin is taken after commitment", () => {
    let s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "talk_houndsman",
      "ask_lure",
      "ask_commit_lure",
      "ask_leave",
      "go_west",
    ]);
    s = actById(s, "take_byre_jerkin").state;

    expect(s.flags["strategy_lure_committed"]).toBe(true);
    expect(s.flags["byre_jerkin_taken"]).toBe(true);
    expect(s.inventory).toContain("byre_jerkin");
    expect(s.vars.defense).toBe(3);
    expect(desc(s)).toContain("DON padded byre-jerkin before going to the Broken Paling");
    expectCommittedLureFeedAvailable(s);

    s = actById(s, "use_byre_jerkin").state;

    expect(s.flags["jerkin_donned"]).toBe(true);
    expect(s.inventory).toContain("byre_jerkin");
    expect(s.vars.defense).toBe(5);
    expect(desc(s)).toContain("You are wearing the padded byre-jerkin");
    expect(desc(s)).not.toContain("Carrying it does not add its defense bonus");
    expectCommittedLureFeedAvailable(s);

    s = actById(s, "take_winter_feed_sack").state;
    expectCommittedLureFeedHeld(s);
  });

  it("retires the committed-drive pickup instruction after Cade's rig is taken", () => {
    let s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "talk_houndsman",
      "ask_drive",
      "ask_commit_drive",
      "ask_leave",
    ]);
    s = actById(s, "take_drive_signal_rope_kit").state;

    expect(s.flags["strategy_drive_committed"]).toBe(true);
    expect(s.inventory).toContain("drive_signal_rope_kit");
    expect(s.vars.defense).toBe(3);
    expect(desc(s)).toContain("DRIVE is final");
    expect(desc(s)).toContain("Cade's two-charge signal-and-rope rig");
    expect(desc(s)).toContain("Go north");
    expect(desc(s)).toContain(
      "FIRE drive shutter signal WITH Cade's two-charge signal-and-rope rig",
    );
    expect(desc(s)).toContain("HUNT, LURE, and FORTIFY are closed");
    expect(desc(s)).not.toContain("TAKE Cade's two-charge signal-and-rope rig");
    expect(desc(s)).not.toContain("west");
    expect(lookNarration(s)).toBe(desc(s));
  });

  it("rejects a forced DROP after donning instead of retaining armor with no item", () => {
    const s = play(initStateForRpgPack(index, 83), [
      "go_north",
      "go_west",
      "take_byre_jerkin",
      "use_byre_jerkin",
    ]);
    const dropped = step(s, { type: "DROP", item: "byre_jerkin" });

    expect(dropped.ok).toBe(false);
    expect(dropped.state).toBe(s);
    expect(s.inventory).toContain("byre_jerkin");
    expect(s.flags["jerkin_donned"]).toBe(true);
    expect(s.vars.defense).toBe(5);
  });

  it("keeps the paling rail in-place and offers its target-only wedge, never TAKE/DROP", () => {
    const s = play(initStateForRpgPack(index, 83), ["go_north", "go_north"]);
    const ids = enumerateRpgActions(index, s).map((option) => option.id);
    const rail = loaded.compiled.pack.objects.find((object) => object.id === "paling_rail");

    expect(rail?.takeable).not.toBe(true);
    expect(s.inventory).not.toContain("paling_rail");
    expect(ids).toContain("wedge_paling_rail");
    expect(ids).not.toContain("take_paling_rail");
    expect(ids).not.toContain("drop_paling_rail");
    expect(desc(s)).toContain("SET the Albany relief spear against the yearling's rush");
    expect(lookNarration(s)).toBe(desc(s));
  });
});
