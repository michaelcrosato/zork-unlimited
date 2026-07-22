import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { SAVE_MODE, load, save } from "../../src/persist/save_load.js";
import { rpgActionOptionForInputId } from "../../src/rpg/legal_actions.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { recordTrace } from "../../src/trace/record.js";
import { replayTrace } from "../../src/trace/replay.js";
import { GameSession } from "../../ui/src/engine.js";

const SOURCE_PATH = "content/rpg/quests/wolf_winter.yaml";
const SOURCE_HASH = "999f3882c25ba9777b0597afb6ee1ba70616987a9725ed590639476b1a8b4fa5";
const loaded = loadRpgSourceFile(SOURCE_PATH);
if (!loaded.ok) throw new Error("wolf_winter must compile");
const index = indexRpgPack(loaded.compiled.pack);

function rng(face: "best" | "worst"): Rng {
  return {
    next: () => (face === "best" ? 0.999999 : 0),
    int: (min, max) => (face === "best" ? max : min),
  };
}

function choose(state: GameState, id: string, face: "best" | "worst" = "best"): GameState {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  expect(option, `missing ${id}`).toBeDefined();
  if (!option) throw new Error(`missing ${id}`);
  const result = makeStep(buildRpgRules(index, () => rng(face)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function atPaling(): GameState {
  let state = initStateForRpgPack(index, 503);
  for (const id of [
    "go_north",
    "talk_houndsman",
    "ask_wolves",
    "ask_byre",
    "ask_leave",
    "go_west",
    "take_byre_jerkin",
    "use_byre_jerkin",
    "go_east",
    "go_north",
  ]) {
    state = choose(state, id);
  }
  return state;
}

function ids(state: GameState): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

function assertOnlyCanonicalRailId(state: GameState, id: string, command: RegExp): void {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === id);
  expect(option?.command).toMatch(command);
  expect(ids(state)).not.toContain("use_paling_rail");
}

describe("Wolf-Winter paling stage action identities", () => {
  it("qualifies only one-to-one verb hubs and rejects legacy-id shadows", () => {
    expect([...index.verbIdentifiedTargetOnlyUseTargets]).toEqual(["paling_rail"]);

    const tideLoaded = loadRpgSourceFile("content/rpg/quests/tide_mill.yaml");
    if (!tideLoaded.ok) throw new Error("tide_mill must compile");
    const tideIndex = indexRpgPack(tideLoaded.compiled.pack);
    expect(tideIndex.verbIdentifiedTargetOnlyUseTargets.has("choked_sluice")).toBe(false);

    const shadowed = structuredClone(loaded.compiled.pack);
    const rail = shadowed.objects.find((object) => object.id === "paling_rail");
    const template = rail?.interactions.find(
      (interaction) => interaction.verb === "USE" && interaction.target === "paling_rail",
    );
    if (!rail || !template) throw new Error("paling fixture must carry a USE interaction");
    rail.interactions.push({
      ...template,
      item: "paling_rail",
      target: "paling_rail",
      command_verb: "reuse",
    });
    expect(indexRpgPack(shadowed).verbIdentifiedTargetOnlyUseTargets.has("paling_rail")).toBe(
      false,
    );
  });

  it("projects all five real stages from the loaded pack without changing its source hash", () => {
    expect(loaded.compiled.contentHash).toBe(SOURCE_HASH);

    const publicOpening = atPaling();
    assertOnlyCanonicalRailId(publicOpening, "wedge_paling_rail", /^wedge /i);

    const split = choose(publicOpening, "wedge_paling_rail", "worst");
    assertOnlyCanonicalRailId(split, "bind_paling_rail", /^bind /i);
    expect(choose(split, "bind_paling_rail").inventory).toContain("split_rail_guard");

    const worksOpening = atPaling();
    worksOpening.flags.works_fortification_prepared = true;
    assertOnlyCanonicalRailId(worksOpening, "set_paling_rail", /^set /i);
    const worksSplit = choose(worksOpening, "set_paling_rail", "worst");
    assertOnlyCanonicalRailId(worksSplit, "splice_paling_rail", /^splice /i);
    const spliced = choose(worksSplit, "splice_paling_rail");
    expect(spliced.flags.breach_braced).toBe(true);
    expect(spliced.vars.cattle_alarm).toBe(1);

    const scentPen = atPaling();
    Object.assign(scentPen.flags, {
      strategy_lure_committed: true,
      lure_trail_fouled: true,
      breach_braced: true,
    });
    assertOnlyCanonicalRailId(scentPen, "turn_paling_rail", /^turn .*scent-pen/i);
    const redirected = choose(scentPen, "turn_paling_rail");
    expect(redirected.flags.yearling_redirected_with_braced_rail).toBe(true);
    expect(redirected.vars.score).toBe((scentPen.vars.score ?? 0) + 10);
  });

  it("fails closed for ambiguous aliases and never publishes input aliases", () => {
    const action = { type: "LOOK" as const };
    expect(
      rpgActionOptionForInputId(
        [
          { id: "first", command: "first", action, inputAliases: ["legacy"] },
          { id: "second", command: "second", action, inputAliases: ["legacy"] },
        ],
        "legacy",
      ),
    ).toBeNull();

    expect(ids(atPaling())).not.toContain("use_paling_rail");
  });

  it("accepts the legacy MCP and UI input while recording the canonical opening id", () => {
    const api = createToolApi({ root: process.cwd() });
    const launched = api.start_world_quest({ world_quest_id: "wolf_winter", seed: 503 });
    const session = api.sessions.get(launched.session_id);
    for (const id of [
      "go_north",
      "talk_houndsman",
      "ask_wolves",
      "ask_byre",
      "ask_leave",
      "go_west",
      "take_byre_jerkin",
      "use_byre_jerkin",
      "go_east",
      "go_north",
    ]) {
      const option = enumerateRpgActions(session.index, session.state).find(
        (candidate) => candidate.id === id,
      );
      if (!option) throw new Error(`MCP fixture missing ${id}`);
      const result = session.step(session.state, option.action);
      if (!result.ok) throw new Error(result.rejectionReason ?? `MCP fixture rejected ${id}`);
      api.sessions.update(session.id, result.state);
    }

    expect(
      api.list_legal_actions({ session_id: session.id, compact_actions: true }).actions,
    ).toContain("wedge_paling_rail");
    const stepped = api.step_action({ session_id: session.id, action_id: "use_paling_rail" });
    expect(stepped).toMatchObject({ ok: true, journeyActionId: "wedge_paling_rail" });
    expect(api.sessions.get(session.id).transcript.at(-1)?.action_id).toBe("wedge_paling_rail");

    const ui = GameSession.start(readFileSync(SOURCE_PATH, "utf8"), 503);
    for (const id of [
      "go_north",
      "talk_houndsman",
      "ask_wolves",
      "ask_byre",
      "ask_leave",
      "go_west",
      "take_byre_jerkin",
      "use_byre_jerkin",
      "go_east",
      "go_north",
    ]) {
      expect(ui.choose(id).ok, id).toBe(true);
    }
    expect(ui.view().choices.map((choice) => choice.id)).toContain("wedge_paling_rail");
    expect(ui.view().choices.map((choice) => choice.id)).not.toContain("use_paling_rail");
    expect(ui.choose("use_paling_rail")).toMatchObject({
      ok: true,
      journeyActionId: "wedge_paling_rail",
    });
  });

  it("keeps structured replay and a pre-change-hash save valid", () => {
    const split = choose(atPaling(), "wedge_paling_rail", "worst");
    const saved = save(split, SOURCE_HASH, SAVE_MODE, { worldQuestId: "wolf_winter" });
    const restored = load(saved, SOURCE_HASH);
    expect(restored.state).toEqual(split);
    expect(ids(restored.state)).toContain("bind_paling_rail");

    const trace = recordTrace(
      buildRpgRules(index, () => rng("worst")),
      atPaling(),
      [{ type: "USE", target: "paling_rail" }],
      {
        trace_id: "wolf_paling_stage_identity",
        content_hash: SOURCE_HASH,
        worldQuestId: "wolf_winter",
      },
    );
    expect(
      replayTrace(
        trace,
        buildRpgRules(index, () => rng("worst")),
      ).ok,
    ).toBe(true);
  });
});
