import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import { enemyHpVar } from "../../src/rpg/schema.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const LEAD_SOURCE =
  WORLD.opening_lead_source ??
  (() => {
    throw new Error("The starting slice requires an opening lead-source choice.");
  })();

const loadedWolf = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loadedWolf.ok) throw new Error("Wolf-Winter must compile.");
const wolfIndex = indexRpgPack(loadedWolf.compiled.pack);

const FULL_OVERWORLD = { compact_context: false, compact_result: false } as const;
const ROWAN_ID = "albany_city__civic_core__contact";
const HAYDEN_ID = "albany_city__transport_hub__contact";
const WOLF_ID = "wolf_winter";
const COURIER = "albany:unaffiliated_courier";
const LEDGER_ADVOCATE = "albany:ledger_advocate";
const ROAD_WARDEN = "albany:road_warden";
const DEFAULT_OATH = "albany:oath_full_compact_duty";
const ROWAN_SOURCE = "albany:source_rowan_civic_docket";
const JAMIE_SOURCE = "albany:source_jamie_market_testimony";
const HAYDEN_SOURCE = "albany:source_hayden_frost_report";
const DEFAULT_PREPARATION = "albany:prep_works_fortification";
const COUNTERFACTUAL_PREPARATION = "albany:prep_relief_protocol";
const RESIDENT_SHELTER_ALLOCATION = "albany:relief_resident_shelter";

type ToolApi = ReturnType<typeof createToolApi>;

function questIds(observation: { quests: readonly { id: string }[] }): string[] {
  return observation.quests.map((quest) => quest.id);
}

function moveToOpeningPreparation(session: OverworldSession): void {
  const areaId = WORLD.opening_preparation?.area;
  if (!areaId || session.view().currentArea?.id === areaId) return;
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`Expected a visible route to ${areaId}.`);
  session.moveArea(route.id);
}

function reachMcpLeadSource(
  api: ToolApi,
  profileId = COURIER,
): {
  sessionId: string;
  pendingJourney: ReturnType<OverworldSession["journey"]>;
} {
  const started = api.start_overworld({ compact_context: false });
  const sessionId = started.session_id;
  expect(questIds(started.observation)).not.toContain(WOLF_ID);

  api.scout_overworld_session_poi({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    poi_id: started.observation.pois[0]!.id,
  });
  const talked = api.talk_overworld_session_contact({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    character_id: ROWAN_ID,
  });
  expect(questIds(talked.observation)).not.toContain(WOLF_ID);
  expect(talked.journey.storyChoice).toMatchObject({ kind: "registration" });

  const registered = api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    choice: profileId,
  });
  expect(questIds(registered.observation)).not.toContain(WOLF_ID);
  expect(registered.journey.storyChoice).toMatchObject({ kind: "relief_oath" });
  const oathBound = api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    choice: DEFAULT_OATH,
  });
  expect(questIds(oathBound.observation)).not.toContain(WOLF_ID);
  expect(oathBound.journey.storyChoice).toMatchObject({
    id: LEAD_SOURCE.id,
    kind: "lead_source",
    options: LEAD_SOURCE.options.map((option) => ({ id: option.id })),
  });
  return { sessionId, pendingJourney: oathBound.journey };
}

function launchMcpWolf(
  sourceId: string,
  preparationId = COUNTERFACTUAL_PREPARATION,
): {
  api: ToolApi;
  overworldSessionId: string;
  state: GameState;
} {
  const api = createToolApi({ root: process.cwd() });
  const pending = reachMcpLeadSource(api);
  const selected = api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: pending.sessionId,
    choice: sourceId,
  });
  const preparationArea = WORLD.opening_preparation?.area;
  if (!preparationArea) throw new Error("Expected Albany opening preparation.");
  const preparationRoute = selected.observation.areaExits.find(
    (candidate) => candidate.destination.id === preparationArea,
  );
  if (!preparationRoute) throw new Error(`Expected a visible route to ${preparationArea}.`);
  const atPreparation = api.move_overworld_session_area({
    ...FULL_OVERWORLD,
    session_id: pending.sessionId,
    area_route_id: preparationRoute.id,
  });
  expect(atPreparation.observation.departureInteractions[0]?.kind).toBe("preparation");
  expect(questIds(atPreparation.observation)).toContain(WOLF_ID);
  const prepared = api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: pending.sessionId,
    story_choice_id: WORLD.opening_preparation!.id,
    choice: preparationId,
  });
  expect(prepared.observation.departureInteractions[0]?.kind).toBe("relief_allocation");
  const allocated = api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: pending.sessionId,
    story_choice_id: WORLD.opening_relief_allocation!.id,
    choice: RESIDENT_SHELTER_ALLOCATION,
  });
  const wolf = allocated.observation.quests.find((quest) => quest.id === WOLF_ID);
  if (!wolf) throw new Error("The selected preparation must reveal Wolf-Winter.");
  if (allocated.observation.currentArea?.id !== wolf.area) {
    const route = allocated.observation.areaExits.find(
      (candidate) => candidate.destination.id === wolf.area,
    );
    if (!route) throw new Error("The selected preparation must leave a route to Wolf-Winter.");
    api.move_overworld_session_area({
      ...FULL_OVERWORLD,
      session_id: pending.sessionId,
      area_route_id: route.id,
    });
  }
  const launched = api.start_overworld_session_quest({
    ...FULL_OVERWORLD,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: pending.sessionId,
    quest_id: wolf.id,
    approach_id: "albany:wolf_approach_sheltered_stockway",
    seed: 505,
  });
  return {
    api,
    overworldSessionId: pending.sessionId,
    state: structuredClone(api.sessions.get(launched.rpg_session_id).state),
  };
}

function reachDirectLeadSource(profileId: string): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(ROWAN_ID);
  session.chooseJourneyStory(profileId);
  expect(session.journey().storyChoice?.kind).toBe("relief_oath");
  session.chooseJourneyStory(DEFAULT_OATH);
  expect(session.journey().storyChoice?.kind).toBe("lead_source");
  return session;
}

function sourceTerms(profileId: string, sourceId: string) {
  const session = reachDirectLeadSource(profileId);
  const before = session.snapshot();
  const choice = session.journey().storyChoice?.options.find((option) => option.id === sourceId);
  if (!choice) throw new Error(`Missing lead-source option ${sourceId}.`);
  session.chooseJourneyStory(sourceId);
  const after = session.snapshot();
  return {
    choice,
    elapsedMinutes: after.minutes - before.minutes,
    moneyBefore: before.character.money,
    moneyAfter: after.character.money,
  };
}

function fixedRolls(...values: number[]): Rng {
  let cursor = 0;
  return {
    next: () => 0.5,
    int: (min, max) => {
      const value = values[cursor++] ?? max;
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
      return value;
    },
  };
}

function actionIds(state: GameState): string[] {
  return enumerateRpgActions(wolfIndex, state).map((option) => option.id);
}

function act(state: GameState, actionId: string, ...rolls: number[]): GameState {
  const options = enumerateRpgActions(wolfIndex, state);
  const option = options.find((candidate) => candidate.id === actionId);
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${options
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(wolfIndex, () => fixedRolls(...rolls)))(
    state,
    option.action,
  );
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function narrationForAction(state: GameState, actionId: string): string {
  const option = enumerateRpgActions(wolfIndex, state).find(
    (candidate) => candidate.id === actionId,
  );
  expect(option, `${actionId} must be legal in ${state.current}`).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(wolfIndex, () => fixedRolls()))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.events
    .flatMap((event) => (event.type === "narration" ? [event.text] : []))
    .join(" ");
}

function defeatYearlingWithEqualRolls(state: GameState): GameState {
  state = act(state, "use_sheltered_stockway_last_mile");
  state = act(state, "go_north");
  state = act(state, "maneuver_yearling_wolf_set_spear", 6, 1);
  expect(state.flags.yearling_down).toBe(true);
  return state;
}

function failRailWithEqualRolls(state: GameState): GameState {
  state = act(state, "use_sheltered_stockway_last_mile");
  state = act(state, "go_north");
  state = act(state, "wedge_paling_rail", 1);
  expect(state.flags.rail_split).toBe(true);
  expect(state.flags.split_rail_guard_made).not.toBe(true);
  return state;
}

function failRailAndReachFlankWithEqualRolls(state: GameState): GameState {
  state = failRailWithEqualRolls(state);
  state = act(state, "maneuver_yearling_wolf_set_spear", 6, 1);
  expect(state.flags.yearling_down).toBe(true);
  return act(state, "go_north");
}

describe("SS-F03 — Albany lead-source counterfactual", () => {
  it("counts one public source selection exactly once and rejects a repeated choice without mutation", () => {
    const api = createToolApi({ root: process.cwd() });
    const pending = reachMcpLeadSource(api);
    const pendingSnapshot = api.export_overworld_session({
      session_id: pending.sessionId,
    }).snapshot;
    const sourceOption = pending.pendingJourney.storyChoice?.options.find(
      (option) => option.id === ROWAN_SOURCE,
    );
    if (!sourceOption) throw new Error("Expected Rowan's public lead-source option.");
    const town = WORLD.nodes.find((candidate) => candidate.id === LEAD_SOURCE.home);
    if (!town) throw new Error("Expected the opening lead-source town.");
    const offerEntry = pendingSnapshot.journalEntries.find(
      (candidate) => candidate.kind === "lead_source_offer",
    );
    if (!offerEntry) throw new Error("Expected the pending lead-source offer journal entry.");
    const expectedJourneyDecision = {
      countsTowardJourney: true,
      reason: "situation_changed",
    } as const;

    const selected = api.choose_overworld_session_story({
      ...FULL_OVERWORLD,
      session_id: pending.sessionId,
      choice: ROWAN_SOURCE,
    });

    expect(selected.result).toEqual({
      storyChoiceId: LEAD_SOURCE.id,
      choiceId: ROWAN_SOURCE,
      consequence: sourceOption.consequence,
      goal: pending.pendingJourney.goal,
      entry: {
        id: `lead_source:${LEAD_SOURCE.id}:${ROWAN_SOURCE}`,
        kind: "lead_source",
        town: town.name,
        title: `Certified source: ${sourceOption.label}`,
        text: sourceOption.consequence,
        recordedAt: offerEntry.recordedAt,
      },
      journeyDecision: expectedJourneyDecision,
    });
    expect(selected.journeyDecision).toEqual(expectedJourneyDecision);
    expect(selected.journey.acceptedDecisions).toBe(pending.pendingJourney.acceptedDecisions + 1);
    expect(selected.journey.storyChoice).toBeNull();
    expect(questIds(selected.observation)).toContain(WOLF_ID);

    const accepted = api.export_overworld_session({ session_id: pending.sessionId });
    expect(() =>
      api.choose_overworld_session_story({
        ...FULL_OVERWORLD,
        session_id: pending.sessionId,
        choice: ROWAN_SOURCE,
      }),
    ).toThrow(/unknown story choice|no (?:presented )?story consequence/i);
    const afterRejectedRepeat = api.export_overworld_session({
      session_id: pending.sessionId,
    });
    expect(afterRejectedRepeat.journey.acceptedDecisions).toBe(selected.journey.acceptedDecisions);
    expect(afterRejectedRepeat.snapshot).toEqual(accepted.snapshot);
  });

  it("keeps Wolf-Winter hidden until a source is certified and preserves both sides of the save boundary", () => {
    const api = createToolApi({ root: process.cwd() });
    const pending = reachMcpLeadSource(api);
    const pendingSnapshot = api.export_overworld_session({
      session_id: pending.sessionId,
    }).snapshot;
    expect(pendingSnapshot.discoveredQuestIds).not.toContain(WOLF_ID);

    const uiPending = UiOverworldSession.restore(WORLD, pendingSnapshot);
    expect(uiPending.journey()).toEqual(pending.pendingJourney);
    const pendingChoice = uiPending.journey().storyChoice;
    expect(pendingChoice).toMatchObject({ id: LEAD_SOURCE.id, kind: "lead_source" });
    expect(
      pendingChoice?.options.find((option) => option.id === ROWAN_SOURCE)?.consequence,
    ).toContain("Actual cost: no added time and $0");
    expect(
      pendingChoice?.options.find((option) => option.id === JAMIE_SOURCE)?.consequence,
    ).toContain("Actual cost: 35 minutes and $6");
    expect(
      pendingChoice?.options.find((option) => option.id === HAYDEN_SOURCE)?.consequence,
    ).toContain("Actual cost: 20 minutes and $0");

    const restoredPending = api.restore_overworld_session({
      snapshot: pendingSnapshot,
      compact_context: false,
      compact_result: false,
    });
    expect(restoredPending.journey).toEqual(pending.pendingJourney);
    expect(questIds(restoredPending.observation)).not.toContain(WOLF_ID);

    const selected = api.choose_overworld_session_story({
      ...FULL_OVERWORLD,
      session_id: restoredPending.session_id,
      choice: JAMIE_SOURCE,
    });
    expect(selected.journey.storyChoice).toBeNull();
    const selectedWolf = selected.observation.quests.find((quest) => quest.id === WOLF_ID);
    expect(selectedWolf).toMatchObject({
      title: "The Wolf-Winter",
      discovery: WORLD.quests.find((quest) => quest.id === WOLF_ID)?.discovery,
      launch: {
        options: [
          { id: "albany:wolf_approach_exposed_ridge" },
          { id: "albany:wolf_approach_sheltered_stockway" },
        ],
      },
    });
    expect(selected.result.entry).toMatchObject({ kind: "lead_source" });
    expect(selected.observation.character).toMatchObject({
      money: 12,
      knowledge: expect.arrayContaining(["albany:knowledge_wolf_market_testimony"]),
    });

    const selectedSnapshot = api.export_overworld_session({
      session_id: restoredPending.session_id,
    }).snapshot;
    const restoredSelected = api.restore_overworld_session({
      snapshot: selectedSnapshot,
      compact_context: false,
      compact_result: false,
    });
    const uiSelected = UiOverworldSession.restore(WORLD, selectedSnapshot);
    expect(restoredSelected.journey).toEqual(selected.journey);
    expect(uiSelected.journey()).toEqual(selected.journey);
    expect(restoredSelected.observation.character).toEqual(selected.observation.character);
    expect(restoredSelected.observation.quests.find((quest) => quest.id === WOLF_ID)).toEqual(
      selectedWolf,
    );
    expect(uiSelected.view().quests.find((quest) => quest.id === WOLF_ID)).toEqual(selectedWolf);
    expect(() => uiSelected.chooseJourneyStory(HAYDEN_SOURCE)).toThrow(
      /unknown story choice|no story consequence/i,
    );
  });

  it("persists Hayden's certified-source memory through save/restore and presents his reactive contact", () => {
    const selected = reachDirectLeadSource(COURIER);
    selected.chooseJourneyStory(HAYDEN_SOURCE);
    const snapshot = selected.snapshot();
    expect(
      snapshot.character.relationships.find(
        (relationship) => relationship.npcId === "albany:hayden_hale",
      )?.memories,
    ).toContain("albany:memory_hayden_frost_report_certified");

    const restored = OverworldSession.restore(WORLD, snapshot);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.journey().storyChoice).toBeNull();
    moveToOpeningPreparation(restored);
    expect(restored.view().departureInteractions[0]?.kind).toBe("preparation");
    restored.chooseJourneyStory(DEFAULT_PREPARATION);
    restored.chooseJourneyStory(RESIDENT_SHELTER_ALLOCATION);
    const hayden = WORLD.characters.find((character) => character.id === HAYDEN_ID);
    if (!hayden) throw new Error("Expected Hayden's Albany contact.");
    const contact = restored.view().characters.find((character) => character.id === HAYDEN_ID);
    expect(contact).toMatchObject({
      summary: expect.stringContaining("frost-heave sketch"),
      agenda: expect.stringContaining("dangerous line"),
    });
    if (!contact) throw new Error("Expected Hayden in the Station Quarter.");
    const talked = restored.talkToCharacter(HAYDEN_ID);
    expect(talked.entry).toMatchObject({
      id: `talk:${HAYDEN_ID}@frost_report_certified`,
      text: `${contact.summary} ${contact.agenda}`,
    });
    expect(talked.entry.text).toMatch(/controlling field account/i);
    expect(talked.entry.text).toMatch(/only if the paling fails and remains unbound/i);
  });

  it("keeps Hayden's base dispatch policy true after Rowan or Jamie is already certified", () => {
    for (const sourceId of [ROWAN_SOURCE, JAMIE_SOURCE]) {
      const session = reachDirectLeadSource(COURIER);
      session.chooseJourneyStory(sourceId);
      moveToOpeningPreparation(session);
      expect(session.view().departureInteractions[0]?.kind).toBe("preparation");
      session.chooseJourneyStory(DEFAULT_PREPARATION);
      session.chooseJourneyStory(RESIDENT_SHELTER_ALLOCATION);
      const hayden = session.view().characters.find((candidate) => candidate.id === HAYDEN_ID);
      expect(hayden?.agenda).toContain("controlling source certification");
      expect(hayden?.agenda).toContain("settled packets carry route timing");
      expect(hayden?.agenda).not.toMatch(/needs .* certified|once the packet is settled/i);
    }
  });

  it("makes Jamie and Hayden sponsorship change the actual authored time and money paid", () => {
    const publicJamie = sourceTerms(COURIER, JAMIE_SOURCE);
    const sponsoredJamie = sourceTerms(LEDGER_ADVOCATE, JAMIE_SOURCE);
    expect(publicJamie).toMatchObject({
      elapsedMinutes: 35,
      moneyBefore: 18,
      moneyAfter: 12,
    });
    expect(publicJamie.choice.consequence).toContain("Actual cost: 35 minutes and $6");
    expect(sponsoredJamie).toMatchObject({
      elapsedMinutes: 15,
      moneyBefore: 25,
      moneyAfter: 25,
    });
    expect(sponsoredJamie.choice.consequence).toContain("Actual cost: 15 minutes and $0");
    expect(sponsoredJamie.choice.consequence).toContain("waiving $6");

    const publicHayden = sourceTerms(COURIER, HAYDEN_SOURCE);
    const sponsoredHayden = sourceTerms(ROAD_WARDEN, HAYDEN_SOURCE);
    expect(publicHayden).toMatchObject({
      elapsedMinutes: 20,
      moneyBefore: 18,
      moneyAfter: 18,
    });
    expect(publicHayden.choice.consequence).toContain("Actual cost: 20 minutes and $0");
    expect(sponsoredHayden).toMatchObject({
      elapsedMinutes: 5,
      moneyBefore: 12,
      moneyAfter: 12,
    });
    expect(sponsoredHayden.choice.consequence).toContain("Actual cost: 5 minutes and $0");
    expect(sponsoredHayden.choice.consequence).toContain("reduces the route-desk review");
  });

  it("imports exactly one equal-seed source and reserves the uncommitted combat loft for Jamie", () => {
    const rowan = launchMcpWolf(ROWAN_SOURCE).state;
    const jamie = launchMcpWolf(JAMIE_SOURCE).state;
    const hayden = launchMcpWolf(HAYDEN_SOURCE).state;

    expect(rowan.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_approach_sheltered_stockway",
      "import:wolf_winter_drover_streetwise",
      "import:wolf_winter_full_compact_duty",
      "import:wolf_winter_relief_protocol",
      "import:wolf_winter_relief_resident_shelter",
    ]);
    expect(jamie.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_approach_sheltered_stockway",
      "import:wolf_winter_drover_streetwise",
      "import:wolf_winter_full_compact_duty",
      "import:wolf_winter_market_testimony",
      "import:wolf_winter_relief_protocol",
      "import:wolf_winter_relief_resident_shelter",
    ]);
    expect(hayden.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_approach_sheltered_stockway",
      "import:wolf_winter_drover_streetwise",
      "import:wolf_winter_frost_report",
      "import:wolf_winter_full_compact_duty",
      "import:wolf_winter_relief_protocol",
      "import:wolf_winter_relief_resident_shelter",
    ]);
    expect([rowan, jamie, hayden].map((state) => state.vars)).toEqual([
      rowan.vars,
      rowan.vars,
      rowan.vars,
    ]);
    expect(rowan.flags.jamie_market_testimony_certified).not.toBe(true);
    expect(rowan.flags.hayden_frost_report_certified).not.toBe(true);
    expect(jamie.flags.jamie_market_testimony_certified).toBe(true);
    expect(jamie.flags.hayden_frost_report_certified).not.toBe(true);
    expect(hayden.flags.jamie_market_testimony_certified).not.toBe(true);
    expect(hayden.flags.hayden_frost_report_certified).toBe(true);

    const atStores = [rowan, jamie, hayden].map((state) => {
      state = defeatYearlingWithEqualRolls(state);
      state = act(state, "go_south");
      return act(state, "go_west");
    });
    expect(actionIds(atStores[0]!)).not.toContain("go_up");
    expect(actionIds(atStores[1]!)).toContain("go_up");
    expect(actionIds(atStores[2]!)).not.toContain("go_up");

    const haydenCombatStore = buildRpgObservation(wolfIndex, atStores[2]!);
    const haydenBlockedLoft = haydenCombatStore.blocked_exits.find(
      (candidate) => candidate.direction === "up",
    );
    expect(haydenBlockedLoft).toEqual({
      direction: "up",
      message:
        "Before the flank-wolf falls, settle the yearling. Then take the crawlboard named by certified testimony or Cade's committed plan, or bind a split rail; leave the sound rail wedged.",
    });
    expect(haydenBlockedLoft?.message).not.toMatch(/in your packet/i);
    expect(haydenCombatStore.description).not.toMatch(/Jamie's certified testimony/i);

    let jamieAtFlank = act(atStores[1]!, "go_up");
    expect(jamieAtFlank.current).toBe("fodder_loft");
    jamieAtFlank = act(jamieAtFlank, "go_east");
    expect(actionIds(jamieAtFlank)).toContain("maneuver_flank_wolf_drop_from_loft");
    expect(actionIds(jamieAtFlank)).not.toContain("maneuver_flank_wolf_frost_brace_trip");
  });

  it("lets Hayden's source use Cade's separately committed nonlethal crawlboard instruction", () => {
    let state = launchMcpWolf(HAYDEN_SOURCE).state;
    for (const actionId of [
      "use_sheltered_stockway_last_mile",
      "talk_houndsman",
      "ask_lure",
      "ask_commit_lure",
      "ask_leave",
      "go_west",
      "take_winter_feed_sack",
      "go_east",
      "go_north",
      "use_winter_feed_sack_on_downwind_feed_line",
      "go_south",
      "go_west",
    ]) {
      state = act(state, actionId);
    }

    expect(state.flags.hayden_frost_report_certified).toBe(true);
    expect(state.flags.jamie_market_testimony_certified).not.toBe(true);
    expect(state.flags.strategy_lure_committed).toBe(true);
    expect(actionIds(state)).toContain("go_up");

    state = act(state, "go_up");
    const loft = buildRpgObservation(wolfIndex, state);
    expect(loft.description).toMatch(
      /Cade's local feed-plan instruction[^]*feed-hauler's crawlboard/i,
    );
    expect(loft.description).not.toMatch(/Jamie|packet/i);
  });

  it("makes only Hayden's unbound failed-rail line expose its high-variance two-beat maneuver", () => {
    const rowan = failRailAndReachFlankWithEqualRolls(launchMcpWolf(ROWAN_SOURCE).state);
    const jamie = failRailAndReachFlankWithEqualRolls(launchMcpWolf(JAMIE_SOURCE).state);
    const hayden = failRailAndReachFlankWithEqualRolls(launchMcpWolf(HAYDEN_SOURCE).state);
    const frostRoot = "maneuver_flank_wolf_frost_brace_trip";

    expect(actionIds(rowan)).not.toContain(frostRoot);
    expect(actionIds(jamie)).not.toContain(frostRoot);
    expect(actionIds(hayden)).toContain(frostRoot);
    expect(
      enumerateRpgActions(wolfIndex, hayden).find((option) => option.id === frostRoot),
    ).toMatchObject({
      combat: { attack_bonus: 4, defense_bonus: -2, phase: "opening", one_shot: true },
    });

    const tripped = act(hayden, frostRoot, 1, 6);
    expect(tripped.flags.flank_frost_brace_tripped).toBe(true);
    const frostChild = "maneuver_flank_wolf_fallen_brace_drive";
    expect(actionIds(tripped)).toContain(frostChild);
    expect(actionIds(tripped)).not.toContain(frostRoot);
    expect(
      enumerateRpgActions(wolfIndex, tripped).find((option) => option.id === frostChild),
    ).toMatchObject({
      combat: { attack_bonus: -1, defense_bonus: 2, phase: "follow_through", one_shot: true },
    });
    const driven = act(tripped, frostChild, 1, 6);
    expect(driven.flags.flank_fallen_brace_driven).toBe(true);
    expect(driven.flags.flank_wolf_down).not.toBe(true);
    expect(driven.vars[enemyHpVar("flank_wolf")]).toBe(1);
    expect(actionIds(driven)).toContain("attack_flank_wolf");

    let boundHayden = failRailWithEqualRolls(launchMcpWolf(HAYDEN_SOURCE).state);
    const forkObservation = buildRpgObservation(wolfIndex, boundHayden);
    expect(forkObservation.description).toMatch(
      /Hayden's report marks a frost-jammed brace north.*leave the rail unbound.*bind.*commit away/is,
    );
    expect(
      forkObservation.available_actions.find((action) => action.id === "bind_paling_rail")?.command,
    ).toMatch(/bind.*rail/i);
    boundHayden = act(boundHayden, "bind_paling_rail");
    expect(boundHayden.flags.split_rail_guard_made).toBe(true);
    expect(boundHayden.inventory).toContain("split_rail_guard");
    boundHayden = act(boundHayden, "maneuver_yearling_wolf_set_spear", 6, 1);
    boundHayden = act(boundHayden, "go_north");
    expect(actionIds(boundHayden)).not.toContain(frostRoot);
    expect(actionIds(boundHayden)).toContain("maneuver_flank_wolf_splinter_guard");
  });

  it("truthfully signposts Hayden's attempted-wedge frost route and its exclusions", () => {
    const haydenSource = LEAD_SOURCE.options.find((option) => option.id === HAYDEN_SOURCE);
    if (!haydenSource) throw new Error("Expected Hayden's source option.");
    expect(haydenSource.preview).toMatch(
      /ordinary hunt.*attempt.*wedge.*only if.*frozen.*splits.*leave.*unbound.*yearling.*go north/is,
    );
    expect(haydenSource.preview).toMatch(/skipping.*no split.*binding.*commits away/is);
    expect(haydenSource.preview).toMatch(/Works.*replaces.*wedge.*forgoes.*frost brace/is);

    const frostRoot = "maneuver_flank_wolf_frost_brace_trip";
    let ordinary = launchMcpWolf(HAYDEN_SOURCE).state;
    ordinary = act(ordinary, "use_sheltered_stockway_last_mile");
    const ordinaryCue = buildRpgObservation(wolfIndex, ordinary).description;
    expect(ordinaryCue).toMatch(
      /Cross north uncommitted.*hunt-and-hold permanently retires.*feed lure.*signal drive.*seal-and-outlast/is,
    );
    expect(ordinaryCue).toMatch(
      /ordinary hunt.*attempt.*public wedge.*only if frozen ground splits.*leave.*unbound.*kill the yearling.*go north.*Skipping.*no split.*binding.*forgoes/is,
    );
    ordinary = act(ordinary, "go_north");
    expect(actionIds(ordinary)).toContain("wedge_paling_rail");

    let skipped = act(ordinary, "maneuver_yearling_wolf_set_spear", 6, 1);
    skipped = act(skipped, "go_north");
    expect(skipped.flags.rail_split).not.toBe(true);
    expect(actionIds(skipped)).not.toContain(frostRoot);

    let failed = act(ordinary, "wedge_paling_rail", 1);
    failed = act(failed, "maneuver_yearling_wolf_set_spear", 6, 1);
    failed = act(failed, "go_north");
    expect(failed.flags.rail_split).toBe(true);
    expect(actionIds(failed)).toContain(frostRoot);

    let bound = act(act(ordinary, "wedge_paling_rail", 1), "bind_paling_rail");
    bound = act(bound, "maneuver_yearling_wolf_set_spear", 6, 1);
    bound = act(bound, "go_north");
    expect(actionIds(bound)).not.toContain(frostRoot);

    let works = launchMcpWolf(HAYDEN_SOURCE, DEFAULT_PREPARATION).state;
    works = act(works, "use_sheltered_stockway_last_mile");
    const worksCue = buildRpgObservation(wolfIndex, works).description;
    expect(worksCue).toMatch(
      /Cross north uncommitted.*hunt-and-hold permanently retires.*feed lure.*signal drive.*seal-and-outlast/is,
    );
    expect(worksCue).toMatch(/Works packet replaces.*wedge.*forgoes the frost-brace line/is);
    works = act(works, "go_north");
    expect(actionIds(works)).toContain("set_paling_rail");
    expect(actionIds(works)).not.toContain("wedge_paling_rail");
    works = act(works, "set_paling_rail", 1);
    expect(works.flags.rail_split).not.toBe(true);
    works = act(works, "maneuver_yearling_wolf_set_spear", 6, 1);
    expect(actionIds(works)).toContain("splice_paling_rail");
    works = act(works, "splice_paling_rail");
    works = act(works, "go_north");
    expect(works.flags.rail_split).not.toBe(true);
    expect(actionIds(works)).not.toContain(frostRoot);

    let june = launchMcpWolf(HAYDEN_SOURCE).state;
    june.flags.june_pike_present = true;
    june = act(june, "use_sheltered_stockway_last_mile");
    const juneCue = buildRpgObservation(wolfIndex, june).description;
    expect(juneCue).toMatch(/June holds the north gate.*any wolf death ends her agreement/is);
    expect(juneCue).toMatch(
      /Hayden's frost line requires.*attempt the public wedge.*only if.*frozen ground splits.*leave.*unbound.*kill the yearling.*go north/is,
    );
    expect(actionIds(june)).not.toContain("go_north");

    let juneWorks = launchMcpWolf(HAYDEN_SOURCE, DEFAULT_PREPARATION).state;
    juneWorks.flags.june_pike_present = true;
    juneWorks = act(juneWorks, "use_sheltered_stockway_last_mile");
    const juneWorksCue = buildRpgObservation(wolfIndex, juneWorks).description;
    expect(juneWorksCue).toMatch(/June holds the north gate.*any wolf death ends her agreement/is);
    expect(juneWorksCue).toMatch(/Works packet replaces the wedge.*forgoes the frost brace/is);
    expect(actionIds(juneWorks)).not.toContain("go_north");
  });

  it("keeps a lure's abandoned split rail from promising Hayden's hunt-only frost line", () => {
    let lure = launchMcpWolf(HAYDEN_SOURCE).state;
    lure = act(lure, "use_sheltered_stockway_last_mile");
    for (const actionId of [
      "talk_houndsman",
      "ask_lure",
      "ask_commit_lure",
      "ask_leave",
      "go_west",
      "take_winter_feed_sack",
      "go_east",
      "go_north",
    ]) {
      lure = act(lure, actionId);
    }
    lure = act(lure, "use_winter_feed_sack_on_downwind_feed_line", 1);
    lure = act(lure, "wedge_paling_rail", 1);
    lure = act(lure, "maneuver_yearling_wolf_commit_hybrid_strike", 1, 1);
    for (let guard = 0; guard < 5 && !lure.flags.yearling_down; guard += 1) {
      lure = act(lure, "attack_yearling_wolf", 6, 1);
    }
    expect(lure.flags).toMatchObject({
      strategy_lure_committed: true,
      lure_hybrid_combat_entered: true,
      rail_split: true,
      yearling_down: true,
    });
    expect(buildRpgObservation(wolfIndex, lure).visible_objects).toContainEqual({
      id: "paling_rail",
      name: "abandoned split paling-rail",
    });
    const lureExamine = narrationForAction(lure, "examine_paling_rail");
    expect(lureExamine).toMatch(
      /committed the fouled lure to hybrid combat.*closing.*rail recovery/is,
    );
    expect(lureExamine).not.toMatch(/Hayden|frost-jammed|bare spear.*trip/is);
    const frostManeuver = loadedWolf.compiled.pack.enemies
      .find((enemy) => enemy.id === "flank_wolf")
      ?.maneuvers?.find((maneuver) => maneuver.id === "frost_brace_trip");
    expect(frostManeuver, "Hayden's frost maneuver must remain authored").toBeDefined();
    expect(frostManeuver?.conditions).toContainEqual({
      not_flag: "strategy_lure_committed",
    });

    const hunt = failRailWithEqualRolls(launchMcpWolf(HAYDEN_SOURCE).state);
    const huntExamine = narrationForAction(hunt, "examine_paling_rail");
    expect(huntExamine).toMatch(/Hayden's certified report.*frost-load.*bare spear.*trip/is);
  });
});
