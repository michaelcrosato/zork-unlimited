/**
 * Wolf-Winter dialogue polish from the fresh-overworld blind batch:
 * players repeatedly read `ask_ask_wolves` as generated UI and saw the Cade
 * return line render as nested speaker/quote text. The pack keeps its mechanics,
 * but its visible topic ids are now authored while old direct routes remain aliases.
 */
import { describe, expect, it } from "vitest";
import { DIALOGUE_VAR_PREFIX, dlgVar } from "../../src/core/dialogue_state.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import type { RpgAction } from "../../src/api/types.js";
import { MCP_ACTION_LABEL_CHAR_LIMIT } from "../../src/mcp/action_labels.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
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
import { classifyRpgJourneyDecision } from "../../src/world/journey_decision.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);
const NORTH_PENDING_GUIDANCE =
  "North waits. Follow this room's cue: talk to June before HUNT; LURE: call any shown docket, fetch feed west, or go west/up for the second cast; DRIVE/FORTIFY: take named gear.";

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

function playerConsequenceState(state: GameState): Omit<GameState, "step"> {
  const { step: _step, vars, ...rest } = state;
  return {
    ...rest,
    vars: Object.fromEntries(
      Object.entries(vars).filter(([name]) => !name.startsWith(DIALOGUE_VAR_PREFIX)),
    ),
  };
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

  it("compares all four strategy costs symmetrically without changing state or actions", () => {
    let state = initStateForRpgPack(index, 541);
    state = act(state, { type: "MOVE", direction: "north" });
    const talked = step(state, { type: "TALK", npc: "houndsman" });
    expect(talked.ok).toBe(true);
    if (!talked.ok) throw new Error("unreachable");
    state = talked.state;
    const before = structuredClone(state);
    const idsBefore = legalActionIds(state);
    const observation = buildRpgObservation(index, state);
    const scorecard = observation.dialogue?.npc_text;

    expect(scorecard).toContain(
      "Choose what must stand at dawn. Every plan can finish Wolf-Winter",
    );
    expect(scorecard).toContain("none saves everything");
    expect(scorecard).toContain(
      "HUNT — Outcome: hold Cade's ground, herd, and relief stores with prepared combat. Cost: wolves may die; failure can lose cattle or the line. Albany: bloodshed changes Greenway work; damage remains.",
    );
    expect(scorecard).toContain(
      "LURE — Outcome: relocate the pack beyond the breach and keep the herd. Cost: last feed, broken paling, two cattle risked on a first-cast foul. Albany: broken boundary or scattered cattle change Station response.",
    );
    expect(scorecard).toContain(
      "DRIVE — Outcome: evacuate people and herd; force the pack clear. Cost: abandon the outer steading; Crisis takes a wound, two cattle, or rig. Albany: the line and chosen loss remain.",
    );
    expect(scorecard).toContain(
      "FORTIFY — Outcome: keep household, herd, and pack apart until dawn. Cost: no retreat; expose property for Cade's aid or spend public seals without it. Albany: terms remain; a no-loss hold opens no Cade repair dispatch.",
    );
    expect(scorecard).toContain("Questions teach; they do not commit");
    expect(scorecard).toContain("HUNT commits on uncommitted north crossing");
    expect(scorecard).toContain("Any commitment closes the other three");
    expect(scorecard!.indexOf("HUNT —")).toBeLessThan(scorecard!.indexOf("LURE —"));
    expect(scorecard!.indexOf("LURE —")).toBeLessThan(scorecard!.indexOf("DRIVE —"));
    expect(scorecard!.indexOf("DRIVE —")).toBeLessThan(scorecard!.indexOf("FORTIFY —"));
    const commands = Object.fromEntries(
      observation.available_actions.map((action) => [action.id, action.command]),
    );
    expect(commands).toMatchObject({
      ask_wolves:
        "ask: HUNT — Hold ground/stores in prepared combat. Risk: wolf deaths; failure risks cattle/line. +2 attack/+5 tally; north commits.",
      ask_lure:
        "ask: LURE — Relocate pack beyond the breach; keep the herd. Cost: last feed, broken paling, two cattle risked on a foul. Inspect.",
      ask_drive:
        "ask: DRIVE — Evacuate people/herd; force pack clear. Cost: abandon outer steading; Crisis takes wound, two cattle, or rig. Inspect.",
      ask_fortify:
        "ask: FORTIFY — Keep household/herd/pack apart to dawn. Cost: no retreat; expose property/Cade aid or spend seals/no aid. Inspect.",
    });
    expect(Object.values(commands).join("\n")).not.toMatch(
      /protects cattle and wolves|protects people and wolves|protects byre, cattle, and wolves/i,
    );
    expect(narrations(talked.events)).toEqual([`old Cade the houndsman: "${scorecard}"`]);
    expect(narrations(talked.events).join(" ")).not.toContain("Save/cost—HUNT");

    const compact = compactRpgObservation(observation, observation.available_actions, {
      includeActions: true,
    });
    expect(compact.dialogue).toEqual(["houndsman", scorecard]);
    expect(compact.choices?.map(([id]) => id)).toEqual(dialogueActionIds(idsBefore));
    const compactWithoutActions = compactRpgObservation(
      { ...observation, available_actions: [] },
      [],
    );
    expect(compactWithoutActions.dialogue).toEqual(["houndsman", scorecard]);
    expect(compactWithoutActions.actions).toBeUndefined();
    expect(compactWithoutActions.choices).toBeUndefined();
    expect(observation.available_actions.map((action) => action.id)).toEqual(idsBefore);
    expect(state).toEqual(before);
    expect(legalActionIds(state)).toEqual(idsBefore);
  });

  it("keeps the scorecard prose invariant under a consistent identifier relabeling", () => {
    const originalText = buildRpgObservation(index, startCadeDialogue()).dialogue?.npc_text;
    const { pack: twinPack, relabeler } = relabelRpgPack(pack);
    const twinIndex = indexRpgPack(twinPack);
    const twinStep = makeStep(buildRpgRules(twinIndex));
    let twinState = initStateForRpgPack(twinIndex, 541);
    const moved = twinStep(twinState, { type: "MOVE", direction: "north" });
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error("unreachable");
    twinState = moved.state;

    const twinNpc = relabeler.r("houndsman");
    expect(twinNpc).not.toBe("houndsman");
    const talked = twinStep(twinState, { type: "TALK", npc: twinNpc });
    expect(talked.ok).toBe(true);
    if (!talked.ok) throw new Error("unreachable");

    expect(buildRpgObservation(twinIndex, talked.state).dialogue?.npc_text).toBe(originalText);
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

  it("keeps each Cade inspection outcome-first without changing its commitment state", () => {
    const root = startCadeDialogue();
    const cases = [
      ["lure", /FEED LURE relocates pack beyond the breach[^]*herd at Cade's yard/i],
      ["drive", /SIGNAL DRIVE evacuates people\/herd[^]*forcing the pack clear/i],
      ["fortify", /FORTIFY keeps household\/herd\/pack apart through dawn/i],
    ] as const;

    for (const [topic, expected] of cases) {
      const inspected = act(root, { type: "ASK", npc: "houndsman", topic });
      const text = buildRpgObservation(index, inspected).dialogue?.npc_text ?? "";
      expect(text, topic).toMatch(expected);
      expect(text, topic).not.toMatch(
        /can save pack\/herd|can spare pack\/people|saves lives\/herd\/byre/i,
      );
      expect(inspected.flags.strategy_lure_committed, topic).not.toBe(true);
      expect(inspected.flags.strategy_drive_committed, topic).not.toBe(true);
      expect(inspected.flags.strategy_fortify_committed, topic).not.toBe(true);
    }
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
      "ask_commit_hunt_and_hold",
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
      "ask_commit_hunt_and_hold",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);

    state = act(state, { type: "ASK", npc: "houndsman", topic: "byre" });
    expect(stepAction("ask_byre").ok).toBe(true);
    expect(mcpDialogueIds()).toEqual(dialogueActionIds(legalActionIds(state)));
    expect(mcpDialogueIds()).toEqual([
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_byre_back",
      "ask_leave",
    ]);
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

  it("keeps Cade's HUNT exit uncommitted until the north crossing", () => {
    let state = startCadeDialogue();
    const root = buildRpgObservation(index, state);
    expect(root.available_actions.find((action) => action.id === "ask_wolves")?.command).toBe(
      "ask: HUNT — Hold ground/stores in prepared combat. Risk: wolf deaths; failure risks cattle/line. +2 attack/+5 tally; north commits.",
    );
    const beforeCommit = structuredClone(state);
    const commitment = root.available_actions.find(
      (action) => action.id === "ask_commit_hunt_and_hold",
    );
    if (!commitment) throw new Error("expected Cade's HUNT exit");
    const huntExitPrompt =
      "End talk; HUNT stays uncommitted. Prepared combat may kill wolves; failure risks cattle/line. Cross north to commit and close LURE/DRIVE/FORTIFY.";
    expect(commitment).toMatchObject({
      command: `ask: ${huntExitPrompt}`,
      action: { type: "ASK", npc: "houndsman", topic: "commit_hunt_and_hold" },
    });
    expect(huntExitPrompt).toHaveLength(145);
    expect(commitment.command).toHaveLength(150);
    expect(commitment.command.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);
    const compactRoot = compactRpgObservation(root, root.available_actions, {
      includeActions: true,
    });
    expect(compactRoot.actions).toContain("ask_commit_hunt_and_hold");
    expect(compactRoot.choices).toContainEqual(["ask_commit_hunt_and_hold", huntExitPrompt]);

    const closed = step(state, commitment.action);
    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error("expected Cade's HUNT exit to close dialogue");
    expect(closed.events).toContainEqual({
      type: "narration",
      text: "(You end the conversation.)",
    });
    expect(
      classifyRpgJourneyDecision({
        action: commitment.action,
        before: state,
        after: closed.state,
        events: closed.events,
        accepted: true,
      }),
    ).toEqual({ countsTowardJourney: false, reason: "dialogue_closure" });
    expect(playerConsequenceState(closed.state)).toEqual(playerConsequenceState(beforeCommit));
    expect(closed.state.step).toBe(beforeCommit.step + 1);
    expect(beforeCommit.vars[dlgVar("houndsman")]).toBeGreaterThan(0);
    expect(closed.state.vars[dlgVar("houndsman")]).toBe(0);
    state = closed.state;

    state = act(state, { type: "TALK", npc: "houndsman" });
    expect(legalActionIds(state)).toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    state = act(state, { type: "ASK", npc: "houndsman", topic: "leave" });
    state = act(state, { type: "MOVE", direction: "north" });
    expect(state.current).toBe("paling_gap");
    state = act(state, { type: "MOVE", direction: "south" });
    state = act(state, { type: "TALK", npc: "houndsman" });
    const postCrossingIds = legalActionIds(state);
    for (const retired of ["ask_lure", "ask_drive", "ask_fortify"])
      expect(postCrossingIds).not.toContain(retired);
  });

  it("uses June's explicit HUNT commitment to disclose the wolf-death consequence", () => {
    let state = initStateForRpgPack(index, 542);
    state.flags.june_pike_present = true;
    state = act(state, { type: "MOVE", direction: "north" });
    state = act(state, { type: "TALK", npc: "houndsman" });
    expect(legalActionIds(state)).toEqual(
      expect.arrayContaining(["ask_wolves", "ask_lure", "ask_drive", "ask_fortify"]),
    );

    state = act(state, { type: "ASK", npc: "houndsman", topic: "wolves" });
    state = act(state, { type: "ASK", npc: "houndsman", topic: "leave" });
    const beforeJune = buildRpgObservation(index, state);
    expect(beforeJune.available_actions.map((action) => action.id)).not.toContain("go_north");
    expect(beforeJune.available_actions.map((action) => action.id)).toContain("talk_june_pike");
    expect(beforeJune.blocked_exits).toContainEqual({
      direction: "north",
      message: NORTH_PENDING_GUIDANCE,
    });
    const compactBeforeJune = compactRpgObservation(beforeJune, beforeJune.available_actions, {
      includeActions: true,
    });
    expect(compactBeforeJune.actions).toContain("talk_june_pike");
    expect(compactBeforeJune.actions).not.toContain("go_north");
    expect(compactBeforeJune.blocked).toContainEqual(["north", NORTH_PENDING_GUIDANCE]);

    state = act(state, { type: "TALK", npc: "june_pike" });
    const juneBoundary = buildRpgObservation(index, state);
    expect(juneBoundary.blocked_exits).toContainEqual({
      direction: "north",
      message: NORTH_PENDING_GUIDANCE,
    });
    expect(
      compactRpgObservation(juneBoundary, juneBoundary.available_actions, {
        includeActions: true,
      }).blocked,
    ).toContainEqual(["north", NORTH_PENDING_GUIDANCE]);
    expect(juneBoundary.dialogue?.npc_text).toMatch(
      /Choose by outcome[^]*HUNT holds Cade's ground[^]*LURE relocates[^]*DRIVE evacuates[^]*FORTIFY keeps household, herd, and pack apart/i,
    );
    expect(juneBoundary.dialogue?.npc_text).toMatch(
      /release me now[^]*preserve our agreement without field aid[^]*keep me on cattle[^]*first wolf death breaks it/i,
    );
    expect(juneBoundary.dialogue?.npc_text).not.toMatch(/living plan/i);
    const juneCommands = Object.fromEntries(
      juneBoundary.available_actions.map((action) => [action.id, action.command]),
    );
    expect(juneCommands).toMatchObject({
      ask_release_june_for_hunt: expect.stringMatching(
        /HUNT \/ release June[^]*preserve agreement[^]*lose June's field aid/i,
      ),
      ask_commit_hunt_and_hold: expect.stringMatching(
        /HUNT \/ keep June[^]*June stays cattle-first[^]*first wolf death breaks agreement/i,
      ),
      ask_keep_cattle_terms: expect.stringMatching(
        /Choose a noncombat plan[^]*LURE relocation[^]*DRIVE evacuation[^]*FORTIFY until dawn/i,
      ),
    });
    expect(
      juneBoundary.available_actions.find((action) => action.id === "ask_commit_hunt_and_hold")
        ?.command,
    ).toMatch(/HUNT \/ keep June[^]*June stays cattle-first[^]*first wolf death breaks agreement/i);
    state = act(state, {
      type: "ASK",
      npc: "june_pike",
      topic: "commit_hunt_and_hold",
    });
    expect(state.flags.june_combat_line_acknowledged).toBe(true);
    expect(state.flags.strategy_lure_committed).not.toBe(true);
    expect(state.flags.strategy_drive_committed).not.toBe(true);
    expect(state.flags.strategy_fortify_committed).not.toBe(true);
    expect(legalActionIds(state)).toContain("go_north");

    state = act(state, { type: "TALK", npc: "houndsman" });
    expect(legalActionIds(state)).toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    state = act(state, { type: "ASK", npc: "houndsman", topic: "leave" });
    state = act(state, { type: "MOVE", direction: "north" });
    state = act(state, { type: "MOVE", direction: "south" });
    state = act(state, { type: "TALK", npc: "houndsman" });
    expect(legalActionIds(state)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
  });

  it("accepts June's legacy MCP acknowledgement id without listing it", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({ world_quest_id: "wolf_winter", seed: 542 });
    const session = api.sessions.get(started.session_id);
    const withJune = structuredClone(session.state);
    withJune.flags.june_pike_present = true;
    api.sessions.update(started.session_id, withJune);
    const stepAction = (actionId: string): StepResult =>
      api.step_action({
        session_id: started.session_id,
        action_id: actionId,
      }) as unknown as StepResult;

    expect(stepAction("go_north").ok).toBe(true);
    expect(stepAction("talk_houndsman").ok).toBe(true);
    expect(stepAction("ask_leave").ok).toBe(true);
    expect(stepAction("talk_june_pike").ok).toBe(true);
    const listed = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: false,
    }) as unknown as LegalActionsResult;
    expect(listed.actions.map((action) => action.id)).toContain("ask_commit_hunt_and_hold");
    expect(listed.actions.map((action) => action.id)).not.toContain("ask_acknowledge_combat_line");

    expect(stepAction("ask_acknowledge_combat_line").ok).toBe(true);
    expect(session.state.flags.june_combat_line_acknowledged).toBe(true);
  });

  it("discloses the optional LURE lesson's plan-menu return while preserving reconsideration", () => {
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

    // This is the irreversible choice point: the player must see the lesson's
    // credit, its navigation consequence, and the direct no-lesson commitment.
    expect(observation.dialogue?.npc_text).toMatch(
      /optional quick lesson[^]*\+2 attack[^]*\+5 final(?:-| )tally[^]*committing first closes it[^]*lesson returns to the plan menu[^]*choose LURE again to commit/i,
    );
    expect(unheardCommit?.command).toMatch(/commit[^]*finite feed-and-hounds line/i);
    expect(directQuick).toMatchObject({
      id: "ask_quick_lesson",
      command:
        "ask: Take Cade's optional quick lesson (+2 attack; +5 final tally). It returns to the plan menu; choose LURE again to commit.",
      action: { type: "ASK", npc: "houndsman", topic: "quick_lesson" },
    });
    expect(
      observation.available_actions.filter((option) => /quick|lesson|wolves/i.test(option.command)),
    ).toEqual([directQuick]);

    // Direct commitment remains legal without taking the optional lesson.
    const direct = act(unheard, { type: "ASK", npc: "houndsman", topic: "commit_lure" });
    expect(direct.flags.strategy_lure_committed).toBe(true);
    expect(direct.flags.heard_counsel).not.toBe(true);
    expect(direct.vars.attack).toBe(5);
    expect(direct.vars.score ?? 0).toBe(0);

    // The disclosed lesson returns to the full plan menu. This preserves the
    // observed LURE-to-HUNT pivot while requiring LURE to be selected again if kept.
    unheard = act(unheard, { type: "ASK", npc: "houndsman", topic: "quick_lesson" });
    expect(unheard.vars).toMatchObject({ attack: 7, score: 5 });
    expect(unheard.flags.heard_counsel).toBe(true);
    expect(unheard.journal).toContain(
      "Cade's quick/open line: set/drive young wolf; wheel/turn through flank; close/drive old grey. You strike truer (+2 attack).",
    );
    observation = buildRpgObservation(index, unheard);
    const postLessonIds = observation.available_actions.map((option) => option.id);
    expect(postLessonIds).toEqual(
      expect.arrayContaining(["ask_commit_hunt_and_hold", "ask_lure", "ask_drive", "ask_fortify"]),
    );
    for (const unavailable of ["ask_wolves", "ask_quick_lesson", "ask_commit_lure"])
      expect(postLessonIds).not.toContain(unavailable);

    const huntPivot = act(structuredClone(unheard), {
      type: "ASK",
      npc: "houndsman",
      topic: "commit_hunt_and_hold",
    });
    expect(huntPivot.flags.strategy_lure_committed).not.toBe(true);
    expect(huntPivot.flags.heard_counsel).toBe(true);
    expect(legalActionIds(huntPivot)).toContain("go_north");

    unheard = act(unheard, { type: "ASK", npc: "houndsman", topic: "lure" });
    observation = buildRpgObservation(index, unheard);
    expect(observation.available_actions.map((option) => option.id)).toContain("ask_commit_lure");
    expect(observation.available_actions.map((option) => option.id)).not.toContain(
      "ask_quick_lesson",
    );
    expect(observation.dialogue?.npc_text).not.toMatch(
      /lesson returns to the plan menu[^]*choose LURE again to commit/i,
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
      /lesson returns to the plan menu[^]*choose LURE again to commit/i,
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
    expect(obs.dialogue?.npc_text).not.toContain("Choose what must stand at dawn");
    expect(obs.dialogue?.npc_text).not.toMatch(/living plan|living commitment/i);
    expect(obs.dialogue?.npc_text).toMatch(/LURE, DRIVE, (?:and|or) FORTIFY/i);
    expect(obs.available_actions.map((option) => option.id)).not.toContain("ask_wolves_back");
    expect(obs.available_actions.map((option) => option.id)).toEqual(
      expect.arrayContaining(["ask_byre", "ask_leave"]),
    );
  });
});
