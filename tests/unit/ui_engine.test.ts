/**
 * UI engine client (spec §13 Stage 5). Proves the browser GameSession drives the
 * SAME deterministic core through the structured API — no rule is reimplemented in
 * the view. Runs in Node (the client has no React, no Node-only APIs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { GameSession, isRpgSource } from "../../ui/src/engine.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { RpgPackSchema } from "../../src/rpg/schema.js";
import {
  createInitialJourneyContractSnapshot,
  recordJourneyDecision,
} from "../../src/world/journey_contract.js";

const read = (p: string): string => readFileSync(p, "utf8");
const NON_RPG_SOURCE = `
meta: { id: non_rpg, title: "Non RPG", start_room: start }
rooms:
  - id: start
    name: "Start"
    description: "No RPG enemies field."
    exits: []
objects: []
win_conditions:
  - { id: done, conditions: [{ visited: start }], ending: done }
endings:
  - { id: done, title: "Done", text: "Done." }
`;

describe("GameSession — RPG-only structured play", () => {
  it("accepts RPG sources and rejects legacy pack shapes", () => {
    expect(isRpgSource(read("content/rpg/quests/sunken_barrow.yaml"))).toBe(true);
    expect(isRpgSource(NON_RPG_SOURCE)).toBe(false);
    expect(() => GameSession.start(NON_RPG_SOURCE, 1)).toThrow(/RPG-only/i);
  });

  it("rejects an illegal action id without advancing", () => {
    const s = GameSession.start(read("content/rpg/quests/sunken_barrow.yaml"), 1);
    const before = s.view().stateHash;
    const out = s.choose("not_an_action");
    expect(out.ok).toBe(false);
    expect(out.journeyDecision).toEqual({ countsTowardJourney: false, reason: "rejected" });
    expect(out.journeyActionId).toBeNull();
    expect(s.view().stateHash).toBe(before);
    // No ending record while play continues — the overworld completion bridge
    // must have nothing to act on.
    expect(s.ending()).toBeNull();
  });

  it("classifies the same accepted quest decision identically in UI and MCP", () => {
    const source = read("content/rpg/quests/sunken_barrow.yaml");
    const ui = GameSession.start(source, 1);
    const uiAction = ui.view().choices.find((choice) => choice.id === "go_down");
    if (!uiAction) throw new Error("expected UI opening movement");

    const api = createToolApi({ root: process.cwd() });
    const mcp = api.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    expect(mcp.observation.available_actions.some((action) => action.id === uiAction.id)).toBe(
      true,
    );

    const uiOutcome = ui.choose(uiAction.id);
    const mcpOutcome = api.step_action({
      session_id: mcp.session_id,
      action_id: uiAction.id,
      compact_observation: false,
      compact_events: false,
    });
    expect(uiOutcome.ok).toBe(true);
    expect(mcpOutcome.ok).toBe(true);
    expect(mcpOutcome.journeyDecision).toEqual(uiOutcome.journeyDecision);
    expect(mcpOutcome.journeyActionId).toBe(uiOutcome.journeyActionId);

    const apply = (actionId: string, classification: typeof uiOutcome.journeyDecision) =>
      recordJourneyDecision(
        createInitialJourneyContractSnapshot(),
        { surface: "quest", actionId },
        classification,
      );
    const uiJourney = apply(uiOutcome.journeyActionId!, uiOutcome.journeyDecision);
    const mcpJourney = apply(mcpOutcome.journeyActionId!, mcpOutcome.journeyDecision);
    expect(mcpJourney.acceptedDecisions).toBe(1);
    expect(mcpJourney.decisionProof).toEqual(uiJourney.decisionProof);
  });

  it("counts a stateful read once and excludes context repeats and dialogue closure", () => {
    const s = GameSession.start(read("content/rpg/quests/falconers_ransom.yaml"), 1);

    expect(s.choose("look_around").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "context_only",
    });
    expect(s.choose("inventory").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "context_only",
    });
    expect(s.choose("read_falcon_jesses").journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "stateful_clue",
    });
    expect(s.choose("examine_falcon_jesses").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "repeated_context",
    });

    expect(s.choose("talk_aldric").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "dialogue_opening",
    });
    expect(s.choose("ask_ask_bill").journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "substantive_dialogue",
    });
    expect(s.choose("ask_bill_back").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "dialogue_navigation",
    });
    expect(s.choose("ask_leave_aldric").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "dialogue_closure",
    });
    expect(s.choose("talk_aldric").journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "dialogue_opening",
    });
  });

  it("keeps a mixed clue/dialogue sequence count-and-proof identical in UI and MCP", () => {
    const source = read("content/rpg/quests/falconers_ransom.yaml");
    const ui = GameSession.start(source, 1);
    const api = createToolApi({ root: process.cwd() });
    const mcp = api.start_world_quest({
      world_quest_id: "falconers_ransom",
      seed: 1,
      compact_observation: false,
    });
    let uiJourney = createInitialJourneyContractSnapshot();
    let mcpJourney = createInitialJourneyContractSnapshot();

    for (const actionId of [
      "look_around",
      "read_falcon_jesses",
      "examine_falcon_jesses",
      "talk_aldric",
      "ask_ask_bill",
      "ask_bill_back",
      "ask_leave_aldric",
      "talk_aldric",
    ]) {
      const uiOutcome = ui.choose(actionId);
      const mcpOutcome = api.step_action({
        session_id: mcp.session_id,
        action_id: actionId,
        compact_observation: false,
        compact_events: false,
      });
      expect(uiOutcome.ok, actionId).toBe(true);
      expect(mcpOutcome.ok, actionId).toBe(true);
      expect(mcpOutcome.journeyDecision, actionId).toEqual(uiOutcome.journeyDecision);
      expect(mcpOutcome.journeyActionId, actionId).toBe(uiOutcome.journeyActionId);
      uiJourney = recordJourneyDecision(
        uiJourney,
        { surface: "quest", actionId: uiOutcome.journeyActionId! },
        uiOutcome.journeyDecision,
      );
      mcpJourney = recordJourneyDecision(
        mcpJourney,
        { surface: "quest", actionId: mcpOutcome.journeyActionId! },
        mcpOutcome.journeyDecision,
      );
      expect(mcpJourney.acceptedDecisions, actionId).toBe(uiJourney.acceptedDecisions);
      expect(mcpJourney.decisionProof, actionId).toEqual(uiJourney.decisionProof);
    }
    expect(uiJourney.acceptedDecisions).toBe(2);
    expect(uiJourney.decisionProof.last).toMatchObject({
      actionId: "ask_ask_bill",
      reason: "substantive_dialogue",
    });
  });

  it("counts an accepted failed skill check identically in UI and MCP", () => {
    const source = read("content/rpg/quests/sunken_barrow.yaml");
    const ui = GameSession.start(source, 3);
    const api = createToolApi({ root: process.cwd() });
    const mcp = api.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 3,
      compact_observation: false,
    });
    const stepBoth = (actionId: string) => {
      const uiOutcome = ui.choose(actionId);
      const mcpOutcome = api.step_action({
        session_id: mcp.session_id,
        action_id: actionId,
        compact_observation: false,
        compact_events: false,
      });
      expect(uiOutcome.ok, actionId).toBe(true);
      expect(mcpOutcome.ok, actionId).toBe(true);
      expect(mcpOutcome.journeyDecision, actionId).toEqual(uiOutcome.journeyDecision);
      return uiOutcome;
    };

    for (const actionId of ["go_down", "take_iron_bar", "go_north"]) stepBoth(actionId);
    for (let attack = 0; attack < 40; attack += 1) {
      if (!ui.view().choices.some((choice) => choice.id === "attack_barrow_wight")) break;
      stepBoth("attack_barrow_wight");
    }
    stepBoth("go_east");
    const failedAttempt = stepBoth("use_iron_bar_on_stone_slab");
    expect(failedAttempt.narration.join(" ")).toMatch(/failure/i);
    expect(failedAttempt.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "skill_check",
    });
  });

  it("reset restores the deterministic initial RPG state", () => {
    const s = GameSession.start(read("content/rpg/quests/sunken_barrow.yaml"), 1);
    const initial = s.view().stateHash;
    const down = s.view().choices.find((c) => c.label === "go down");
    expect(down).toBeTruthy();
    expect(s.choose(down!.id).ok).toBe(true);
    expect(s.choose("take_iron_bar").journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "preparation",
    });
    expect(s.view().stateHash).not.toBe(initial);
    s.reset();
    expect(s.view().stateHash).toBe(initial);
  });

  it("plays the RPG pack (combat + skill check) to victory and is deterministic", () => {
    const play = (): string => {
      const s = GameSession.start(read("content/rpg/quests/sunken_barrow.yaml"), 1);
      const byLabel = (needle: string): string | undefined =>
        s.view().choices.find((c) => c.label.includes(needle))?.id;
      expect(s.choose(byLabel("go down")!).ok).toBe(true);
      expect(s.choose(byLabel("take iron bar")!).ok).toBe(true);
      expect(s.choose(byLabel("go north")!).ok).toBe(true);
      for (let i = 0; i < 40 && !s.view().ended; i++) {
        const atk = s.view().choices.find((c) => c.label.startsWith("attack"));
        if (!atk) break;
        s.choose(atk.id);
      }
      expect(s.choose(byLabel("go east")!).ok).toBe(true);
      for (let i = 0; i < 40; i++) {
        // The slab USE now reads with its natural verb ("lever stone slab with iron
        // bar"), not the generic "use ... on stone slab" (bug_0078 command_verb).
        const use = s.view().choices.find((c) => c.label.startsWith("lever"));
        const down = s.view().choices.find((c) => c.label === "go down");
        if (down) break;
        if (use) s.choose(use.id);
        else break;
      }
      const down = s.view().choices.find((c) => c.label === "go down");
      expect(down).toBeTruthy();
      s.choose(down!.id);
      // The win turns on claiming the circlet, not on entering the chamber (bug_0056).
      expect(s.view().ended).toBe(false);
      const take = s
        .view()
        .choices.find((c) => c.label.includes("take") && c.label.includes("circlet"));
      expect(take).toBeTruthy();
      s.choose(take!.id);
      const v = s.view();
      expect(v.ended).toBe(true);
      expect(v.endingId).toBe("ending_victory");
      // ending() surfaces the pack's own ending record ({id, title, death}) —
      // the exact completion payload OverworldSession.completeQuest needs, so
      // the web UI can close a finished quest back into the overworld the same
      // way the MCP bridge and terminal CLI do (death passthrough included).
      const pack = RpgPackSchema.parse(parseYaml(read("content/rpg/quests/sunken_barrow.yaml")));
      const expected = pack.endings.find((e) => e.id === "ending_victory")!;
      expect(s.ending()).toEqual({
        id: expected.id,
        title: expected.title,
        death: expected.death,
      });
      expect(s.ending()!.death).toBe(false);
      return v.stateHash;
    };
    expect(play()).toBe(play()); // identical final hash — determinism through the UI client
  });
});
