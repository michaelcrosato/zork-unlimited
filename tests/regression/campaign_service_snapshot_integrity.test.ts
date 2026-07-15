import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  campaignServiceJournalCopy,
  campaignServiceJourneyActionId,
} from "../../src/world/session_services.js";
import type {
  OverworldJournalEntry,
  OverworldSessionSnapshot,
} from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const TIMBER_SERVICE_RULE_ID = "albany:wolf_saved_timber_quick_resupply";

function timeLabel(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const minuteOfDay = minutes % 1440;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `Day ${day}, ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function moveToArea(session: OverworldSession, areaId: string): void {
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function albanyStationSession(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  const poi = opening.pois[0];
  const contact = opening.characters[0];
  if (!poi || !contact) throw new Error("expected Albany opening sources");
  session.scoutPoi(poi.id);
  session.talkToCharacter(contact.id);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:source_jamie_market_testimony");
  expect(session.journey().storyChoice?.kind).toBe("preparation");
  session.chooseJourneyStory("albany:prep_works_fortification");
  moveToArea(session, "albany_city__market");
  moveToArea(session, "albany_city__transport_hub");
  return session;
}

function completeSavedTimberQuest(session: OverworldSession): void {
  session.startQuest("wolf_winter", "albany:wolf_approach_sheltered_stockway");
  session.completeQuest("wolf_winter", {
    endingId: "ending_held_timber_saved",
    endingTitle: "The Byre Held, Paling Timber Saved",
    death: false,
  });
}

function returnedSavedTimberSession(): OverworldSession {
  const session = albanyStationSession();
  completeSavedTimberQuest(session);
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");

  const outbound = session
    .view()
    .exits.find((candidate) => candidate.destination.id === "colonie_town");
  if (!outbound) throw new Error("expected the Albany-Colonie road");
  session.travel(outbound.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  const returnRoad = session
    .view()
    .exits.find((candidate) => candidate.destination.id === "albany_city");
  if (!returnRoad) throw new Error("expected the Colonie-Albany road");
  session.travel(returnRoad.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  return session;
}

function timberServiceSnapshot(): OverworldSessionSnapshot {
  const session = returnedSavedTimberSession();
  expect(session.view().serviceOffers).toContainEqual(
    expect.objectContaining({
      id: TIMBER_SERVICE_RULE_ID,
      action: "resupply",
      minutes: 15,
    }),
  );
  session.resupplyAtTown();
  return session.snapshot();
}

function timberServiceRule() {
  const rule = WORLD.campaign_service_rules?.find(
    (candidate) => candidate.id === TIMBER_SERVICE_RULE_ID,
  );
  if (!rule) throw new Error("expected the saved-timber campaign service rule");
  return rule;
}

function ordinaryServiceEntry(snapshot: OverworldSessionSnapshot): OverworldJournalEntry {
  const entry = snapshot.journalEntries.find(
    (candidate) => candidate.kind === "service" && candidate.serviceRuleId === undefined,
  );
  if (!entry) throw new Error("expected an ordinary service journal entry");
  return entry;
}

function rewriteDecisionAction(
  snapshot: OverworldSessionSnapshot,
  acceptedDecisions: number,
  actionId: string,
): ReadonlyMap<number, string> {
  const trail = snapshot.openingLeadSourceDecisionTrail;
  if (!trail) throw new Error("expected the opening decision trail");
  const decision = trail.decisions.find((candidate) => candidate.number === acceptedDecisions);
  if (!decision) throw new Error(`expected decision ${acceptedDecisions}`);
  decision.actionId = actionId;

  const proofHashes = new Map<number, string>([
    [trail.baseAcceptedDecisions, trail.baseDecisionProofHash],
  ]);
  let proofHash = trail.baseDecisionProofHash;
  for (const candidate of trail.decisions) {
    proofHash = hashState({ previous: proofHash, ...candidate });
    proofHashes.set(candidate.number, proofHash);
  }
  snapshot.journey.decisionProof = {
    hash: proofHash,
    last: trail.decisions.at(-1) ? { ...trail.decisions.at(-1)! } : null,
  };
  return proofHashes;
}

function rebindJournalBoundaryHashes(
  snapshot: OverworldSessionSnapshot,
  proofHashes: ReadonlyMap<number, string>,
): void {
  for (const entry of snapshot.journalEntries) {
    for (const boundary of [
      entry.questCompletionBoundary,
      entry.registrationBoundary,
      entry.serviceBoundary,
      entry.storyChoiceBoundary,
    ]) {
      if (!boundary) continue;
      const proofHash = proofHashes.get(boundary.acceptedDecisions);
      if (proofHash) boundary.decisionProofHash = proofHash;
    }
  }
}

function relabelOrdinaryResupply(args: {
  entry: OverworldJournalEntry;
  suppliesBefore: number;
  fatigueBefore: number;
  acceptedDecisions: number;
  recordedAt: number;
  proofHash: string;
}): void {
  const rule = timberServiceRule();
  const copy = campaignServiceJournalCopy(rule, {
    supplies: args.suppliesBefore,
    fatigue: args.fatigueBefore,
  });
  Object.assign(args.entry, {
    id: `service:resupply:${args.recordedAt}`,
    title: copy.title,
    text: copy.text,
    recordedAt: timeLabel(args.recordedAt),
    serviceRuleId: rule.id,
    serviceAreaId: rule.area,
    serviceBoundary: {
      acceptedDecisions: args.acceptedDecisions,
      decisionProofHash: args.proofHash,
      townId: rule.home,
      areaId: rule.area,
      minutes: args.recordedAt,
    },
  });
}

function campaignServiceEntry(snapshot: OverworldSessionSnapshot): OverworldJournalEntry {
  const entry = snapshot.journalEntries.find(
    (candidate) => candidate.serviceRuleId === TIMBER_SERVICE_RULE_ID,
  );
  if (!entry) throw new Error("expected campaign service journal proof");
  return entry;
}

describe("campaign service snapshot integrity", () => {
  it("round-trips canonical one-time service proof and authored minutes", () => {
    const snapshot = timberServiceSnapshot();
    const service = campaignServiceEntry(snapshot);
    expect(service).toMatchObject({
      id: `service:resupply:${snapshot.minutes}`,
      kind: "service",
      serviceRuleId: TIMBER_SERVICE_RULE_ID,
      serviceAreaId: "albany_city__transport_hub",
    });

    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
  });

  it("rejects a current save whose service-gating quest fact lost its completion boundary", () => {
    const forged = returnedSavedTimberSession().snapshot();
    const completion = forged.journalEntries.find((entry) => entry.id === "quest_done:wolf_winter");
    if (!completion) throw new Error("expected Wolf-Winter completion journal");
    delete completion.questCompletionBoundary;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /quest completion "wolf_winter" lacks the decision boundary required by a campaign service fact/i,
    );
  });

  it("rejects relabeling an ordinary Market resupply as the Station campaign service", () => {
    const session = returnedSavedTimberSession();
    moveToArea(session, "albany_city__market");
    const before = session.view();
    session.resupplyAtTown();
    const forged = session.snapshot();
    const service = ordinaryServiceEntry(forged);
    const serviceDecision = forged.openingLeadSourceDecisionTrail?.decisions.at(-1);
    if (!serviceDecision || serviceDecision.actionId !== "resupply") {
      throw new Error("expected the ordinary resupply decision");
    }

    const proofHashes = rewriteDecisionAction(
      forged,
      serviceDecision.number,
      campaignServiceJourneyActionId(TIMBER_SERVICE_RULE_ID, "resupply"),
    );
    rebindJournalBoundaryHashes(forged, proofHashes);
    const forgedMinutes = forged.minutes - 30;
    forged.minutes = forgedMinutes;
    relabelOrdinaryResupply({
      entry: service,
      suppliesBefore: before.supplies,
      fatigueBefore: before.fatigue,
      acceptedDecisions: serviceDecision.number,
      recordedAt: forgedMinutes,
      proofHash: proofHashes.get(serviceDecision.number)!,
    });

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /boundary does not match its replayed campaign service location/i,
    );
  });

  it("rejects retroactively moving a pre-quest ordinary service behind the saved-timber fact", () => {
    const session = albanyStationSession();
    const before = session.view();
    session.resupplyAtTown();
    const ordinarySnapshot = session.snapshot();
    const ordinary = ordinaryServiceEntry(ordinarySnapshot);
    const ordinaryRecordedAt = ordinary.recordedAt;
    const serviceDecision = ordinarySnapshot.openingLeadSourceDecisionTrail?.decisions.at(-1);
    if (!serviceDecision || serviceDecision.actionId !== "resupply") {
      throw new Error("expected the pre-quest ordinary resupply decision");
    }

    completeSavedTimberQuest(session);
    const forged = session.snapshot();
    const service = ordinaryServiceEntry(forged);
    const quest = forged.journalEntries.find(
      (candidate) => candidate.id === "quest_done:wolf_winter",
    );
    if (!quest?.questCompletionBoundary) throw new Error("expected Wolf-Winter completion proof");
    expect(ordinaryRecordedAt < quest.recordedAt).toBe(true);

    const proofHashes = rewriteDecisionAction(
      forged,
      serviceDecision.number,
      campaignServiceJourneyActionId(TIMBER_SERVICE_RULE_ID, "resupply"),
    );
    rebindJournalBoundaryHashes(forged, proofHashes);

    // Manufacture timestamp evidence that makes the quest and service appear
    // simultaneous. The verified trail still fixes the service at decision 7
    // and the quest-produced fact at decision 8.
    const forgedMinutes = quest.questCompletionBoundary.minutes + 15;
    forged.minutes = forgedMinutes;
    quest.recordedAt = timeLabel(forgedMinutes);
    quest.questCompletionBoundary.minutes = forgedMinutes;
    relabelOrdinaryResupply({
      entry: service,
      suppliesBefore: before.supplies,
      fatigueBefore: before.fatigue,
      acceptedDecisions: serviceDecision.number,
      recordedAt: forgedMinutes,
      proofHash: proofHashes.get(serviceDecision.number)!,
    });
    forged.journalEntries.splice(forged.journalEntries.indexOf(service), 1);
    forged.journalEntries.splice(forged.journalEntries.indexOf(quest) + 1, 0, service);

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /journal decision boundaries must be newest-first|lacks required world fact "fact:wolf_winter_repair_timber_available" before its service decision/i,
    );
  });

  it("rejects duplicate consumption of the same one-time service rule", () => {
    const forged = timberServiceSnapshot();
    const service = campaignServiceEntry(forged);
    const duplicateMinutes = forged.minutes + 15;
    forged.minutes = duplicateMinutes;
    forged.journalEntries.unshift({
      ...service,
      id: `service:resupply:${duplicateMinutes}`,
      recordedAt: timeLabel(duplicateMinutes),
      serviceBoundary: {
        ...service.serviceBoundary!,
        minutes: duplicateMinutes,
      },
    });

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(/used more than once/i);
  });
});
