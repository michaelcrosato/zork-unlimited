import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import type { OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { describeOverworldEventResolution } from "../../src/world/session_event_resolution.js";
import { AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH } from "../../src/world/local_scene_legacy_sources.js";
import {
  OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH,
  OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import {
  exactEmeryEvidenceCustodyPredecessor,
  exactFrostJambSignpostPredecessorSnapshot,
} from "./fixtures/historical_overworlds.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREDECESSOR = exactEmeryEvidenceCustodyPredecessor(WORLD);
const AREA = "albany_city__greenway";
const EVENT = "albany_city__greenway__event";
const JOB = "albany_city__greenway__job";
const QUIET_EVENT = "place_quiet_corridor_markers";
const QUIET_JOB = "trace_winter_wildlife_corridor_with_witness_points";
const CUSTODY_EVENT = "open_bloodshed_evidence_custody";
const CUSTODY_JOB = "trace_bloodshed_chain_of_custody_with_witness_points";
const PUBLIC_EVENT = "post_accessible_public_detour";
const PUBLIC_JOB = "map_all_weather_public_loop";
const EMERY_MEMORY = "albany:memory_emery_wolf_full_combat_bloodshed";

function moveToArea(world: OverworldManifest, session: OverworldSession, areaId: string): void {
  const start = session.view().currentArea?.id;
  if (!start) throw new Error("Expected an Albany area.");
  for (
    let attempts = 0;
    attempts < 8 && !session.view().areas.some((area) => area.id === areaId);
    attempts += 1
  ) {
    session.exploreArea(session.view().currentArea!.id);
  }
  const queue: { areaId: string; routes: string[] }[] = [{ areaId: start, routes: [] }];
  const seen = new Set([start]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    if (current.areaId === areaId) {
      for (const route of current.routes) session.moveArea(route);
      return;
    }
    for (const edge of world.area_edges) {
      if (edge.home !== session.view().current.id) continue;
      const next =
        edge.from_area === current.areaId
          ? edge.to_area
          : edge.to_area === current.areaId
            ? edge.from_area
            : null;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push({ areaId: next, routes: [...current.routes, edge.id] });
    }
  }
  throw new Error(`No Albany route reaches ${areaId}.`);
}

function completedGreenwayPolicy(args: {
  endingId: string;
  endingTitle: string;
  eventOption: string;
  jobOption?: string;
  preparationId?: string;
  reliefAllocationId?: string;
  world: OverworldManifest;
}): OverworldSession {
  const { world } = args;
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_full_compact_duty");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(world, session, world.opening_preparation!.area);
  session.chooseJourneyStory(args.preparationId ?? "albany:prep_works_fortification");
  if (session.view().departureInteractions[0]?.kind === "relief_allocation") {
    session.chooseJourneyStory(args.reliefAllocationId ?? "albany:relief_cade_fodder");
  }
  const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf) throw new Error("Wolf-Winter must be available.");
  moveToArea(world, session, wolf.area);
  session.scoutPoi("albany_city__transport_hub__poi");
  session.talkToCharacter("albany_city__transport_hub__contact");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: args.endingId,
    endingTitle: args.endingTitle,
    death: false,
  });
  session.chooseJourney("continue");
  session.chooseJourneyStory("send_wardens_north");
  moveToArea(world, session, AREA);
  session.scoutPoi("albany_city__greenway__poi");
  session.talkToCharacter("albany_city__greenway__contact");
  session.investigateEvent(EVENT);
  session.resolveEvent(EVENT, args.eventOption);
  if (args.jobOption) session.workLocalJob(JOB, args.jobOption);
  return session;
}

function entry(snapshot: ReturnType<OverworldSession["snapshot"]>, id: string) {
  const result = snapshot.journalEntries.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Expected journal entry ${id}.`);
  return result;
}

function hasEmeryMemory(snapshot: ReturnType<OverworldSession["snapshot"]>): boolean {
  return snapshot.character.relationships.some(
    (relationship) =>
      relationship.npcId === "albany:emery_sloane" && relationship.memories.includes(EMERY_MEMORY),
  );
}

function emeryRelationship(snapshot: ReturnType<OverworldSession["snapshot"]>) {
  return snapshot.character.relationships.find(
    (relationship) => relationship.npcId === "albany:emery_sloane",
  );
}

/** Forge only the authored event choice, then reseal the replayable decision suffix. */
function rehashGreenwayEventOption(
  snapshot: ReturnType<OverworldSession["snapshot"]>,
  optionId: string,
): ReturnType<OverworldSession["snapshot"]> {
  const forged = structuredClone(snapshot);
  const resolution = entry(forged, `resolve:${EVENT}`);
  const proof = resolution.localSceneProof;
  const event = WORLD.local_events.find((candidate) => candidate.id === EVENT)!;
  const option = event.authored_scene!.options.find((candidate) => candidate.id === optionId)!;
  const node = WORLD.nodes.find((candidate) => candidate.id === event.home)!;
  if (!proof?.boundary) throw new Error("Expected a Greenway event decision boundary.");
  const descriptor = describeOverworldEventResolution(event, node.name, node.region, option);
  resolution.title = descriptor.title;
  resolution.text = descriptor.text;
  proof.optionId = optionId;

  const trail = forged.openingLeadSourceDecisionTrail;
  if (!trail) throw new Error("Expected a replayable campaign decision trail.");
  let oldHash = trail.baseDecisionProofHash;
  let newHash = trail.baseDecisionProofHash;
  const hashes = new Map<string, string>();
  trail.decisions = trail.decisions.map((decision) => {
    oldHash = hashState({ previous: oldHash, ...decision });
    const migrated =
      decision.number === proof.boundary!.acceptedDecisions
        ? { ...decision, actionId: `resolve_event:${EVENT}:${optionId}` }
        : decision;
    newHash = hashState({ previous: newHash, ...migrated });
    hashes.set(oldHash, newHash);
    return migrated;
  });
  proof.boundary.decisionProofHash = hashes.get(proof.boundary.decisionProofHash)!;
  forged.journey.decisionProof = { hash: newHash, last: trail.decisions.at(-1)! };
  forged.journey.retentionHistory = forged.journey.retentionHistory.map((record) => ({
    ...record,
    decisionProofHash: hashes.get(record.decisionProofHash) ?? record.decisionProofHash,
  }));
  return forged;
}

describe("Emery evidence-custody snapshot integrity", () => {
  it("pins the exact predecessor and current manifests", () => {
    expect(hashState(PREDECESSOR)).toBe(OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH);
    expect(OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH).toBe(
      "46734c7efbc34fcd4fa4def812ed30f98dee230090fcf767629b62438331eaf3",
    );
    expect(hashState(WORLD)).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH).toBe(
      "7b517d0a2ccae01b9548b415465391c51176c6357facc513c506808e7a115590",
    );
  });

  it("grandfathers a bloodshed quiet Greenway return without rewriting the player's policy", () => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: QUIET_EVENT,
      jobOption: QUIET_JOB,
    }).snapshot();
    const predecessorEvent = entry(predecessor, `resolve:${EVENT}`);
    const predecessorJob = entry(predecessor, `job:${JOB}`);
    expect(hasEmeryMemory(predecessor)).toBe(false);
    expect(predecessorEvent.localSceneProof?.optionId).toBe(QUIET_EVENT);
    expect(predecessorJob.localSceneProof?.optionId).toBe(QUIET_JOB);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const restoredEvent = entry(restored, `resolve:${EVENT}`);
    const restoredJob = entry(restored, `job:${JOB}`);
    const predecessorContact = predecessor.journalEntries.find(
      (candidate) =>
        candidate.kind === "contact" &&
        candidate.id.startsWith("talk:albany_city__greenway__contact"),
    );
    const restoredContact = restored.journalEntries.find(
      (candidate) =>
        candidate.kind === "contact" &&
        candidate.id.startsWith("talk:albany_city__greenway__contact"),
    );

    expect(restored.worldHash).toBe(OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH);
    expect(hasEmeryMemory(restored)).toBe(true);
    expect(restoredEvent).toEqual({
      ...predecessorEvent,
      localSceneProof: {
        ...predecessorEvent.localSceneProof,
        sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
      },
    });
    expect(restoredJob).toEqual({
      ...predecessorJob,
      localSceneProof: {
        ...predecessorJob.localSceneProof,
        sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
      },
    });
    expect(restoredContact).toEqual({
      ...predecessorContact,
      sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
    });
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(OverworldSession.restore(WORLD, restored).snapshot()).toEqual(restored);
  });

  it("adds only pre-care provenance to a bloodless quiet deep record", () => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_pack_diverted",
      endingTitle: "The Pack Diverted Alive",
      eventOption: QUIET_EVENT,
      jobOption: QUIET_JOB,
    }).snapshot();
    const expected = structuredClone(predecessor);
    expected.worldHash = OVERWORLD_AUTHORED_LOCAL_JOB_WORLD_HASH;
    entry(expected, `job:${JOB}`).localSceneProof!.sourceWorldHash =
      OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH;

    expect(OverworldSession.restore(WORLD, predecessor).snapshot()).toEqual(expected);
  });

  it("leaves a full-combat public Greenway return public while replaying Emery's new memory", () => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: PUBLIC_EVENT,
      jobOption: PUBLIC_JOB,
    }).snapshot();
    const predecessorEvent = entry(predecessor, `resolve:${EVENT}`);
    const predecessorJob = entry(predecessor, `job:${JOB}`);
    expect(hasEmeryMemory(predecessor)).toBe(false);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const restoredEvent = entry(restored, `resolve:${EVENT}`);
    const restoredJob = entry(restored, `job:${JOB}`);
    expect(restoredEvent.localSceneProof?.optionId).toBe(PUBLIC_EVENT);
    expect(restoredJob.localSceneProof?.optionId).toBe(PUBLIC_JOB);
    expect(restoredEvent.title).toBe(predecessorEvent.title);
    expect(restoredEvent.text).toBe(predecessorEvent.text);
    expect(restoredJob.title).toBe(predecessorJob.title);
    expect(restoredJob.text).toBe(predecessorJob.text);
    expect(restored.minutes).toBe(predecessor.minutes);
    expect(restored.supplies).toBe(predecessor.supplies);
    expect(restored.fatigue).toBe(predecessor.fatigue);
    expect(hasEmeryMemory(restored)).toBe(true);
  });

  it.each([
    {
      label: "no prior Emery relationship",
      preparationId: "albany:prep_works_fortification",
      reliefAllocationId: "albany:relief_resident_shelter",
      expectedPrior: null,
    },
    {
      label: "the drover-route Emery floor",
      preparationId: "albany:prep_drover_route",
      reliefAllocationId: "albany:relief_resident_shelter",
      expectedPrior: {
        memories: ["albany:memory_emery_wolf_drover_route_allocated"],
        trust: 3,
        regard: 3,
        owesPlayer: 0,
      },
    },
    {
      label: "the Cade-fodder Emery floor",
      preparationId: "albany:prep_works_fortification",
      reliefAllocationId: "albany:relief_cade_fodder",
      expectedPrior: {
        memories: ["albany:memory_emery_relief_cade_fodder_allocated"],
        trust: 4,
        regard: 4,
        owesPlayer: 0,
      },
    },
  ])("replays full-combat memory floors over $label", (variant) => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: PUBLIC_EVENT,
      preparationId: variant.preparationId,
      reliefAllocationId: variant.reliefAllocationId,
    }).snapshot();
    const prior = emeryRelationship(predecessor);
    if (variant.expectedPrior === null) {
      expect(prior).toBeUndefined();
    } else {
      expect(prior).toMatchObject(variant.expectedPrior);
    }

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    const current = emeryRelationship(restored);
    expect(current).toBeDefined();
    expect(current?.memories).toEqual(
      expect.arrayContaining([...(prior?.memories ?? []), EMERY_MEMORY]),
    );
    expect(current?.memories).toHaveLength(
      new Set([...(prior?.memories ?? []), EMERY_MEMORY]).size,
    );
    expect(current).toMatchObject({
      trust: Math.max(prior?.trust ?? 0, 4),
      regard: Math.max(prior?.regard ?? 0, 5),
      owesPlayer: Math.max(prior?.owesPlayer ?? 0, 0),
    });
  });

  it("grandfathers the hybrid after-blood quiet record without inventing the full-combat memory", () => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_pack_diverted_after_blood",
      endingTitle: "The Pack Broken After Blood",
      eventOption: QUIET_EVENT,
      jobOption: QUIET_JOB,
    }).snapshot();
    expect(hasEmeryMemory(predecessor)).toBe(false);

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(entry(restored, `resolve:${EVENT}`)).toEqual({
      ...entry(predecessor, `resolve:${EVENT}`),
      localSceneProof: {
        ...entry(predecessor, `resolve:${EVENT}`).localSceneProof,
        sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
      },
    });
    expect(entry(restored, `job:${JOB}`)).toEqual({
      ...entry(predecessor, `job:${JOB}`),
      localSceneProof: {
        ...entry(predecessor, `job:${JOB}`).localSceneProof,
        sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
      },
    });
    expect(hasEmeryMemory(restored)).toBe(false);
  });

  it("preserves an unshadowed predecessor hybrid Emery contact with its historical copy", () => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_pack_diverted_after_blood",
      endingTitle: "The Pack Broken After Blood",
      eventOption: QUIET_EVENT,
      preparationId: "albany:prep_works_fortification",
      reliefAllocationId: "albany:relief_resident_shelter",
    }).snapshot();
    const predecessorContact = predecessor.journalEntries.find(
      (candidate) =>
        candidate.id === "talk:albany_city__greenway__contact@wolf_pack_diverted_after_blood",
    );
    expect(predecessorContact).toBeDefined();

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(
      restored.journalEntries.find(
        (candidate) =>
          candidate.id === "talk:albany_city__greenway__contact@wolf_pack_diverted_after_blood",
      ),
    ).toEqual({
      ...predecessorContact,
      sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
    });
  });

  it("grandfathers a bloodshed event-only return while retaining its quiet job branch", () => {
    const predecessor = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: QUIET_EVENT,
    }).snapshot();
    expect(predecessor.journalEntries.some((candidate) => candidate.id === `job:${JOB}`)).toBe(
      false,
    );

    const restored = OverworldSession.restore(WORLD, predecessor).snapshot();
    expect(entry(restored, `resolve:${EVENT}`)).toEqual({
      ...entry(predecessor, `resolve:${EVENT}`),
      localSceneProof: {
        ...entry(predecessor, `resolve:${EVENT}`).localSceneProof,
        sourceWorldHash: OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH,
      },
    });
    expect(restored.journalEntries.some((candidate) => candidate.id === `job:${JOB}`)).toBe(false);
    expect(restored.journey.decisionProof).toEqual(predecessor.journey.decisionProof);
    expect(restored.openingLeadSourceDecisionTrail).toEqual(
      predecessor.openingLeadSourceDecisionTrail,
    );
    expect(
      OverworldSession.restore(WORLD, restored)
        .view()
        .jobChoices.map(([jobId, optionId]) => [jobId, optionId]),
    ).toEqual(
      expect.arrayContaining([
        [JOB, "reset_steward_markers"],
        [JOB, QUIET_JOB],
      ]),
    );
  });

  it.each([
    {
      label: "custody under a bloodless return",
      endingId: "ending_pack_diverted",
      endingTitle: "The Pack Diverted Alive",
      forgedOption: CUSTODY_EVENT,
    },
    {
      label: "quiet markers under a bloodshed return",
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      forgedOption: QUIET_EVENT,
    },
  ])("rejects a rehashed $label", ({ endingId, endingTitle, forgedOption }) => {
    const source = completedGreenwayPolicy({
      world: WORLD,
      endingId,
      endingTitle,
      eventOption: PUBLIC_EVENT,
    }).snapshot();
    const forged = rehashGreenwayEventOption(source, forgedOption);

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /authored event .* earlier world-fact requirements/i,
    );
  });

  it("rejects a current-only Emery contact carrying trusted predecessor provenance", () => {
    const forged = completedGreenwayPolicy({
      world: WORLD,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: PUBLIC_EVENT,
      preparationId: "albany:prep_works_fortification",
      reliefAllocationId: "albany:relief_resident_shelter",
    }).snapshot();
    const currentOnlyContact = forged.journalEntries.find(
      (candidate) =>
        candidate.id === "talk:albany_city__greenway__contact@wolf_full_combat_bloodshed",
    );
    if (!currentOnlyContact)
      throw new Error("Expected the current-only full-combat Emery contact.");
    currentOnlyContact.sourceWorldHash = OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH;

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /current-only Emery contact cannot claim predecessor provenance/i,
    );
  });

  it("rejects custody forged under the predecessor and adjacent hashes", () => {
    const forged = completedGreenwayPolicy({
      world: WORLD,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: CUSTODY_EVENT,
      jobOption: CUSTODY_JOB,
    }).snapshot();
    forged.worldHash = OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH;
    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(/custody option introduced/i);

    const adjacent = completedGreenwayPolicy({
      world: PREDECESSOR,
      endingId: "ending_held",
      endingTitle: "The Byre Held",
      eventOption: QUIET_EVENT,
      jobOption: QUIET_JOB,
    }).snapshot();
    adjacent.worldHash = `f${OVERWORLD_EMERY_EVIDENCE_CUSTODY_PREDECESSOR_WORLD_HASH.slice(1)}`;
    expect(() => OverworldSession.restore(WORLD, adjacent)).toThrow(/different world manifest/i);
  });

  it("rejects an authored custody event proof relabeled as the generic Greenway predecessor", () => {
    const forged = exactFrostJambSignpostPredecessorSnapshot(
      WORLD,
      completedGreenwayPolicy({
        world: WORLD,
        endingId: "ending_held",
        endingTitle: "The Byre Held",
        eventOption: CUSTODY_EVENT,
      }).snapshot(),
    );
    forged.worldHash = AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH;
    forged.journalEntries = forged.journalEntries.filter(
      (candidate) => !candidate.id.startsWith("talk:albany_city__greenway__contact"),
    );

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /generic local-event predecessor .* cannot carry an authored-scene proof/i,
    );
  });

  it("rejects an authored custody job proof relabeled as the generic Greenway predecessor", () => {
    const forged = exactFrostJambSignpostPredecessorSnapshot(
      WORLD,
      completedGreenwayPolicy({
        world: WORLD,
        endingId: "ending_held",
        endingTitle: "The Byre Held",
        eventOption: CUSTODY_EVENT,
        jobOption: CUSTODY_JOB,
      }).snapshot(),
    );
    forged.worldHash = AUTHORED_ALBANY_GREENWAY_PREDECESSOR_WORLD_HASH;
    forged.journalEntries = forged.journalEntries.filter(
      (candidate) => !candidate.id.startsWith("talk:albany_city__greenway__contact"),
    );
    forged.resolvedEventIds = [];
    forged.journalEntries = forged.journalEntries.filter(
      (candidate) => candidate.id !== `investigate:${EVENT}` && candidate.id !== `resolve:${EVENT}`,
    );

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /generic local-job predecessor .* cannot carry an authored-scene proof/i,
    );
  });
});
