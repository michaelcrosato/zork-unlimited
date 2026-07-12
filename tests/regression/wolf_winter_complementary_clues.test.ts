/**
 * Regression for bug_0504: Wolf-Winter's day-book and Cade once repeated a complete
 * answer key, while Cade's two topics presented the leader's close and wait openings as
 * contradictory instructions. The sources now have distinct jobs: the book records
 * evidence, and Cade labels a quick/open line versus a guarded/patient alternative.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { activeDialogue } from "../../src/rpg/model.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));
const cade = pack.npcs.find((npc) => npc.id === "houndsman");
const node = (id: string) => cade?.dialogue.nodes.find((entry) => entry.id === id);

function takeAction(state: GameState, id: string) {
  const actions = enumerateRpgActions(index, state);
  const chosen = actions.find((action) => action.id === id);
  expect(
    chosen,
    `expected ${id} in ${state.current}; available: ${actions.map((action) => action.id).join(", ")}`,
  ).toBeDefined();
  if (!chosen) throw new Error(`missing ${id}`);
  const result = step(state, chosen.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`rejected ${id}`);
  return result;
}

function act(state: GameState, id: string): GameState {
  return takeAction(state, id).state;
}

function narration(events: ReturnType<typeof takeAction>["events"]): string {
  return events.flatMap((event) => (event.type === "narration" ? [event.text] : [])).join(" ");
}

describe("bug_0504 — Wolf-Winter clues are complementary rather than contradictory", () => {
  it("uses the day-book for reconnaissance and prep evidence, not combat commands", () => {
    const book = pack.objects.find((object) => object.id === "day_book")?.read_text ?? "";

    expect(book).toMatch(/THREE AT THE PALING[^]*OLD GREY LEADS/i);
    expect(book).toMatch(/spear ALREADY/i);
    expect(book).toMatch(/Cade's knack[^]*byre-JERKIN[^]*watchman standing/i);
    expect(book).toMatch(/trusted spear alone[^]*bled/i);
    expect(book).toMatch(/Heed Cade[^]*don the JERKIN[^]*both[^]*less[^]*gamble/i);
    expect(book).not.toMatch(/old eyes/i);
    expect(book).not.toMatch(/no wolf[^]*pull you down/i);
    expect(book).not.toMatch(/\bset\b[^]*\bdrive\b|\bwheel\b[^]*\bturn\b/i);
    expect(book).not.toMatch(/\b(?:close|wait)\b[^]*\b(?:feint|rush)\b/i);
  });

  it("labels Cade's two topics as quick/open and guarded/patient alternatives", () => {
    const root = node("cade_root");
    const quick = node("cade_wolves")?.npc_text ?? "";
    const guarded = node("cade_byre")?.npc_text ?? "";

    expect(root?.npc_text).toMatch(/quick spear-hand[^]*guarded byre plan[^]*two roads/i);
    expect(root?.topics.find((topic) => topic.id === "wolves")?.prompt).toMatch(
      /quick spear-hand/i,
    );
    expect(root?.topics.find((topic) => topic.id === "byre")?.prompt).toMatch(/guarded byre plan/i);

    expect(quick).toMatch(/Quick lines[^]*set[^]*drive[^]*wheel[^]*turn/i);
    expect(quick).toMatch(/close[^]*fast[^]*guard opens[^]*drive/i);
    expect(quick).toMatch(/jerkin[^]*both[^]*no wolf[^]*pull you down/i);
    expect(quick).not.toMatch(/wait[^]*true rush|wedge[^]*rail/i);

    expect(guarded).toMatch(/Guarded lines[^]*rail[^]*wedge[^]*guarded funnel/i);
    expect(guarded).toMatch(/splits[^]*bind/i);
    expect(guarded).toMatch(/wait[^]*true rush[^]*patient alternative[^]*closing early/i);
    expect(guarded).not.toMatch(/\bset\b[^]*\bdrive\b|\bwheel\b[^]*\bturn\b/i);
  });

  it("preserves both roles in the actual dialogue surface and compact journal memory", () => {
    let state = initStateForRpgPack(index, 930014);
    state = act(state, "go_north");
    state = act(state, "talk_houndsman");
    const quick = takeAction(state, "ask_wolves");
    state = quick.state;
    expect(narration(quick.events)).toMatch(/Quick lines/i);
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    const quickObservation = buildRpgObservation(index, state);
    expect(quickObservation.dialogue?.npc_text).toMatch(/Ask what else you need/i);
    expect(quickObservation.available_actions.map((action) => action.id)).toEqual(
      expect.arrayContaining(["ask_byre", "ask_leave"]),
    );
    expect(quickObservation.available_actions.map((action) => action.id)).not.toContain(
      "ask_wolves_back",
    );
    expect(state.journal.some((entry) => /quick\/open line/i.test(entry))).toBe(true);

    const guarded = takeAction(state, "ask_byre");
    state = guarded.state;
    expect(narration(guarded.events)).toMatch(/Guarded lines[^]*patient alternative/i);
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    const guardedObservation = buildRpgObservation(index, state);
    expect(guardedObservation.dialogue?.npc_text).toMatch(/Ask what else you need/i);
    expect(guardedObservation.available_actions.map((action) => action.id)).toContain("ask_leave");
    expect(guardedObservation.available_actions.map((action) => action.id)).not.toContain(
      "ask_byre_back",
    );
    expect(state.journal.some((entry) => /guarded\/patient/i.test(entry))).toBe(true);
    expect(state.flags).toMatchObject({ heard_counsel: true, heard_plan: true });
  });

  it("matches the labels to the leader's real attack-versus-guard tradeoff", () => {
    const leader = pack.enemies.find((enemy) => enemy.id === "grey_leader");
    const wait = leader?.maneuvers?.find((maneuver) => maneuver.id === "wait_out_feint");
    const close = leader?.maneuvers?.find((maneuver) => maneuver.id === "close_on_feint");

    expect(wait).toMatchObject({ attack_bonus: 0, defense_bonus: 3 });
    expect(close).toMatchObject({ attack_bonus: 4, defense_bonus: -3 });
    expect(node("cade_byre")?.npc_text).toMatch(/guarded[^]*patient/i);
    expect(node("cade_wolves")?.npc_text).toMatch(/quick[^]*fast[^]*guard opens/i);
  });

  it("names the opening threat as a young wolf before 'yearling' can read as cattle", () => {
    const yard = pack.rooms.find((room) => room.id === "byre_yard");
    const readTally = yard?.variants?.find((variant) => /last wolf-count/i.test(variant.text));
    const gap = pack.rooms.find((room) => room.id === "paling_gap");

    for (const text of [yard?.description, readTally?.text, gap?.description]) {
      expect(text).toMatch(/young wolf/i);
      expect(text).not.toMatch(/\byearling\b/i);
    }
  });
});
