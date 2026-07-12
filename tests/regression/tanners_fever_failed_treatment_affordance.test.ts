/**
 * Regression for bug_0511: Tanner's Fever remained mechanically recoverable
 * after a failed treatment, but the known treatment vanished from every action
 * menu until the player discovered which evidence flag was missing. The compact
 * failure text also stopped immediately before the recovery instructions.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  render as renderCli,
  renderActionHelp,
  resolve as resolveCli,
} from "../../bin/rpg_play.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";
import { compactPlayerEvent } from "../../src/mcp/compact_rpg_event.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  enumerateRpgBlockedActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { GameSession } from "../../ui/src/engine.js";

const loaded = loadRpgSourceFile("content/rpg/quests/tanners_fever.yaml");
if (!loaded.ok) throw new Error("tanners_fever must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));

const TREATMENT_ID = "use_meadowsweet_on_sick_edric";
const BLOCKED_REASON =
  "Godwin will hear a corrected treatment only after all three proofs are established: inspect Edric, read his case notes, and inspect the meadowsweet in hand.";
const PREP_WITH_UNEXAMINED_HERB = [
  "examine_sick_edric",
  "go_west",
  "take_godwin_notes",
  "read_godwin_notes",
  "go_east",
  "go_east",
  "take_meadowsweet",
  "go_west",
] as const;

function act(state: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  if (!option) {
    throw new Error(
      `Missing ${id} in ${state.current}; legal=[${enumerateRpgActions(index, state)
        .map((candidate) => candidate.id)
        .join(", ")}]`,
    );
  }
  const result = step(state, option.action);
  expect(result.ok).toBe(true);
  return { state: result.state, events: result.events };
}

function play(state: GameState, ids: readonly string[]): GameState {
  for (const id of ids) state = act(state, id).state;
  return state;
}

function failedTreatment(): { state: GameState; events: GameEvent[] } {
  const state = play(initStateForRpgPack(index, 12), PREP_WITH_UNEXAMINED_HERB);
  const failed = act(state, TREATMENT_ID);
  expect(failed.state.flags.confrontation_attempted).toBe(true);
  expect(failed.state.flags.treatment_given).toBeUndefined();
  expect(failed.state.flags.herbs_examined).toBeUndefined();
  return failed;
}

function narration(events: readonly GameEvent[]): string {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: "narration" }> => event.type === "narration",
    )
    .map((event) => event.text)
    .join("\n");
}

describe("bug_0511 - failed Tanner treatment keeps a visible recovery affordance", () => {
  it("keeps the exact recovery instructions complete and persistently unavailable", () => {
    const failed = failedTreatment();
    const failedText = narration(failed.events);
    expect(failedText).toMatch(/inspect Edric/i);
    expect(failedText).toMatch(/read Godwin's case notes/i);
    expect(failedText).toMatch(/inspect the meadowsweet/i);
    expect(failedText).toMatch(/treat Edric again at the bedside/i);

    const recoveryEvent = failed.events.find(
      (event): event is Extract<GameEvent, { type: "narration" }> =>
        event.type === "narration" && event.text.includes("Godwin rejects"),
    );
    expect(recoveryEvent).toBeDefined();
    expect(compactPlayerEvent(recoveryEvent!)).toEqual(["n", recoveryEvent!.text]);
    expect(recoveryEvent!.text).not.toMatch(/\.\.\.\(\+|#[0-9a-f]{12}/i);

    const latestJournal = failed.state.journal.at(-1);
    expect(latestJournal).toMatch(/inspect Edric.*read his notes.*inspect the meadowsweet/is);
    expect(latestJournal?.length).toBeLessThanOrEqual(128);

    expect(enumerateRpgActions(index, failed.state).map((option) => option.id)).not.toContain(
      TREATMENT_ID,
    );
    const blocked = enumerateRpgBlockedActions(index, failed.state);
    expect(blocked).toEqual([
      expect.objectContaining({ id: TREATMENT_ID, reason: BLOCKED_REASON }),
    ]);
    expect(JSON.stringify(blocked)).not.toMatch(/herbs_examined|visible_when|conditions/);

    const observation = buildRpgObservation(index, failed.state);
    expect(observation.blocked_actions).toEqual(blocked);
    const compact = compactRpgObservation(
      observation,
      observation.available_actions.map((option) => option.id),
    );
    expect(compact.unavailable).toEqual([[TREATMENT_ID, BLOCKED_REASON]]);
    expect(compact.journal?.at(-1)).toBe(latestJournal);
    expect(renderCli(observation)).toContain(
      `Unavailable: ${blocked[0]!.command} — ${BLOCKED_REASON}`,
    );
    expect(renderActionHelp(index, failed.state)).toContain(
      `Unavailable: ${blocked[0]!.command} — ${BLOCKED_REASON}`,
    );
    expect(resolveCli(index, failed.state, blocked[0]!.command)).toEqual({
      ok: false,
      reason: BLOCKED_REASON,
    });

    const talking = act(failed.state, "talk_godwin").state;
    expect(enumerateRpgBlockedActions(index, talking)).toEqual(blocked);
    expect(buildRpgObservation(index, talking).blocked_actions).toEqual(blocked);
    expect(resolveCli(index, talking, blocked[0]!.command)).toEqual({
      ok: false,
      reason: BLOCKED_REASON,
    });

    let ready = act(failed.state, "examine_meadowsweet").state;
    expect(enumerateRpgBlockedActions(index, ready)).toEqual([]);
    const recovery = enumerateRpgActions(index, ready).find((option) => option.id === TREATMENT_ID);
    expect(recovery?.skill_check).toBeUndefined();
    expect(recovery?.command).toMatch(/after ordering the evidence/i);
    ready = act(ready, TREATMENT_ID).state;
    expect(ready.flags.treatment_given).toBe(true);
  });

  it("keeps UI, full MCP, compact MCP, rejection, and restore on the same reason", () => {
    const source = readFileSync("content/rpg/quests/tanners_fever.yaml", "utf8");
    const ui = GameSession.start(source, 12);
    for (const id of PREP_WITH_UNEXAMINED_HERB) expect(ui.choose(id).ok, id).toBe(true);
    expect(ui.choose(TREATMENT_ID).ok).toBe(true);
    const uiBlocked = ui.view().unavailableChoices;
    expect(uiBlocked).toEqual([
      expect.objectContaining({ id: TREATMENT_ID, reason: BLOCKED_REASON }),
    ]);
    const uiHash = ui.view().stateHash;
    expect(ui.choose(TREATMENT_ID)).toMatchObject({
      ok: false,
      rejection: BLOCKED_REASON,
      journeyDecision: { countsTowardJourney: false, reason: "rejected" },
      journeyActionId: null,
    });
    expect(ui.view().stateHash).toBe(uiHash);
    expect(ui.choose("talk_godwin").ok).toBe(true);
    expect(ui.view().unavailableChoices).toEqual([
      expect.objectContaining({ id: TREATMENT_ID, reason: BLOCKED_REASON }),
    ]);

    const api = createToolApi({ root: process.cwd() });
    const started = api.start_world_quest({
      world_quest_id: "tanners_fever",
      seed: 12,
      compact_observation: false,
    });
    for (const actionId of PREP_WITH_UNEXAMINED_HERB) {
      const outcome = api.step_action({
        session_id: started.session_id,
        action_id: actionId,
        compact_observation: false,
        compact_events: false,
      });
      expect(outcome.ok, actionId).toBe(true);
    }
    const failed = api.step_action({
      session_id: started.session_id,
      action_id: TREATMENT_ID,
      compact_observation: false,
      compact_events: false,
    });
    expect(failed.ok).toBe(true);
    expect(failed.observation.blocked_actions).toEqual([
      expect.objectContaining({ id: TREATMENT_ID, reason: BLOCKED_REASON }),
    ]);
    const talked = api.step_action({
      session_id: started.session_id,
      action_id: "talk_godwin",
      compact_observation: false,
      compact_events: false,
    });
    expect(talked.ok).toBe(true);
    expect(talked.observation.dialogue?.npc).toBe("godwin");
    expect(talked.observation.blocked_actions).toEqual([
      expect.objectContaining({ id: TREATMENT_ID, reason: BLOCKED_REASON }),
    ]);

    const compact = api.get_observation({
      session_id: started.session_id,
      compact_observation: true,
    });
    expect(compact.context.unavailable).toEqual([[TREATMENT_ID, BLOCKED_REASON]]);
    const compactRows = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: true,
    });
    expect(compactRows.actions).not.toContain(TREATMENT_ID);
    expect(compactRows.blocked_actions).toEqual([[TREATMENT_ID, BLOCKED_REASON]]);
    const fullRows = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: false,
    });
    expect(fullRows.blocked_actions).toEqual([
      expect.objectContaining({ id: TREATMENT_ID, reason: BLOCKED_REASON }),
    ]);

    const saved = api.save_game({ session_id: started.session_id });
    const restored = api.load_game({ save: saved.save, compact_observation: true });
    expect(restored.context.unavailable).toEqual([[TREATMENT_ID, BLOCKED_REASON]]);

    const blockedAttempt = api.step_action({
      session_id: started.session_id,
      action_id: TREATMENT_ID,
      expected_state_hash: talked.state_hash,
      compact_observation: true,
      compact_events: true,
    });
    expect(blockedAttempt).toMatchObject({
      ok: false,
      rejection_reason: BLOCKED_REASON,
      state_hash: talked.state_hash,
      journeyDecision: { countsTowardJourney: false, reason: "rejected" },
      journeyActionId: null,
    });
    if (!("context" in blockedAttempt)) throw new Error("expected state-matched rejection");
    expect(blockedAttempt.context.unavailable).toEqual([[TREATMENT_ID, BLOCKED_REASON]]);

    const identified = api.step_action({
      session_id: started.session_id,
      action_id: "examine_meadowsweet",
      compact_observation: true,
      compact_events: true,
    });
    expect(identified.ok).toBe(true);
    expect(identified.context.unavailable).toBeUndefined();
    const ready = api.list_legal_actions({
      session_id: started.session_id,
      compact_actions: false,
    });
    expect(ready.blocked_actions).toBeUndefined();
    expect(ready.actions.find((option) => option.id === TREATMENT_ID)).toMatchObject({
      id: TREATMENT_ID,
    });
    expect(ready.actions.find((option) => option.id === TREATMENT_ID)?.skill_check).toBeUndefined();

    const recovered = api.step_action({
      session_id: started.session_id,
      action_id: TREATMENT_ID,
      compact_observation: false,
      compact_events: false,
    });
    expect(recovered.ok).toBe(true);
    expect(recovered.observation.blocked_actions).toEqual([]);
    expect(recovered.observation.state.flags).toContain("treatment_given");
  });

  it("renders unavailable web choices disabled with their authored reason", () => {
    const app = readFileSync("ui/src/App.tsx", "utf8");
    const styles = readFileSync("ui/src/styles.css", "utf8");
    expect(app).toContain("questView.unavailableChoices.map");
    expect(app).toMatch(/<button disabled[\s\S]{0,220}choice\.reason[\s\S]{0,80}<\/button>/);
    expect(styles).toContain(".choices button:disabled");
    expect(styles).toContain(".choice-reason");
  });

  it("never blocks the same-id recovery when a prepared failed case is already legal", () => {
    let state = play(initStateForRpgPack(index, 30), [
      ...PREP_WITH_UNEXAMINED_HERB.slice(0, -1),
      "examine_meadowsweet",
      "go_west",
    ]);
    state = act(state, TREATMENT_ID).state;
    expect(state.flags.treatment_given).toBeUndefined();
    expect(enumerateRpgBlockedActions(index, state)).toEqual([]);
    const recovery = enumerateRpgActions(index, state).find((option) => option.id === TREATMENT_ID);
    expect(recovery?.id).toBe(TREATMENT_ID);
    expect(recovery?.skill_check).toBeUndefined();
  });
});
