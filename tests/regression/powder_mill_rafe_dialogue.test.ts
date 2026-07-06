/**
 * Regression for bug_0449 -- Powder Mill Surety authored Rafe like a motivated
 * gatekeeper but offered only attack_rafe. An ordnance surveyor should be able to
 * show authority and explain the hazard, even though the real solution remains
 * making the live tray safe.
 */
import { describe, it, expect } from "vitest";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep, actionEquals } from "../../src/core/engine.js";
import type { RpgAction } from "../../src/api/types.js";
import type { GameEvent } from "../../src/core/events.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadRpgSourceFile("content/rpg/quests/powder_mill_surety.yaml");
if (!loaded.ok) throw new Error("powder_mill_surety must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function act(state: GameState, RpgAction: RpgAction): { state: GameState; text: string } {
  expect(
    rules.legalActions(state).some((a) => actionEquals(a, RpgAction)),
    `RpgAction ${JSON.stringify(RpgAction)} must be legal in ${state.current}`,
  ).toBe(true);
  const result = step(state, RpgAction);
  expect(result.ok, result.rejectionReason).toBe(true);
  return {
    state: result.state,
    text: result.events
      .filter((e): e is GameEvent & { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" "),
  };
}

function withFuseReadAtGate(): GameState {
  let state = initStateForRpgPack(index, 7);
  state = act(state, { type: "MOVE", direction: "east" }).state;
  state = act(state, { type: "READ", target: "fuse_chart" }).state;
  state = act(state, { type: "MOVE", direction: "west" }).state;
  return act(state, { type: "MOVE", direction: "north" }).state;
}

describe("bug_0449 -- Powder Mill Surety lets Rafe be addressed without a fight", () => {
  it("offers talk with Rafe alongside the combat fallback on the gate walk", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" }).state;

    const obs = buildRpgObservation(index, state);
    expect(obs.available_actions.map((a) => a.id)).toContain("talk_rafe_watcher");
    expect(obs.available_actions.map((a) => a.id)).toContain("attack_rafe");
    expect(obs.blocked_exits.find((e) => e.direction === "north")?.message).toContain(
      "force your way past",
    );
  });

  it("lets the surveyor show authority and records why words alone do not open the gate", () => {
    let state = initStateForRpgPack(index, 7);
    state = act(state, { type: "MOVE", direction: "north" }).state;
    state = act(state, { type: "TALK", npc: "rafe_watcher" }).state;

    let obs = buildRpgObservation(index, state);
    expect(obs.dialogue?.npc).toBe("rafe_watcher");
    expect(obs.available_actions.map((a) => a.id)).toContain("ask_show_commission");

    const shown = act(state, {
      type: "ASK",
      npc: "rafe_watcher",
      topic: "show_commission",
    });
    state = shown.state;

    expect(shown.text).toContain("I know the city stamp");
    expect(state.flags["showed_commission"]).toBe(true);
    expect(state.vars["score"] ?? 0).toBe(0);
    expect(buildRpgObservation(index, state).dialogue?.npc_text).toContain(
      "Kill the charge where it lies",
    );

    state = act(state, {
      type: "ASK",
      npc: "rafe_watcher",
      topic: "commission_back",
    }).state;
    obs = buildRpgObservation(index, state);
    expect(obs.dialogue?.npc_text).toContain("It proves whose report this is");
  });

  it("after reading the fuse chart, Rafe can be told the concrete smothering plan", () => {
    let state = withFuseReadAtGate();
    state = act(state, { type: "TALK", npc: "rafe_watcher" }).state;

    let obs = buildRpgObservation(index, state);
    expect(obs.available_actions.map((a) => a.id)).toContain("ask_explain_tray");

    const warned = act(state, {
      type: "ASK",
      npc: "rafe_watcher",
      topic: "explain_tray",
    });
    state = warned.state;

    expect(warned.text).toContain("Dry magazine sand");
    expect(warned.text).toContain("Make that tray dull");
    expect(state.flags["warned_rafe"]).toBe(true);
    expect(state.vars["score"]).toBe(10);
    expect(buildRpgObservation(index, state).dialogue?.npc_text).toContain("Dry magazine sand");

    state = act(state, {
      type: "ASK",
      npc: "rafe_watcher",
      topic: "hazard_back",
    }).state;
    obs = buildRpgObservation(index, state);
    expect(obs.dialogue?.npc_text).toContain("dry sand, low hand");
    expect(obs.available_actions.map((a) => a.id)).not.toContain("ask_explain_tray");
  });

  it("the pack remains valid under the RPG validator", () => {
    const report = validateRpg(pack);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
