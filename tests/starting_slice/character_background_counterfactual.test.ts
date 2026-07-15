import { describe, expect, it } from "vitest";

import { makeStep } from "../../src/core/engine.js";
import type { Rng } from "../../src/core/rng.js";
import type { GameState } from "../../src/core/state.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { buildRpgRules, enumerateRpgActions, indexRpgPack } from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { createInitialCampaignCharacterState } from "../../src/world/campaign_character_state.js";
import { openingRegistrationLegacyJournalEntry } from "../../src/world/opening_registration_journal.js";
import { planOverworldRoute } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { parseTimeLabel, timeLabel } from "../../src/world/session_journal_codec.js";
import {
  OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
  OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
  OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const openingRegistration = WORLD.opening_registration;
if (!openingRegistration) throw new Error("The starting slice requires opening registration.");
const REGISTRATION = openingRegistration;
const openingLeadSource = WORLD.opening_lead_source;
if (!openingLeadSource) throw new Error("The starting slice requires an opening lead source.");
const LEAD_SOURCE = openingLeadSource;
const DEFAULT_SOURCE_ID = "albany:source_rowan_civic_docket";

const loadedWolf = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loadedWolf.ok) throw new Error("Wolf-Winter must compile.");
const wolfIndex = indexRpgPack(loadedWolf.compiled.pack);

const FULL_OVERWORLD = { compact_context: false, compact_result: false } as const;
const ROWAN_ID = "albany_city__civic_core__contact";
const HAYDEN_ID = "albany_city__transport_hub__contact";

type ToolApi = ReturnType<typeof createToolApi>;

function registerSession(profileId: string): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  const talked = session.talkToCharacter(ROWAN_ID);
  expect(talked.discoveredQuests?.map((quest) => quest.id)).not.toContain("wolf_winter");
  expect(session.journey().storyChoice).toMatchObject({
    id: REGISTRATION.id,
    kind: "registration",
    options: REGISTRATION.profiles.map((profile) => ({ id: profile.id })),
  });
  session.chooseJourneyStory(profileId);
  expect(session.view().quests.map((quest) => quest.id)).not.toContain("wolf_winter");
  expect(session.journey().storyChoice).toMatchObject({
    id: LEAD_SOURCE.id,
    kind: "lead_source",
    options: LEAD_SOURCE.options.map((option) => ({ id: option.id })),
  });
  session.chooseJourneyStory(DEFAULT_SOURCE_ID);
  expect(session.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
  return session;
}

function startedWolfSession(profileId = "albany:unaffiliated_courier"): OverworldSession {
  const session = registerSession(profileId);
  const wolf = WORLD.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("expected Wolf-Winter in the starting world");
  moveSessionToArea(session, wolf.area);
  session.startQuest(wolf.id);
  return session;
}

function prooflessStartedWolfSnapshot(): {
  proofless: ReturnType<OverworldSession["snapshot"]>;
  registered: ReturnType<OverworldSession["snapshot"]>;
} {
  const registered = startedWolfSession().snapshot();
  const proofless = structuredClone(registered);
  proofless.journalEntries = proofless.journalEntries.filter(
    (entry) =>
      entry.kind !== "registration" &&
      entry.kind !== "registration_offer" &&
      entry.kind !== "lead_source" &&
      entry.kind !== "lead_source_offer",
  );
  delete proofless.openingLeadSourceDecisionTrail;
  proofless.character = createInitialCampaignCharacterState();
  return { proofless, registered };
}

function preRegistrationUnrelatedQuestSnapshot(): ReturnType<OverworldSession["snapshot"]> {
  const predecessorWorld = structuredClone(WORLD);
  delete predecessorWorld.opening_registration;
  delete predecessorWorld.opening_lead_source;
  const session = new OverworldSession(predecessorWorld);
  const route = planOverworldRoute(predecessorWorld, session.view().current.id, "queensbury_town");
  if (!route) throw new Error("expected a route to Queensbury");
  for (const step of route.steps) {
    session.travel(step.edge.id);
    if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  }
  session.exploreArea("queensbury_town__civic_core");
  moveSessionToArea(session, "queensbury_town__market");
  session.startQuest("gallowmere");
  return session.snapshot();
}

function moveSessionToArea(session: OverworldSession, targetAreaId: string): void {
  const currentAreaId = session.view().currentArea?.id;
  if (!currentAreaId) throw new Error("expected a current Albany area");
  for (
    let attempt = 0;
    attempt < 8 && !session.view().discoveredAreaIds.includes(targetAreaId);
    attempt += 1
  ) {
    session.exploreArea(currentAreaId);
  }
  if (!session.view().discoveredAreaIds.includes(targetAreaId)) {
    throw new Error(`Albany play did not discover ${targetAreaId}.`);
  }
  const queue: { areaId: string; routeIds: string[] }[] = [{ areaId: currentAreaId, routeIds: [] }];
  const seen = new Set([currentAreaId]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.areaId === targetAreaId) {
      for (const routeId of current.routeIds) session.moveArea(routeId);
      return;
    }
    for (const route of WORLD.area_edges.filter(
      (candidate) => candidate.from_area === current.areaId || candidate.to_area === current.areaId,
    )) {
      const nextAreaId = route.from_area === current.areaId ? route.to_area : route.from_area;
      if (seen.has(nextAreaId)) continue;
      seen.add(nextAreaId);
      queue.push({ areaId: nextAreaId, routeIds: [...current.routeIds, route.id] });
    }
  }
  throw new Error(`No Albany area path reaches ${targetAreaId}.`);
}

function launchRegisteredWolf(profileId: string): {
  api: ToolApi;
  state: GameState;
  registeredSnapshot: ReturnType<OverworldSession["snapshot"]>;
  rowanJournalId: string;
  haydenJournalId: string | null;
} {
  const api = createToolApi({ root: process.cwd() });
  const started = api.start_overworld({ compact_context: false });
  const sessionId = started.session_id;
  const opening = started.observation;
  api.scout_overworld_session_poi({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    poi_id: opening.pois[0]!.id,
  });
  const talked = api.talk_overworld_session_contact({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    character_id: ROWAN_ID,
  });
  expect(talked.journey.storyChoice?.kind).toBe("registration");
  expect(
    api.get_overworld_session_context({
      session_id: sessionId,
      compact_context: true,
    }).journey,
  ).toEqual(talked.journey);
  const registered = api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    choice: profileId,
  });
  expect(registered.journey.storyChoice).toMatchObject({
    id: LEAD_SOURCE.id,
    kind: "lead_source",
  });
  api.choose_overworld_session_story({
    ...FULL_OVERWORLD,
    session_id: sessionId,
    choice: DEFAULT_SOURCE_ID,
  });

  const registeredSnapshot = api.export_overworld_session({ session_id: sessionId }).snapshot;
  const restored = api.restore_overworld_session({
    snapshot: registeredSnapshot,
    compact_context: false,
    compact_result: false,
  });
  const rowan = api.talk_overworld_session_contact({
    ...FULL_OVERWORLD,
    session_id: restored.session_id,
    character_id: ROWAN_ID,
  });
  const quest = rowan.observation.quests.find((candidate) => candidate.id === "wolf_winter");
  if (!quest) throw new Error("The registered Albany save must remember Wolf-Winter.");
  const route = rowan.observation.areaExits.find(
    (candidate) => candidate.destination.id === quest.area,
  );
  if (!route) throw new Error("The Station Quarter route must remain visible after restore.");
  api.move_overworld_session_area({
    ...FULL_OVERWORLD,
    session_id: restored.session_id,
    area_route_id: route.id,
  });
  let haydenJournalId: string | null = null;
  if (profileId === "albany:road_warden") {
    const hayden = api.talk_overworld_session_contact({
      ...FULL_OVERWORLD,
      session_id: restored.session_id,
      character_id: HAYDEN_ID,
    });
    haydenJournalId = hayden.result.entry.id;
  }
  const launched = api.start_overworld_session_quest({
    ...FULL_OVERWORLD,
    compact_observation: false,
    compact_actions: false,
    include_actions: true,
    session_id: restored.session_id,
    quest_id: quest.id,
    seed: 505,
  });
  return {
    api,
    state: structuredClone(api.sessions.get(launched.rpg_session_id).state),
    registeredSnapshot,
    rowanJournalId: rowan.result.entry.id,
    haydenJournalId,
  };
}

function fixedRoll(value: number): Rng {
  return {
    next: () => (value - 1) / 20,
    int: (min, max) => Math.max(min, Math.min(max, value)),
  };
}

function act(state: GameState, actionId: string, roll = 7): GameState {
  const option = enumerateRpgActions(wolfIndex, state).find(
    (candidate) => candidate.id === actionId,
  );
  expect(
    option,
    `${actionId} must be legal in ${state.current}; legal: ${enumerateRpgActions(wolfIndex, state)
      .map((candidate) => candidate.id)
      .join(", ")}`,
  ).toBeDefined();
  if (!option) throw new Error(`Missing action ${actionId}.`);
  const result = makeStep(buildRpgRules(wolfIndex, () => fixedRoll(roll)))(state, option.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

describe("SS-F01 — Albany character background counterfactual", () => {
  it("authors four complete, persistent concepts including an irreversible refusal", () => {
    expect(REGISTRATION.profiles).toHaveLength(4);
    const pending = new OverworldSession(WORLD);
    const pendingOpening = pending.view();
    pending.scoutPoi(pendingOpening.pois[0]!.id);
    pending.talkToCharacter(ROWAN_ID);
    const restoredPending = OverworldSession.restore(WORLD, pending.snapshot());
    expect(restoredPending.journey().storyChoice).toEqual(pending.journey().storyChoice);
    expect(restoredPending.campaignCharacterState().background).toBeNull();

    for (const profile of REGISTRATION.profiles) {
      expect(profile.character.background).toBe(profile.id);
      expect(profile.character.skills).toHaveLength(1);
      expect(profile.character.values).toHaveLength(1);
      expect(profile.character.equipment).toHaveLength(1);
      expect(profile.character.promises).toHaveLength(1);
      expect(profile.character.relationships).toHaveLength(2);
      expect(profile.preview).toMatch(
        /Contact: .*Skill edge: .*Value: .*Kit: .*Funds: .*Standing: .*Knowledge: .*Obligation:/,
      );

      const selected = registerSession(profile.id);
      const restored = OverworldSession.restore(WORLD, selected.snapshot());
      expect(restored.campaignCharacterState()).toEqual(profile.character);
      expect(restored.journey().storyChoice).toBeNull();
      expect(restored.talkToCharacter(ROWAN_ID).entry.id).toContain("@");
      const sponsorRelationship = profile.character.relationships.find(
        (relationship) => relationship.npcId !== "albany:rowan_quill",
      );
      if (!sponsorRelationship) throw new Error(`${profile.id} must name a distinct sponsor`);
      const sponsor = WORLD.characters.find(
        (character) => character.campaign_npc_id === sponsorRelationship.npcId,
      );
      if (!sponsor) throw new Error(`${profile.id} sponsor must bind an Albany contact`);
      const sponsorVariant = sponsor.variants?.find(
        (variant) =>
          (variant.after_quests ?? []).length === 0 &&
          sponsorRelationship.memories.every((memoryId) =>
            variant.after_relationship_memories?.includes(memoryId),
          ),
      );
      if (!sponsorVariant) throw new Error(`${profile.id} sponsor must consume its memory`);
      moveSessionToArea(restored, sponsor.area);
      expect(restored.talkToCharacter(sponsor.id).entry.id).toBe(
        `talk:${sponsor.id}@${sponsorVariant.id}`,
      );
      expect(() => restored.chooseJourneyStory(profile.id)).toThrow(
        /no story consequence to choose/i,
      );
    }

    const refusal = REGISTRATION.profiles.find(
      (profile) => profile.id === "albany:unaffiliated_courier",
    );
    expect(refusal?.consequence).toMatch(/decline institutional sponsorship/i);
    expect(refusal?.consequence).toMatch(/instead of reopening the same question/i);
  });

  it("requires registration before the first overworld quest and keeps refusal authored", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    moveSessionToArea(session, "albany_city__market");
    const marketPoi = session.view().pois[0];
    if (!marketPoi) throw new Error("expected an Albany market point of interest");
    session.scoutPoi(marketPoi.id);
    moveSessionToArea(session, "albany_city__transport_hub");
    const wolf = WORLD.quests.find((quest) => quest.id === "wolf_winter");
    if (!wolf) throw new Error("expected Wolf-Winter in the starting world");

    expect(session.campaignCharacterState().background).toBeNull();
    expect(session.view().quests.map((quest) => quest.id)).not.toContain(wolf.id);
    expect(() => session.previewQuestStart(wolf.id)).toThrow(
      /complete Enter Albany's Relief Compact.*Rowan Quill.*Albany Civic Center/i,
    );
    expect(() => session.startQuest(wolf.id)).toThrow(
      /before starting this journey's first quest/i,
    );
    expect(session.snapshot().startedQuestIds).toEqual([]);

    moveSessionToArea(session, REGISTRATION.area);
    session.talkToCharacter(ROWAN_ID);
    session.chooseJourneyStory("albany:unaffiliated_courier");
    expect(session.journey().storyChoice).toMatchObject({ kind: "lead_source" });
    expect(session.view().quests.map((quest) => quest.id)).not.toContain(wolf.id);
    expect(() => session.previewQuestStart(wolf.id)).toThrow(
      /certify .*Wolf-Winter Source Packet/i,
    );
    session.chooseJourneyStory(DEFAULT_SOURCE_ID);
    moveSessionToArea(session, wolf.area);
    expect(session.previewQuestStart(wolf.id).id).toBe(wolf.id);
    expect(session.startQuest(wolf.id).id).toBe(wolf.id);

    const forgedStartedBeforeRegistration = structuredClone(session.snapshot());
    const registrationEntry = forgedStartedBeforeRegistration.journalEntries.find(
      (entry) => entry.kind === "registration",
    );
    const offerEntry = forgedStartedBeforeRegistration.journalEntries.find(
      (entry) => entry.kind === "registration_offer",
    );
    const contactEntry = forgedStartedBeforeRegistration.journalEntries.find(
      (entry) => entry.id === `talk:${ROWAN_ID}`,
    );
    const questEntry = forgedStartedBeforeRegistration.journalEntries.find(
      (entry) => entry.id === "quest:wolf_winter",
    );
    if (!registrationEntry || !offerEntry || !contactEntry || !questEntry) {
      throw new Error("expected complete registration and quest-start evidence");
    }
    const forgedRegistrationTime = questEntry.recordedAt;
    for (const entry of [registrationEntry, offerEntry, contactEntry]) {
      entry.recordedAt = forgedRegistrationTime;
    }
    offerEntry.registrationBoundary!.minutes = parseTimeLabel(forgedRegistrationTime);
    registrationEntry.registrationBoundary!.minutes = parseTimeLabel(forgedRegistrationTime);
    const reorderedIds = new Set([
      registrationEntry.id,
      offerEntry.id,
      contactEntry.id,
      questEntry.id,
    ]);
    forgedStartedBeforeRegistration.journalEntries = [
      registrationEntry,
      offerEntry,
      contactEntry,
      questEntry,
      ...forgedStartedBeforeRegistration.journalEntries.filter(
        (entry) => !reorderedIds.has(entry.id),
      ),
    ];
    expect(() => OverworldSession.restore(WORLD, forgedStartedBeforeRegistration)).toThrow(
      /journal decision boundaries must be newest-first/i,
    );
  });

  it("rejects opaque pre-registration progress rather than minting incomplete provenance", () => {
    const { proofless } = prooflessStartedWolfSnapshot();
    expect(() => OverworldSession.restore(WORLD, proofless)).toThrow(
      /quest progress without selected opening registration or trusted legacy provenance/i,
    );

    for (const sourceWorldHash of [
      OVERWORLD_PRE_CAMPAIGN_EXPORTS_WORLD_HASH,
      OVERWORLD_CAMPAIGN_EXPORTS_WORLD_HASH,
      OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
    ]) {
      const opaqueWolfPredecessor = structuredClone(proofless);
      opaqueWolfPredecessor.worldHash = sourceWorldHash;
      expect(() => OverworldSession.restore(WORLD, opaqueWolfPredecessor)).toThrow(
        /opaque pre-registration quest progress without a replayable registration and lead-source path/i,
      );

      const predecessor = preRegistrationUnrelatedQuestSnapshot();
      predecessor.worldHash = sourceWorldHash;
      expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
        /opaque pre-registration quest progress without a replayable registration and lead-source path/i,
      );
    }
  });

  it("rejects legacy registration progress that has no replayable lead-source path", () => {
    const predecessor = preRegistrationUnrelatedQuestSnapshot();
    predecessor.worldHash = new OverworldSession(WORLD).snapshot().worldHash;
    if (predecessor.currentAreaId === null) throw new Error("expected a current area");
    const predecessorTown = WORLD.nodes.find((node) => node.id === predecessor.currentId)?.name;
    if (!predecessorTown) throw new Error("expected the predecessor town name");
    predecessor.journalEntries.unshift(
      openingRegistrationLegacyJournalEntry({
        sourceWorldHash: OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
        town: predecessorTown,
        recordedAt: timeLabel(predecessor.minutes),
        registrationBoundary: {
          acceptedDecisions: predecessor.journey.acceptedDecisions,
          decisionProofHash: predecessor.journey.decisionProof.hash,
          townId: predecessor.currentId,
          areaId: predecessor.currentAreaId,
          minutes: predecessor.minutes,
        },
      }),
    );
    expect(() => OverworldSession.restore(WORLD, predecessor)).toThrow(
      /opaque legacy registration progress without a replayable lead-source path/i,
    );

    const freshSession = new OverworldSession(WORLD);
    const fresh = freshSession.snapshot();
    if (fresh.currentAreaId === null) throw new Error("expected Albany's initial area");
    const freshTown = WORLD.nodes.find((node) => node.id === fresh.currentId)?.name;
    if (!freshTown) throw new Error("expected Albany's town name");
    fresh.journalEntries.unshift(
      openingRegistrationLegacyJournalEntry({
        sourceWorldHash: OVERWORLD_CAMPAIGN_IMPORTS_WORLD_HASH,
        town: freshTown,
        recordedAt: timeLabel(fresh.minutes),
        registrationBoundary: {
          acceptedDecisions: fresh.journey.acceptedDecisions,
          decisionProofHash: fresh.journey.decisionProof.hash,
          townId: fresh.currentId,
          areaId: fresh.currentAreaId,
          minutes: fresh.minutes,
        },
      }),
    );
    expect(() => OverworldSession.restore(WORLD, fresh)).toThrow(
      /no earlier quest progress to grandfather/i,
    );
  });

  it("does not expose an impossible registration choice after ending at checkpoint 40", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    while (session.journey().acceptedDecisions < 39) {
      const target =
        session.view().currentArea?.id === REGISTRATION.area
          ? "albany_city__market"
          : REGISTRATION.area;
      moveSessionToArea(session, target);
    }
    expect(session.view().currentArea?.id).toBe(REGISTRATION.area);
    session.talkToCharacter(ROWAN_ID);
    expect(session.journey()).toMatchObject({
      acceptedDecisions: 40,
      status: "awaiting_choice",
      storyChoice: null,
    });
    const awaiting = session.snapshot();
    expect(awaiting.journalEntries.some((entry) => entry.kind === "registration_offer")).toBe(true);

    const continued = OverworldSession.restore(WORLD, awaiting);
    continued.chooseJourney("continue");
    expect(continued.journey()).toMatchObject({
      status: "active",
      storyChoice: { kind: "registration" },
    });

    const ended = OverworldSession.restore(WORLD, awaiting);
    ended.chooseJourney("end");
    expect(ended.journey()).toMatchObject({ status: "ended", storyChoice: null });
    const restoredEnded = OverworldSession.restore(WORLD, ended.snapshot());
    expect(restoredEnded.journey()).toMatchObject({ status: "ended", storyChoice: null });
    expect(() => restoredEnded.chooseJourneyStory("albany:road_warden")).toThrow(
      /journey has ended/i,
    );
  });

  it("redacts and detaches registration proof metadata from player-facing results", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    session.talkToCharacter(ROWAN_ID);
    const selection = session.chooseJourneyStory("albany:road_warden");
    expect("registrationBoundary" in selection.entry).toBe(false);
    expect(session.view().journal.every((entry) => !("registrationBoundary" in entry))).toBe(true);

    const exported = session.snapshot();
    const boundary = exported.journalEntries.find(
      (entry) => entry.kind === "registration",
    )?.registrationBoundary;
    if (!boundary) throw new Error("expected private registration proof in the save snapshot");
    const acceptedDecisions = boundary.acceptedDecisions;
    boundary.acceptedDecisions += 100;
    expect(
      session.snapshot().journalEntries.find((entry) => entry.kind === "registration")
        ?.registrationBoundary?.acceptedDecisions,
    ).toBe(acceptedDecisions);
  });

  it("changes Wolf-Winter's risk and next legal action under the same roll", () => {
    const warden = launchRegisteredWolf("albany:road_warden");
    const advocate = launchRegisteredWolf("albany:ledger_advocate");

    expect(warden.registeredSnapshot.character).toEqual(
      REGISTRATION.profiles.find((profile) => profile.id === "albany:road_warden")!.character,
    );
    expect(advocate.registeredSnapshot.character).toEqual(
      REGISTRATION.profiles.find((profile) => profile.id === "albany:ledger_advocate")!.character,
    );
    expect(warden.rowanJournalId).toBe(
      "talk:albany_city__civic_core__contact@registered_road_warden",
    );
    expect(warden.haydenJournalId).toBe(
      "talk:albany_city__transport_hub__contact@sponsored_road_warden",
    );
    expect(advocate.rowanJournalId).toBe(
      "talk:albany_city__civic_core__contact@registered_ledger_advocate",
    );

    expect(warden.state.vars.defense).toBe(4);
    expect(warden.state.campaignImportReceipt?.applied_rules).toEqual([
      "import:wolf_winter_fieldcraft",
      "import:wolf_winter_lure_fieldcraft",
    ]);
    expect(warden.state.vars.fieldcraft).toBe(4);
    expect(advocate.state.vars.defense).toBe(3);
    expect(advocate.state.campaignImportReceipt).toBeUndefined();

    let wardenAtRail = act(act(warden.state, "go_north"), "go_north");
    let advocateAtRail = act(act(advocate.state, "go_north"), "go_north");
    const wardenRail = enumerateRpgActions(wolfIndex, wardenAtRail).find(
      (candidate) => candidate.id === "use_paling_rail",
    );
    const advocateRail = enumerateRpgActions(wolfIndex, advocateAtRail).find(
      (candidate) => candidate.id === "use_paling_rail",
    );
    expect(wardenRail?.skill_check).toEqual({
      skill: "defense",
      difficulty: 11,
      die: "d20",
    });
    expect(advocateRail?.skill_check).toEqual(wardenRail?.skill_check);

    wardenAtRail = act(wardenAtRail, "use_paling_rail", 7);
    advocateAtRail = act(advocateAtRail, "use_paling_rail", 7);
    expect(wardenAtRail.flags).toMatchObject({
      rail_attempted: true,
      breach_braced: true,
    });
    expect(wardenAtRail.flags.rail_split).not.toBe(true);
    expect(advocateAtRail.flags).toMatchObject({
      rail_attempted: true,
      rail_split: true,
    });
    expect(advocateAtRail.flags.breach_braced).not.toBe(true);

    const wardenNext = enumerateRpgActions(wolfIndex, wardenAtRail).map((option) => option.id);
    const advocateNext = enumerateRpgActions(wolfIndex, advocateAtRail).map((option) => option.id);
    expect(wardenNext).not.toContain("use_paling_rail");
    expect(advocateNext).toContain("use_paling_rail");
    expect(wardenNext).not.toEqual(advocateNext);

    const direct = warden.api.start_world_quest({ world_quest_id: "wolf_winter", seed: 505 });
    const directState = warden.api.sessions.get(direct.session_id).state;
    expect(directState.vars.defense).toBe(3);
    expect(directState.campaignImportReceipt).toBeUndefined();
  });

  it("rejects forged profile state, memories, and registration evidence on restore", () => {
    const pending = new OverworldSession(WORLD);
    const pendingOpening = pending.view();
    pending.scoutPoi(pendingOpening.pois[0]!.id);
    pending.talkToCharacter(ROWAN_ID);
    const pendingSnapshot = pending.snapshot();
    pending.chooseJourneyStory("albany:road_warden");
    const legitimatelySelected = pending.snapshot();
    const canonicalSelection = legitimatelySelected.journalEntries.find(
      (entry) => entry.kind === "registration",
    );
    if (!canonicalSelection) throw new Error("expected canonical registration selection proof");
    const splicedSelection = structuredClone(pendingSnapshot);
    splicedSelection.journalEntries.unshift(structuredClone(canonicalSelection));
    splicedSelection.character = structuredClone(
      REGISTRATION.profiles.find((profile) => profile.id === "albany:road_warden")!.character,
    );
    expect(() => OverworldSession.restore(WORLD, splicedSelection)).toThrow(
      /registration selection is ahead of its journey decision count/i,
    );

    const snapshot = registerSession("albany:road_warden").snapshot();

    const forgedSkill = structuredClone(snapshot);
    forgedSkill.character.skills[0]!.rank = 5;
    expect(() => OverworldSession.restore(WORLD, forgedSkill)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );

    const forgedMemory = structuredClone(snapshot);
    forgedMemory.character.relationships[0]!.memories = [];
    expect(() => OverworldSession.restore(WORLD, forgedMemory)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );

    const forgedCopy = structuredClone(snapshot);
    forgedCopy.journalEntries.find((entry) => entry.kind === "registration")!.text +=
      " Forged authority.";
    expect(() => OverworldSession.restore(WORLD, forgedCopy)).toThrow(/authored copy/i);

    const missingOffer = structuredClone(snapshot);
    missingOffer.journalEntries = missingOffer.journalEntries.filter(
      (entry) => entry.kind !== "registration_offer",
    );
    expect(() => OverworldSession.restore(WORLD, missingOffer)).toThrow(
      /no replayable opening offer/i,
    );

    const selectedWithLaterPlay = registerSession("albany:road_warden");
    const event = selectedWithLaterPlay.view().events[0];
    if (!event) throw new Error("expected Albany's opening event");
    selectedWithLaterPlay.investigateEvent(event.id);
    const missingSelection = structuredClone(selectedWithLaterPlay.snapshot());
    missingSelection.journalEntries = missingSelection.journalEntries.filter(
      (entry) => entry.kind !== "registration",
    );
    missingSelection.character = createInitialCampaignCharacterState();
    expect(() => OverworldSession.restore(WORLD, missingSelection)).toThrow(
      /pending registration offer must remain the latest journal boundary/i,
    );

    const movedAfterSelection = pending;
    movedAfterSelection.chooseJourneyStory(DEFAULT_SOURCE_ID);
    moveSessionToArea(movedAfterSelection, "albany_city__market");
    const wrongLocation = structuredClone(movedAfterSelection.snapshot());
    wrongLocation.journalEntries = wrongLocation.journalEntries.filter(
      (entry) =>
        entry.kind !== "registration" &&
        entry.kind !== "lead_source" &&
        entry.kind !== "lead_source_offer" &&
        entry.kind !== "area",
    );
    wrongLocation.discoveredQuestIds = wrongLocation.discoveredQuestIds.filter(
      (questId) => questId !== LEAD_SOURCE.target_quest,
    );
    wrongLocation.character = createInitialCampaignCharacterState();
    wrongLocation.journey = structuredClone(pendingSnapshot.journey);
    expect(() => OverworldSession.restore(WORLD, wrongLocation)).toThrow(
      /pending registration no longer matches its offered world and journey boundary/i,
    );

    moveSessionToArea(movedAfterSelection, REGISTRATION.area);
    const wrongClock = structuredClone(movedAfterSelection.snapshot());
    wrongClock.journalEntries = wrongClock.journalEntries.filter(
      (entry) =>
        entry.kind !== "registration" &&
        entry.kind !== "lead_source" &&
        entry.kind !== "lead_source_offer" &&
        entry.kind !== "area",
    );
    wrongClock.discoveredQuestIds = wrongClock.discoveredQuestIds.filter(
      (questId) => questId !== LEAD_SOURCE.target_quest,
    );
    wrongClock.character = createInitialCampaignCharacterState();
    wrongClock.journey = structuredClone(pendingSnapshot.journey);
    expect(() => OverworldSession.restore(WORLD, wrongClock)).toThrow(
      /pending registration no longer matches its offered world and journey boundary/i,
    );
  });
});
