/**
 * Wolf-Winter dialogue polish from the fresh-overworld blind batch:
 * players repeatedly read `ask_ask_wolves` as generated UI and saw the Cade
 * return line render as nested speaker/quote text. The pack keeps its mechanics,
 * but its visible topic ids are now authored while old direct routes remain aliases.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

type StepResult = { ok: boolean };
type LegalActionsResult = { actions: { id: string }[] };

function narrations(events: readonly GameEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text);
}

function act(state: GameState, want: Partial<RpgAction> & { type: RpgAction["type"] }): GameState {
  const match = enumerateRpgActions(index, state).find((option) =>
    Object.entries(want).every(
      ([key, value]) => (option.action as Record<string, unknown>)[key] === value,
    ),
  );
  expect(
    match,
    `expected ${JSON.stringify(want)} in legal ids [${enumerateRpgActions(index, state)
      .map((option) => option.id)
      .join(", ")}]`,
  ).toBeTruthy();
  const result = step(state, match!.action);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  return result.state;
}

function startCadeDialogue(): GameState {
  let state = initStateForRpgPack(index, 541);
  state = act(state, { type: "MOVE", direction: "north" });
  return act(state, { type: "TALK", npc: "houndsman" });
}

function legalActionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function dialogueActionIds(ids: readonly string[]): string[] {
  return ids.filter((id) => id.startsWith("ask_"));
}

describe("Wolf-Winter dialogue surface", () => {
  it("the pack still validates green", () => {
    const report = validateRpg(pack, {
      extraSettableFlags: [
        "jamie_market_testimony_certified",
        "hayden_frost_report_certified",
        "relief_oath_full_duty",
        "relief_oath_limited_duty",
        "relief_oath_unaffiliated_bond",
        "works_fortification_prepared",
        "drover_route_prepared",
        "relief_protocol_prepared",
        "june_pike_present",
        "approach_exposed_ridge",
        "approach_sheltered_stockway",
        "relief_cade_fodder_allocated",
        "relief_resident_shelter_allocated",
        "relief_mobile_reserve_allocated",
      ],
    });
    expect(report.ok).toBe(true);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("uses authored topic ids instead of doubled ask_ask ids", () => {
    const state = startCadeDialogue();
    const ids = legalActionIds(state);

    expect(ids).toEqual(
      expect.arrayContaining(["ask_wolves", "ask_byre", "ask_drive", "ask_fortify", "ask_leave"]),
    );
    expect(ids).not.toContain("ask_ask_wolves");
    expect(ids).not.toContain("ask_ask_byre");
    expect(ids).not.toContain("ask_leave_cade");
  });

  it("keeps old MCP action ids as hidden aliases without listing them", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({ world_quest_id: "wolf_winter", seed: 541 });
    const sessionId = started.session_id;
    const stepAction = (actionId: string): StepResult =>
      api.step_action({ session_id: sessionId, action_id: actionId }) as unknown as StepResult;

    expect(stepAction("go_north").ok).toBe(true);
    expect(stepAction("talk_houndsman").ok).toBe(true);
    const listed = api.list_legal_actions({ session_id: sessionId, compact_actions: false })
      .actions as { id: string }[];
    expect(listed.map((action) => action.id)).toContain("ask_wolves");
    expect(listed.map((action) => action.id)).not.toContain("ask_ask_wolves");

    const result = stepAction("ask_ask_wolves");
    expect(result.ok).toBe(true);
    const afterQuick = api.list_legal_actions({ session_id: sessionId, compact_actions: false })
      .actions as { id: string }[];
    expect(afterQuick.map((action) => action.id)).toContain("ask_byre");
    expect(afterQuick.map((action) => action.id)).not.toContain("ask_ask_byre");
    expect(stepAction("ask_ask_byre").ok).toBe(true);
    expect(stepAction("ask_leave_cade").ok).toBe(true);
  });

  it("keeps the human observation and MCP menu on the same lesson actions", () => {
    let state = startCadeDialogue();
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({ world_quest_id: "wolf_winter", seed: 541 });
    const sessionId = started.session_id;
    const stepAction = (actionId: string): StepResult =>
      api.step_action({ session_id: sessionId, action_id: actionId }) as unknown as StepResult;
    const mcpDialogueIds = (): string[] => {
      const listed = api.list_legal_actions({
        session_id: sessionId,
        compact_actions: false,
      }) as unknown as LegalActionsResult;
      return dialogueActionIds(listed.actions.map((action) => action.id));
    };

    expect(stepAction("go_north").ok).toBe(true);
    expect(stepAction("talk_houndsman").ok).toBe(true);
    expect(mcpDialogueIds()).toEqual(dialogueActionIds(legalActionIds(state)));
    expect(mcpDialogueIds()).toEqual([
      "ask_wolves",
      "ask_byre",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);

    state = act(state, { type: "ASK", npc: "houndsman", topic: "wolves" });
    expect(stepAction("ask_wolves").ok).toBe(true);
    expect(mcpDialogueIds()).toEqual(dialogueActionIds(legalActionIds(state)));
    expect(mcpDialogueIds()).toEqual([
      "ask_byre",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);

    state = act(state, { type: "ASK", npc: "houndsman", topic: "byre" });
    expect(stepAction("ask_byre").ok).toBe(true);
    expect(mcpDialogueIds()).toEqual(dialogueActionIds(legalActionIds(state)));
    expect(mcpDialogueIds()).toEqual(["ask_lure", "ask_drive", "ask_fortify", "ask_leave"]);
  });

  it("offers direct follow-ups and a leave option after Cade gives advice", () => {
    let state = startCadeDialogue();
    state = act(state, { type: "ASK", npc: "houndsman", topic: "wolves" });

    const ids = legalActionIds(state);
    expect(ids).toEqual(
      expect.arrayContaining(["ask_byre", "ask_lure", "ask_drive", "ask_fortify", "ask_leave"]),
    );
    expect(ids).not.toContain("ask_ask_byre");
    expect(ids).not.toContain("ask_wolves_back");
  });

  it("keeps Cade's existing quick lesson beside the lure commitment until its +5 credit is decided", () => {
    const root = startCadeDialogue();
    const rootQuick = buildRpgObservation(index, root).available_actions.find(
      (option) => option.id === "ask_wolves",
    );
    expect(rootQuick).toBeDefined();

    let unheard = act(root, { type: "ASK", npc: "houndsman", topic: "lure" });
    let observation = buildRpgObservation(index, unheard);
    const unheardCommit = observation.available_actions.find(
      (option) => option.id === "ask_commit_lure",
    );
    const directQuick = observation.available_actions.find(
      (option) => option.id === "ask_quick_lesson",
    );

    // This is the irreversible choice point: the player must see both the lost
    // final-tally credit and the one existing action that can still secure it.
    expect(observation.dialogue?.npc_text).toMatch(
      /quick lesson[^]*\+2 attack[^]*\+5 final(?:-| )tally[^]*commitment closes it/i,
    );
    expect(unheardCommit?.command).toMatch(/commit[^]*finite feed-and-hounds line/i);
    expect(directQuick).toMatchObject({
      id: "ask_quick_lesson",
      command: expect.stringMatching(/quick lesson/i),
      action: { type: "ASK", npc: "houndsman", topic: "quick_lesson" },
    });
    expect(
      observation.available_actions.filter((option) => /quick|lesson|wolves/i.test(option.command)),
    ).toEqual([directQuick]);

    // The compact action now names the lesson and keeps Cade's established lure
    // follow-up rather than making the player reopen his root dialogue.
    unheard = act(unheard, { type: "ASK", npc: "houndsman", topic: "quick_lesson" });
    expect(unheard.vars).toMatchObject({ attack: 7, score: 5 });
    observation = buildRpgObservation(index, unheard);
    expect(observation.available_actions.map((option) => option.id)).toContain("ask_lure");
    expect(observation.available_actions.map((option) => option.id)).not.toContain("ask_wolves");
    unheard = act(unheard, { type: "ASK", npc: "houndsman", topic: "lure" });
    observation = buildRpgObservation(index, unheard);
    expect(observation.available_actions.map((option) => option.id)).toContain("ask_commit_lure");
    expect(observation.dialogue?.npc_text).not.toMatch(
      /quick lesson[^]*\+2 attack[^]*\+5 final(?:-| )tally[^]*commitment closes it/i,
    );
    unheard = act(unheard, { type: "ASK", npc: "houndsman", topic: "commit_lure" });
    expect(unheard.flags.strategy_lure_committed).toBe(true);

    // The same commitment stays legal for a player who heard the existing lesson
    // before asking about the lure, but its stale forfeiture warning must not repeat.
    let heard = act(root, { type: "ASK", npc: "houndsman", topic: "wolves" });
    expect(heard.vars).toMatchObject({ attack: 7, score: 5 });
    heard = act(heard, { type: "ASK", npc: "houndsman", topic: "lure" });
    observation = buildRpgObservation(index, heard);
    expect(observation.available_actions.map((option) => option.id)).toContain("ask_commit_lure");
    expect(observation.dialogue?.npc_text).not.toMatch(
      /quick lesson[^]*\+2 attack[^]*\+5 final(?:-| )tally[^]*commitment closes it/i,
    );
    heard = act(heard, { type: "ASK", npc: "houndsman", topic: "commit_lure" });
    expect(heard.flags.strategy_lure_committed).toBe(true);
  });

  it("auto-resumes Cade's reactive root without a nested filler reply", () => {
    const state = startCadeDialogue();
    const advised = step(state, { type: "ASK", npc: "houndsman", topic: "wolves" });

    expect(advised.ok).toBe(true);
    if (!advised.ok) throw new Error("unreachable");
    expect(narrations(advised.events).join(" ")).toContain("Quick lines");
    const obs = buildRpgObservation(index, advised.state);
    expect(obs.dialogue?.npc_text).toMatch(
      /guarded spear-fighting plan is still yours to learn[^]*Ask for it/i,
    );
    expect(obs.dialogue?.npc_text).not.toContain("Old Cade shifts");
    expect(obs.dialogue?.npc_text).not.toMatch(/: "Old Cade\b/);
    expect(obs.available_actions.map((option) => option.id)).not.toContain("ask_wolves_back");
    expect(obs.available_actions.map((option) => option.id)).toEqual(
      expect.arrayContaining(["ask_byre", "ask_leave"]),
    );
  });
});
