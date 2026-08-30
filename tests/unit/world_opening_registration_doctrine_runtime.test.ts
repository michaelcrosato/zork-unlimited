import { describe, expect, it } from "vitest";

import { openingLeadSourceJournalId } from "../../src/world/opening_lead_source_journal.js";
import { openingRegistrationJournalId } from "../../src/world/opening_registration_journal.js";
import { presentOpeningRegistration } from "../../src/world/opening_registration_presentation.js";
import { openingReliefOathJournalId } from "../../src/world/opening_relief_oath_journal.js";
import { presentOpeningReliefOath } from "../../src/world/opening_relief_oath_presentation.js";
import { assertOverworldIntegrity, type OverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "../regression/support/journey_story.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const READY_MADE_DISPATCH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "albany:doctrine_fortify_breach": "Ready-made setup — Full Compact + Rowan's report",
  "albany:doctrine_road_warden_aid_route": "Ready-made setup — Aid-Only + Hayden's report",
  "albany:doctrine_independent_drive": "Ready-made setup — Personal Bond + Rowan's report",
});

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

describe("Albany background-first ready-made dispatch runtime", () => {
  it("presents four backgrounds first, then only the selected background's ready-made dispatch before ordinary promises", () => {
    const opening = atRegistration();
    const registrationPrompt = opening.journey().storyChoice!;
    const registrationPresentation = presentOpeningRegistration(REGISTRATION);

    expect(registrationPrompt.options.map((option) => option.id)).toEqual(
      REGISTRATION.profiles.map((profile) => profile.id),
    );
    expect(registrationPrompt.options).toHaveLength(4);
    expect(registrationPresentation.message).toContain("ready-made promise and report");
    expect(registrationPresentation.message.toLowerCase()).not.toContain("standard packet");
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
        const oathPresentation = presentOpeningReliefOath(
          RELIEF_OATH,
          session.snapshot().character,
          { registration: REGISTRATION, leadSource: LEAD_SOURCE },
        );
        expect(oathPresentation.message.toLowerCase()).toContain("ready-made promise and report");
        expect(oathPresentation.message.toLowerCase()).not.toContain("standard packet");
        expect(oathPrompt.progressiveDisclosure).toMatchObject({
          initialOptionIds: [matchedPacket.id],
          reveal: {
            id: "customize_duty_and_evidence",
            optionIds: RELIEF_OATH.options.map((option) => option.id),
          },
        });
        expect(packetOption.label).toBe(READY_MADE_DISPATCH_LABELS[matchedPacket.id]);
        const expectedOutcome =
          matchedPacket.profile_id === "albany:ironhands_repairer"
            ? "Start with public authority and a first public-seal FORTIFY Repair of DC 12 instead of 14."
            : matchedPacket.profile_id === "albany:road_warden"
              ? "Start with Defense 4, the clean-feed LURE benefit, and Hayden's conditional HUNT brace."
              : "Start independent with an easier first DRIVE shutter-signal check.";
        expect(packetOption.summary?.commitment).toBe(expectedOutcome);
        expect(packetOption.summary?.tradeoff).toBe("Other promise/report pairs close.");
        expect(packetOption.consequence).toContain("Tradeoff: Other promise/report pairs close.");
        expect(packetOption.consequence).toContain(`Benefit: ${matchedPacket.trigger_category}`);
        expect(packetOption.summary?.commitment).not.toContain(matchedPacket.trigger_category);
        expect(JSON.stringify(packetOption.summary)).not.toMatch(
          /\b(?:DEF|import|fieldTrigger)\b/i,
        );
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

  it("falls back to the live promise/report pairing when a known doctrine's mechanics change", () => {
    const revisedWorld = structuredClone(WORLD);
    const revisedDoctrine = revisedWorld.opening_registration!.doctrines!.find(
      (doctrine) => doctrine.id === "albany:doctrine_road_warden_aid_route",
    )!;
    const revisedCategory =
      "Fieldcraft 5; revised dispatch support applies only after a road survey.";
    revisedDoctrine.trigger_category = revisedCategory;

    expect(() => assertOverworldIntegrity(revisedWorld)).not.toThrow();
    const session = atRegistration(revisedWorld);
    session.chooseJourneyStory(revisedDoctrine.profile_id);
    const option = session
      .journey()
      .storyChoice!.options.find((candidate) => candidate.id === revisedDoctrine.id)!;

    expect(option.summary?.commitment).toBe(
      "Pairs Accept Aid-Only Terms with Use Hayden's Frost Report.",
    );
    expect(option.summary?.commitment).not.toContain(revisedCategory);
    expect(option.summary?.commitment).not.toContain("a bloodless LURE skips one alarm");
    expect(option.summary?.commitment).not.toContain("Duty");
    expect(option.consequence).toContain(`Benefit: ${revisedCategory}`);
  });

  it("falls back to translated live titles when a known doctrine's packet mapping changes", () => {
    const revisedWorld = structuredClone(WORLD);
    const revisedDoctrine = revisedWorld.opening_registration!.doctrines!.find(
      (doctrine) => doctrine.id === "albany:doctrine_road_warden_aid_route",
    )!;
    const revisedOath = revisedWorld.opening_relief_oath!.options.find(
      (option) => option.id === revisedDoctrine.relief_oath_option_id,
    )!;
    const revisedSource = revisedWorld.opening_lead_source!.options.find(
      (option) => option.id === "albany:source_jamie_market_testimony",
    )!;
    revisedOath.title = "Accept the Revised Aid Duty";
    revisedDoctrine.lead_source_option_id = revisedSource.id;
    revisedDoctrine.immediate_cost = "40 minutes and $6";

    expect(() => assertOverworldIntegrity(revisedWorld)).not.toThrow();
    const session = atRegistration(revisedWorld);
    session.chooseJourneyStory(revisedDoctrine.profile_id);
    const option = session
      .journey()
      .storyChoice!.options.find((candidate) => candidate.id === revisedDoctrine.id)!;

    expect(option.label).toBe(
      `Ready-made setup — Accept the Revised Aid Duty + ${revisedSource.title}`,
    );
    expect(option.label).not.toContain("Hayden's frost report");
    expect(option.summary?.commitment).toBe(
      `Pairs Accept the Revised Aid Duty with ${revisedSource.title}.`,
    );
    expect(option.summary?.commitment).not.toContain(
      "Carry winter-road judgment and flexible, life-first aid",
    );
    expect(option.summary?.commitment).not.toContain(revisedDoctrine.trigger_category);
    expect(option.consequence).toContain(`Benefit: ${revisedDoctrine.trigger_category}`);
  });

  it("falls back to the live pairing when a known doctrine moves to another background", () => {
    const revisedWorld = structuredClone(WORLD);
    const revisedDoctrine = revisedWorld.opening_registration!.doctrines!.find(
      (doctrine) => doctrine.id === "albany:doctrine_road_warden_aid_route",
    )!;
    revisedDoctrine.profile_id = "albany:ledger_advocate";
    revisedDoctrine.immediate_cost = "25 minutes and $0";

    expect(() => assertOverworldIntegrity(revisedWorld)).not.toThrow();
    const session = atRegistration(revisedWorld);
    session.chooseJourneyStory(revisedDoctrine.profile_id);
    const option = session
      .journey()
      .storyChoice!.options.find((candidate) => candidate.id === revisedDoctrine.id)!;

    expect(option.label).toBe(
      "Ready-made setup — Accept Aid-Only Terms + Use Hayden's Frost Report",
    );
    expect(option.summary?.commitment).toBe(
      "Pairs Accept Aid-Only Terms with Use Hayden's Frost Report.",
    );
    expect(option.summary?.commitment).not.toContain("winter-road judgment");
    expect(option.consequence).toContain(`Benefit: ${revisedDoctrine.trigger_category}`);
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
      revealCurrentJourneyStoryOptions(manualSession, RELIEF_OATH.id);
      manualSession.chooseJourneyStory(doctrine.relief_oath_option_id);
      manualSession.chooseJourneyStory(doctrine.lead_source_option_id);

      expect(acceptedBeforePacket).toBe(acceptedBeforeRole + 1);
      expect(packetSession.journey().acceptedDecisions).toBe(acceptedBeforePacket + 2);
      expect(receipt).toMatchObject({
        storyChoiceId: RELIEF_OATH.id,
        choiceId: doctrine.id,
      });
      expect(receipt.entry.title).toBe(`Quick setup confirmed: ${doctrine.title}`);
      expect(receipt.entry.title.toLowerCase()).not.toContain("standard packet");
      const profileTitle = REGISTRATION.profiles.find(
        (profile) => profile.id === doctrine.profile_id,
      )!.title;
      const oathTitle = RELIEF_OATH.options.find(
        (option) => option.id === doctrine.relief_oath_option_id,
      )!.title;
      const sourceTitle = LEAD_SOURCE.options.find(
        (option) => option.id === doctrine.lead_source_option_id,
      )!.title;
      const exactReceipt =
        `${doctrine.preview} Cost: ${doctrine.immediate_cost}. ` +
        `${doctrine.consequence} Background: ${profileTitle}. ` +
        `Promise: ${oathTitle}. Report: ${sourceTitle}.`;
      expect(receipt.consequence).toBe(exactReceipt);
      expect(receipt.entry.text).toBe(exactReceipt);
      if (doctrine.id === "albany:doctrine_road_warden_aid_route") {
        expect(receipt.consequence).toContain("Defense starts at 4 instead of 3.");
        expect(receipt.consequence).toContain(
          "The first successful LURE LAY still raises cattle alarm as listed; Aid-Only then skips the last feed's +1, not the first.",
        );
        expect(receipt.consequence).toContain(
          "Hayden's report can unlock a HUNT brace after a rail splits.",
        );
        expect(receipt.consequence).not.toMatch(
          /\b(?:DEF|Works)\b|imported starting|ordinary-hunt|frost[- ](?:brace|jamb)|public (?:fence )?(?:brace|wedge)|yearling|bare spear|field-team|relief allocation/gu,
        );
      }
      expect(receipt.displaySummary).toBe(
        `Quick setup chosen. Background: ${profileTitle}. ` +
          `Wolf-Winter promise: ${oathTitle}. Report: ${sourceTitle}. ` +
          "You can still choose a field kit, relief wagon, second rider, and route.",
      );
      expect(receipt.displaySummary).not.toMatch(
        /\b(role|duty|source|preparation|relief allocation|field-team)\b/iu,
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
      revealCurrentJourneyStoryOptions(session, RELIEF_OATH.id);
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

    expect(() => wrongRole.chooseJourneyStory(roadPacket.id)).toThrow(
      /unknown story choice|does not offer option/i,
    );
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
