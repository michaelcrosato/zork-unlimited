/**
 * SS-F04 campaign proof. June's optional Albany contract composes with every
 * earlier build/source/preparation state, survives save/replay, imports into
 * Wolf-Winter, and changes persistent party, promise, testimony, and services.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldSessionSnapshot } from "../../src/world/session_snapshot.js";
import { OVERWORLD_OPENING_ALLY_PREDECESSOR_WORLD_HASH } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { GameSession } from "../../ui/src/engine.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const LEAD = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === "wolf_winter")!;

const ACCEPT = "albany:ally_june_cattle_first";
const RELAY = "albany:ally_june_relay_only";
const SOLO = "albany:ally_travel_solo";
const JUNE = "albany:june_pike";
const PROMISE = "albany:promise_june_cattle_first";
const SHELTERED = "albany:wolf_approach_sheltered_stockway";
const WOLF_SOURCE = readFileSync("content/rpg/quests/wolf_winter.yaml", "utf8");
const FULL = { compact_context: false, compact_result: false } as const;

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId || currentAreaId === targetAreaId) return;
  const edges = WORLD.area_edges.filter((edge) => edge.home === session.view().current.id);
  const queue = [currentAreaId];
  const previous = new Map<string, string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current === targetAreaId) break;
    for (const edge of edges.filter(
      (candidate) => candidate.from_area === current || candidate.to_area === current,
    )) {
      const next = edge.from_area === current ? edge.to_area : edge.from_area;
      if (next === currentAreaId || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let cursor = targetAreaId; cursor !== currentAreaId; ) {
    const prior = previous.get(cursor);
    if (!prior) throw new Error(`No area route to ${targetAreaId}.`);
    path.unshift(cursor);
    cursor = prior;
  }
  for (const areaId of path) {
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Area route to ${areaId} is not visible.`);
    session.moveArea(route.id);
  }
}

function reachAlly(
  args: {
    backgroundId?: string;
    sourceId?: string;
    preparationId?: string;
  } = {},
): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(args.backgroundId ?? REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(args.sourceId ?? LEAD.options[0]!.id);
  session.chooseJourneyStory(args.preparationId ?? PREPARATION.profiles[0]!.id);
  moveToArea(session, ALLY.area);
  session.talkToCharacter(ALLY.contact);
  return session;
}

function selectAlly(optionId: string): OverworldSession {
  const session = reachAlly();
  session.chooseJourneyStory(optionId);
  return session;
}

function selectPreparationWithoutAlly(profileId: string): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  session.chooseJourneyStory(LEAD.options[0]!.id);
  session.chooseJourneyStory(profileId);
  return session;
}

function completeWolf(session: OverworldSession, endingId: string): void {
  session.startQuest(WOLF.id, SHELTERED);
  const campaignExport = WOLF.campaign_exports!.find(
    (candidate) => candidate.ending_id === endingId,
  );
  if (!campaignExport) throw new Error(`Missing Wolf ending ${endingId}.`);
  session.completeQuest(WOLF.id, {
    endingId,
    endingTitle: campaignExport.ending_title,
    death: false,
  });
}

function promiseStatus(session: OverworldSession): string | undefined {
  return session.snapshot().character.promises.find((promise) => promise.promiseId === PROMISE)
    ?.status;
}

function addRoadStrain(session: OverworldSession): void {
  const outbound = session.view().exits.find((road) => road.destination.id === "colonie_town");
  if (!outbound) throw new Error("expected Albany's Colonie road");
  session.travel(outbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  const inbound = session.view().exits.find((road) => road.destination.id === "albany_city");
  if (!inbound) throw new Error("expected Colonie's Albany road");
  session.travel(inbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
}

describe("SS-F04 — Albany ally commitment counterfactual", () => {
  it("offers all three honest contracts after every 4×3×3 prior opening state", () => {
    expect(REGISTRATION.profiles).toHaveLength(4);
    expect(LEAD.options).toHaveLength(3);
    expect(PREPARATION.profiles).toHaveLength(3);

    for (const background of REGISTRATION.profiles) {
      for (const source of LEAD.options) {
        for (const preparation of PREPARATION.profiles) {
          for (const optionId of [ACCEPT, RELAY, SOLO]) {
            const session = reachAlly({
              backgroundId: background.id,
              sourceId: source.id,
              preparationId: preparation.id,
            });
            const prompt = session.journey().storyChoice;
            expect(prompt).toMatchObject({ id: ALLY.id, kind: "ally" });
            expect(prompt?.message).toMatch(/capability:.*condition:/i);
            expect(prompt?.options.map((option) => option.id)).toEqual([ACCEPT, RELAY, SOLO]);
            expect(
              prompt?.options.every((option) => /actual cost:/i.test(option.consequence)),
            ).toBe(true);

            const before = session.snapshot();
            session.chooseJourneyStory(optionId);
            const after = session.snapshot();
            expect(after.minutes - before.minutes).toBe(
              optionId === ACCEPT ? 15 : optionId === RELAY ? 5 : 0,
            );
            expect(OverworldSession.restore(WORLD, after).snapshot()).toEqual(after);
          }
        }
      }
    }
  });

  it("keeps direct departure solo, while a pending June offer must be resolved", () => {
    const direct = reachAlly();
    // Rebuild without talking to June: start now is the explicitly disclosed solo default.
    const pending = direct.snapshot();
    expect(() => direct.startQuest(WOLF.id, SHELTERED)).toThrow(/field-team commitment/i);

    const solo = OverworldSession.restore(WORLD, pending);
    solo.chooseJourneyStory(SOLO);
    solo.startQuest(WOLF.id, SHELTERED);
    expect(solo.snapshot().character.companions).toEqual([]);
    expect(promiseStatus(solo)).toBeUndefined();

    const noContact = new OverworldSession(WORLD);
    const opening = noContact.view();
    noContact.scoutPoi(opening.pois[0]!.id);
    noContact.talkToCharacter(REGISTRATION.contact);
    noContact.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    noContact.chooseJourneyStory(LEAD.options[0]!.id);
    noContact.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    moveToArea(noContact, WOLF.area);
    expect(noContact.previewQuestStart(WOLF.id).id).toBe(WOLF.id);
    noContact.startQuest(WOLF.id, SHELTERED);
    expect(noContact.snapshot().character.relationships).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ npcId: JUNE })]),
    );
  });

  it("binds a post-preparation offer when June was already met before registration", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    const marketRoute = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === "albany_city__market");
    if (!marketRoute) throw new Error("Expected the early Albany route to the Market.");
    session.moveArea(marketRoute.id);
    session.scoutPoi("albany_city__market__poi");
    const stationRoute = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === ALLY.area);
    if (!stationRoute) throw new Error("Expected the early Albany route to the Station.");
    session.moveArea(stationRoute.id);
    session.talkToCharacter(ALLY.contact);

    moveToArea(session, REGISTRATION.area);
    session.talkToCharacter(REGISTRATION.contact);
    session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    session.chooseJourneyStory(LEAD.options[0]!.id);
    session.chooseJourneyStory(PREPARATION.profiles[0]!.id);

    moveToArea(session, ALLY.area);
    const decisionsBeforeContact = session.journey().acceptedDecisions;
    const repeated = session.talkToCharacter(ALLY.contact);
    expect(repeated.alreadyKnown).toBe(true);
    expect(repeated.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "substantive_dialogue",
    });
    expect(session.journey().acceptedDecisions).toBe(decisionsBeforeContact + 1);
    expect(session.journey().decisionProof.last?.actionId).toBe(`talk:${ALLY.contact}`);
    expect(session.journey().storyChoice).toMatchObject({ id: ALLY.id, kind: "ally" });
    session.chooseJourneyStory(ACCEPT);

    const snapshot = session.snapshot();
    const offerIndex = snapshot.journalEntries.findIndex((entry) => entry.kind === "ally_offer");
    expect(snapshot.journalEntries[offerIndex + 1]).toMatchObject({
      kind: "contact",
      recordedAt: snapshot.journalEntries[offerIndex]!.recordedAt,
    });
    expect(snapshot.journalEntries[offerIndex + 1]!.id.startsWith(`talk:${ALLY.contact}:`)).toBe(
      true,
    );
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);

    const questBeforeAlly = structuredClone(snapshot);
    const preparationIndex = questBeforeAlly.journalEntries.findIndex(
      (entry) => entry.kind === "preparation",
    );
    if (preparationIndex < 0) throw new Error("Expected the opening preparation boundary");
    questBeforeAlly.journalEntries.splice(preparationIndex, 0, {
      id: `quest:${WOLF.id}`,
      kind: "quest",
      town: WORLD.nodes.find((node) => node.id === WOLF.home)!.name,
      title: `Started ${WOLF.title}`,
      text: WOLF.discovery,
      recordedAt: questBeforeAlly.journalEntries[preparationIndex]!.recordedAt,
    });
    questBeforeAlly.startedQuestIds = [WOLF.id];
    expect(() => OverworldSession.restore(WORLD, questBeforeAlly)).toThrow(
      /ally selection must precede every quest boundary/i,
    );
  });

  it("keeps June after a living return and loses her failure-forward after blood", () => {
    const cooperative = selectAlly(ACCEPT);
    const selectedSnapshot = cooperative.snapshot();
    expect(selectedSnapshot.character.companions).toContain(JUNE);
    expect(promiseStatus(cooperative)).toBe("active");
    expect(cooperative.compactView().character[10]).toContain(JUNE);
    expect(OverworldSession.restore(WORLD, selectedSnapshot).snapshot()).toEqual(selectedSnapshot);

    completeWolf(cooperative, "ending_pack_diverted");
    expect(cooperative.snapshot().character.companions).toContain(JUNE);
    expect(promiseStatus(cooperative)).toBe("kept");
    expect(
      cooperative
        .snapshot()
        .character.relationships.find((relationship) => relationship.npcId === JUNE)?.memories,
    ).toContain("albany:memory_june_held_cattle_line");
    expect(cooperative.view().serviceOffers.map((offer) => offer.id)).toEqual([
      "albany:june_kept_line_station_resupply",
    ]);
    expect(
      cooperative.view().characters.find((character) => character.id === ALLY.contact)?.summary,
    ).toMatch(/matching account|returned beside/i);
    const cooperativeSnapshot = cooperative.snapshot();
    expect(OverworldSession.restore(WORLD, cooperativeSnapshot).snapshot()).toEqual(
      cooperativeSnapshot,
    );

    const claimant = OverworldSession.restore(WORLD, cooperativeSnapshot);
    claimant.chooseJourney("continue");
    claimant.chooseJourneyStory("send_wardens_north");
    addRoadStrain(claimant);
    moveToArea(claimant, ALLY.area);
    const beforeClaim = claimant.view();
    expect(beforeClaim.supplies).toBeLessThan(beforeClaim.maxSupplies);
    const claimed = claimant.resupplyAtTown();
    expect(claimed).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 15,
      suppliesBefore: beforeClaim.supplies,
      suppliesAfter: beforeClaim.maxSupplies,
      message: expect.stringContaining("second-seat stores"),
    });
    expect(claimant.view().serviceOffers).toEqual([]);
    const consumedSnapshot = claimant.snapshot();
    expect(consumedSnapshot.journalEntries).toContainEqual(
      expect.objectContaining({
        kind: "service",
        serviceRuleId: "albany:june_kept_line_station_resupply",
      }),
    );
    expect(OverworldSession.restore(WORLD, consumedSnapshot).view().serviceOffers).toEqual([]);

    const lost = selectAlly(ACCEPT);
    completeWolf(lost, "ending_pack_diverted_after_blood");
    expect(lost.snapshot().character.companions).not.toContain(JUNE);
    expect(promiseStatus(lost)).toBe("broken");
    expect(
      lost.snapshot().character.relationships.find((relationship) => relationship.npcId === JUNE)
        ?.memories,
    ).toContain("albany:memory_june_left_after_blood");
    expect(lost.view().serviceOffers).toEqual([]);
    expect(
      lost.view().characters.find((character) => character.id === ALLY.contact)?.summary,
    ).toMatch(/field seat is empty[^]*crossed into combat[^]*cattle-first field agreement/i);
    expect(OverworldSession.restore(WORLD, lost.snapshot()).snapshot()).toEqual(lost.snapshot());
  });

  it("gives negotiated refusal, explicit solo, and relationship loss distinct returns", () => {
    const relay = selectAlly(RELAY);
    completeWolf(relay, "ending_pack_diverted");
    expect(relay.snapshot().character.companions).toEqual([]);
    expect(relay.view().serviceOffers.map((offer) => offer.id)).toEqual([
      "albany:june_relay_refusal_station_rest",
    ]);

    const solo = selectAlly(SOLO);
    completeWolf(solo, "ending_pack_diverted");
    expect(solo.view().serviceOffers).toEqual([]);
    expect(
      solo.snapshot().character.relationships.find((relationship) => relationship.npcId === JUNE)
        ?.memories,
    ).toContain("albany:memory_june_solo_dispatch_chosen");

    expect(relay.snapshot().character).not.toEqual(solo.snapshot().character);
  });

  it("imports the same ally state into full MCP, compact MCP, and the browser engine", () => {
    const campaign = selectAlly(ACCEPT).snapshot();
    const api = createToolApi({ root: process.cwd() });
    const restored = api.restore_overworld_session({ ...FULL, snapshot: campaign });
    const launched = api.start_overworld_session_quest({
      ...FULL,
      compact_actions: false,
      compact_observation: false,
      include_actions: true,
      session_id: restored.session_id,
      quest_id: WOLF.id,
      approach_id: SHELTERED,
      seed: 504,
    });
    const fullState = api.get_state({
      session_id: launched.rpg_session_id,
      include_state: true,
    });
    expect(fullState.state.flags.june_pike_present).toBe(true);
    expect(fullState.state.campaignImportReceipt?.effects).toContainEqual(
      expect.objectContaining({
        type: "companion_to_flag",
        target_flag: "june_pike_present",
        value: true,
      }),
    );

    const compact = api.get_observation({
      session_id: launched.rpg_session_id,
      compact_observation: true,
      hide_graph: true,
    });
    expect(compact.state_hash).toBe(fullState.state_hash);
    expect(compact.context.text).toMatch(/June Pike|Road Warden/i);

    const saved = api.save_game({
      session_id: launched.rpg_session_id,
      include_source: true,
      include_content_hash: true,
    });
    const loaded = api.load_game({ save: saved.save, compact_observation: false });
    const loadedState = api.get_state({ session_id: loaded.session_id, include_state: true });
    expect(loaded.state_hash).toBe(fullState.state_hash);
    expect(loadedState.state).toEqual(fullState.state);
    expect(loadedState.state.campaignImportReceipt?.effects).toContainEqual(
      expect.objectContaining({
        type: "companion_to_flag",
        target_flag: "june_pike_present",
        value: true,
      }),
    );

    const launchedCampaign = api.export_overworld_session({
      session_id: restored.session_id,
    }).snapshot.character;
    const browser = GameSession.startEmbedded(
      WOLF_SOURCE,
      launchedCampaign,
      WOLF.campaign_imports,
      504,
    );
    expect(browser.view().stateHash.startsWith(fullState.state_hash)).toBe(true);
    expect(browser.view().text).toMatch(/June Pike|Road Warden/i);
  });

  it("rejects forged ally state and truthfully migrates the F05 predecessor as solo", () => {
    const accepted = selectAlly(ACCEPT).snapshot();
    const noCompanion = structuredClone(accepted);
    noCompanion.character.companions = [];
    expect(() => OverworldSession.restore(WORLD, noCompanion)).toThrow(/campaign character/i);

    const brokenEarly = structuredClone(accepted);
    brokenEarly.character.promises.find((promise) => promise.promiseId === PROMISE)!.status =
      "broken";
    expect(() => OverworldSession.restore(WORLD, brokenEarly)).toThrow(/campaign character/i);

    const withoutChoice = structuredClone(accepted);
    withoutChoice.journalEntries = withoutChoice.journalEntries.filter(
      (entry) => entry.kind !== "ally" && entry.kind !== "ally_offer",
    );
    expect(() => OverworldSession.restore(WORLD, withoutChoice)).toThrow(
      /ally|campaign character/i,
    );

    const withoutOffer = structuredClone(accepted);
    withoutOffer.journalEntries = withoutOffer.journalEntries.filter(
      (entry) => entry.kind !== "ally_offer",
    );
    expect(() => OverworldSession.restore(WORLD, withoutOffer)).toThrow(/durable offer/i);

    const progressed = selectAlly(ACCEPT);
    completeWolf(progressed, "ending_pack_diverted");
    const splicedBoundary = progressed.snapshot();
    const offer = splicedBoundary.journalEntries.find((entry) => entry.kind === "ally_offer");
    const selection = splicedBoundary.journalEntries.find((entry) => entry.kind === "ally");
    if (!offer?.storyChoiceBoundary || !selection?.storyChoiceBoundary) {
      throw new Error("expected ally offer and selection boundaries");
    }
    offer.storyChoiceBoundary.decisionProofHash = "0".repeat(64);
    selection.storyChoiceBoundary.decisionProofHash = hashState({
      previous: offer.storyChoiceBoundary.decisionProofHash,
      number: selection.storyChoiceBoundary.acceptedDecisions,
      surface: "overworld",
      actionId: `campaign_story:${ALLY.id}:${ACCEPT}`,
      reason: "situation_changed",
    });
    expect(() => OverworldSession.restore(WORLD, splicedBoundary)).toThrow(
      /ally (offer|selection) boundary.*replayed campaign decision proof/i,
    );

    const predecessorSession = new OverworldSession(WORLD);
    const opening = predecessorSession.view();
    predecessorSession.scoutPoi(opening.pois[0]!.id);
    predecessorSession.talkToCharacter(REGISTRATION.contact);
    predecessorSession.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    predecessorSession.chooseJourneyStory(LEAD.options[0]!.id);
    predecessorSession.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    moveToArea(predecessorSession, WOLF.area);
    // Keep this migration witness pre-launch: a current route commitment cannot
    // truthfully be relabelled as an F05 quest start.
    const predecessorSource = structuredClone(predecessorSession.snapshot());
    const { companions: _companions, ...predecessorCharacter } = predecessorSource.character;
    const predecessor: Omit<OverworldSessionSnapshot, "character"> & {
      character: Omit<OverworldSessionSnapshot["character"], "companions"> & {
        companions?: string[];
      };
    } = {
      ...predecessorSource,
      worldHash: OVERWORLD_OPENING_ALLY_PREDECESSOR_WORLD_HASH,
      character: predecessorCharacter,
    };
    const migrated = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(migrated.character.companions).toEqual([]);
    expect(migrated.journalEntries.some((entry) => entry.kind.startsWith("ally"))).toBe(false);

    const forgedPredecessor = {
      ...structuredClone(predecessor),
      character: { ...predecessor.character, companions: [JUNE] },
    };
    expect(() => OverworldSession.restore(WORLD, forgedPredecessor)).toThrow(
      /campaign character|ally evidence/i,
    );
  });

  it("rejects consumed F07 preparation services merely relabelled as F05", () => {
    const cases = [
      {
        profileId: "albany:prep_works_fortification",
        areaId: "albany_city__industrial",
        action: "resupply" as const,
        serviceId: "albany:wolf_works_fortification_return_resupply",
      },
      {
        profileId: "albany:prep_drover_route",
        areaId: "albany_city__campus",
        action: "rest" as const,
        serviceId: "albany:wolf_drover_route_return_rest",
      },
      {
        profileId: "albany:prep_relief_protocol",
        areaId: "albany_city__civic_core",
        action: "resupply" as const,
        serviceId: "albany:wolf_relief_protocol_return_resupply",
      },
    ];

    let proofStrippedPredecessor: OverworldSessionSnapshot | null = null;
    for (const migrationCase of cases) {
      const session = selectPreparationWithoutAlly(migrationCase.profileId);
      moveToArea(session, WOLF.area);
      completeWolf(session, "ending_held");
      session.chooseJourney("continue");
      session.chooseJourneyStory("send_wardens_north");
      const station = session.view();
      session.scoutPoi(station.pois[0]!.id);
      const existingContact = station.characters.find((character) => character.id !== ALLY.contact);
      if (!existingContact) throw new Error("expected the predecessor Station contact");
      session.talkToCharacter(existingContact.id);
      session.investigateEvent(station.events[0]!.id);
      addRoadStrain(session);
      moveToArea(session, migrationCase.areaId);
      if (migrationCase.action === "rest") session.restAtTown();
      else session.resupplyAtTown();
      const current = session.snapshot();
      expect(current.journalEntries).toContainEqual(
        expect.objectContaining({
          kind: "service",
          serviceRuleId: migrationCase.serviceId,
        }),
      );

      const predecessor = structuredClone(current);
      predecessor.worldHash = OVERWORLD_OPENING_ALLY_PREDECESSOR_WORLD_HASH;
      delete (predecessor.character as { companions?: string[] }).companions;
      expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
        /quest-start proof evidence introduced by a later manifest/i,
      );
      proofStrippedPredecessor ??= predecessor;
    }

    if (!proofStrippedPredecessor) throw new Error("expected a relabelled F07 witness");
    for (const entry of proofStrippedPredecessor.journalEntries) {
      delete entry.questStartProof;
    }
    expect(() => OverworldSession.restore(WORLD, proofStrippedPredecessor)).toThrow(
      /quest launch "wolf_winter" does not match its (?:selected approach decision|exact pre-ally authored copy)/i,
    );
  });
});
