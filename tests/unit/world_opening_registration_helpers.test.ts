import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  buildCampaignCharacterState,
  createInitialCampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_REGISTRATION_JOURNAL_PREFIX,
  OPENING_REGISTRATION_OFFER_JOURNAL_PREFIX,
  allOpeningRegistrationJournalDrafts,
  openingRegistrationJournalDraft,
  openingRegistrationJournalEntry,
  openingRegistrationJournalId,
  openingRegistrationOfferJournalDraft,
  openingRegistrationOfferJournalEntry,
  openingRegistrationOfferJournalId,
  proveOpeningRegistrationJournal,
} from "../../src/world/opening_registration_journal.js";
import { presentOpeningRegistration } from "../../src/world/opening_registration_presentation.js";
import {
  OPENING_REGISTRATION_VERSION,
  parseOpeningRegistration,
  type OpeningRegistration,
} from "../../src/world/opening_registration.js";
import { overworldContactTalkJournalId } from "../../src/world/overworld.js";
import { parseTimeLabel, timeLabel } from "../../src/world/session_journal_codec.js";
import type { OverworldJournalEntry } from "../../src/world/session_snapshot.js";

const PROFILE_IDS = [
  "background:road_warden",
  "background:market_runner",
  "background:union_repairer",
  "background:greenway_tracker",
] as const;
const OFFER_PROOF_HASH = "1".repeat(64);

function registration(): OpeningRegistration {
  return parseOpeningRegistration({
    version: OPENING_REGISTRATION_VERSION,
    id: "albany:relief_registration",
    home: "albany",
    area: "municipal_ledger",
    contact: "rowan_quill",
    title: "Put a lived history on the relief docket",
    message: "Rowan waits for the history you will make part of the public record.",
    profiles: PROFILE_IDS.map((id, index) => ({
      id,
      title: `Profile ${String(index + 1)}`,
      summary: `Summary ${String(index + 1)}.`,
      preview: `Visible mechanical preview ${String(index + 1)}.`,
      consequence: `Permanent consequence ${String(index + 1)}.`,
      character: buildCampaignCharacterState({
        background: id,
        skills: [{ skillId: `skill:registration_${String(index)}`, rank: index + 1 }],
        money: index * 10,
        knowledge: [`knowledge:registration_${String(index)}`],
      }),
    })),
  });
}

function contactEntry(scene: OpeningRegistration, recordedAt: string): OverworldJournalEntry {
  return {
    id: overworldContactTalkJournalId(scene.contact, null),
    kind: "contact",
    town: "Albany",
    title: "Rowan Quill — Municipal Ledger",
    text: "Rowan opens the emergency relief docket.",
    recordedAt,
  };
}

function offerEntry(
  scene: OpeningRegistration,
  recordedAt: string,
  town = "Albany",
): OverworldJournalEntry {
  return openingRegistrationOfferJournalEntry({
    registration: scene,
    town,
    recordedAt,
    registrationBoundary: {
      acceptedDecisions: 2,
      decisionProofHash: OFFER_PROOF_HASH,
      townId: scene.home,
      areaId: scene.area,
      minutes: parseTimeLabel(recordedAt),
    },
  });
}

function registrationEntry(
  scene: OpeningRegistration,
  profileId: string,
  recordedAt: string,
  town = "Albany",
): OverworldJournalEntry {
  const number = 3;
  const last = {
    number,
    surface: "overworld" as const,
    actionId: `campaign_story:${scene.id}:${profileId}`,
    reason: "situation_changed" as const,
  };
  return openingRegistrationJournalEntry({
    registration: scene,
    profileId,
    town,
    recordedAt,
    registrationBoundary: {
      acceptedDecisions: number,
      decisionProofHash: hashState({ previous: OFFER_PROOF_HASH, ...last }),
      townId: scene.home,
      areaId: scene.area,
      minutes: parseTimeLabel(recordedAt),
    },
  });
}

function unrelatedEntry(
  id: string,
  kind: OverworldJournalEntry["kind"],
  recordedAt: string,
): OverworldJournalEntry {
  return {
    id,
    kind,
    town: "Albany",
    title: id,
    text: `${id} journal copy.`,
    recordedAt,
  };
}

describe("opening registration presentation", () => {
  it("projects all four profiles with their visible mechanical previews", () => {
    const scene = registration();
    const prompt = presentOpeningRegistration(scene);

    expect(prompt).toEqual({
      id: scene.id,
      kind: "registration",
      message: `${scene.title}. ${scene.message}`,
      options: scene.profiles.map((profile) => ({
        id: profile.id,
        label: profile.title,
        consequence: `${profile.summary} ${profile.preview} ${profile.consequence}`,
      })),
    });
    expect(prompt.options).toHaveLength(4);
    for (const [index, option] of prompt.options.entries()) {
      expect(option.consequence).toContain(scene.profiles[index]!.preview);
      expect(Object.keys(option).sort()).toEqual(["consequence", "id", "label"]);
      expect(Object.isFrozen(option)).toBe(true);
    }
    expect(Object.isFrozen(prompt)).toBe(true);
    expect(Object.isFrozen(prompt.options)).toBe(true);
  });
});

describe("opening registration journal", () => {
  it("authors the exact canonical id, copy, and full draft catalog", () => {
    const scene = registration();
    const profile = scene.profiles[1]!;
    const expectedId = "registration:albany:relief_registration:background:market_runner";
    const draft = openingRegistrationJournalDraft(scene, profile.id);
    const entry = registrationEntry(scene, profile.id, "Day 1, 01:15");
    const allDrafts = allOpeningRegistrationJournalDrafts(scene);
    const expectedOfferId = "registration_offer:albany:relief_registration";
    const offerDraft = openingRegistrationOfferJournalDraft(scene);
    const authoredOfferEntry = offerEntry(scene, "Day 1, 01:15");

    expect(OPENING_REGISTRATION_JOURNAL_PREFIX).toBe("registration:");
    expect(OPENING_REGISTRATION_OFFER_JOURNAL_PREFIX).toBe("registration_offer:");
    expect(openingRegistrationJournalId(scene.id, profile.id)).toBe(expectedId);
    expect(openingRegistrationOfferJournalId(scene.id)).toBe(expectedOfferId);
    expect(draft).toEqual({
      id: expectedId,
      kind: "registration",
      title: "Registered: Profile 2",
      text: "Summary 2. Visible mechanical preview 2. Permanent consequence 2.",
    });
    expect(entry).toEqual({
      ...draft,
      town: "Albany",
      recordedAt: "Day 1, 01:15",
      registrationBoundary: entry.registrationBoundary,
    });
    expect(offerDraft).toEqual({
      id: expectedOfferId,
      kind: "registration_offer",
      title: scene.title,
      text: scene.message,
    });
    expect(authoredOfferEntry).toEqual({
      ...offerDraft,
      town: "Albany",
      recordedAt: "Day 1, 01:15",
      registrationBoundary: authoredOfferEntry.registrationBoundary,
    });
    expect(allDrafts).toHaveLength(4);
    expect(allDrafts.map((candidate) => candidate.id)).toEqual(
      scene.profiles.map((candidate) => openingRegistrationJournalId(scene.id, candidate.id)),
    );
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(offerDraft)).toBe(true);
    expect(Object.isFrozen(entry.registrationBoundary)).toBe(true);
    expect(Object.isFrozen(authoredOfferEntry)).toBe(true);
    expect(Object.isFrozen(authoredOfferEntry.registrationBoundary)).toBe(true);
    expect(Object.isFrozen(allDrafts)).toBe(true);
    expect(allDrafts.every((candidate) => Object.isFrozen(candidate))).toBe(true);
  });

  it("returns the exact neutral, not-offered baseline when there is no evidence", () => {
    const scene = registration();
    const proof = proveOpeningRegistrationJournal({
      registration: scene,
      journalEntries: [contactEntry(scene, timeLabel(0))],
      expectedTown: "Albany",
    });
    const proofWithoutAuthoredScene = proveOpeningRegistrationJournal({
      registration: null,
      journalEntries: [],
      expectedTown: null,
    });

    expect(proof).toEqual({
      characterAtRegistration: createInitialCampaignCharacterState(),
      offered: false,
      offerBoundary: null,
      profile: null,
      selectionBoundary: null,
      journalIndex: null,
      recordedAt: null,
    });
    expect(proofWithoutAuthoredScene).toEqual(proof);
    expect(Object.isFrozen(proof)).toBe(true);
  });

  it("proves an offer-only save as neutral and already offered", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const offer = offerEntry(scene, recordedAt);
    const proof = proveOpeningRegistrationJournal({
      registration: scene,
      journalEntries: [offer, contactEntry(scene, recordedAt)],
      expectedTown: "Albany",
    });

    expect(proof).toEqual({
      characterAtRegistration: createInitialCampaignCharacterState(),
      offered: true,
      offerBoundary: offer.registrationBoundary,
      profile: null,
      selectionBoundary: null,
      journalIndex: null,
      recordedAt: 75,
    });
  });

  it("recovers the selected canonical profile from adjacent same-time evidence", () => {
    const scene = registration();
    const selected = scene.profiles[2]!;
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, selected.id, recordedAt);
    const offer = offerEntry(scene, recordedAt);
    const proof = proveOpeningRegistrationJournal({
      registration: scene,
      journalEntries: [selectedEntry, offer, contactEntry(scene, recordedAt)],
      expectedTown: "Albany",
    });
    const sceneBefore = structuredClone(scene);

    expect(proof.profile).toEqual(selected);
    expect(proof.characterAtRegistration).toEqual(selected.character);
    expect(proof.offered).toBe(true);
    expect(proof.offerBoundary).toEqual(offer.registrationBoundary);
    expect(proof.selectionBoundary).toEqual(selectedEntry.registrationBoundary);
    expect(proof.journalIndex).toBe(0);
    expect(proof.recordedAt).toBe(75);
    expect(Object.isFrozen(proof)).toBe(true);

    proof.characterAtRegistration.money += 100;
    proof.characterAtRegistration.knowledge.push("knowledge:later_mutation");
    proof.profile!.character.health.current = 0;
    expect(scene).toEqual(sceneBefore);
  });

  it("rejects duplicate and unknown registration evidence", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt);
    const contact = contactEntry(scene, recordedAt);
    const offer = offerEntry(scene, recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [selectedEntry, offer, contact, selectedEntry],
        expectedTown: "Albany",
      }),
    ).toThrow(/at most one opening registration/i);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          {
            ...selectedEntry,
            id: openingRegistrationJournalId(scene.id, "background:not_authored"),
          },
          offer,
          contact,
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/unknown profile/i);
  });

  it("rejects a selected profile with missing opening-offer evidence", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [selectedEntry, contactEntry(scene, recordedAt)],
        expectedTown: "Albany",
      }),
    ).toThrow(/no replayable opening offer/i);
  });

  it.each([
    ["id", { id: "registration_offer:albany:forged" }],
    ["title", { title: "Forged opening title" }],
    ["text", { text: "Forged opening instructions." }],
  ] as const)("rejects a tampered opening-offer %s", (_field, tamper) => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const offer = offerEntry(scene, recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [{ ...offer, ...tamper }, contactEntry(scene, recordedAt)],
        expectedTown: "Albany",
      }),
    ).toThrow(/registration offer.*does not match its authored copy/i);
  });

  it("rejects duplicate opening-offer evidence", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const offer = offerEntry(scene, recordedAt);
    const contact = contactEntry(scene, recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [offer, contact, offer, contact],
        expectedTown: "Albany",
      }),
    ).toThrow(/at most one opening registration offer/i);
  });

  it.each([
    ["title", { title: "Registered: forged profile" }],
    ["text", { text: "Forged registration effects." }],
  ] as const)("rejects tampered authored %s copy", (_field, tamper) => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          { ...selectedEntry, ...tamper },
          offerEntry(scene, recordedAt),
          contactEntry(scene, recordedAt),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/does not match its authored copy/i);
  });

  it("rejects evidence bound to the wrong town", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt, "Troy");

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          selectedEntry,
          offerEntry(scene, recordedAt),
          contactEntry(scene, recordedAt),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/bound to town "Troy", expected "Albany"/i);
  });

  it("rejects a non-adjacent selection or same-time non-adjacent offer", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          selectedEntry,
          unrelatedEntry("event:intervening", "event", recordedAt),
          offerEntry(scene, recordedAt),
          contactEntry(scene, recordedAt),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/immediately follow its opening offer/i);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          offerEntry(scene, recordedAt),
          unrelatedEntry("event:intervening", "event", recordedAt),
          contactEntry(scene, recordedAt),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/immediately follow its authored contact conversation/i);
  });

  it("accepts a later re-offer after the authored contact and intervening play", () => {
    const scene = registration();
    const offeredAt = timeLabel(90);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], offeredAt);

    expect(
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          selectedEntry,
          offerEntry(scene, offeredAt),
          unrelatedEntry("event:intervening", "event", timeLabel(80)),
          contactEntry(scene, timeLabel(75)),
        ],
        expectedTown: "Albany",
      }),
    ).toMatchObject({ offered: true, profile: { id: PROFILE_IDS[0] } });
  });

  it("rejects newer play above an unselected registration offer", () => {
    const scene = registration();

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          unrelatedEntry("event:after_offer", "event", timeLabel(80)),
          offerEntry(scene, timeLabel(75)),
          contactEntry(scene, timeLabel(75)),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/pending registration offer must remain the latest journal boundary/i);
  });

  it("rejects selection, offer, or contact evidence recorded at different times", () => {
    const scene = registration();
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], timeLabel(75));

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          selectedEntry,
          offerEntry(scene, timeLabel(76)),
          contactEntry(scene, timeLabel(76)),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/at the same time/i);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [offerEntry(scene, timeLabel(75)), contactEntry(scene, timeLabel(76))],
        expectedTown: "Albany",
      }),
    ).toThrow(/same time or be a later re-offer/i);
  });

  it("rejects tampered registration decision and location boundaries", () => {
    const scene = registration();
    const recordedAt = timeLabel(75);
    const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt);
    const offer = offerEntry(scene, recordedAt);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          {
            ...selectedEntry,
            registrationBoundary: {
              ...selectedEntry.registrationBoundary!,
              acceptedDecisions: selectedEntry.registrationBoundary!.acceptedDecisions + 1,
            },
          },
          offer,
          contactEntry(scene, recordedAt),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/does not match its journey decision boundary/i);

    expect(() =>
      proveOpeningRegistrationJournal({
        registration: scene,
        journalEntries: [
          {
            ...offer,
            registrationBoundary: {
              ...offer.registrationBoundary!,
              areaId: "albany_market",
            },
          },
          contactEntry(scene, recordedAt),
        ],
        expectedTown: "Albany",
      }),
    ).toThrow(/does not match its authored location and time/i);
  });

  it.each(["quest", "quest_done"] as const)(
    "rejects registration evidence recorded after a %s entry",
    (questKind) => {
      const scene = registration();
      const recordedAt = timeLabel(75);
      const selectedEntry = registrationEntry(scene, PROFILE_IDS[0], recordedAt);

      expect(() =>
        proveOpeningRegistrationJournal({
          registration: scene,
          journalEntries: [
            selectedEntry,
            offerEntry(scene, recordedAt),
            contactEntry(scene, recordedAt),
            unrelatedEntry(
              `quest${questKind === "quest_done" ? "_done" : ""}:wolf_winter`,
              questKind,
              timeLabel(60),
            ),
          ],
          expectedTown: "Albany",
        }),
      ).toThrow(/cannot follow a started or completed quest/i);
    },
  );
});
