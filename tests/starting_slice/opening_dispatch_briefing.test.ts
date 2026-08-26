import { describe, expect, it } from "vitest";

import { createToolApi } from "../../src/mcp/tools.js";
import {
  compactJourneyStoryChoiceComparison,
  JOURNEY_STORY_CHOICE_REVIEW_INSTRUCTION,
  type CompactJourneyPresentation,
  type JourneyStoryChoiceSummaryComparison,
} from "../../src/mcp/journey_projection.js";
import {
  journeyStoryChoiceOptionsForPresentation,
  type JourneyPresentation,
  type JourneyStoryChoicePrompt,
  type JourneyStoryChoicePresentationKind,
} from "../../src/world/journey_contract.js";
import { openingDispatchCrisisPreview } from "../../src/world/opening_dispatch_briefing.js";
import {
  OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION,
  OPENING_RELIEF_OATH_CUSTOMIZE_LABEL,
  OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS,
} from "../../src/world/opening_relief_oath_presentation.js";
import {
  OverworldSession,
  type OverworldJourneyStoryChoiceResult,
} from "../../src/world/session.js";
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
const WOLF_CRISIS_PREVIEW =
  "Old Cade needs help protecting his household and cattle from a wolf pack.";
const REGISTRATION_MESSAGE =
  "The Wolf-Winter: Old Cade needs help protecting his household and cattle from a wolf pack. Choose one permanent background. Then use a ready-made setup or choose the promise and report separately. Every field plan stays open.";
const MATCHED_OATH_MESSAGE =
  "The Wolf-Winter: use a ready-made promise and report or choose them separately. Every approach stays open.";
const PREPARATION_MESSAGE =
  "You can leave Albany Station now or choose one field kit. The relief wagon and June are separate choices.";
const CUSTOM_DUTY_MESSAGE =
  "The Wolf-Winter: choose one promise. Your report comes next. Every field plan stays open.";
const SOURCE_MESSAGE =
  "The Wolf-Winter: choose one report. Albany Station comes next. Every field plan stays open.";
const RELIEF_ALLOCATION_MESSAGE =
  "You can leave Albany Station now or assign the relief wagon. The field kit and June are separate choices.";
const ALLY_MESSAGE =
  "You can leave Albany Station alone or ask June Pike to join. The field kit and relief wagon are separate choices.";
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
    originalMessage: string;
    expectedMessage: string;
  },
): JourneyStoryChoicePrompt {
  const storyChoice = currentStoryChoice(session);
  expect(storyChoice).toMatchObject({ id: args.id, kind: args.kind });
  expect(storyChoice.message).toBe(args.expectedMessage);
  expect(storyChoice.message).not.toContain(args.originalMessage);
  return storyChoice;
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
    if (option.summary?.fieldTriggerScope === "starter") {
      expect(option.summary.fieldTrigger).toEqual(expect.any(String));
      expect(option.summary.highlights?.length).toBeGreaterThan(0);
      expect(option.consequence.length).toBeGreaterThan(0);
      continue;
    }
    expect(option.summary).not.toHaveProperty("fieldTrigger");
    if (storyChoice.kind === "registration") {
      expect(option.consequence).toContain("Best for:");
      if (option.id === "albany:road_warden") {
        expect(option.consequence).toContain("In Wolf-Winter, Defense starts at 4 instead of 3");
        expect(option.consequence).not.toMatch(/\bDEF\b|imported starting/iu);
      } else {
        expect(option.consequence).toMatch(/Fieldcraft Defense bonus/i);
      }
      expect(JSON.stringify(option.summary)).not.toMatch(/\b(?:DEF|import|fieldTrigger)\b/i);
      continue;
    }
    expect(option.consequence).toContain("Benefit:");
    expect(option.consequence).toContain(`Cost: ${option.summary!.immediateCost}.`);
    expect(option.consequence).toContain(`Tradeoff: ${option.summary!.tradeoff}`);
  }
}

const RESULT_PREFIX: Readonly<Record<JourneyStoryChoicePresentationKind, string>> = {
  registration: "Background chosen",
  relief_oath: "Wolf-Winter promise chosen",
  lead_source: "Report chosen",
  preparation: "Field kit chosen",
  relief_allocation: "Relief wagon choice made",
  ally: "Riding choice made",
};

const RESULT_PLAIN_OUTCOME: Readonly<Record<string, string>> = {
  "albany:ally_june_cattle_first": "June joined you as the second rider.",
  "albany:ally_june_relay_only": "June would not accept your orders and stayed at the Station.",
  "albany:ally_travel_solo": "June remained at the Station; you will ride alone.",
};

function expectPlayerFirstOpeningResult(args: {
  session: OverworldSession;
  prompt: JourneyStoryChoicePrompt & { kind: JourneyStoryChoicePresentationKind };
  optionId: string;
  result: OverworldJourneyStoryChoiceResult;
}): void {
  const option = args.prompt.options.find((candidate) => candidate.id === args.optionId);
  if (!option?.summary) throw new Error(`Expected a summary for ${args.optionId}.`);
  const summary = option.summary;
  const plainOutcome = RESULT_PLAIN_OUTCOME[option.id];
  expect(args.result.displaySummary).toBe(
    `${RESULT_PREFIX[args.prompt.kind]} — ${option.label}. ` +
      `${plainOutcome ? `${plainOutcome} ` : ""}Cost: ${summary.immediateCost.replace(/\.$/u, "")}.`,
  );
  expect(args.result.consequence).toBe(option.consequence);
  expect(args.result.displaySummary).not.toContain(args.result.consequence);
  const serializedResult = JSON.stringify(args.result);
  expect(serializedResult.indexOf('"displaySummary"')).toBeLessThan(
    serializedResult.indexOf('"consequence"'),
  );
  const snapshot = args.session.snapshot();
  expect(JSON.stringify(snapshot)).not.toContain(args.result.displaySummary!);
  expect(snapshot.journalEntries.find((entry) => entry.id === args.result.entry.id)?.text).not.toBe(
    args.result.displaySummary,
  );
}

function wordCount(value: string): number {
  return value.match(/\S+/g)?.length ?? 0;
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
    expect(option?.consequence).toContain(`Tradeoff: ${profile.tradeoff}`);
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
      highlights: [{ label: "Check skill", value: expectedPreparationCheckFit(profile) }],
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
    expect(option?.consequence).toContain(`Tradeoff: Leaves exposed:`);
    expect(option?.consequence).not.toContain(allocationOption.preview);
    expect(option?.consequence).not.toContain(allocationOption.consequence);
  }
}

function openingSessionAtRegistration(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  return session;
}

function openingSessionAtLeadSource(): OverworldSession {
  const session = openingSessionAtRegistration();
  session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
  const oath = currentStoryChoice(session);
  if (oath.progressiveDisclosure) {
    session.revealJourneyStory(oath.id, oath.progressiveDisclosure.reveal.id);
  }
  session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
  return session;
}

function openingSessionAtStation(): OverworldSession {
  const session = openingSessionAtLeadSource();
  session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === PREPARATION.area);
  if (!route) throw new Error("Expected the opening route to Albany Station.");
  session.moveArea(route.id);
  return session;
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
    expect(registration.message).toContain(`${WOLF.title}:`);
    expect(registration.message).not.toContain(REGISTRATION.message);
    expect(registration.message).toContain(WOLF_CRISIS_PREVIEW.replace(/\.$/u, ""));
    expect(registration.message).toContain("Choose one permanent background");
    expect(registration.message).toContain(
      "use a ready-made setup or choose the promise and report separately",
    );
    expect(registration.message).toContain("Every field plan stays open");
    expect(registration.message).not.toContain(WOLF.discovery);
    expect(registration.message).not.toMatch(STALE_DEFAULT_CIVIC_FRAMING);
    expect(registration.message).not.toMatch(DEFERRED_STATION_SUPPORT_DETAILS);
    expect(registration.options.map((option) => option.id)).toEqual(
      REGISTRATION.profiles.map((profile) => profile.id),
    );
    expect(registration.options.every((option) => option.group === undefined)).toBe(true);
    expect(registration.message.match(/[.!?]/gu)).toHaveLength(4);
    expect(wordCount(registration.message)).toBeLessThanOrEqual(52);
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

    const registrationResult = session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
    expectPlayerFirstOpeningResult({
      session,
      prompt: registration as JourneyStoryChoicePrompt & {
        kind: JourneyStoryChoicePresentationKind;
      },
      optionId: REGISTRATION.profiles[0]!.id,
      result: registrationResult,
    });
    expect(registrationResult.consequence).toContain(
      "In Wolf-Winter, Defense starts at 4 instead of 3.",
    );
    expect(registrationResult.consequence).not.toMatch(
      /\b(?:DEF|LURE|HUNT)\b|imported starting|ordinary-hunt|frost[- ](?:brace|jamb)|public wedge|field-team|relief allocation/gu,
    );
    const oath = currentStoryChoice(session);
    expect(oath).toMatchObject({ id: RELIEF_OATH.id, kind: "relief_oath" });
    expect(oath.message).toBe(MATCHED_OATH_MESSAGE);
    expect(oath.message).toContain(`${WOLF.title}:`);
    expect(oath.message).not.toContain(RELIEF_OATH.message);
    const standardPacket = REGISTRATION.doctrines!.find(
      (doctrine) => doctrine.profile_id === REGISTRATION.profiles[0]!.id,
    )!;
    expect(oath.message).toContain("Every approach stays open.");
    expect(oath.message).not.toMatch(STALE_DEFAULT_CIVIC_FRAMING);
    expect(oath.message).not.toMatch(DEFERRED_STATION_SUPPORT_DETAILS);
    expect(oath.options.map((option) => option.id)).toEqual([
      standardPacket.id,
      ...RELIEF_OATH.options.map((option) => option.id),
    ]);
    expect(oath.message.match(/[.!?]/gu)).toHaveLength(2);
    expect(wordCount(oath.message)).toBeLessThanOrEqual(16);
    expect(wordCount(registration.message) + wordCount(oath.message)).toBeLessThanOrEqual(65);
    expectSummaryFirstOptions(oath);
    expect(oath.options.every((option) => option.summary?.immediateCost)).toBe(true);
    const roadWardenPacket = oath.options.find((option) => option.id === standardPacket.id)!;
    expect(roadWardenPacket.label).toBe("Ready-made setup — Aid-Only + Hayden's report");
    expect(roadWardenPacket.summary?.commitment).toBe(
      "Start with Defense 4, the clean-feed LURE benefit, and Hayden's conditional HUNT brace.",
    );
    expect(roadWardenPacket.summary?.tradeoff).toBe("Other promise/report pairs close.");
    expect(roadWardenPacket.consequence).toContain("Tradeoff: Other promise/report pairs close.");
    expect(roadWardenPacket.consequence).toContain(
      "Benefit: Defense starts at 4. A clean first LURE feed prevents the final +1 cattle alarm. A split rail can help HUNT.",
    );
    expect(JSON.stringify(roadWardenPacket.summary)).not.toMatch(
      /\b(?:DEF|DC|import|fieldTrigger)\b/i,
    );
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
        label: OPENING_RELIEF_OATH_CUSTOMIZE_LABEL,
        description: OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION,
        optionIds: RELIEF_OATH.options.map((option) => option.id),
      },
    });
    expect(JSON.stringify(oath)).not.toContain(OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS);
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
      originalMessage: RELIEF_OATH.message,
      expectedMessage: CUSTOM_DUTY_MESSAGE,
    });
    expect(ledgerOath.message.match(/[.!?]/gu)).toHaveLength(3);
    expect(wordCount(ledgerOath.message)).toBeLessThanOrEqual(16);
    expect(ledgerOath.options.map((option) => option.id)).toEqual(
      RELIEF_OATH.options.map((option) => option.id),
    );
    expect(ledgerOath).not.toHaveProperty("progressiveDisclosure");
    expect(journeyStoryChoiceOptionsForPresentation(ledgerOath).map((option) => option.id)).toEqual(
      RELIEF_OATH.options.map((option) => option.id),
    );
    expect(ledgerOath.message).not.toContain("standard packet for duty + evidence");

    ledgerSession.chooseJourneyStory("albany:oath_full_compact_duty");
    const ledgerSource = expectStage(ledgerSession, {
      id: LEAD_SOURCE.id,
      kind: "lead_source",
      originalMessage: LEAD_SOURCE.message,
      expectedMessage: SOURCE_MESSAGE,
    });
    expect(ledgerSource.message.match(/[.!?]/gu)).toHaveLength(3);
    expect(wordCount(ledgerSource.message)).toBeLessThanOrEqual(15);
    expect(
      wordCount(registration.message) +
        wordCount(ledgerOath.message) +
        wordCount(ledgerSource.message),
    ).toBeLessThanOrEqual(80);
    expect(
      registration.message.length + ledgerOath.message.length + ledgerSource.message.length,
    ).toBeLessThanOrEqual(620);

    const revealedOath = session.revealJourneyStory(oath.id, oath.progressiveDisclosure!.reveal.id);
    expect(revealedOath).not.toHaveProperty("progressiveDisclosure");
    expect(revealedOath.message).toBe(
      `${oath.message} ${OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS}`,
    );
    const oathCompass = OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS;
    expect(oathCompass).toBe(
      "HUNT — Fight the wolves to protect the farm, herd, and supplies. Wolves may die; failure can cost cattle or damage the fence. Bloodshed changes later Greenway work. LURE — Use Cade's last feed to lead the wolves away and keep the herd. The fence breaks, and a failed first feed can cost two cattle. DRIVE — Move the people and herd out, forcing the living pack away. The farm is abandoned, and the crisis costs a wound, two cattle, or the rig. FORTIFY — Keep the household, herd, and wolves apart until dawn. You cannot retreat; choose between exposing property with Cade's help or spending public seals without it. Review only: no plan is selected.",
    );
    expect(wordCount(oathCompass)).toBeLessThanOrEqual(145);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(
      revealedOath,
    );
    const oathResult = session.chooseJourneyStory(RELIEF_OATH.options[0]!.id);
    expectPlayerFirstOpeningResult({
      session,
      prompt: revealedOath as JourneyStoryChoicePrompt & {
        kind: JourneyStoryChoicePresentationKind;
      },
      optionId: RELIEF_OATH.options[0]!.id,
      result: oathResult,
    });
    const source = expectStage(session, {
      id: LEAD_SOURCE.id,
      kind: "lead_source",
      originalMessage: LEAD_SOURCE.message,
      expectedMessage: SOURCE_MESSAGE,
    });
    expect(source.message).toContain("Albany Station comes next");
    expect(source.message).not.toContain(LEAD_SOURCE.message);
    expect(source.message.match(/[.!?]/gu)).toHaveLength(3);
    expect(wordCount(source.message)).toBeLessThanOrEqual(15);
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

    const sourceResult = session.chooseJourneyStory(LEAD_SOURCE.options[0]!.id);
    expectPlayerFirstOpeningResult({
      session,
      prompt: source as JourneyStoryChoicePrompt & { kind: JourneyStoryChoicePresentationKind },
      optionId: LEAD_SOURCE.options[0]!.id,
      result: sourceResult,
    });
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
    expect(preparation.message).toBe(PREPARATION_MESSAGE);
    expect(preparation.message).toContain("leave Albany Station now");
    expect(preparation.message).toContain("choose one field kit");
    expect(preparation.message).not.toContain(PREPARATION.message);
    expect(preparation.message).toContain("The relief wagon and June are separate choices.");
    expect(preparation.message.match(/[.!?]/gu)).toHaveLength(2);
    expect(wordCount(preparation.message)).toBeLessThanOrEqual(20);
    expectSummaryFirstOptions(preparation);
    expectProgressivePreparationOptions(preparation);
    expect(preparation.options.every((option) => option.summary?.immediateCost)).toBe(true);
    expect(preparation.options.every((option) => option.dispatchForecast)).toBe(true);
    expect(
      preparation.options.every((option) =>
        option.dispatchForecast?.line.startsWith("If chosen, dispatch totals"),
      ),
    ).toBe(true);
    expect(
      OverworldSession.restore(WORLD, session.snapshot()).inspectJourneyStory(PREPARATION.id),
    ).toEqual(preparation);

    const preparationResult = session.chooseJourneyStory(PREPARATION.profiles[0]!.id);
    expectPlayerFirstOpeningResult({
      session,
      prompt: preparation as JourneyStoryChoicePrompt & {
        kind: JourneyStoryChoicePresentationKind;
      },
      optionId: PREPARATION.profiles[0]!.id,
      result: preparationResult,
    });
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
    expect(allocation.message).toBe(RELIEF_ALLOCATION_MESSAGE);
    expect(allocation.message).toContain("leave Albany Station now");
    expect(allocation.message).toContain("assign the relief wagon");
    expect(allocation.message).not.toContain(RELIEF_ALLOCATION.message);
    expect(allocation.message).toContain("The field kit and June are separate choices.");
    expect(allocation.message.match(/[.!?]/gu)).toHaveLength(2);
    expect(wordCount(allocation.message)).toBeLessThanOrEqual(21);
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

    const allocationResult = session.chooseJourneyStory(
      RELIEF_ALLOCATION.options[0]!.id,
      RELIEF_ALLOCATION.id,
    );
    expectPlayerFirstOpeningResult({
      session,
      prompt: allocation as JourneyStoryChoicePrompt & {
        kind: JourneyStoryChoicePresentationKind;
      },
      optionId: RELIEF_ALLOCATION.options[0]!.id,
      result: allocationResult,
    });
    session.talkToCharacter(ALLY.contact);
    const ally = currentStoryChoice(session);
    expect(ally).toMatchObject({ id: ALLY.id, kind: "ally" });
    expect(ally.message).toBe(ALLY_MESSAGE);
    expect(ally.message).toContain("leave Albany Station alone");
    expect(ally.message).toContain("The field kit and relief wagon are separate choices.");
    expect(ally.message).not.toContain(ALLY.message);
    expect(ally.message.match(/[.!?]/gu)).toHaveLength(2);
    expect(wordCount(ally.message)).toBeLessThanOrEqual(24);
    expectSummaryFirstOptions(ally);
    expect(OverworldSession.restore(WORLD, session.snapshot()).journey().storyChoice).toEqual(ally);
    const allyResult = session.chooseJourneyStory(ALLY.options[0]!.id);
    expectPlayerFirstOpeningResult({
      session,
      prompt: ally as JourneyStoryChoicePrompt & { kind: JourneyStoryChoicePresentationKind },
      optionId: ALLY.options[0]!.id,
      result: allyResult,
    });
  });

  it("keeps every ordinary accepted opening summary player-first while exact bytes stay separate", () => {
    const forbiddenFirstLevelMechanics =
      /\b(?:DRIVE|FORTIFY|Overrun|pressure|HP|DEF|import)\b|field\s*trigger/iu;
    const assertAccepted = (
      session: OverworldSession,
      prompt: JourneyStoryChoicePrompt,
      optionId: string,
      result: OverworldJourneyStoryChoiceResult,
    ): void => {
      expectPlayerFirstOpeningResult({
        session,
        prompt: prompt as JourneyStoryChoicePrompt & {
          kind: JourneyStoryChoicePresentationKind;
        },
        optionId,
        result,
      });
      expect(result.displaySummary).not.toMatch(forbiddenFirstLevelMechanics);
    };

    for (const profile of REGISTRATION.profiles) {
      const session = openingSessionAtRegistration();
      const prompt = currentStoryChoice(session);
      assertAccepted(session, prompt, profile.id, session.chooseJourneyStory(profile.id));
    }
    for (const oathOption of RELIEF_OATH.options) {
      const session = openingSessionAtRegistration();
      session.chooseJourneyStory(REGISTRATION.profiles[0]!.id);
      const initialOath = currentStoryChoice(session);
      if (initialOath.progressiveDisclosure) {
        session.revealJourneyStory(initialOath.id, initialOath.progressiveDisclosure.reveal.id);
      }
      const prompt = currentStoryChoice(session);
      assertAccepted(session, prompt, oathOption.id, session.chooseJourneyStory(oathOption.id));
    }
    for (const sourceOption of LEAD_SOURCE.options) {
      const session = openingSessionAtLeadSource();
      const prompt = currentStoryChoice(session);
      assertAccepted(session, prompt, sourceOption.id, session.chooseJourneyStory(sourceOption.id));
    }
    for (const profile of PREPARATION.profiles) {
      const session = openingSessionAtStation();
      const prompt = session.inspectJourneyStory(PREPARATION.id);
      assertAccepted(
        session,
        prompt,
        profile.id,
        session.chooseJourneyStory(profile.id, PREPARATION.id),
      );
    }
    for (const allocationOption of RELIEF_ALLOCATION.options) {
      const session = openingSessionAtStation();
      const prompt = session.inspectJourneyStory(RELIEF_ALLOCATION.id);
      assertAccepted(
        session,
        prompt,
        allocationOption.id,
        session.chooseJourneyStory(allocationOption.id, RELIEF_ALLOCATION.id),
      );
    }
    for (const allyOption of ALLY.options) {
      const session = openingSessionAtStation();
      session.talkToCharacter(ALLY.contact);
      const prompt = currentStoryChoice(session);
      assertAccepted(session, prompt, allyOption.id, session.chooseJourneyStory(allyOption.id));
    }
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
        label: OPENING_RELIEF_OATH_CUSTOMIZE_LABEL,
        description: OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION,
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

      const revealedOath = session.revealJourneyStory(oath.id, disclosure.reveal.id);
      const afterReveal = session.snapshot();
      expect(afterReveal).not.toEqual(beforeReveal);
      expect(afterReveal.inspectedStoryReveals).toContainEqual([oath.id, [disclosure.reveal.id]]);
      expect(revealedOath).not.toHaveProperty("progressiveDisclosure");
      expect(revealedOath.message).toBe(
        `${oath.message} ${OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS}`,
      );
      expect(session.journey()).toEqual({ ...beforeJourney, storyChoice: revealedOath });
      expect(session.inspectJourneyStoryOption(oath.id, customDuty.id)).toEqual(revealedOath);

      const restored = OverworldSession.restore(WORLD, afterReveal);
      expect(restored.inspectJourneyStoryOption(oath.id, customDuty.id)).toEqual(revealedOath);
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
    expect(talked.journey.storyChoice?.message).toBe(REGISTRATION_MESSAGE);
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
    expect(compactJourney.storyChoice?.message).toBe(
      `${MATCHED_OATH_MESSAGE} ${JOURNEY_STORY_CHOICE_REVIEW_INSTRUCTION}`,
    );

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
    expect(mcpStation.context.station_dispatch_board?.[0]).toBe(6);
    expect(mcpStation.context.station_dispatch_board?.[4]).toHaveLength(3);
    expect(mcpStation.context.station_dispatch_board?.[5]).toEqual([
      "station_dispatch:review_optional_support",
      "Optional: a field kit using Repair, Streetwise, or Mediation; plus Albany's last relief wagon or June as a cattle-safety rider. Review only what interests you.",
    ]);
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
    expect(mcpPreparation.message).toBe(PREPARATION_MESSAGE);
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
      2,
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
    expect(mcpAlly!.message).toBe(ALLY_MESSAGE);
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
    expect(compactDuty?.message).toBe(
      `${CUSTOM_DUTY_MESSAGE} ${JOURNEY_STORY_CHOICE_REVIEW_INSTRUCTION}`,
    );
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
    expect(compactSource?.message).toBe(
      `${SOURCE_MESSAGE} ${JOURNEY_STORY_CHOICE_REVIEW_INSTRUCTION}`,
    );
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
