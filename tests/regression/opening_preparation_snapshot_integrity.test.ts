import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import { openingPreparationLegacyJournalEntry } from "../../src/world/opening_preparation_journal.js";
import { OverworldSession } from "../../src/world/session.js";
import type {
  OverworldJournalEntry,
  OverworldSessionSnapshot,
} from "../../src/world/session_snapshot.js";
import {
  OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
  OVERWORLD_OPENING_PREPARATION_WORLD_HASH,
} from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const PREPARATION = WORLD.opening_preparation;
if (!PREPARATION) throw new Error("expected the Albany opening preparation scene");

const REGISTRATION_PROFILE = "albany:ledger_advocate";
const LEAD_SOURCE = "albany:source_jamie_market_testimony";
const PREPARATION_PROFILE = "albany:prep_relief_protocol";

function registerAndSelectLead(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  const poi = opening.pois[0];
  const contact = opening.characters[0];
  if (!poi || !contact) throw new Error("expected Albany opening registration sources");
  session.scoutPoi(poi.id);
  session.talkToCharacter(contact.id);
  session.chooseJourneyStory(REGISTRATION_PROFILE);
  session.chooseJourneyStory(LEAD_SOURCE);
  expect(session.journey().storyChoice?.kind).toBe("preparation");
  return session;
}

function selectPreparation(): OverworldSession {
  const session = registerAndSelectLead();
  session.chooseJourneyStory(PREPARATION_PROFILE);
  expect(session.journey().storyChoice).toBeNull();
  return session;
}

function journalEntry(
  snapshot: OverworldSessionSnapshot,
  kind: OverworldJournalEntry["kind"],
): OverworldJournalEntry {
  const entry = snapshot.journalEntries.find((candidate) => candidate.kind === kind);
  if (!entry) throw new Error(`expected ${kind} journal evidence`);
  return entry;
}

describe("opening preparation snapshot integrity", () => {
  it("round-trips pending and selected preparation with replayed character effects", () => {
    expect(hashState(WORLD)).toBe(OVERWORLD_OPENING_PREPARATION_WORLD_HASH);

    const pending = registerAndSelectLead().snapshot();
    expect(journalEntry(pending, "preparation_offer").storyChoiceBoundary).toBeDefined();
    expect(pending.discoveredQuestIds).not.toContain(PREPARATION.target_quest);
    expect(OverworldSession.restore(WORLD, pending).snapshot()).toEqual(pending);

    const selected = selectPreparation().snapshot();
    expect(selected.discoveredQuestIds).toContain(PREPARATION.target_quest);
    expect(selected.character.knowledge).toContain("albany:knowledge_wolf_relief_protocol");
    expect(
      selected.character.relationships
        .find((relationship) => relationship.npcId === "albany:jamie_tanner")
        ?.memories.includes("albany:memory_jamie_wolf_relief_protocol_allocated"),
    ).toBe(true);
    expect(OverworldSession.restore(WORLD, selected).snapshot()).toEqual(selected);

    const forgedCharacter = structuredClone(selected);
    forgedCharacter.character.knowledge = forgedCharacter.character.knowledge.filter(
      (knowledgeId) => knowledgeId !== "albany:knowledge_wolf_relief_protocol",
    );
    expect(() => OverworldSession.restore(WORLD, forgedCharacter)).toThrow(
      /campaign character does not match replayed quest consequences/i,
    );
  });

  it("rejects preparation journal or action evidence relabeled as the 742 predecessor", () => {
    const selected = selectPreparation().snapshot();

    const journalRelabel = structuredClone(selected);
    journalRelabel.worldHash = OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH;
    expect(() => OverworldSession.restore(WORLD, journalRelabel)).toThrow(
      /opening preparation evidence introduced by a later manifest/i,
    );

    const actionRelabel = structuredClone(selected);
    actionRelabel.worldHash = OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH;
    actionRelabel.journalEntries = actionRelabel.journalEntries.filter(
      (entry) => !entry.kind.startsWith("preparation"),
    );
    expect(() => OverworldSession.restore(WORLD, actionRelabel)).toThrow(
      /opening preparation evidence introduced by a later manifest/i,
    );
  });

  it("migrates a lead-selected no-progress 742 snapshot into the real preparation prompt", () => {
    const predecessor = registerAndSelectLead().snapshot();
    predecessor.worldHash = OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH;
    predecessor.journalEntries = predecessor.journalEntries.filter(
      (entry) => entry.kind !== "preparation_offer",
    );
    predecessor.discoveredQuestIds.push(PREPARATION.target_quest);

    const migratedSession = OverworldSession.restore(WORLD, predecessor);
    const migrated = migratedSession.snapshot();
    expect(migrated.journalEntries[0]?.kind).toBe("preparation_offer");
    expect(migrated.journalEntries[1]?.kind).toBe("lead_source");
    expect(migrated.journalEntries[0]?.storyChoiceBoundary).toEqual(
      migrated.journalEntries[1]?.storyChoiceBoundary,
    );
    expect(migrated.journalEntries[0]?.recordedAt).toBe(migrated.journalEntries[1]?.recordedAt);
    expect(migrated.character).toEqual(predecessor.character);
    expect(migratedSession.journey().storyChoice?.kind).toBe("preparation");
    expect(migratedSession.view().quests.map((quest) => quest.id)).not.toContain(
      PREPARATION.target_quest,
    );

    const restoredAgain = OverworldSession.restore(WORLD, migrated);
    expect(restoredAgain.snapshot()).toEqual(migrated);
    restoredAgain.chooseJourneyStory(PREPARATION_PROFILE);
    expect(restoredAgain.view().quests.map((quest) => quest.id)).toContain(
      PREPARATION.target_quest,
    );
  });

  it("rejects a current save that replaces the pending offer with a self-minted legacy marker", () => {
    const forged = registerAndSelectLead().snapshot();
    const offer = journalEntry(forged, "preparation_offer");
    const lead = journalEntry(forged, "lead_source");
    if (!offer.storyChoiceBoundary || !lead.storyChoiceBoundary) {
      throw new Error("expected preparation and lead boundaries");
    }
    forged.journalEntries = forged.journalEntries.filter(
      (entry) => entry.kind !== "preparation_offer",
    );
    forged.journalEntries.unshift(
      openingPreparationLegacyJournalEntry({
        sourceWorldHash: OVERWORLD_OPENING_PREPARATION_PREDECESSOR_WORLD_HASH,
        town: lead.town,
        recordedAt: lead.recordedAt,
        storyChoiceBoundary: lead.storyChoiceBoundary,
      }),
    );
    forged.discoveredQuestIds.push(PREPARATION.target_quest);

    expect(() => OverworldSession.restore(WORLD, forged)).toThrow(
      /no later replayable Wolf-Winter progress to grandfather/i,
    );
  });
});
