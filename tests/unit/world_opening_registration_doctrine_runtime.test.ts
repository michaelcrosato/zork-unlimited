import { describe, expect, it } from "vitest";

import { openingLeadSourceJournalId } from "../../src/world/opening_lead_source_journal.js";
import { openingRegistrationJournalId } from "../../src/world/opening_registration_journal.js";
import { openingReliefOathJournalId } from "../../src/world/opening_relief_oath_journal.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import type { OverworldManifest } from "../../src/world/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const DOCTRINE = REGISTRATION.doctrines![0]!;

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

describe("Albany starting doctrine runtime", () => {
  it("runs every doctrine as the exact canonical registration, oath, and source sequence", () => {
    const opening = atRegistration();
    const prompt = opening.journey().storyChoice!;
    expect(prompt.options.slice(0, REGISTRATION.doctrines!.length)).toEqual(
      expect.arrayContaining(
        REGISTRATION.doctrines!.map((doctrine) =>
          expect.objectContaining({ id: doctrine.id, group: "doctrine" }),
        ),
      ),
    );
    expect(prompt.options.slice(REGISTRATION.doctrines!.length)).toEqual(
      expect.arrayContaining(
        REGISTRATION.profiles.map((profile) =>
          expect.objectContaining({ id: profile.id, group: "custom_role" }),
        ),
      ),
    );

    for (const doctrine of REGISTRATION.doctrines!) {
      const doctrineSession = atRegistration();
      const acceptedBefore = doctrineSession.journey().acceptedDecisions;
      const receipt = doctrineSession.chooseJourneyStory(doctrine.id);

      const manualSession = atRegistration();
      manualSession.chooseJourneyStory(doctrine.profile_id);
      manualSession.chooseJourneyStory(doctrine.relief_oath_option_id);
      manualSession.chooseJourneyStory(doctrine.lead_source_option_id);

      expect(receipt).toMatchObject({
        storyChoiceId: REGISTRATION.id,
        choiceId: doctrine.id,
      });
      expect(receipt.consequence).toContain(doctrine.preview);
      expect(receipt.consequence).toContain(`Exact opening cost: ${doctrine.immediate_cost}.`);
      expect(receipt.consequence).toContain(doctrine.consequence);
      expect(receipt.consequence).toContain(
        `role — ${REGISTRATION.profiles.find((profile) => profile.id === doctrine.profile_id)!.title}`,
      );
      expect(receipt.consequence).toContain(
        `duty — ${RELIEF_OATH.options.find((option) => option.id === doctrine.relief_oath_option_id)!.title}`,
      );
      expect(receipt.consequence).toContain(
        `source — ${LEAD_SOURCE.options.find((option) => option.id === doctrine.lead_source_option_id)!.title}`,
      );
      expect(doctrineSession.journey().acceptedDecisions).toBe(acceptedBefore + 3);
      expect(doctrineSession.snapshot()).toEqual(manualSession.snapshot());

      const journalIds = doctrineSession.snapshot().journalEntries.map((entry) => entry.id);
      expect(journalIds).toEqual(
        expect.arrayContaining([
          openingRegistrationJournalId(REGISTRATION.id, doctrine.profile_id),
          openingReliefOathJournalId(RELIEF_OATH.id, doctrine.relief_oath_option_id),
          openingLeadSourceJournalId(LEAD_SOURCE.id, doctrine.lead_source_option_id),
        ]),
      );
      expect(journalIds).not.toContain(doctrine.id);
      expect(doctrineSession.view().quests.map((quest) => quest.id)).toContain("wolf_winter");
    }
  });

  it("leaves preparation, allocation, and June unselected while keeping their normal route selectable", () => {
    const session = atRegistration();
    session.chooseJourneyStory(DOCTRINE.id);

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

  it("round-trips doctrine-selected canonical evidence and rejects bad mappings atomically", () => {
    const selected = atRegistration();
    selected.chooseJourneyStory(DOCTRINE.id);
    const snapshot = selected.snapshot();
    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);

    const invalidWorld = structuredClone(WORLD);
    invalidWorld.opening_registration!.doctrines![0]!.profile_id = "albany:missing_profile";
    const invalid = atRegistration(invalidWorld);
    const before = invalid.snapshot();

    expect(() => invalid.chooseJourneyStory(DOCTRINE.id)).toThrow(/unknown registration profile/i);
    expect(invalid.snapshot()).toEqual(before);
    expect(invalid.journey().storyChoice).toMatchObject({
      id: REGISTRATION.id,
      kind: "registration",
    });
  });
});
