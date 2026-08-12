import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  compactJourneyStoryChoiceComparison,
  type CompactJourneyPresentation,
  type JourneyStoryChoiceSummaryComparison,
} from "../../src/mcp/journey_projection.js";
import {
  journeyStoryChoiceOptionsForPresentation,
  type JourneyPresentation,
  type JourneyStoryChoicePrompt,
} from "../../src/world/journey_contract.js";
import { openingDispatchCrisisPreview } from "../../src/world/opening_dispatch_briefing.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { OverworldSession as UiOverworldSession } from "../../ui/src/overworld.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION = WORLD.opening_registration!;
const RELIEF_OATH = WORLD.opening_relief_oath!;
const LEAD_SOURCE = WORLD.opening_lead_source!;
const PREPARATION = WORLD.opening_preparation!;
const RELIEF_ALLOCATION = WORLD.opening_relief_allocation!;
const ALLY = WORLD.opening_ally!;
const WOLF = WORLD.quests.find((quest) => quest.id === LEAD_SOURCE.target_quest)!;
const ALLY_CONTACT = WORLD.characters.find((character) => character.id === ALLY.contact)!;
const FIELD_CHECK_TIMING = "Field checks surface with their action before resolution.";
const REGISTRATION_HEADER = `Compare starting resources, first field edge, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const OATH_HEADER = `Compare promise, exact cost, and what each duty gives up. ${FIELD_CHECK_TIMING}`;
const STANDARD_PACKET_OATH_HEADER = `Compare promise, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const SOURCE_HEADER = `Other accounts close. Compare field priority, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const PREPARATION_HEADER = `Compare field priority, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const RELIEF_ALLOCATION_HEADER = `Compare who is protected, exact cost, and what remains exposed. ${FIELD_CHECK_TIMING}`;
const ALLY_HEADER = `Compare field-team promise, exact cost, and tradeoff. ${FIELD_CHECK_TIMING}`;
const JUNE_TOTAL_TIMING =
  "Totals include the standard 15-minute conversation: Grant June Cattle-First Authority: 15 minutes additional, 30 minutes total; Negotiate for a Subordinate Relay: 5 minutes additional, 20 minutes total; Leave with a Solo Field Team: no added time, 15 minutes total.";
const PURPOSES = Object.freeze({
  registration: "Purpose: choose your permanent background and promise.",
  relief_oath: "Purpose: choose duty; every field plan stays open.",
  lead_source: "Purpose: choose evidence; every field plan stays open.",
  preparation:
    "Purpose: optionally choose one preparation; relief priority and field team stay separate.",
  relief_allocation:
    "Purpose: optionally choose one relief priority; preparation and field team stay separate.",
  ally: "Purpose: choose June's field-team terms or the solo team; every Wolf-Winter route stays available.",
});
const STANDARD_PACKET_PURPOSE =
  "Purpose: finish matched duty and evidence, or customize; every field plan stays open.";
const WOLF_CRISIS_PREVIEW =
  "A winter-relief tag moves from Albany's civic records to the Albany Station Quarter route desk: Old Cade's hill steading, a cattle byre, and a wolf pack coming down with the weather.";
const REGISTRATION_MESSAGE =
  "The Wolf-Winter Civic docket · role. Purpose: choose your permanent background and promise. Mission preview — A winter-relief tag moves from Albany's civic records to the Albany Station Quarter route desk: Old Cade's hill steading, a cattle byre, and a wolf pack coming down with the weather. In one next choice, a matched role may finish duty and evidence, or customize. Enter Albany's Relief Compact. Compare starting resources, first field edge, exact cost, and tradeoff. Field checks surface with their action before resolution.";
const MATCHED_OATH_MESSAGE =
  "The Wolf-Winter Civic docket · matched duty + evidence. Purpose: finish matched duty and evidence, or customize; every field plan stays open. A custom duty leaves one evidence choice next. Set the Wolf-Winter Relief Terms. Compare promise, exact cost, and tradeoff. Field checks surface with their action before resolution.";
const CUSTOM_DUTY_MESSAGE =
  "The Wolf-Winter Civic docket · 2/3 — duty. Purpose: choose duty; every field plan stays open. Evidence follows. Set the Wolf-Winter Relief Terms. Compare promise, exact cost, and what each duty gives up. Field checks surface with their action before resolution.";
const SOURCE_MESSAGE =
  "The Wolf-Winter Civic docket · 3/3 — evidence. Purpose: choose evidence; every field plan stays open. Hayden's Station launch board follows. Certify the Wolf-Winter Source Packet. Other accounts close. Compare field priority, exact cost, and tradeoff. Field checks surface with their action before resolution.";
const STALE_DEFAULT_CIVIC_FRAMING = /\b(?:1\/3|2\/3|Civic order)\b|role\s*→\s*duty\s*→\s*evidence/i;
const DEFERRED_STATION_SUPPORT_DETAILS =
  /Hayden|field kit|last relief wagon|June|second field seat|second rider|cattle-first/i;

function expectedPreparationCheckFit(profile: (typeof PREPARATION.profiles)[number]): string {
  const check = profile.check_disclosure;
  if (!check) throw new Error(`Preparation "${profile.id}" requires a check disclosure.`);
  const character = REGISTRATION.profiles[0]!.character;
  const modifier = character.skills.find((skill) => skill.skillId === check.skill_id)?.rank ?? 0;
  const signedModifier = modifier >= 0 ? `+${String(modifier)}` : String(modifier);
  return `${check.skill_label} ${signedModifier} vs DC ${String(check.difficulty)}`;
}

function currentStoryChoice(session: OverworldSession): JourneyStoryChoicePrompt {
  const storyChoice = session.journey().storyChoice;
  if (!storyChoice) throw new Error("Expected an opening dispatch story choice.");
  return storyChoice;
}

function expectStage(
  session: OverworldSession,
  args: {
    id: string;
    kind: NonNullable<JourneyStoryChoicePrompt["kind"]>;
    phase: "Civic docket" | "Departure plan";
    step: number;
    total: number;
    label: string;
    originalTitle: string;
    originalMessage: string;
    presentedMessage: string;
  },
): JourneyStoryChoicePrompt {
  const storyChoice = currentStoryChoice(session);
  expect(storyChoice).toMatchObject({ id: args.id, kind: args.kind });
  expect(storyChoice.message).toContain(
    `${WOLF.title} ${args.phase} · ${args.step}/${args.total} — ${args.label}.`,
  );
  expect(storyChoice.message).toContain(`${args.originalTitle}. ${args.presentedMessage}`);
  expect(storyChoice.message).not.toContain(args.originalMessage);
  return storyChoice;
}

function expectLaunchDetailsDeferred(storyChoice: { message: string }): void {
  expect(storyChoice.message).toContain(
    `Route costs and tactics remain on ${WOLF.title}'s launch card.`,
  );
  expect(storyChoice.message).not.toContain(WOLF.discovery);
  for (const option of WOLF.launch?.options ?? []) {
    expect(storyChoice.message).not.toContain(option.title);
    expect(storyChoice.message).not.toContain(option.summary);
    expect(storyChoice.message).not.toContain(option.preview);
  }
}

function expectSummaryFirstOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const option of storyChoice.options) {
    expect(option.summary).toMatchObject({
      commitment: expect.any(String),
      immediateCost: expect.any(String),
      tradeoff: expect.any(String),
    });
    expect(option.summary?.commitment.length).toBeGreaterThan(0);
    expect(option.summary?.immediateCost.length).toBeGreaterThan(0);
    expect(option.summary?.tradeoff.length).toBeGreaterThan(0);
    expect(option.summary).not.toHaveProperty("fieldTrigger");
    expect(option.consequence).toContain("Benefit:");
    expect(option.consequence).toContain(`Cost: ${option.summary!.immediateCost}.`);
    expect(option.consequence).toContain(`Boundary: ${option.summary!.tradeoff}`);
  }
}

function wordCount(value: string): number {
  return value.match(/\S+/g)?.length ?? 0;
}

function expectBoundedPurpose(storyChoice: JourneyStoryChoicePrompt, purpose: string): void {
  expect(purpose.length).toBeLessThanOrEqual(140);
  expect(storyChoice.message.match(/\bPurpose:/g) ?? []).toHaveLength(1);
  expect(storyChoice.message).toContain(purpose);
  expect(storyChoice.message.indexOf(purpose)).toBeLessThan(
    storyChoice.message.indexOf(FIELD_CHECK_TIMING),
  );
  expect(purpose).not.toMatch(/\b(?:best|optimal|recommended)\b/i);
  if (purpose !== PURPOSES.relief_oath) {
    expect(purpose).not.toMatch(/\bmust\b/i);
  }
}

function expectRoleplayFirstFraming(storyChoice: JourneyStoryChoicePrompt): void {
  expect(storyChoice.message).toMatch(/\b(?:promises?|priorit(?:y|ies))\b/i);
  expect(storyChoice.message).toContain("exact cost");
  expect(storyChoice.message).toMatch(/\b(?:gives up|remains exposed|tradeoffs?)\b/i);
  expect(storyChoice.message).toContain(FIELD_CHECK_TIMING);
  expect(storyChoice.message).not.toMatch(
    /broad field fit|trigger category|inspect a card|exact check|recovery chain/i,
  );
}

function expectCompactSummaryOptions(storyChoice: JourneyStoryChoiceSummaryComparison): void {
  for (const option of storyChoice.options) {
    expect(option.summary).toMatchObject({
      commitment: expect.any(String),
      immediateCost: expect.any(String),
      tradeoff: expect.any(String),
    });
    expect(option.summary).not.toHaveProperty("fieldTrigger");
    expect(option).not.toHaveProperty("consequence");
  }
  expect(storyChoice.inspectedOption).toBeNull();
}

function expectProgressivePreparationOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const profile of PREPARATION.profiles) {
    const option = storyChoice.options.find((candidate) => candidate.id === profile.id);
    expect(option?.summary).toEqual({
      commitment: profile.summary,
      checkFit: expectedPreparationCheckFit(profile),
      immediateCost: expect.any(String),
      tradeoff: profile.tradeoff,
    });
    expect(option?.summary?.commitment.split(/\s+/).length).toBeLessThanOrEqual(16);
    expect(option?.consequence).toContain(`Benefit: ${profile.trigger_category}`);
    expect(option?.consequence).toContain(`Boundary: ${profile.tradeoff}`);
    expect(option?.consequence).not.toContain(profile.preview);
    expect(option?.consequence).not.toContain(profile.consequence);
  }
}

function expectProgressivePreparationComparison(
  storyChoice: JourneyStoryChoiceSummaryComparison,
): void {
  for (const profile of PREPARATION.profiles) {
    const option = storyChoice.options.find((candidate) => candidate.id === profile.id);
    expect(option?.summary).toEqual({
      commitment: profile.summary,
      immediateCost: expect.any(String),
      tradeoff: profile.tradeoff,
    });
    expect(option?.summary).not.toHaveProperty("checkFit");
    expect(option).not.toHaveProperty("consequence");
  }
}

function expectProgressiveReliefAllocationOptions(storyChoice: JourneyStoryChoicePrompt): void {
  for (const allocationOption of RELIEF_ALLOCATION.options) {
    const option = storyChoice.options.find((candidate) => candidate.id === allocationOption.id);
    expect(option?.summary).toEqual({
      commitment: allocationOption.summary,
      immediateCost: expect.any(String),
      tradeoff: `Leaves exposed: ${allocationOption.leaves_exposed}`,
    });
    expect(option?.consequence).toContain(`Benefit: ${allocationOption.trigger_category}`);
    expect(option?.consequence).toContain(`Boundary: Leaves exposed:`);
    expect(option?.consequence).not.toContain(allocationOption.preview);
    expect(option?.consequence).not.toContain(allocationOption.consequence);
  }
}

function expectProgressiveReliefAllocationComparison(
  storyChoice: JourneyStoryChoiceSummaryComparison,
): void {
  for (const allocationOption of RELIEF_ALLOCATION.options) {
    const option = storyChoice.options.find((candidate) => candidate.id === allocationOption.id);
    expect(option?.summary).toEqual({
      commitment: allocationOption.summary,
      immediateCost: expect.any(String),
      tradeoff: `Leaves exposed: ${allocationOption.leaves_exposed}`,
    });
    expect(option).not.toHaveProperty("consequence");
  }
}

describe("Albany Wolf-Winter dispatch briefing", () => {
  it("splits the authored Station-support boundary without inferring sentence grammar", () => {
    expect(
      openingDispatchCrisisPreview(
        "Dr. Cade's herd is under wolf attack. The live dispatch has June waiting at Station.",
      ),
    ).toBe("Dr. Cade's herd is under wolf attack.");
    expect(
      openingDispatchCrisisPreview(
        'Cade asks, "Ready?" The wolf pack is at the cattle byre. The live dispatch has June waiting at Station.',
      ),
    ).toBe('Cade asks, "Ready?" The wolf pack is at the cattle byre.');
    expect(
      openingDispatchCrisisPreview(
        "Bring feed, blankets, etc. The live dispatch has June waiting at Station.",
      ),
    ).toBe("Bring feed, blankets, etc.");
    expect(
      openingDispatchCrisisPreview(
        "A. Cade's herd is under wolf attack. The live dispatch has June waiting at Station.",
      ),
    ).toBe("A. Cade's herd is under wolf attack.");
    expect(openingDispatchCrisisPreview("Cade's herd needs help")).toBeNull();
    expect(
      openingDispatchCrisisPreview(
        "Cade needs aid. The live dispatch has June. The live dispatch has a relief wagon.",
      ),
    ).toBeNull();
    expect(openingDispatchCrisisPreview(WOLF.discovery)).toBe(WOLF_CRISIS_PREVIEW);
  });

  it("makes the mission concrete before choice one and separates Civic from departure decisions", () => {
    const session = new OverworldSession(WORLD);
    const opening = session.view();
    session.scoutPoi(opening.pois[0]!.id);
    session.talkToCharacter(REGISTRATION.contact);

    const registration = currentStoryChoice(session);
    expect(registration).toMatchObject({ id: REGISTRATION.id, kind: "registration" });
    expect(registration.message).toBe(REGISTRATION_MESSAGE);
    expect(registration.message).toContain(`${WOLF.title} Civic docket · role.`);
    expect(registration.message).toContain(`${REGISTRATION.title}. ${REGISTRATION_HEADER}`);
    expect(registration.message).not.toContain(REGISTRATION.message);
    expect(registration.message).toContain(`Mission preview — ${WOLF_CRISIS_PREVIEW}`);
    expect(registration.message).toContain(
      "In one next choice, a matched role may finish duty and evidence, or customize.",
    );
    expect(registration.message).not.toContain(WOLF.discovery);
    expect(registration.message).not.toMatch(STALE_DEFAULT_CIVIC_FRAMING);
    expect(registration.message).not.toMatch(DEFERRED_STATION_SUPPORT_DETAILS);
    expectBoundedPurpose(registration, PURPOSES.registration);
    expect(registration.options.map((option) => option.id)).toEqual(
      REGISTRATION.profiles.map((profile) => profile.id),
    );
    expect(registration.options.every((option) => option.group === undefined)).toBe(true);
    expectRoleplayFirstFraming(registration);
    expect(wordCount(registration.message)).toBeLessThanOrEqual(90);
    expectSummaryFirstOptions(registration);
    expect(registration.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(
      registration,
    );
    const offer = session
      .snapshot()
      .journalEntries.find((entry) => entry.kind === "registration_offer");
    expect(offer).toMatchObject({
      title: REGISTRATION.title,
      text: REGISTRATION.message,
    });

    session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    const oath = currentStoryChoice(session);
    expect(oath).toMatchObject({ id: RELIEF_OATH.id, kind: "relief_oath" });
    expect(oath.message).toBe(MATCHED_OATH_MESSAGE);
    expect(oath.message).toContain(`${WOLF.title} Civic docket · matched duty + evidence.`);
    expect(oath.message).toContain(`${RELIEF_OATH.title}. ${STANDARD_PACKET_OATH_HEADER}`);
    expect(oath.message).not.toContain(RELIEF_OATH.message);
    const standardPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === REGISTRATION.profiles[0]!.id,
    )!;
    expect(oath.message).toContain("A custom duty leaves one evidence choice next.");
    expect(oath.message).not.toMatch(STALE_DEFAULT_CIVIC_FRAMING);
    expect(oath.message).not.toMatch(DEFERRED_STATION_SUPPORT_DETAILS);
    expectBoundedPurpose(oath, STANDARD_PACKET_PURPOSE);
    expect(oath.options.map((option) => option.id)).toEqual([
      standardPacket.id,
      ...RELIEF_OATH.options.map((option) => option.id),
    ]);
    expectRoleplayFirstFraming(oath);
    expect(wordCount(oath.message)).toBeLessThanOrEqual(50);
    expect(wordCount(registration.message) + wordCount(oath.message)).toBeLessThanOrEqual(135);
    expectSummaryFirstOptions(oath);
    expect(oath.options.every((option) => option.summary?.immediateCost)).toBe(true);
    const roadWardenPacket = oath.options.find((option) => option.id === standardPacket.id)!;
    expect(roadWardenPacket.label).toBe(
      "Role shortcut — Negotiate Aid-Only Duty + Take Hayden's Frost-Heave Report",
    );
    expect(roadWardenPacket.summary?.commitment).toBe(
      "Skips the separate evidence choice; no field plan is chosen. Support: Fieldcraft 4; a bloodless LURE skips one alarm; after an unbound rail split, HUNT may use Hayden's brace.",
    );
    expect(roadWardenPacket.summary?.tradeoff).toBe(
      "Other duty/evidence pairs close; every field plan stays open.",
    );
    expect(roadWardenPacket.consequence).toContain(
      "Benefit: Fieldcraft 4 sets DEF 4; Aid-Only skips clean LURE's last alarm; Hayden conditionally braces split-rail HUNT.",
    );
    expect(roadWardenPacket.summary?.commitment).not.toContain("DEF");
    expect(roadWardenPacket.summary?.commitment).not.toContain("split-rail");
    expect(roadWardenPacket.summary?.commitment).not.toContain(standardPacket.summary);
    expect(
      compactJourneyStoryChoiceComparison(
        oath,
        undefined,
        oath.progressiveDisclosure!.reveal.id,
      ).options.find((option) => option.id === standardPacket.id)?.summary?.commitment,
    ).toBe(roadWardenPacket.summary?.commitment);
    expect(oath.progressiveDisclosure).toMatchObject({
      initialOptionIds: [standardPacket.id],
      reveal: {
        id: "customize_duty_and_evidence",
        label: expect.stringContaining("Customize duty and evidence"),
        optionIds: RELIEF_OATH.options.map((option) => option.id),
      },
    });
    const oathCompass = oath.progressiveDisclosure!.reveal.description;
    expect(oathCompass).toMatch(/HUNT[^]*defends herd and relief stores[^]*wolves may die/i);
    expect(oathCompass).toMatch(/LURE[^]*keep herd and pack alive[^]*spends Cade's last feed/i);
    expect(oathCompass).toMatch(
      /DRIVE[^]*moves people and the living pack clear[^]*abandons the outer line/i,
    );
    expect(oathCompass).toMatch(
      /FORTIFY[^]*keeps home, herd, and pack[^]*property or spends public seals/i,
    );
    expect(oathCompass).toMatch(/No plan is recommended or committed/i);
    expect(journeyStoryChoiceOptionsForPresentation(oath).map((option) => option.id)).toEqual([
      standardPacket.id,
    ]);
    expect(
      journeyStoryChoiceOptionsForPresentation(oath, "customize_duty_and_evidence").map(
        (option) => option.id,
      ),
    ).toEqual([standardPacket.id, ...RELIEF_OATH.options.map((option) => option.id)]);
    expect(() => journeyStoryChoiceOptionsForPresentation(oath, "not_a_reveal")).toThrow(
      /no progressive disclosure/i,
    );
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(oath);

    const matchedSession = OverworldSession.restore(WORLD, session.snapshot());
    const beforeMatchedDecisions = matchedSession.journey().acceptedDecisions;
    matchedSession.chooseJourneyStory(standardPacket.id);
    expect(matchedSession.journey().acceptedDecisions).toBe(beforeMatchedDecisions + 2);
    expect(matchedSession.journey().storyChoice).toBeNull();

    const ledgerSession = new OverworldSession(WORLD);
    ledgerSession.scoutPoi(ledgerSession.view().pois[0]!.id);
    ledgerSession.talkToCharacter(REGISTRATION.contact);
    ledgerSession.chooseJourneyStory("albany:ledger_advocate");
    const ledgerOath = expectStage(ledgerSession, {
      id: RELIEF_OATH.id,
      kind: "relief_oath",
      phase: "Civic docket",
      step: 2,
      total: 3,
      label: "duty",
      originalTitle: RELIEF_OATH.title,
      originalMessage: RELIEF_OATH.message,
      presentedMessage: OATH_HEADER,
    });
    expect(ledgerOath.message).toBe(CUSTOM_DUTY_MESSAGE);
    expect(wordCount(ledgerOath.message)).toBeLessThanOrEqual(45);
    expect(ledgerOath.options.map((option) => option.id)).toEqual(
      RELIEF_OATH.options.map((option) => option.id),
    );
    expect(ledgerOath).not.toHaveProperty("progressiveDisclosure");
    expectBoundedPurpose(ledgerOath, PURPOSES.relief_oath);
    expect(journeyStoryChoiceOptionsForPresentation(ledgerOath).map((option) => option.id)).toEqual(
      RELIEF_OATH.options.map((option) => option.id),
    );
    expect(ledgerOath.message).not.toContain("standard packet for duty + evidence");

    ledgerSession.chooseJourneyStory("albany:oath_full_compact_duty");
    const ledgerSource = expectStage(ledgerSession, {
      id: LEAD_SOURCE.id,
      kind: "lead_source",
      phase: "Civic docket",
      step: 3,
      total: 3,
      label: "evidence",
      originalTitle: LEAD_SOURCE.title,
      originalMessage: LEAD_SOURCE.message,
      presentedMessage: SOURCE_HEADER,
    });
    expect(ledgerSource.message).toBe(SOURCE_MESSAGE);
    expect(wordCount(ledgerSource.message)).toBeLessThanOrEqual(45);
    expect(
      wordCount(registration.message) +
        wordCount(ledgerOath.message) +
        wordCount(ledgerSource.message),
    ).toBeLessThanOrEqual(170);
    expect(
      registration.message.length + ledgerOath.message.length + ledgerSource.message.length,
    ).toBeLessThanOrEqual(1_120);

    session.revealJourneyStory(oath.id, oath.progressiveDisclosure!.reveal.id);
    session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    const source = expectStage(session, {
      id: LEAD_SOURCE.id,
      kind: "lead_source",
      phase: "Civic docket",
      step: 3,
      total: 3,
      label: "evidence",
      originalTitle: LEAD_SOURCE.title,
      originalMessage: LEAD_SOURCE.message,
      presentedMessage: SOURCE_HEADER,
    });
    expect(source.message).toBe(SOURCE_MESSAGE);
    expect(source.message).toContain("Hayden's Station launch board follows.");
    expect(source.message).toContain(`Certify the Wolf-Winter Source Packet. ${SOURCE_HEADER}`);
    expect(source.message).not.toContain(LEAD_SOURCE.message);
    expectBoundedPurpose(source, PURPOSES.lead_source);
    expectRoleplayFirstFraming(source);
    expect(wordCount(source.message)).toBeLessThanOrEqual(45);
    expectSummaryFirstOptions(source);
    expect(source.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(
      source,
    );
    expect(
      session.snapshot().journalEntries.find((entry) => entry.kind === "lead_source_offer"),
    ).toMatchObject({
      title: LEAD_SOURCE.title,
      text: LEAD_SOURCE.message,
    });

    session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
    expect(session.journey().storyChoice).toBeNull();
    const route = session
      .view()
      .areaExits.find((candidate) => candidate.destination.id === RELIEF_ALLOCATION.area);
    if (!route) throw new Error("Expected a route to Albany's departure board.");
    session.moveArea(route.id);
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions[0]).toMatchObject({
      id: PREPARATION.id,
      kind: "preparation",
    });
    const preparation = session.inspectJourneyStory(PREPARATION.id);
    expect(preparation).toMatchObject({ id: PREPARATION.id, kind: "preparation" });
    expect(preparation.message).toContain(`${WOLF.title} · optional preparation.`);
    expect(preparation.message).toContain(`${PREPARATION.title}. ${PREPARATION_HEADER}`);
    expect(preparation.message).not.toContain(PREPARATION.message);
    expect(preparation.message).not.toContain("relief-capacity choice");
    expect(preparation.message).toContain(
      `${ALLY_CONTACT.name}'s field-team conversation is separate.`,
    );
    expect(preparation.message).toContain(JUNE_TOTAL_TIMING);
    expectBoundedPurpose(preparation, PURPOSES.preparation);
    expectRoleplayFirstFraming(preparation);
    expect(preparation.message).not.toMatch(/Departure plan|1\/2|Still ahead/i);
    expect(wordCount(preparation.message)).toBeLessThanOrEqual(110);
    expectLaunchDetailsDeferred(preparation);
    expectSummaryFirstOptions(preparation);
    expectProgressivePreparationOptions(preparation);
    expect(preparation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(preparation.options.every((option) => option.dispatchForecast)).toBe(true);
    expect(
      preparation.options.every((option) =>
        option.dispatchForecast?.line.startsWith("Dispatch forecast if chosen:"),
      ),
    ).toBe(true);
    expect(
      OverworldSession.restore(WORLD, session.snapshot()).inspectJourneyStory(PREPARATION.id),
    ).toEqual(preparation);

    session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    expect(
      session.snapshot().journalEntries.find((entry) => entry.kind === "preparation_offer"),
    ).toMatchObject({
      title: PREPARATION.title,
      text: PREPARATION.message,
    });
    expect(session.journey().storyChoice).toBeNull();
    expect(session.view().departureInteractions[0]).toMatchObject({
      id: RELIEF_ALLOCATION.id,
      kind: "relief_allocation",
    });
    const allocation = session.inspectJourneyStory(RELIEF_ALLOCATION.id);
    expect(allocation).toMatchObject({
      id: RELIEF_ALLOCATION.id,
      kind: "relief_allocation",
    });
    expect(allocation.message).toContain(`${WOLF.title} · optional relief priority.`);
    expect(allocation.message).toContain(`${RELIEF_ALLOCATION.title}. ${RELIEF_ALLOCATION_HEADER}`);
    expect(allocation.message).not.toContain(RELIEF_ALLOCATION.message);
    expect(allocation.message).not.toMatch(/Departure plan|2\/2|Still ahead|Chosen for departure/i);
    expect(allocation.message).not.toContain("Optional field-team choice follows");
    expect(allocation.message).not.toMatch(/\b(?:required|mandatory)\b/i);
    expect(allocation.message).toContain(
      `${ALLY_CONTACT.name}'s field-team conversation is separate; launching now keeps the solo route legal.`,
    );
    expect(allocation.message).toContain(JUNE_TOTAL_TIMING);
    expectBoundedPurpose(allocation, PURPOSES.relief_allocation);
    expectRoleplayFirstFraming(allocation);
    expect(wordCount(allocation.message)).toBeLessThanOrEqual(115);
    expectLaunchDetailsDeferred(allocation);
    expectSummaryFirstOptions(allocation);
    expectProgressiveReliefAllocationOptions(allocation);
    expect(allocation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(allocation.options.every((option) => option.dispatchImpact)).toBe(true);
    expect(
      allocation.options.every((option) => option.dispatchImpact?.line.startsWith("Dispatch:")),
    ).toBe(true);
    expect(
      OverworldSession.restore(WORLD, session.snapshot()).inspectJourneyStory(RELIEF_ALLOCATION.id),
    ).toEqual(allocation);

    session.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    session.talkToCharacter(ALLY.contact);
    const ally = currentStoryChoice(session);
    expect(ally).toMatchObject({ id: ALLY.id, kind: "ally" });
    expect(ally.message).toContain(`${WOLF.title} · optional field team.`);
    expectBoundedPurpose(ally, PURPOSES.ally);
    expect(ally.message).toContain(
      'Choose "Leave with a Solo Field Team" to keep the one-rider launch.',
    );
    expect(ally.message).toContain(`${ALLY.title}. ${ALLY_HEADER}`);
    expect(ally.message).not.toContain(ALLY.message);
    expectRoleplayFirstFraming(ally);
    expect(wordCount(ally.message)).toBeLessThanOrEqual(75);
    expectLaunchDetailsDeferred(ally);
    expectSummaryFirstOptions(ally);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(ally);
  });

  it("keeps role packets immediate and makes customization a durable session receipt", () => {
    for (const doctrine of REGISTRATION.doctrines ?? []) {
      const session = new OverworldSession(WORLD);
      session.scoutPoi(session.view().pois[0]!.id);
      session.talkToCharacter(REGISTRATION.contact);
      session.chooseJourneyStory(doctrine.profile_id);

      const oath = currentStoryChoice(session);
      const beforeReveal = session.snapshot();
      const beforeJourney = session.journey();
      const disclosure = oath.progressiveDisclosure;
      if (!disclosure) throw new Error(`Expected ${doctrine.id} to offer duty customization.`);

      expect(disclosure.initialOptionIds).toEqual([doctrine.id]);
      expect(disclosure.reveal).toMatchObject({
        id: "customize_duty_and_evidence",
        label: expect.stringContaining("Customize duty and evidence"),
      });
      expect(journeyStoryChoiceOptionsForPresentation(oath).map((option) => option.id)).toEqual([
        doctrine.id,
      ]);
      expect(compactJourneyStoryChoiceComparison(oath).options.map((option) => option.id)).toEqual([
        doctrine.id,
      ]);

      const customDuty = RELIEF_OATH.options[0]!;
      expect(() => session.inspectJourneyStoryOption(oath.id, customDuty.id)).toThrow(/hidden/i);
      expect(() => session.chooseJourneyStory(customDuty.id, oath.id)).toThrow(/hidden/i);

      const revealed = compactJourneyStoryChoiceComparison(oath, undefined, disclosure.reveal.id);
      expect(revealed.options.map((option) => option.id)).toEqual([
        doctrine.id,
        ...RELIEF_OATH.options.map((option) => option.id),
      ]);
      expect(session.snapshot()).toEqual(beforeReveal);
      expect(session.journey()).toEqual(beforeJourney);
      expect(OverworldSession.restore(WORLD, beforeReveal).journey()).toEqual(beforeJourney);

      session.revealJourneyStory(oath.id, disclosure.reveal.id);
      const afterReveal = session.snapshot();
      expect(afterReveal).not.toEqual(beforeReveal);
      expect(afterReveal.inspectedStoryReveals).toContainEqual([oath.id, [disclosure.reveal.id]]);
      expect(session.journey()).toEqual(beforeJourney);
      expect(session.inspectJourneyStoryOption(oath.id, customDuty.id)).toEqual(oath);

      const restored = OverworldSession.restore(WORLD, afterReveal);
      expect(restored.inspectJourneyStoryOption(oath.id, customDuty.id)).toEqual(oath);
      expect(() => restored.chooseJourneyStory(customDuty.id, oath.id)).not.toThrow();
    }
  });

  it("rejects forged, duplicate, and unavailable progressive-disclosure receipts", () => {
    const session = new OverworldSession(WORLD);
    session.scoutPoi(session.view().pois[0]!.id);
    session.talkToCharacter(REGISTRATION.contact);
    session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    const oath = currentStoryChoice(session);
    const revealId = oath.progressiveDisclosure?.reveal.id;
    if (!revealId) throw new Error("Expected the standard oath to offer customization.");
    session.revealJourneyStory(oath.id, revealId);
    const snapshot = session.snapshot();

    expect(OverworldSession.restore(WORLD, snapshot).snapshot()).toEqual(snapshot);

    const duplicateStory = structuredClone(snapshot);
    duplicateStory.inspectedStoryReveals!.push([oath.id, [revealId]]);
    expect(() => OverworldSession.restore(WORLD, duplicateStory)).toThrow(
      /repeats story reveal receipt/i,
    );

    const duplicateReveal = structuredClone(snapshot);
    duplicateReveal.inspectedStoryReveals![0]![1].push(revealId);
    expect(() => OverworldSession.restore(WORLD, duplicateReveal)).toThrow(/repeats a reveal id/i);

    const forgedReveal = structuredClone(snapshot);
    forgedReveal.inspectedStoryReveals![0]![1] = ["reveal:forged"];
    expect(() => OverworldSession.restore(WORLD, forgedReveal)).toThrow(
      /exactly its authored progressive-disclosure id/i,
    );

    const multipleReveals = structuredClone(snapshot);
    multipleReveals.inspectedStoryReveals![0]![1].push("reveal:forged");
    expect(() => OverworldSession.restore(WORLD, multipleReveals)).toThrow(
      /exactly its authored progressive-disclosure id/i,
    );

    const unavailableStory = structuredClone(snapshot);
    unavailableStory.inspectedStoryReveals![0]![0] = REGISTRATION.id;
    expect(() => OverworldSession.restore(WORLD, unavailableStory)).toThrow(
      /not currently inspectable/i,
    );
  });

  it("presents the exact same matched briefing through full UI and compact MCP", () => {
    const ui = new UiOverworldSession(WORLD);
    const uiOpening = ui.view();
    ui.scoutPoi(uiOpening.pois[0]!.id);
    ui.talkToCharacter(REGISTRATION.contact);

    const api = createToolApi({ root: process.cwd() });
    const started = api.start_overworld({ compact_context: false });
    api.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
      compact_context: false,
      compact_result: false,
    });
    const talked = api.talk_overworld_session_contact({
      session_id: started.session_id,
      character_id: REGISTRATION.contact,
      compact_context: false,
      compact_result: false,
    });

    expect(talked.journey.storyChoice).toEqual(ui.journey().storyChoice);
    expect(talked.journey.storyChoice?.message).toContain(
      `Mission preview — ${WOLF_CRISIS_PREVIEW}`,
    );
    expectSummaryFirstOptions(talked.journey.storyChoice!);

    const standardPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === REGISTRATION.profiles[0]!.id,
    )!;
    ui.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    let compactJourney: JourneyPresentation | CompactJourneyPresentation =
      api.choose_overworld_session_story({
        session_id: started.session_id,
        choice: REGISTRATION.profiles[0]!.id,
        compact_context: true,
        compact_result: true,
      }).journey;
    expect(ui.journey().storyChoice?.message).toBe(MATCHED_OATH_MESSAGE);
    expect(compactJourney.storyChoice?.message).toBe(MATCHED_OATH_MESSAGE);

    ui.chooseJourneyStory(standardPacket.id);
    compactJourney = api.choose_overworld_session_story({
      session_id: started.session_id,
      choice: standardPacket.id,
      compact_context: true,
      compact_result: true,
    }).journey;
    expect(compactJourney.storyChoice).toEqual(ui.journey().storyChoice);
    expect(compactJourney.storyChoice).toBeNull();
    const stationRoute = ui
      .view()
      .areaExits.find((candidate) => candidate.destination.id === RELIEF_ALLOCATION.area);
    if (!stationRoute) throw new Error("Expected a UI route to the departure board.");
    ui.moveArea(stationRoute.id);
    const mcpStation = api.move_overworld_session_area({
      session_id: started.session_id,
      area_route_id: stationRoute.id,
      compact_context: true,
      compact_result: true,
    });
    compactJourney = mcpStation.journey;
    expect(compactJourney.storyChoice).toEqual(ui.journey().storyChoice);
    expect(compactJourney.storyChoice).toBeNull();
    expect(mcpStation.context.station_dispatch_board).toEqual(
      ui.compactView().station_dispatch_board,
    );
    expect(mcpStation.context.station_dispatch_board?.[4]).toHaveLength(6);
    expect(mcpStation.context).not.toHaveProperty("departure_recap");
    expect(mcpStation.context).not.toHaveProperty("departure_interactions");
    expect(mcpStation.context).not.toHaveProperty("departure_contact_leads");
    expect(
      Object.keys(mcpStation.context).filter((key) =>
        ["quests", "quest_starts", "station_dispatch_board"].includes(key),
      ),
    ).toEqual(["quests", "quest_starts", "station_dispatch_board"]);
    expect(ui.view().departureInteractions[0]?.id).toBe(PREPARATION.id);
    const uiPreparation = ui.inspectJourneyStory(PREPARATION.id);
    const mcpPreparation = api.inspect_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: PREPARATION.id,
      compact_context: true,
      compact_result: true,
    }).story;
    expect(mcpPreparation).toEqual(compactJourneyStoryChoiceComparison(uiPreparation));
    expect(mcpPreparation).not.toEqual(uiPreparation);
    expectLaunchDetailsDeferred(mcpPreparation);
    expectCompactSummaryOptions(mcpPreparation);
    expectProgressivePreparationComparison(mcpPreparation);
    expectSummaryFirstOptions(uiPreparation);
    expectProgressivePreparationOptions(uiPreparation);

    ui.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    const mcpPreparationSelected = api.choose_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: PREPARATION.id,
      choice: PREPARATION.profiles[0]!.id,
      compact_context: true,
    });
    expect(mcpPreparationSelected.context.station_dispatch_board).toEqual(
      ui.compactView().station_dispatch_board,
    );
    expect(mcpPreparationSelected.context.station_dispatch_board?.[3]).toEqual([
      "committed",
      35,
      null,
      ["relief_allocation", "field_team"],
    ]);
    const uiAllocation = ui.inspectJourneyStory(RELIEF_ALLOCATION.id);
    const mcpAllocation = api.inspect_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: RELIEF_ALLOCATION.id,
      compact_context: true,
    }).story;
    expect(mcpAllocation).toEqual(compactJourneyStoryChoiceComparison(uiAllocation));
    expectProgressiveReliefAllocationComparison(mcpAllocation);
    expectProgressiveReliefAllocationOptions(uiAllocation);

    ui.chooseJourneyStory(RELIEF_ALLOCATION.options[0]!.id, RELIEF_ALLOCATION.id);
    api.choose_overworld_session_story({
      session_id: started.session_id,
      story_choice_id: RELIEF_ALLOCATION.id,
      choice: RELIEF_ALLOCATION.options[0]!.id,
      compact_context: true,
    });
    ui.talkToCharacter(ALLY.contact);
    const mcpAlly = api.talk_overworld_session_contact({
      session_id: started.session_id,
      character_id: ALLY.contact,
      compact_context: false,
      compact_result: false,
    }).journey.storyChoice;
    expect(mcpAlly).toEqual(ui.journey().storyChoice);
    expect(mcpAlly).not.toBeNull();
    expectBoundedPurpose(mcpAlly!, PURPOSES.ally);
  });

  it("keeps custom Civic headers literal across full UI and compact MCP", () => {
    const ui = new UiOverworldSession(WORLD);
    ui.scoutPoi(ui.view().pois[0]!.id);
    ui.talkToCharacter(REGISTRATION.contact);

    const api = createToolApi({ root: process.cwd() });
    const started = api.start_overworld({ compact_context: false });
    api.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
      compact_context: false,
      compact_result: false,
    });
    const talked = api.talk_overworld_session_contact({
      session_id: started.session_id,
      character_id: REGISTRATION.contact,
      compact_context: false,
      compact_result: false,
    });
    expect(talked.journey.storyChoice?.message).toBe(REGISTRATION_MESSAGE);

    const decisionsBeforeRole = ui.journey().acceptedDecisions;
    ui.chooseJourneyStory("albany:ledger_advocate");
    const compactDuty = api.choose_overworld_session_story({
      session_id: started.session_id,
      choice: "albany:ledger_advocate",
      compact_context: true,
      compact_result: true,
    }).journey.storyChoice;
    const fullDuty = ui.journey().storyChoice;
    if (!fullDuty) throw new Error("Expected Ledger Advocate's full duty choice.");
    expect(fullDuty.message).toBe(CUSTOM_DUTY_MESSAGE);
    expect(compactDuty?.message).toBe(CUSTOM_DUTY_MESSAGE);
    expect(compactJourneyStoryChoiceComparison(fullDuty).message).toBe(CUSTOM_DUTY_MESSAGE);
    expect(fullDuty).not.toHaveProperty("progressiveDisclosure");
    expect(fullDuty.options.map((option) => option.id)).toEqual([
      "albany:oath_full_compact_duty",
      "albany:oath_limited_aid_only",
      "albany:oath_unaffiliated_personal_bond",
    ]);
    expect(ui.journey().acceptedDecisions).toBe(decisionsBeforeRole + 1);
    const decisionsBeforeDuty = ui.journey().acceptedDecisions;
    const dutySnapshot = ui.snapshot();
    compactJourneyStoryChoiceComparison(fullDuty);
    ui.journey();
    expect(ui.snapshot()).toEqual(dutySnapshot);

    ui.chooseJourneyStory("albany:oath_full_compact_duty");
    const compactSource = api.choose_overworld_session_story({
      session_id: started.session_id,
      choice: "albany:oath_full_compact_duty",
      compact_context: true,
      compact_result: true,
    }).journey.storyChoice;
    const fullSource = ui.journey().storyChoice;
    if (!fullSource) throw new Error("Expected the full Albany evidence choice.");
    expect(fullSource.message).toBe(SOURCE_MESSAGE);
    expect(compactSource?.message).toBe(SOURCE_MESSAGE);
    expect(compactJourneyStoryChoiceComparison(fullSource).message).toBe(SOURCE_MESSAGE);
    expect(fullSource.options.map((option) => option.id)).toEqual([
      "albany:source_rowan_civic_docket",
      "albany:source_jamie_market_testimony",
      "albany:source_hayden_frost_report",
    ]);
    expect(ui.journey().acceptedDecisions).toBe(decisionsBeforeDuty + 1);
    const sourceSnapshot = ui.snapshot();
    compactJourneyStoryChoiceComparison(fullSource);
    ui.journey();
    expect(ui.snapshot()).toEqual(sourceSnapshot);

    const decisionsBeforeSource = ui.journey().acceptedDecisions;
    ui.chooseJourneyStory("albany:source_rowan_civic_docket");
    const compactAfterSource = api.choose_overworld_session_story({
      session_id: started.session_id,
      choice: "albany:source_rowan_civic_docket",
      compact_context: true,
      compact_result: true,
    }).journey.storyChoice;
    expect(ui.journey().acceptedDecisions).toBe(decisionsBeforeSource + 1);
    expect(ui.journey().storyChoice).toBeNull();
    expect(compactAfterSource).toBeNull();
  });
});
