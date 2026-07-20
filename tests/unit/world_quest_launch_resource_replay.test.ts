import { describe, expect, it } from "vitest";

import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const QUEST_ID = "wolf_winter";
const APPROACHES = [
  {
    id: "albany:wolf_approach_exposed_ridge",
    terms: { minutes: 30, supplies: 1, fatigue: 25 },
    knowledge: "albany:knowledge_wolf_exposed_ridge",
    memory: "albany:memory_hayden_dispatched_exposed_ridge",
    returnSummary: /reached Cade by the exposed ridge/i,
  },
  {
    id: "albany:wolf_approach_sheltered_stockway",
    terms: { minutes: 75, supplies: 2, fatigue: 10 },
    knowledge: "albany:knowledge_wolf_sheltered_stockway",
    memory: "albany:memory_hayden_dispatched_sheltered_stockway",
    returnSummary: /reached Cade by the sheltered stockway/i,
  },
] as const;

function moveToArea(session: OverworldSession, areaId: string): void {
  if (session.view().currentArea?.id === areaId) return;
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`expected a visible route to ${areaId}`);
  session.moveArea(route.id);
}

function sessionAtWolf(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:ledger_advocate");
  expect(session.journey().storyChoice?.kind).toBe("relief_oath");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  expect(session.journey().storyChoice?.kind).toBe("lead_source");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory("albany:relief_resident_shelter");
  return session;
}

function questStartEntry(snapshot: ReturnType<OverworldSession["snapshot"]>) {
  const entry = snapshot.journalEntries.find((candidate) => candidate.id === `quest:${QUEST_ID}`);
  if (!entry) throw new Error("expected Wolf-Winter start journal");
  return entry;
}

describe("quest-launch resource replay", () => {
  it.each(APPROACHES)(
    "replays $id costs, character effects, proof, and completion copy",
    (spec) => {
      const session = sessionAtWolf();
      const before = session.snapshot();
      session.startQuest(QUEST_ID, spec.id);
      const started = session.snapshot();
      const start = questStartEntry(started);

      expect(started).toMatchObject({
        minutes: before.minutes + spec.terms.minutes,
        supplies: before.supplies - spec.terms.supplies,
        fatigue: before.fatigue + spec.terms.fatigue,
      });
      expect(start.questStartProof).toEqual({
        kind: "approach",
        approachId: spec.id,
        boundary: {
          acceptedDecisions: started.journey.acceptedDecisions,
          decisionProofHash: started.journey.decisionProof.hash,
          townId: "albany_city",
          areaId: "albany_city__transport_hub",
          minutes: started.minutes,
        },
      });
      expect(started.character.knowledge).toContain(spec.knowledge);
      expect(
        started.character.relationships.flatMap((relationship) => relationship.memories),
      ).toContain(spec.memory);
      expect(OverworldSession.restore(WORLD, started).snapshot()).toEqual(started);

      session.completeQuest(QUEST_ID, {
        endingId: "ending_held_timber_saved",
        endingTitle: "The Byre Held, Paling Timber Saved",
        death: false,
      });
      const completed = session.snapshot();
      expect(
        completed.journalEntries.find((entry) => entry.id === `quest_done:${QUEST_ID}`)?.text,
      ).toMatch(spec.returnSummary);
      expect(OverworldSession.restore(WORLD, completed).snapshot()).toEqual(completed);
    },
  );

  it("replays launch costs before a later fact-gated resupply", () => {
    const session = sessionAtWolf();
    session.startQuest(QUEST_ID, "albany:wolf_approach_sheltered_stockway");
    session.completeQuest(QUEST_ID, {
      endingId: "ending_fortified_cade_terms",
      endingTitle: "Dawn Behind Cade's Shutters",
      death: false,
    });
    session.chooseJourney("continue");
    session.chooseJourneyStory("send_wagon_to_cade");
    expect(session.view().serviceOffers.map((offer) => offer.id)).toContain(
      "albany:wolf_fortified_cade_terms_station_resupply",
    );
    session.resupplyAtTown();

    const snapshot = session.snapshot();
    expect(snapshot.supplies).toBe(8);
    expect(
      snapshot.journalEntries.filter(
        (entry) => entry.serviceRuleId === "albany:wolf_fortified_cade_terms_station_resupply",
      ),
    ).toHaveLength(1);
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);
  });

  it("rejects resource, approach, boundary, and missing-proof tampering", () => {
    const session = sessionAtWolf();
    session.startQuest(QUEST_ID, "albany:wolf_approach_exposed_ridge");
    const valid = session.snapshot();

    const supplies = structuredClone(valid);
    supplies.supplies += 1;
    expect(() => OverworldSession.restore(WORLD, supplies)).toThrow(
      /supplies do not match resource replay/i,
    );

    const fatigue = structuredClone(valid);
    fatigue.fatigue -= 1;
    expect(() => OverworldSession.restore(WORLD, fatigue)).toThrow(
      /fatigue does not match resource replay/i,
    );

    const approach = structuredClone(valid);
    const approachProof = questStartEntry(approach).questStartProof;
    if (approachProof?.kind !== "approach") throw new Error("expected approach proof");
    approachProof.approachId = "albany:wolf_approach_sheltered_stockway";
    expect(() => OverworldSession.restore(WORLD, approach)).toThrow(
      /canonical journal copy|selected approach decision/i,
    );

    const boundary = structuredClone(valid);
    const boundaryProof = questStartEntry(boundary).questStartProof;
    if (!boundaryProof) throw new Error("expected start boundary");
    boundaryProof.boundary.minutes += 1;
    expect(() => OverworldSession.restore(WORLD, boundary)).toThrow(
      /boundary time|boundary does not match/i,
    );

    const missing = structuredClone(valid);
    delete questStartEntry(missing).questStartProof;
    expect(() => OverworldSession.restore(WORLD, missing)).toThrow(
      /lacks a persisted approach or legacy proof/i,
    );
  });
});
