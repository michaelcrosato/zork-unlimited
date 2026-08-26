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
import { campaignCharacterImportPlayerStateContract } from "../../src/rpg/campaign_character_import.js";
import { endingText } from "../../src/rpg/model.js";
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
import { loadOverworldManifest } from "../../src/world/source.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);
const wolfCampaignImports = loadOverworldManifest(process.cwd()).quests.find(
  (quest) => quest.id === "wolf_winter",
)?.campaign_imports;
if (!wolfCampaignImports) throw new Error("Wolf-Winter must declare campaign imports");
const wolfImportContract = campaignCharacterImportPlayerStateContract(wolfCampaignImports);
const NORTH_PENDING_GUIDANCE =
  "North is blocked. Before HUNT, TALK TO Road Warden June Pike. During LURE, follow the shown CALL or feed action; feed is west, and the hatch is west then up. During DRIVE or FORTIFY, complete the shown gear action.";
const CADE_LURE_ROOT_LABEL =
  "LURE — Move the wolves alive and protect the herd. Costs Cade's last feed; the fence stays broken. First-action failure adds 2 cattle alarm. Review only.";
const CADE_LURE_ROOT_COMMAND = `ask: ${CADE_LURE_ROOT_LABEL}`;
const CADE_HUNT_ROOT_LABEL =
  "HUNT — Protect home and herd. Wolves may die; failure risks cattle. Cade's tactics and padded byre-jerkin help. Review. Go north or RELEASE JUNE to choose.";
const CADE_HUNT_PREPARE_LABEL =
  "LEAVE REVIEW — Do not choose HUNT. Go north or RELEASE JUNE to choose it; wolves may die and other plans close.";

type StepResult = { ok: boolean };
type LegalActionsResult = { actions: { id: string; command?: string }[] };

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
      extraSettableFlags: wolfImportContract.settableFlagIds,
      extraObtainable: wolfImportContract.obtainableObjectIds,
      extraInitialVarRanges: wolfImportContract.initialVarRanges,
    });
    expect(report.ok).toBe(true);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("composes every current dispatch support note without changing plan authority", () => {
    const currentSupport = pack.npcs
      .find((npc) => npc.id === "houndsman")
      ?.dialogue.nodes.find((node) => node.id === "cade_current_support");
    expect(currentSupport?.variants).toBeUndefined();
    expect(currentSupport?.append_variants?.map((fragment) => fragment.when)).toEqual([
      [
        { var_gte: { name: "fieldcraft", value: 4 } },
        { has_flag: "opening_condition_steady_scent_channel" },
      ],
      [
        { var_gte: { name: "fieldcraft", value: 4 } },
        { has_flag: "opening_condition_open_ash_lane" },
      ],
      [
        { var_gte: { name: "fieldcraft", value: 4 } },
        { not_flag: "opening_condition_steady_scent_channel" },
        { not_flag: "opening_condition_open_ash_lane" },
        { not_flag: "opening_condition_sound_lower_frame" },
      ],
      [
        { var_gte: { name: "fieldcraft", value: 4 } },
        { has_flag: "opening_condition_sound_lower_frame" },
      ],
      [{ has_flag: "relief_oath_limited_duty" }],
      [{ has_flag: "june_pike_present" }],
      [{ has_flag: "relief_oath_full_duty" }, { not_flag: "opening_condition_sound_lower_frame" }],
      [{ has_flag: "relief_oath_full_duty" }, { has_flag: "opening_condition_sound_lower_frame" }],
      [
        { has_flag: "works_fortification_prepared" },
        { not_flag: "opening_condition_sound_lower_frame" },
      ],
      [
        { has_flag: "works_fortification_prepared" },
        { has_flag: "opening_condition_sound_lower_frame" },
      ],
    ]);

    let state = startCadeDialogue();
    state = {
      ...state,
      vars: { ...state.vars, fieldcraft: 4 },
      flags: {
        ...state.flags,
        relief_oath_limited_duty: true,
        june_pike_present: true,
        works_fortification_prepared: true,
      },
    };
    const before = playerConsequenceState(state);
    const support = step(state, { type: "ASK", npc: "houndsman", topic: "current_support" });
    expect(support.ok).toBe(true);
    if (!support.ok) throw new Error("unreachable");
    state = support.state;
    const text = narrations(support.events).join("\n");
    expect(text).toContain("Fieldcraft 4 set starting DEF to 4 and supplies LURE checks");
    expect(text).toContain("open ash lane removes DRIVE's first check");
    expect(text).toContain("The Aid-Only oath gives no DRIVE or HUNT benefit");
    expect(text).toContain("June only protects cattle");
    expect(text).toContain("The Works packet sets the first FORTIFY Repair check to DC 12");
    expect(text).not.toContain("Full Compact lowers");
    expect(text.indexOf("Fieldcraft 4")).toBeLessThan(text.indexOf("Aid-Only"));
    expect(text.indexOf("Aid-Only")).toBeLessThan(text.indexOf("June"));
    expect(text.indexOf("June")).toBeLessThan(text.indexOf("Works"));
    expect(playerConsequenceState(state)).toEqual(before);
    expect(state.flags.strategy_lure_committed).not.toBe(true);
    expect(state.flags.strategy_drive_committed).not.toBe(true);
    expect(state.flags.strategy_fortify_committed).not.toBe(true);

    let fullCompactState = startCadeDialogue();
    fullCompactState = {
      ...fullCompactState,
      flags: {
        ...fullCompactState.flags,
        relief_oath_full_duty: true,
        works_fortification_prepared: true,
      },
    };
    const fullCompactBefore = playerConsequenceState(fullCompactState);
    const fullCompactSupport = step(fullCompactState, {
      type: "ASK",
      npc: "houndsman",
      topic: "current_support",
    });
    expect(fullCompactSupport.ok).toBe(true);
    if (!fullCompactSupport.ok) throw new Error("unreachable");
    fullCompactState = fullCompactSupport.state;
    const fullCompactText = narrations(fullCompactSupport.events).join("\n");
    expect(fullCompactText).toContain("Full Compact lowers");
    expect(fullCompactText).toContain(
      "The Works packet sets the first FORTIFY Repair check to DC 12",
    );
    expect(fullCompactText.indexOf("Full Compact")).toBeLessThan(fullCompactText.indexOf("Works"));
    expect(fullCompactText).not.toContain("Aid-Only oath");
    expect(playerConsequenceState(fullCompactState)).toEqual(fullCompactBefore);
  });

  it("composes worn, carried, and absent jerkin truth onto every held-byre ending", () => {
    const base = initStateForRpgPack(index, 541);
    const endingIds = [
      "ending_held_gate_barred_june_released",
      "ending_held_gate_barred",
      "ending_held_timber_saved_june_released",
      "ending_held_timber_saved",
      "ending_held_june_released",
      "ending_held",
    ];

    for (const endingId of endingIds) {
      const ending = pack.endings.find((candidate) => candidate.id === endingId)!;
      const absent = endingText(ending, base);
      const carried = endingText(ending, {
        ...base,
        inventory: [...base.inventory, "byre_jerkin"],
      });
      const worn = endingText(ending, {
        ...base,
        flags: { ...base.flags, jerkin_donned: true },
        inventory: [...base.inventory, "byre_jerkin"],
      });

      expect(absent).toContain("never took the padded byre-jerkin");
      expect(absent).not.toContain("received its +2 defense bonus");
      expect(absent).not.toContain("carried the padded byre-jerkin");
      expect(carried).toContain("carried the padded byre-jerkin but never DONNED it");
      expect(carried).not.toContain("received its +2 defense bonus");
      expect(worn).toContain("wore the padded byre-jerkin and received its +2 defense bonus");
      expect(worn).not.toContain("never DONNED it");
    }

    const held = pack.endings.find((candidate) => candidate.id === "ending_held")!;
    const patientWorn = endingText(held, {
      ...base,
      flags: { ...base.flags, jerkin_donned: true, leader_waited_out: true },
      inventory: [...base.inventory, "byre_jerkin"],
    });
    expect(patientWorn).toContain("WAITED through the grey leader's feint");
    expect(patientWorn).toContain("wore the padded byre-jerkin");
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

    expect(scorecard).toContain("Reviews choose nothing");
    expect(scorecard).toContain("PREPARE SUPPORT chooses nothing");
    expect(scorecard).toContain("Choose HUNT with GO north or RELEASE JUNE");
    expect(scorecard).toContain("One choice permanently closes the rest");
    expect(scorecard).toContain(
      "FIELD CONDITION — open ash lane. At the opening, FIRE drive shutter signal WITH Cade's two-charge signal-and-rope rig succeeds without a check. The second charge and crisis priority remain.",
    );
    expect(scorecard!.length).toBeLessThanOrEqual(380);
    const commands = Object.fromEntries(
      observation.available_actions.map((action) => [action.id, action.command]),
    );
    expect(commands).toMatchObject({
      ask_hunt: `ask: ${CADE_HUNT_ROOT_LABEL}`,
      ask_wolves:
        "ask: PREPARE SUPPORT — Learn the quick HUNT tactic for +2 attack and +5 score. This does not choose HUNT.",
      ask_lure: CADE_LURE_ROOT_COMMAND,
      ask_drive:
        "ask: DRIVE — Evacuate people and cattle; wolves live. Lose retreat and outer defense. Crisis costs 6 HP, two cattle, or the rig. Review only.",
      ask_fortify:
        "ask: FORTIFY — Protect home and herd until dawn; wolves live. Lose retreat. Use Cade's shutters and expose his property, or spend Albany's seals. Review only.",
    });
    expect(dialogueActionIds(idsBefore).slice(0, 4)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
    ]);
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

  it("keeps each Cade comparison read-only and makes the next irreversible action explicit", () => {
    const root = startCadeDialogue();
    const cases = [
      [
        "lure",
        /LURE redirects all three wolves alive[^]*consumes Cade's only winter-feed sack[^]*leaves the Broken Paling unrepaired[^]*failed first LAY action raises cattle alarm by 2[^]*cannot be retried/i,
        "commit_lure",
        "strategy_lure_committed",
        /CHOOSE LURE[^]*only feed sack[^]*three actions[^]*leave the paling broken[^]*close HUNT, DRIVE, and FORTIFY/i,
      ],
      [
        "drive",
        /DRIVE evacuates people and cattle alive[^]*loses outer defense and retreat[^]*Crisis costs a lasting wound and 6 HP, two cattle, or the rig/i,
        "commit_drive",
        "strategy_drive_committed",
        /CHOOSE DRIVE[^]*lose outer defense and retreat[^]*Crisis costs 6 HP, two cattle, or the rig[^]*close HUNT, LURE, and FORTIFY/i,
      ],
      [
        "fortify",
        /FORTIFY protects home and herd until dawn[^]*all wolves alive[^]*retreat and other plans close/i,
        "commit_cade_terms",
        "strategy_fortify_committed",
        /CHOOSE FORTIFY \/ CADE[^]*Lose retreat[^]*expose Cade's property[^]*preserve Albany's seals[^]*get Cade's help after one failed seal[^]*permanently close other plans/i,
      ],
    ] as const;

    for (const [topic, expected, commitmentTopic, committedFlag, commitmentLabel] of cases) {
      const inspected = act(root, { type: "ASK", npc: "houndsman", topic });
      const text = buildRpgObservation(index, inspected).dialogue?.npc_text ?? "";
      expect(text, topic).toMatch(expected);
      expect(text, topic).not.toMatch(
        /can save pack\/herd|can spare pack\/people|saves lives\/herd\/byre/i,
      );
      expect(inspected.flags.strategy_lure_committed, topic).not.toBe(true);
      expect(inspected.flags.strategy_drive_committed, topic).not.toBe(true);
      expect(inspected.flags.strategy_fortify_committed, topic).not.toBe(true);
      const commitment = enumerateRpgActions(index, inspected).find(
        (option) => option.action.type === "ASK" && option.action.topic === commitmentTopic,
      );
      expect(commitment?.command, topic).toMatch(commitmentLabel);
      if (!commitment) throw new Error(`expected ${commitmentTopic}`);
      const committed = act(inspected, commitment.action);
      expect(committed.flags[committedFlag], topic).toBe(true);
      expect(legalActionIds(committed), topic).not.toEqual(
        expect.arrayContaining(["ask_hunt", "ask_lure", "ask_drive", "ask_fortify"]),
      );
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
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_wolves",
      "ask_byre",
      "ask_leave",
    ]);

    state = act(state, { type: "ASK", npc: "houndsman", topic: "wolves" });
    expect(stepAction("ask_wolves").ok).toBe(true);
    expect(mcpDialogueIds()).toEqual(dialogueActionIds(legalActionIds(state)));
    expect(mcpDialogueIds()).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_byre",
      "ask_leave",
    ]);

    state = act(state, { type: "ASK", npc: "houndsman", topic: "byre" });
    expect(stepAction("ask_byre").ok).toBe(true);
    expect(state.flags.heard_plan).toBe(true);
    expect(state.flags.strategy_lure_committed).not.toBe(true);
    expect(state.flags.strategy_drive_committed).not.toBe(true);
    expect(state.flags.strategy_fortify_committed).not.toBe(true);
    const mcpStateAfterGuardedSupport = api.sessions.get(sessionId).state;
    expect(mcpStateAfterGuardedSupport.flags.heard_plan).toBe(true);
    expect(mcpStateAfterGuardedSupport.flags.strategy_lure_committed).not.toBe(true);
    expect(mcpStateAfterGuardedSupport.flags.strategy_drive_committed).not.toBe(true);
    expect(mcpStateAfterGuardedSupport.flags.strategy_fortify_committed).not.toBe(true);
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
      "ask: PREPARE SUPPORT — Learn the quick HUNT tactic for +2 attack and +5 score. This does not choose HUNT.",
    );
    const beforeCommit = structuredClone(state);
    const inspection = root.available_actions.find((action) => action.id === "ask_hunt");
    if (!inspection) throw new Error("expected Cade's HUNT inspection");
    expect(inspection).toMatchObject({
      command: `ask: ${CADE_HUNT_ROOT_LABEL}`,
      action: { type: "ASK", npc: "houndsman", topic: "hunt" },
    });
    expect(inspection.command.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);
    const compactRoot = compactRpgObservation(root, root.available_actions, {
      includeActions: true,
    });
    expect(compactRoot.actions).toContain("ask_hunt");
    expect(compactRoot.choices).toContainEqual(["ask_hunt", CADE_HUNT_ROOT_LABEL]);

    const inspected = step(state, inspection.action);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) throw new Error("expected Cade's HUNT inspection");
    expect(playerConsequenceState(inspected.state)).toEqual(playerConsequenceState(beforeCommit));
    expect(buildRpgObservation(index, inspected.state).dialogue?.npc_text).toMatch(
      /HUNT protects the home[^]*This review and PREPARE SUPPORT do not choose HUNT[^]*Go north or RELEASE JUNE to choose it[^]*LURE, DRIVE, and FORTIFY then close/i,
    );
    const commitment = enumerateRpgActions(index, inspected.state).find(
      (action) => action.id === "ask_prepare_hunt",
    );
    expect(commitment).toMatchObject({
      command: `ask: ${CADE_HUNT_PREPARE_LABEL}`,
      action: { type: "ASK", npc: "houndsman", topic: "prepare_hunt" },
    });
    if (!commitment) throw new Error("expected Cade's HUNT review exit");
    expect(commitment.command.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);

    const closed = step(inspected.state, commitment.action);
    expect(closed.ok).toBe(true);
    if (!closed.ok) throw new Error("expected Cade's HUNT review exit to close dialogue");
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
    expect(closed.state.step).toBe(beforeCommit.step + 2);
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

  it("keeps Cade's legacy HUNT action alias as a non-mutating inspection only", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({ world_quest_id: "wolf_winter", seed: 541 });
    const sessionId = started.session_id;
    expect(api.step_action({ session_id: sessionId, action_id: "go_north" }).ok).toBe(true);
    expect(api.step_action({ session_id: sessionId, action_id: "talk_houndsman" }).ok).toBe(true);
    const before = api.sessions.get(sessionId).state;
    const listed = api.list_legal_actions({
      session_id: sessionId,
      compact_actions: false,
    }) as unknown as LegalActionsResult;
    expect(listed.actions.map((candidate) => candidate.id)).toContain("ask_hunt");
    expect(listed.actions.map((candidate) => candidate.id)).not.toContain(
      "ask_commit_hunt_and_hold",
    );

    const legacy = api.step_action({
      session_id: sessionId,
      action_id: "ask_commit_hunt_and_hold",
    });
    expect(legacy.ok).toBe(true);
    const after = api.sessions.get(sessionId).state;
    expect(playerConsequenceState(after)).toEqual(playerConsequenceState(before));
    expect(legalActionIds(after)).toContain("ask_prepare_hunt");
    expect(after.flags.strategy_lure_committed).not.toBe(true);
    expect(after.flags.strategy_drive_committed).not.toBe(true);
    expect(after.flags.strategy_fortify_committed).not.toBe(true);
  });

  it("uses June's explicit HUNT commitment to disclose the wolf-death consequence", () => {
    let state = initStateForRpgPack(index, 542);
    state.flags.june_pike_present = true;
    state = act(state, { type: "MOVE", direction: "north" });
    state = act(state, { type: "TALK", npc: "houndsman" });
    const cadeWithJune = buildRpgObservation(index, state);
    expect(cadeWithJune.dialogue?.npc_text).toMatch(/Choose HUNT with GO north or RELEASE JUNE/i);
    expect(cadeWithJune.available_actions.find((action) => action.id === "ask_hunt")?.command).toBe(
      `ask: ${CADE_HUNT_ROOT_LABEL}`,
    );
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
      /Choose by outcome[^]*Cade's reviews and support do not choose a plan[^]*Choose LURE, DRIVE, or FORTIFY with Cade before going north/i,
    );
    expect(juneBoundary.dialogue?.npc_text).toMatch(
      /choose now[^]*RELEASE JUNE[^]*preserves our agreement[^]*loses all my help[^]*keep me with the cattle and go north[^]*first wolf death[^]*end our agreement/i,
    );
    expect(juneBoundary.dialogue?.npc_text).not.toMatch(/living plan/i);
    const juneCommands = Object.fromEntries(
      juneBoundary.available_actions.map((action) => [action.id, action.command]),
    );
    expect(juneCommands).toMatchObject({
      ask_release_june_for_hunt: expect.stringMatching(
        /CHOOSE HUNT \/ RELEASE JUNE[^]*Preserve June's agreement[^]*lose all her help/i,
      ),
      ask_commit_hunt_and_hold: expect.stringMatching(
        /KEEP JUNE[^]*Keep her cattle-first help[^]*Going north chooses HUNT[^]*first wolf death ends her agreement/i,
      ),
      ask_keep_cattle_terms: expect.stringMatching(
        /BACK[^]*Return to Cade's LURE, DRIVE, and FORTIFY reviews without choosing a plan/i,
      ),
    });
    expect(
      juneBoundary.available_actions.find((action) => action.id === "ask_commit_hunt_and_hold")
        ?.command,
    ).toMatch(/KEEP JUNE[^]*first wolf death ends her agreement/i);
    const releasedImmediately = act(structuredClone(state), {
      type: "ASK",
      npc: "june_pike",
      topic: "release_june_for_hunt",
    });
    expect(releasedImmediately.flags.june_hunt_released).toBe(true);
    expect(releasedImmediately.flags.june_pike_present).not.toBe(true);
    expect(releasedImmediately.visited.paling_gap).not.toBe(true);
    expect(legalActionIds(releasedImmediately)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
    let deferredToCade = act(structuredClone(state), {
      type: "ASK",
      npc: "june_pike",
      topic: "keep_cattle_terms",
    });
    const juneTerms = buildRpgObservation(index, deferredToCade);
    expect(juneTerms.dialogue?.npc_text).toMatch(
      /cattle-first terms already apply[^]*chooses nothing[^]*Return to Cade[^]*North remains blocked/i,
    );
    expect(dialogueActionIds(legalActionIds(deferredToCade))).toEqual(["ask_return_to_cade"]);
    expect(deferredToCade.flags.strategy_lure_committed).not.toBe(true);
    expect(deferredToCade.flags.strategy_drive_committed).not.toBe(true);
    expect(deferredToCade.flags.strategy_fortify_committed).not.toBe(true);
    deferredToCade = act(deferredToCade, {
      type: "ASK",
      npc: "june_pike",
      topic: "return_to_cade",
    });
    expect(buildRpgObservation(index, deferredToCade).dialogue).toBeNull();
    deferredToCade = act(deferredToCade, { type: "TALK", npc: "houndsman" });
    expect(legalActionIds(deferredToCade)).toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
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

  it("keeps June's alternate HUNT commitment and guarded support truthful through MCP tools", () => {
    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({ world_quest_id: "wolf_winter", seed: 543 });
    const session = api.sessions.get(started.session_id);
    const withJune = structuredClone(session.state);
    withJune.flags.june_pike_present = true;
    api.sessions.update(started.session_id, withJune);
    const stepAction = (actionId: string): StepResult =>
      api.step_action({
        session_id: started.session_id,
        action_id: actionId,
      }) as unknown as StepResult;
    const listed = (): LegalActionsResult =>
      api.list_legal_actions({
        session_id: started.session_id,
        compact_actions: false,
      }) as unknown as LegalActionsResult;

    expect(stepAction("go_north").ok).toBe(true);
    expect(stepAction("talk_houndsman").ok).toBe(true);
    expect(listed().actions.find((action) => action.id === "ask_hunt")?.command).toBe(
      `ask: ${CADE_HUNT_ROOT_LABEL}`,
    );
    expect(listed().actions.find((action) => action.id === "ask_byre")?.command).toMatch(
      /PREPARE SUPPORT[^]*guarded HUNT tactic[^]*does not choose HUNT/i,
    );

    expect(stepAction("ask_byre").ok).toBe(true);
    expect(session.state.flags.heard_plan).toBe(true);
    expect(session.state.flags.strategy_lure_committed).not.toBe(true);
    expect(session.state.flags.strategy_drive_committed).not.toBe(true);
    expect(session.state.flags.strategy_fortify_committed).not.toBe(true);

    expect(stepAction("ask_leave").ok).toBe(true);
    expect(stepAction("talk_june_pike").ok).toBe(true);
    expect(
      listed().actions.find((action) => action.id === "ask_release_june_for_hunt")?.command,
    ).toMatch(/CHOOSE HUNT \/ RELEASE JUNE/i);
    expect(stepAction("ask_release_june_for_hunt").ok).toBe(true);
    expect(session.state.flags.june_hunt_released).toBe(true);
    expect(session.state.visited.paling_gap).not.toBe(true);
    expect(listed().actions.map((action) => action.id)).not.toEqual(
      expect.arrayContaining(["ask_lure", "ask_drive", "ask_fortify"]),
    );
  });

  it("discloses the optional LURE lesson's plan-menu return while preserving reconsideration", () => {
    const root = startCadeDialogue();
    const rootObservation = buildRpgObservation(index, root);
    const rootQuick = rootObservation.available_actions.find(
      (option) => option.id === "ask_wolves",
    );
    const rootLure = rootObservation.available_actions.find((option) => option.id === "ask_lure");
    expect(rootQuick).toBeDefined();
    expect(rootLure).toMatchObject({
      id: "ask_lure",
      command: CADE_LURE_ROOT_COMMAND,
      action: { type: "ASK", npc: "houndsman", topic: "lure" },
    });
    expect(CADE_LURE_ROOT_COMMAND.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);

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
      /Learn Cade's quick HUNT tactic now[^]*\+2 attack[^]*\+5 score[^]*choosing LURE permanently closes that lesson[^]*Going north without choosing LURE chooses HUNT/i,
    );
    expect(unheardCommit?.command).toMatch(
      /CHOOSE LURE[^]*only feed sack[^]*three actions[^]*leave the paling broken[^]*permanently close HUNT, DRIVE, and FORTIFY/i,
    );
    expect(directQuick).toMatchObject({
      id: "ask_quick_lesson",
      command:
        "ask: PREPARE SUPPORT — Learn the quick HUNT tactic for +2 attack and +5 score. This does not choose LURE.",
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
      "Cade's quick HUNT tactic grants persistent +2 attack and +5 score. Use the shown SET/DRIVE pair for the yearling, WHEEL/TURN for the flank-wolf, or CLOSE/DRIVE for the grey leader. Completed fights stay complete.",
    );
    observation = buildRpgObservation(index, unheard);
    const postLessonIds = observation.available_actions.map((option) => option.id);
    expect(observation.available_actions.find((option) => option.id === "ask_lure")).toMatchObject({
      id: "ask_lure",
      command: CADE_LURE_ROOT_COMMAND,
      action: { type: "ASK", npc: "houndsman", topic: "lure" },
    });
    expect(postLessonIds).toEqual(
      expect.arrayContaining(["ask_hunt", "ask_lure", "ask_drive", "ask_fortify"]),
    );
    for (const unavailable of ["ask_wolves", "ask_quick_lesson", "ask_commit_lure"])
      expect(postLessonIds).not.toContain(unavailable);

    const huntPivot = act(structuredClone(unheard), {
      type: "ASK",
      npc: "houndsman",
      topic: "hunt",
    });
    expect(huntPivot.flags.strategy_lure_committed).not.toBe(true);
    expect(huntPivot.flags.heard_counsel).toBe(true);
    const preparedHunt = act(huntPivot, {
      type: "ASK",
      npc: "houndsman",
      topic: "prepare_hunt",
    });
    expect(legalActionIds(preparedHunt)).toContain("go_north");

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
    expect(narrations(advised.events).join(" ")).toContain(
      "SET the Albany relief spear against the yearling's rush",
    );
    const obs = buildRpgObservation(index, advised.state);
    expect(obs.dialogue?.npc_text).toMatch(
      /You know the quick HUNT tactic[^]*still learn the guarded tactic/i,
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
