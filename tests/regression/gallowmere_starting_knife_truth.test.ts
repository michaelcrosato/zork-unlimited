/**
 * Regression for bug_0516 — two independent pure players trusted the opening
 * claim that their hunting-knife was already at their belt, then discovered an
 * empty inventory after leaving. The knife is the hunter's mandatory tool, not a
 * zero-payoff pickup: every human and MCP surface must start with it as real gear.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { buildCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { GameSession } from "../../ui/src/engine.js";

const SOURCE_PATH = "content/rpg/quests/gallowmere.yaml";
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const loaded = loadRpgSourceFile(SOURCE_PATH);
if (!loaded.ok) throw new Error("gallowmere must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);
const world = loadOverworldManifest(process.cwd());

function registeredQueensburyMarketSession(): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:road_warden");
  if (session.journey().storyChoice?.kind === "relief_oath") {
    session.chooseJourneyStory("albany:oath_limited_aid_only");
  }
  if (session.journey().storyChoice?.kind === "lead_source") {
    session.chooseJourneyStory("albany:source_rowan_civic_docket");
  }
  session.travel("road_albany_city__saratoga_springs_city");
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel("road_saratoga_springs_city__queensbury_town");
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.exploreArea("queensbury_town__civic_core");
  session.moveArea("queensbury_town__area_route__civic_core__market__1");
  expect(session.view().quests.map((quest) => quest.id)).toContain("gallowmere");
  return session;
}

function finishPreparedGallowmere(ui: GameSession): void {
  for (const actionId of [
    "go_west",
    "talk_hedrick",
    "ask_ask_sow",
    "read_shepherd_log",
    "go_east",
    "go_north",
    "go_east",
    "use_hunting_knife_on_spoor_ground",
    "go_west",
    "go_north",
    "use_hunting_knife_on_wind_stone",
    "go_north",
  ]) {
    expect(ui.choose(actionId).ok, actionId).toBe(true);
  }
  if (ui.view().choices.some((choice) => choice.id === "use_hunting_knife_on_sow_blind_side")) {
    expect(ui.choose("use_hunting_knife_on_sow_blind_side").ok).toBe(true);
  }
  for (
    let guard = 0;
    guard < 20 && ui.view().choices.some((choice) => choice.id === "attack_gallowmere_sow");
    guard += 1
  ) {
    expect(ui.choose("attack_gallowmere_sow").ok).toBe(true);
  }
  expect(ui.choose("go_north").ok).toBe(true);
}

type CompactContext = {
  here: readonly [string, string];
  text: string;
  inv?: string[];
  objects?: string[];
  actions?: string[];
  blocked?: Array<readonly [string, string]>;
};

function idsAt(state: ReturnType<typeof initStateForRpgPack>): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

describe("bug_0516 — Gallowmere starts with its promised hunting-knife", () => {
  it("models the knife as real, non-droppable starting gear instead of room loot", () => {
    const knife = pack.objects.find((object) => object.id === "hunting_knife");
    const edge = pack.rooms.find((room) => room.id === "moor_edge");
    expect(knife).toMatchObject({ held: true, takeable: false });
    expect(edge?.objects).not.toContain("hunting_knife");
    expect(edge?.variants ?? []).toEqual([]);

    const state = initStateForRpgPack(index, 2218);
    const observation = buildRpgObservation(index, state);
    const actions = idsAt(state);
    expect(state.inventory).toEqual(["hunting_knife"]);
    expect(observation.inventory).toEqual(["hunting_knife"]);
    expect(observation.visible_objects.map((object) => object.id)).not.toContain("hunting_knife");
    expect(actions).toContain("examine_hunting_knife");
    expect(actions).not.toContain("take_hunting_knife");
    expect(actions).not.toContain("drop_hunting_knife");
    expect(rules.legalActions(state)).not.toContainEqual({
      type: "TAKE",
      item: "hunting_knife",
    });
  });

  it("gives UI, full MCP, and compact MCP the same truthful opening state", () => {
    const ui = GameSession.start(SOURCE, 2218);
    const human = ui.view();
    const api = createToolApi({ root: process.cwd() });
    const full = api.start_world_quest({
      world_quest_id: "gallowmere",
      seed: 2218,
      compact_observation: false,
    });
    const compact = api.start_world_quest({
      world_quest_id: "gallowmere",
      seed: 2218,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    }) as unknown as { context: CompactContext };

    expect(human.text).toMatch(/hunting-knife is secured at your belt/i);
    expect(human.text).toMatch(/bothy[^]*west[^]*path[^]*north/i);
    expect(human.inventory).toEqual(["hunting_knife"]);
    expect(human.choices.map((choice) => choice.id)).toContain("examine_hunting_knife");
    expect(human.choices.map((choice) => choice.id)).not.toEqual(
      expect.arrayContaining(["take_hunting_knife", "drop_hunting_knife"]),
    );

    expect(full.observation.description).toBe(human.text);
    expect(full.observation.inventory).toEqual(human.inventory);
    expect(full.observation.available_actions.map((choice) => choice.id)).toEqual(
      human.choices.map((choice) => choice.id),
    );
    expect(compact.context.text).toBe(human.text.trimEnd());
    expect(compact.context.inv).toEqual(human.inventory);
    expect(compact.context.objects ?? []).not.toContain("hunting_knife");
    expect(compact.context.actions).toEqual(human.choices.map((choice) => choice.id));
    expect(compact.context.text).toBe(
      compactText(human.text.trimEnd(), COMPACT_DESCRIPTION_CHAR_LIMIT),
    );
    expect(compact.context.text).not.toMatch(/\.\.\.\(\+\d+ chars\)/);
    expect(full).not.toHaveProperty("character_continuity");
    expect(compact).not.toHaveProperty("character_continuity");
  });

  it("shows embedded browser players the same-character, quest-local profile boundary", () => {
    const character = buildCampaignCharacterState({
      background: "albany:road_warden",
      health: { current: 30, max: 30 },
    });
    const direct = GameSession.start(SOURCE, 2218).view();
    const embedded = GameSession.startEmbedded(SOURCE, character, undefined, 2218).view();

    expect(embedded.stateHash).toBe(direct.stateHash);
    expect(embedded.facts).toEqual(direct.facts);
    expect(embedded.inventory).toEqual(["hunting_knife"]);
    expect(embedded.characterContinuity).toMatchObject({
      continuity: "same_campaign_character",
      profile_scope: "quest_local",
      persistent_record: {
        background: "albany:road_warden",
        health: { current: 30, max: 30 },
      },
      quest_local_profile: {
        hp: 24,
        attack: 4,
        defense: 2,
        skills: [
          { id: "lore", value: 3 },
          { id: "tracking", value: 3 },
        ],
        inventory: ["hunting_knife"],
      },
      applied_campaign_import_effects: [],
    });
    expect(direct.characterContinuity).toBeUndefined();
  });

  it("projects the importless boundary in full and compact embedded MCP starts", () => {
    const snapshot = registeredQueensburyMarketSession().snapshot();
    const fullApi = createToolApi({ root: process.cwd() });
    const compactApi = createToolApi({ root: process.cwd() });
    const fullParent = fullApi.restore_overworld_session({
      snapshot,
      compact_context: false,
    });
    const compactParent = compactApi.restore_overworld_session({
      snapshot,
      compact_context: true,
    });
    const full = fullApi.start_overworld_session_quest({
      session_id: fullParent.session_id,
      quest_id: "gallowmere",
      seed: 2218,
      compact_observation: false,
      compact_actions: false,
      compact_result: false,
    });
    const compact = compactApi.start_overworld_session_quest({
      session_id: compactParent.session_id,
      quest_id: "gallowmere",
      seed: 2218,
      compact_observation: true,
      compact_actions: true,
      compact_result: false,
    });

    expect(full.rpg_session.character_continuity).toMatchObject({
      continuity: "same_campaign_character",
      profile_scope: "quest_local",
      persistent_record: {
        background: "albany:road_warden",
        health: { current: 30, max: 30 },
      },
      quest_local_profile: {
        hp: 24,
        attack: 4,
        defense: 2,
        skills: [
          { id: "lore", value: 3 },
          { id: "tracking", value: 3 },
        ],
        inventory: ["hunting_knife"],
      },
      applied_campaign_import_effects: [],
    });
    expect(compact.rpg_session.character_continuity).toEqual([
      "same_campaign_character",
      "quest_local",
      ["persistent_campaign_record", "albany:road_warden", 30, 30],
      [
        24,
        4,
        2,
        [
          ["lore", 3],
          ["tracking", 3],
        ],
        ["hunting_knife"],
      ],
      [],
      expect.any(String),
    ]);
    expect(compact.rpg_session.character_continuity_legend).toContain("profile_scope");
    expect(fullApi.sessions.get(full.rpg_session_id).stateHash).toBe(
      compactApi.sessions.get(compact.rpg_session_id).stateHash,
    );
    expect(fullApi.sessions.get(full.rpg_session_id).stateHash).toBe(
      GameSession.start(SOURCE, 2218).view().stateHash,
    );
  });

  it("keeps quest-local combat damage out of the persistent parent record", () => {
    const parent = registeredQueensburyMarketSession();
    parent.startQuest("gallowmere");
    const persistentBefore = parent.campaignCharacterState();
    const ui = GameSession.startEmbedded(SOURCE, persistentBefore, undefined, 7);

    finishPreparedGallowmere(ui);
    const ending = ui.view();
    expect(ending.ended).toBe(true);
    const questHp = Number(/^HP (\d+)/.exec(ending.facts[0] ?? "")?.[1]);
    expect(questHp).toBeLessThan(24);
    expect(ending.characterContinuity?.persistent_record.health.current).toBe(30);
    const endingTitle = pack.endings.find((candidate) => candidate.id === ending.endingId)?.title;
    if (!ending.endingId || !endingTitle)
      throw new Error("Expected the authored Gallowmere ending.");
    parent.completeQuest("gallowmere", {
      endingId: ending.endingId,
      endingTitle,
      death: false,
    });
    expect(parent.campaignCharacterState()).toEqual(persistentBefore);
  });

  it("carries the knife to both tool checks without a pickup or recovery detour", () => {
    const ui = GameSession.start(SOURCE, 2218);
    expect(ui.choose("go_north").ok).toBe(true);
    expect(ui.choose("go_east").ok).toBe(true);
    expect(ui.view().inventory).toEqual(["hunting_knife"]);
    expect(ui.view().choices.map((choice) => choice.id)).toContain(
      "use_hunting_knife_on_spoor_ground",
    );

    expect(ui.choose("go_west").ok).toBe(true);
    expect(ui.choose("go_north").ok).toBe(true);
    expect(ui.view().inventory).toEqual(["hunting_knife"]);
    expect(ui.view().choices.map((choice) => choice.id)).toContain(
      "use_hunting_knife_on_wind_stone",
    );
    expect(
      ui
        .view()
        .facts.some(
          (fact) => fact.startsWith("blocked: north — ") && /read(?:ing)? the wind/i.test(fact),
        ),
    ).toBe(true);
  });

  it("keeps Gallowmere's score, combat contract, and validator green", () => {
    expect(pack.meta.max_score).toBe(50);
    expect(pack.meta.vars_init).toMatchObject({ hp: 24, attack: 4, defense: 2 });
    expect(pack.meta.combat_guaranteed).toBe(true);
    const report = validateRpg(pack);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
