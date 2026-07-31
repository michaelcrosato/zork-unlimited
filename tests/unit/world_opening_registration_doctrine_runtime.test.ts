import { describe, expect, it } from "vitest";

import { openingLeadSourceJournalId } from "../../src/world/opening_lead_source_journal.js";
import { openingRegistrationJournalId } from "../../src/world/opening_registration_journal.js";
import { openingReliefOathJournalId } from "../../src/world/opening_relief_oath_journal.js";
import { assertOverworldIntegrity, type OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;

function atRegistration(world: OverworldManifest = WORLD): OverworldSession {
  const session = new OverworldSession(world);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(world.opening_registration!.contact);
  expect(session.journey().storyChoice).toMatchObject({
    id: world.opening_registration!.id,
    kind: "registration",
  });
  return session;
}

function moveToArea(session: OverworldSession, targetAreaId: string): void {
  if (session.view().currentArea?.id === targetAreaId) return;
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === targetAreaId);
  if (!route) throw new Error(`Expected a visible route to ${targetAreaId}.`);
  session.moveArea(route.id);
}

describe("Albany role-first standard packet runtime", () => {
  it("presents four roles first, then only the selected role's matched packet before ordinary oaths", () => {
    const opening = atRegistration();
    const registrationPrompt = opening.journey().storyChoice!;

    expect(registrationPrompt.options.map((option) => option.id)).toEqual(
      REGISTRATION.profiles.map((profile) => profile.id),
    );
    expect(registrationPrompt.options).toHaveLength(4);
    expect(registrationPrompt.options.every((option) => option.group === undefined)).toBe(true);
    expect(registrationPrompt.options.map((option) => option.id)).not.toEqual(
      expect.arrayContaining(REGISTRATION.doctrines!.map((doctrine) => doctrine.id)),
    );

    for (const profile of REGISTRATION.profiles) {
      const session = atRegistration();
      const acceptedBeforeRole = session.journey().acceptedDecisions;
      session.chooseJourneyStory(profile.id);

      expect(session.journey().acceptedDecisions).toBe(acceptedBeforeRole + 1);
      const oathPrompt = session.journey().storyChoice!;
      const matchedPacket = REGISTRATION.doctrines!.find(
        (doctrine) => doctrine.profile_id === profile.id,
      );
      expect(oathPrompt).toMatchObject({
        id: RELIEF_OATH.id,
        kind: "relief_oath",
      });
      expect(oathPrompt.options.map((option) => option.id)).toEqual([
        ...(matchedPacket ? [matchedPacket.id] : []),
        ...RELIEF_OATH.options.map((option) => option.id),
      ]);
      expect(oathPrompt.options).toHaveLength(matchedPacket ? 4 : 3);
      if (matchedPacket) {
        const packetOption = oathPrompt.options[0]!;
        const mappedOath = RELIEF_OATH.options.find(
          (option) => option.id === matchedPacket.relief_oath_option_id,
        )!;
        const mappedSource = LEAD_SOURCE.options.find(
          (option) => option.id === matchedPacket.lead_source_option_id,
        )!;
        expect(packetOption.summary?.commitment).toContain(`Duty: ${mappedOath.title}`);
        expect(packetOption.summary?.commitment).toContain(`evidence: ${mappedSource.title}`);
        expect(packetOption.summary?.commitment).toContain(matchedPacket.trigger_category);
      }
      expect(
        REGISTRATION.doctrines!.filter((doctrine) =>
          oathPrompt.options.some((option) => option.id === doctrine.id),
        ),
      ).toEqual(matchedPacket ? [matchedPacket] : []);

      const snapshot = session.snapshot();
      const restored = OverworldSession.restore(WORLD, snapshot);
      expect(restored.snapshot()).toEqual(snapshot);
      expect(restored.journey().storyChoice).toEqual(oathPrompt);
    }
  });

  it("runs every matched packet as exactly two canonical oath and source decisions", () => {
    for (const doctrine of REGISTRATION.doctrines!) {
      const packetSession = atRegistration();
      const acceptedBeforeRole = packetSession.journey().acceptedDecisions;
      packetSession.chooseJourneyStory(doctrine.profile_id);
      const acceptedBeforePacket = packetSession.journey().acceptedDecisions;
      const receipt = packetSession.chooseJourneyStory(doctrine.id);

      const manualSession = atRegistration();
      manualSession.chooseJourneyStory(doctrine.profile_id);
      manualSession.chooseJourneyStory(doctrine.relief_oath_option_id);
      manualSession.chooseJourneyStory(doctrine.lead_source_option_id);

      expect(acceptedBeforePacket).toBe(acceptedBeforeRole + 1);
      expect(packetSession.journey().acceptedDecisions).toBe(acceptedBeforePacket + 2);
      expect(receipt).toMatchObject({
        storyChoiceId: RELIEF_OATH.id,
        choiceId: doctrine.id,
      });
      expect(receipt.consequence).toContain(doctrine.preview);
      expect(receipt.consequence).toContain(`Exact opening cost: ${doctrine.immediate_cost}.`);
      expect(receipt.consequence).toContain(doctrine.consequence);
      expect(receipt.consequence).toContain(
        `Registered role — ${
          REGISTRATION.profiles.find((profile) => profile.id === doctrine.profile_id)!.title
        }`,
      );
      expect(receipt.consequence).toContain(
        `duty — ${
          RELIEF_OATH.options.find((option) => option.id === doctrine.relief_oath_option_id)!.title
        }`,
      );
      expect(receipt.consequence).toContain(
        `source — ${
          LEAD_SOURCE.options.find((option) => option.id === doctrine.lead_source_option_id)!.title
        }`,
      );
      expect(packetSession.snapshot()).toEqual(manualSession.snapshot());

      const journalIds = packetSession.snapshot().journalEntries.map((entry) => entry.id);
      expect(journalIds).toEqual(
        expect.arrayContaining([
          openingRegistrationJournalId(REGISTRATION.id, doctrine.profile_id),
          openingReliefOathJournalId(RELIEF_OATH.id, doctrine.relief_oath_option_id),
          openingLeadSourceJournalId(LEAD_SOURCE.id, doctrine.lead_source_option_id),
        ]),
      );
      expect(journalIds).not.toContain(doctrine.id);
      expect(packetSession.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
      expect(OverworldSession.restore(WORLD, packetSession.snapshot()).snapshot()).toEqual(
        packetSession.snapshot(),
      );
    }
  });

  it("keeps the ordinary oath then source path unchanged for matched and unmatched roles", () => {
    for (const profileId of ["albany:road_warden", "albany:ledger_advocate"]) {
      const session = atRegistration();
      session.chooseJourneyStory(profileId);
      const acceptedBeforeOath = session.journey().acceptedDecisions;
      session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);

      expect(session.journey().acceptedDecisions).toBe(acceptedBeforeOath + 1);
      expect(session.journey().storyChoice).toMatchObject({
        id: LEAD_SOURCE.id,
        kind: "lead_source",
        options: LEAD_SOURCE.options.map((option) => ({ id: option.id })),
      });

      const acceptedBeforeSource = session.journey().acceptedDecisions;
      session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
      expect(session.journey().acceptedDecisions).toBe(acceptedBeforeSource + 1);
      expect(session.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
    }
  });

  it("defers a due checkpoint until both standard-packet decisions are canonical", () => {
    const doctrine = REGISTRATION.doctrines!.find(
      (candidate) => candidate.profile_id === "albany:road_warden",
    )!;
    const session = new OverworldSession(WORLD);
    session.scoutPoi(session.view().pois[0]!.id);
    while (session.journey().acceptedDecisions < 37) {
      const target =
        session.view().currentArea?.id === REGISTRATION.area
          ? "albany_city__market"
          : REGISTRATION.area;
      moveToArea(session, target);
    }
    expect(session.view().currentArea?.id).toBe(REGISTRATION.area);
    session.talkToCharacter(REGISTRATION.contact);
    session.chooseJourneyStory(doctrine.profile_id);
    expect(session.journey()).toMatchObject({
      acceptedDecisions: 39,
      status: "active",
      storyChoice: { kind: "relief_oath" },
    });

    expect(() => session.chooseJourneyStory(doctrine.id)).not.toThrow();
    expect(session.journey()).toMatchObject({
      acceptedDecisions: 41,
      status: "awaiting_choice",
      pendingChoice: { atDecision: 41, checkpoint: 40 },
      storyChoice: null,
    });
    expect(session.snapshot().journalEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: openingReliefOathJournalId(RELIEF_OATH.id, doctrine.relief_oath_option_id),
          storyChoiceBoundary: expect.objectContaining({ acceptedDecisions: 40 }),
        }),
        expect.objectContaining({
          id: openingLeadSourceJournalId(LEAD_SOURCE.id, doctrine.lead_source_option_id),
          storyChoiceBoundary: expect.objectContaining({ acceptedDecisions: 41 }),
        }),
      ]),
    );
    expect(session.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
  });

  it("leaves preparation, allocation, and June unselected after a standard packet", () => {
    const doctrine = REGISTRATION.doctrines![0]!;
    const session = atRegistration();
    session.chooseJourneyStory(doctrine.profile_id);
    session.chooseJourneyStory(doctrine.id);

    expect(session.snapshot().journalEntries.map((entry) => entry.kind)).not.toEqual(
      expect.arrayContaining(["preparation", "relief_allocation", "ally"]),
    );

    moveToArea(session, PREPARATION.area);
    expect(session.view().departureInteractions).toContainEqual(
      expect.objectContaining({ id: PREPARATION.id, kind: "preparation" }),
    );
    session.chooseJourneyStory(PREPARATION.profiles[0]!.id, PREPARATION.id);
    expect(session.view().departureInteractions).toContainEqual(
      expect.objectContaining({ id: RELIEF_ALLOCATION.id, kind: "relief_allocation" }),
    );
    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    session.talkToCharacter(ALLY.contact);
    expect(session.journey().storyChoice).toMatchObject({ id: ALLY.id, kind: "ally" });
  });

  it("rejects a nonmatching packet and invalid source mapping without changing the oath boundary", () => {
    const ironhandsPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === "albany:ironhands_repairer",
    )!;
    const roadPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === "albany:road_warden",
    )!;
    const wrongRole = atRegistration();
    wrongRole.chooseJourneyStory(ironhandsPacket.profile_id);
    const beforeWrongPacket = wrongRole.snapshot();

    expect(() => wrongRole.chooseJourneyStory(roadPacket.id)).toThrow(/unknown story choice/i);
    expect(wrongRole.snapshot()).toEqual(beforeWrongPacket);

    const invalidWorld = structuredClone(WORLD);
    const invalidPacket = invalidWorld.opening_registration!.doctrines!.find(
      (doctrine) => doctrine.id === ironhandsPacket.id,
    )!;
    const invalid = atRegistration(invalidWorld);
    invalid.chooseJourneyStory(invalidPacket.profile_id);
    const beforeInvalidPacket = invalid.snapshot();
    invalidPacket.lead_source_option_id = "albany:missing_source";

    expect(() => invalid.chooseJourneyStory(invalidPacket.id)).toThrow(
      /invalid duty\/source mapping|unknown lead-source option/i,
    );
    expect(invalid.snapshot()).toEqual(beforeInvalidPacket);
    invalidPacket.lead_source_option_id = ironhandsPacket.lead_source_option_id;
    expect(invalid.journey().storyChoice).toMatchObject({
      id: RELIEF_OATH.id,
      kind: "relief_oath",
    });
  });

  it("rejects a standard-packet id that collides with an ordinary oath id", () => {
    const collision = structuredClone(WORLD);
    collision.opening_registration!.doctrines![0]!.id =
      collision.opening_relief_oath!.options[0]!.id;

    expect(() => assertOverworldIntegrity(collision)).toThrow(
      /starting doctrine.*collides with a relief-oath option id/i,
    );
  });
});
