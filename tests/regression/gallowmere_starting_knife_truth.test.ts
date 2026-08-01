/**
 * Regression for bug_0516 — two independent pure players trusted the opening
 * claim that their hunting-knife was already at their belt, then discovered an
 * empty inventory after leaving. The knife is the hunter's mandatory tool, not a
 * zero-payoff pickup: every human and MCP surface must start with it as real gear.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { RPG_STATE_HASH_MISMATCH_REASON } from "../../src/mcp/rpg_state_guards.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";
import { JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE } from "../../src/mcp/journey_projection.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  EMBEDDED_QUEST_COMPACT_SCOPE_NOTE,
  type EmbeddedQuestCharacterContinuity,
} from "../../src/rpg/embedded_quest_character_continuity.js";
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
const MOOR_EDGE_PROFILE_CONTEXT =
  "Your history remains your own; on this moor, the hunt is read in spoor, wind, and knife-work.";

function namedCompactContinuity(continuity: EmbeddedQuestCharacterContinuity | undefined) {
  if (!continuity) return undefined;
  return {
    continuity: continuity.continuity,
    cross_boundary: "authored_imports_exports_only" as const,
    persistent_record: {
      background: continuity.persistent_record.background,
      health: { ...continuity.persistent_record.health },
    },
    quest_local_profile: {
      hp: continuity.quest_local_profile.hp,
      attack: continuity.quest_local_profile.attack,
      defense: continuity.quest_local_profile.defense,
      skills: continuity.quest_local_profile.skills.map((skill) => ({ ...skill })),
      inventory: [...continuity.quest_local_profile.inventory],
    },
    applied_campaign_import_effects: continuity.applied_campaign_import_effects.map((effect) => ({
      ...effect,
    })),
    scope_note: EMBEDDED_QUEST_COMPACT_SCOPE_NOTE,
  };
}

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
    expect(human.text).toContain(MOOR_EDGE_PROFILE_CONTEXT);
    expect(human.inventory).toEqual(["hunting_knife"]);
    expect(human.choices.map((choice) => choice.id)).toContain("examine_hunting_knife");
    expect(human.choices.map((choice) => choice.id)).not.toEqual(
      expect.arrayContaining(["take_hunting_knife", "drop_hunting_knife"]),
    );

    expect(full.observation.description).toBe(human.text);
    expect(full.observation.description).toContain(MOOR_EDGE_PROFILE_CONTEXT);
    expect(full.observation.inventory).toEqual(human.inventory);
    expect(full.observation.available_actions.map((choice) => choice.id)).toEqual(
      human.choices.map((choice) => choice.id),
    );
    expect(compact.context.text).toBe(human.text.trimEnd());
    expect(compact.context.text).toContain(MOOR_EDGE_PROFILE_CONTEXT);
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
    expect(embedded.text).toContain(MOOR_EDGE_PROFILE_CONTEXT);
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
    });

    expect(compact).toHaveProperty("context");
    expect(compact).not.toHaveProperty("launch_handoff");
    expect(compact.quest).toEqual(["gallowmere", "The Gallowmere", "queensbury_town__market"]);
    if (!compact.context) throw new Error("expected generic compact parent context");
    expect(compact.context.here[0]).toBe("queensbury_town");
    expect(compact.journey).toHaveProperty("decisionProof");

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
    expect(compact.rpg_session.character_continuity).toEqual({
      continuity: "same_campaign_character",
      cross_boundary: "authored_imports_exports_only",
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
      scope_note: EMBEDDED_QUEST_COMPACT_SCOPE_NOTE,
    });
    expect(compact.rpg_session.character_continuity).toEqual(
      namedCompactContinuity(full.rpg_session.character_continuity),
    );
    expect(compact.rpg_session).not.toHaveProperty("character_continuity_legend");
    expect(fullApi.sessions.get(full.rpg_session_id).stateHash).toBe(
      compactApi.sessions.get(compact.rpg_session_id).stateHash,
    );
    expect(fullApi.sessions.get(full.rpg_session_id).stateHash).toBe(
      GameSession.start(SOURCE, 2218).view().stateHash,
    );

    const fullOpeningRead = fullApi.get_observation({
      session_id: full.rpg_session_id,
      compact_observation: false,
    });
    const compactOpeningRead = compactApi.get_observation({
      session_id: compact.rpg_session_id,
      compact_observation: true,
    });
    expect(fullOpeningRead).not.toHaveProperty("character_continuity");
    expect(fullOpeningRead.observation.description).toContain(MOOR_EDGE_PROFILE_CONTEXT);
    expect(compactOpeningRead).not.toHaveProperty("character_continuity");
    expect(compactOpeningRead.context.text).toContain(MOOR_EDGE_PROFILE_CONTEXT);
    expect(compactOpeningRead).not.toHaveProperty("character_continuity_legend");

    const fullContinuityRecovery = fullApi.get_observation({
      session_id: full.rpg_session_id,
      compact_observation: false,
      include_character_continuity: true,
      if_state_hash: full.rpg_session.state_hash,
    });
    expect(fullContinuityRecovery.character_continuity).toEqual(
      full.rpg_session.character_continuity,
    );
    const compactContinuityRecovery = compactApi.get_observation({
      session_id: compact.rpg_session_id,
      compact_observation: true,
      include_character_continuity: true,
      if_state_hash: compact.rpg_session.state_hash,
    });
    expect(compactContinuityRecovery).not.toHaveProperty("unchanged");
    expect(compactContinuityRecovery.character_continuity).toEqual(
      compact.rpg_session.character_continuity,
    );

    const directApi = createToolApi({ root: process.cwd() });
    const directStart = directApi.start_world_quest({
      world_quest_id: "gallowmere",
      seed: 2218,
      compact_observation: true,
    });
    const directContinuityPull = directApi.get_observation({
      session_id: directStart.session_id,
      compact_observation: true,
      include_character_continuity: true,
      if_state_hash: directStart.state_hash,
    });
    expect(directContinuityPull).not.toHaveProperty("unchanged");
    expect(directContinuityPull).not.toHaveProperty("character_continuity");
    const directStale = directApi.step_action({
      session_id: directStart.session_id,
      action_id: "look_around",
      expected_state_hash: "stale",
      compact_observation: true,
    });
    expect(directStale.ok).toBe(false);
    expect(directStale.rejection_reason).toBe(RPG_STATE_HASH_MISMATCH_REASON);

    const compactInitialStateHash = compactApi.sessions.get(compact.rpg_session_id).stateHash;
    const compactRejected = compactApi.step_action({
      session_id: compact.rpg_session_id,
      action_id: "not_a_legal_action",
      compact_observation: true,
      compact_events: true,
    });
    expect(compactRejected.ok).toBe(false);
    expect(compactRejected.state_hash).toBe(compact.rpg_session.state_hash);
    expect(compactRejected).not.toHaveProperty("character_continuity");
    expect(compactRejected).not.toHaveProperty("character_continuity_legend");
    expect(compactApi.sessions.get(compact.rpg_session_id).stateHash).toBe(compactInitialStateHash);

    const staleRecovery = compactApi.step_action({
      session_id: compact.rpg_session_id,
      action_id: "look_around",
      expected_state_hash: "stale",
      compact_observation: true,
      compact_events: true,
    });
    expect(staleRecovery.ok).toBe(false);
    expect(staleRecovery.rejection_reason).toContain(
      "get_observation include_character_continuity:true",
    );
    expect(staleRecovery).not.toHaveProperty("character_continuity");
    expect(compactApi.sessions.get(compact.rpg_session_id).stateHash).toBe(compactInitialStateHash);

    expect(
      fullApi.step_action({
        session_id: full.rpg_session_id,
        action_id: "go_west",
        compact_observation: false,
        compact_events: false,
      }).ok,
    ).toBe(true);
    expect(
      fullApi.step_action({
        session_id: full.rpg_session_id,
        action_id: "talk_hedrick",
        compact_observation: false,
        compact_events: false,
      }).ok,
    ).toBe(true);
    const fullLoreStep = fullApi.step_action({
      session_id: full.rpg_session_id,
      action_id: "ask_ask_sow",
      compact_observation: false,
      compact_events: false,
    });
    expect(fullLoreStep.ok).toBe(true);
    expect(fullLoreStep).not.toHaveProperty("character_continuity");
    expect(fullApi.sessions.get(full.rpg_session_id).state.vars.lore).toBe(8);

    expect(
      compactApi.step_action({
        session_id: compact.rpg_session_id,
        action_id: "go_west",
        compact_observation: true,
        compact_events: true,
      }).ok,
    ).toBe(true);
    expect(
      compactApi.step_action({
        session_id: compact.rpg_session_id,
        action_id: "talk_hedrick",
        compact_observation: true,
        compact_events: true,
      }).ok,
    ).toBe(true);
    const compactLoreStep = compactApi.step_action({
      session_id: compact.rpg_session_id,
      action_id: "ask_ask_sow",
      compact_observation: true,
      compact_events: true,
    });
    expect(compactLoreStep.ok).toBe(true);
    expect(compactLoreStep).not.toHaveProperty("character_continuity");
    expect(compactApi.sessions.get(compact.rpg_session_id).state.vars.lore).toBe(8);
    expect(compactLoreStep.state_hash).toBe(fullLoreStep.state_hash);
    expect(compactLoreStep).not.toHaveProperty("character_continuity_legend");

    const fullReread = fullApi.get_observation({
      session_id: full.rpg_session_id,
      compact_observation: false,
    });
    const compactReread = compactApi.get_observation({
      session_id: compact.rpg_session_id,
      compact_observation: true,
    });
    expect(fullReread).not.toHaveProperty("character_continuity");
    expect(compactReread).not.toHaveProperty("character_continuity");

    const saved = fullApi.save_game({ session_id: full.rpg_session_id });
    expect(JSON.parse(saved.save)).toMatchObject({
      embedded_character_continuity: {
        version: 1,
        character_continuity: { applied_campaign_import_effects: [] },
      },
    });
    const fullReload = fullApi.load_game({
      save: saved.save,
      compact_observation: false,
    });
    const compactReload = compactApi.load_game({
      save: saved.save,
      compact_observation: true,
    });
    expect(fullReload.state_hash).toBe(fullLoreStep.state_hash);
    expect(fullReload.character_continuity?.quest_local_profile.skills).toContainEqual({
      id: "lore",
      value: 8,
    });
    expect(compactReload.character_continuity?.quest_local_profile.skills).toContainEqual({
      id: "lore",
      value: 8,
    });
    expect(compactReload.character_continuity).toEqual(
      namedCompactContinuity(fullReload.character_continuity),
    );
    expect(compactReload).not.toHaveProperty("character_continuity_legend");
    const reloadedSession = fullApi.sessions.get(fullReload.session_id);
    expect(reloadedSession.overworldSessionId).toBeUndefined();
    expect(Object.isFrozen(reloadedSession.embeddedCharacterContinuity)).toBe(true);
    expect(fullApi.save_game({ session_id: fullReload.session_id }).save).toBe(saved.save);
  });

  it("surfaces a reachable parent story gate while suppressing Gallowmere actions", () => {
    const a = createToolApi({ root: process.cwd() });
    const parent = a.restore_overworld_session({
      snapshot: registeredQueensburyMarketSession().snapshot(),
      compact_context: true,
    });
    const launched = a.start_overworld_session_quest({
      session_id: parent.session_id,
      quest_id: "gallowmere",
      seed: 2218,
      compact_observation: true,
      include_actions: true,
    });

    for (const roadId of [
      "road_saratoga_springs_city__queensbury_town",
      "road_albany_city__saratoga_springs_city",
    ]) {
      a.travel_overworld_session({ session_id: parent.session_id, road_id: roadId });
      const view = a.get_overworld_session({
        session_id: parent.session_id,
        include_observation: true,
      }).observation;
      if (view.pendingRoadEncounter) {
        a.resolve_overworld_session_road_encounter({
          session_id: parent.session_id,
          strategy: "press_on",
        });
      }
    }
    const returned = a.get_overworld_session({
      session_id: parent.session_id,
      include_observation: true,
    }).observation;
    const stationRoute = returned.areaExits.find(
      (route) => route.destination.id === "albany_city__transport_hub",
    );
    if (!stationRoute) throw new Error("expected the Albany Station route");
    a.move_overworld_session_area({
      session_id: parent.session_id,
      area_route_id: stationRoute.id,
    });
    a.choose_overworld_session_story({
      session_id: parent.session_id,
      story_choice_id: "albany:wolf_preparation",
      choice: "albany:prep_works_fortification",
    });
    const june = a.talk_overworld_session_contact({
      session_id: parent.session_id,
      character_id: "albany_city__transport_hub__june_pike",
      compact_context: false,
      compact_result: false,
    });
    const fullStory = june.journey.storyChoice;
    if (!fullStory) throw new Error("expected June's reachable parent story gate");

    const rpgHash = a.sessions.get(launched.rpg_session_id).stateHash;
    const read = a.get_observation({
      session_id: launched.rpg_session_id,
      compact_observation: true,
      include_actions: true,
    });
    expect(read.context).not.toHaveProperty("actions");
    expect(read.journey?.storyChoice).toMatchObject({
      id: "albany:wolf_ally_commitment",
      kind: "ally",
      options: expect.arrayContaining([
        expect.objectContaining({
          id: "albany:ally_june_cattle_first",
          consequence: JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
        }),
      ]),
    });
    expect(JSON.stringify(read.journey?.storyChoice)).not.toContain(
      fullStory.options[0]!.consequence,
    );

    const listed = a.list_legal_actions({
      session_id: launched.rpg_session_id,
      compact_actions: true,
    });
    expect(listed.actions).toEqual([]);
    expect(listed.journey).toEqual(read.journey);

    const rejected = a.step_action({
      session_id: launched.rpg_session_id,
      action_id: "look_around",
      expected_state_hash: launched.rpg_session.state_hash,
      compact_observation: true,
    });
    expect(rejected.ok).toBe(false);
    if (!("context" in rejected)) throw new Error("expected the blocked child context");
    expect(rejected.context).not.toHaveProperty("actions");
    expect(rejected.journey?.storyChoice).toEqual(read.journey?.storyChoice);
    expect(rejected.state_hash).toBe(launched.rpg_session.state_hash);
    expect(a.sessions.get(launched.rpg_session_id).stateHash).toBe(rpgHash);
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
    expect(ending.characterContinuity?.quest_local_profile.hp).toBe(questHp);
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
