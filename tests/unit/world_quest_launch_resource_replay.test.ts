import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { OverworldSession } from "../../src/world/session.js";
import {
  OVERWORLD_SESSION_PREVIOUS_SAVE_VERSION,
  OVERWORLD_SESSION_SAVE_VERSION,
} from "../../src/world/session_snapshot.js";
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
      const plan = session.prepareQuestStart(QUEST_ID, spec.id);
      session.commitQuestStart(plan);
      const started = session.snapshot();
      const start = questStartEntry(started);

      expect(started).toMatchObject({
        minutes: before.minutes + spec.terms.minutes,
        supplies: before.supplies - spec.terms.supplies,
        fatigue: before.fatigue + spec.terms.fatigue,
      });
      expect(start.questStartProof).toMatchObject({
        kind: "approach",
        approachId: spec.id,
        boundary: {
          acceptedDecisions: started.journey.acceptedDecisions,
          decisionProofHash: started.journey.decisionProof.hash,
          townId: "albany_city",
          areaId: "albany_city__transport_hub",
          minutes: started.minutes,
        },
        dispatchSeal: {
          schemaVersion: 1,
          questId: QUEST_ID,
          approachId: spec.id,
          status: plan.dispatchWindow.status,
          ledgerMinutes: plan.dispatchWindow.ledgerMinutes,
          windowProofHash: plan.dispatchWindow.proofHash,
          slots: {
            preparation: {
              kind: "selected",
              optionId: "albany:prep_works_fortification",
            },
            reliefAllocation: {
              kind: "selected",
              optionId: "albany:relief_resident_shelter",
            },
            fieldTeam: { kind: "declined_at_launch" },
          },
          launchBoundary: {
            acceptedDecisions: started.journey.acceptedDecisions,
            decisionProofHash: started.journey.decisionProof.hash,
            townId: "albany_city",
            areaId: "albany_city__transport_hub",
            minutes: started.minutes,
          },
        },
      });
      if (start.questStartProof?.kind !== "approach") {
        throw new Error("expected approach proof");
      }
      expect(start.questStartProof.dispatchSeal?.proofHash).toMatch(/^[0-9a-f]{64}$/);
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

  it("rejects dispatch-seal mutation, transplant, self-rehashed forgery, and stripping", () => {
    const session = sessionAtWolf();
    session.startQuest(QUEST_ID, "albany:wolf_approach_exposed_ridge");
    const valid = session.snapshot();

    const mutateSeal = (
      mutate: (
        seal: NonNullable<
          Extract<
            NonNullable<ReturnType<typeof questStartEntry>["questStartProof"]>,
            { kind: "approach" }
          >["dispatchSeal"]
        >,
      ) => void,
    ) => {
      const snapshot = structuredClone(valid);
      const proof = questStartEntry(snapshot).questStartProof;
      if (proof?.kind !== "approach" || !proof.dispatchSeal) {
        throw new Error("expected dispatch seal");
      }
      mutate(proof.dispatchSeal);
      expect(() => OverworldSession.restore(WORLD, snapshot)).toThrow(/dispatch seal/i);
    };

    mutateSeal((seal) => {
      seal.slots.preparation = { kind: "declined_at_launch" };
    });
    mutateSeal((seal) => {
      seal.ledgerMinutes += 1;
    });
    mutateSeal((seal) => {
      seal.windowProofHash = "0".repeat(64);
    });
    mutateSeal((seal) => {
      seal.launchBoundary.minutes += 1;
    });
    mutateSeal((seal) => {
      seal.approachId = "albany:wolf_approach_sheltered_stockway";
    });
    mutateSeal((seal) => {
      seal.proofHash = "0".repeat(64);
    });
    mutateSeal((seal) => {
      seal.slots.fieldTeam = {
        kind: "selected",
        optionId: "albany:ally_june_cattle_first",
      };
      const { proofHash: _proofHash, ...proof } = seal;
      seal.proofHash = hashState(proof);
    });

    const other = sessionAtWolf();
    other.startQuest(QUEST_ID, "albany:wolf_approach_sheltered_stockway");
    const transplanted = structuredClone(valid);
    const targetProof = questStartEntry(transplanted).questStartProof;
    const sourceProof = questStartEntry(other.snapshot()).questStartProof;
    if (
      targetProof?.kind !== "approach" ||
      sourceProof?.kind !== "approach" ||
      !sourceProof.dispatchSeal
    ) {
      throw new Error("expected transplantable dispatch seals");
    }
    targetProof.dispatchSeal = structuredClone(sourceProof.dispatchSeal);
    expect(() => OverworldSession.restore(WORLD, transplanted)).toThrow(/dispatch seal/i);

    const stripped = structuredClone(valid);
    const strippedProof = questStartEntry(stripped).questStartProof;
    if (strippedProof?.kind !== "approach") throw new Error("expected approach proof");
    delete strippedProof.dispatchSeal;
    expect(stripped.version).toBe(OVERWORLD_SESSION_SAVE_VERSION);
    expect(() => OverworldSession.restore(WORLD, stripped)).toThrow(
      /lacks its current dispatch seal/i,
    );
  });

  it("canonically backfills an unsealed v9 launch once and emits a stable v10 save", () => {
    const session = sessionAtWolf();
    session.startQuest(QUEST_ID, "albany:wolf_approach_exposed_ridge");
    const previous = structuredClone(session.snapshot());
    previous.version = OVERWORLD_SESSION_PREVIOUS_SAVE_VERSION;
    const proof = questStartEntry(previous).questStartProof;
    if (proof?.kind !== "approach") throw new Error("expected approach proof");
    delete proof.dispatchSeal;

    const migrated = OverworldSession.restore(WORLD, previous).snapshot();
    expect(migrated.version).toBe(OVERWORLD_SESSION_SAVE_VERSION);
    const migratedProof = questStartEntry(migrated).questStartProof;
    expect(migratedProof?.kind).toBe("approach");
    if (migratedProof?.kind !== "approach") throw new Error("expected migrated proof");
    expect(migratedProof.dispatchSeal?.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect(OverworldSession.restore(WORLD, migrated).snapshot()).toEqual(migrated);
  });
});
