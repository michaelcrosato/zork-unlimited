import { describe, expect, it } from "vitest";

import { hashState } from "../../src/core/hash.js";
import {
  cloneCampaignCharacterState,
  evolveCampaignCharacterState,
  type CampaignCharacterState,
} from "../../src/world/campaign_character_state.js";
import {
  OPENING_LEAD_SOURCE_MAX_OPTIONS,
  OPENING_LEAD_SOURCE_MIN_OPTIONS,
  OpeningLeadSourceOptionSchema,
  OpeningLeadSourceSchema,
  applyOpeningLeadSourceOption,
  cloneOpeningLeadSource,
  formatOpeningLeadSourceCost,
  openingLeadSourceOptionById,
  openingLeadSourceTerms,
  parseOpeningLeadSource,
  type OpeningLeadSource,
  type OpeningLeadSourceOption,
} from "../../src/world/opening_lead_source.js";
import {
  openingLeadSourceJournalEntry,
  openingLeadSourceOfferJournalEntry,
  proveOpeningLeadSourceJournal,
} from "../../src/world/opening_lead_source_journal.js";
import type { OpeningRegistrationJournalProof } from "../../src/world/opening_registration_journal.js";
import { applyOpeningReliefOathOption } from "../../src/world/opening_relief_oath.js";
import {
  openingReliefOathJournalEntry,
  openingReliefOathLegacyJournalEntry,
  openingReliefOathOfferJournalEntry,
  type OpeningReliefOathJournalProof,
} from "../../src/world/opening_relief_oath_journal.js";
import {
  assertOverworldIntegrity,
  parseOverworldManifest,
  type OverworldManifest,
} from "../../src/world/overworld.js";
import { timeLabel } from "../../src/world/session_journal_codec.js";
import type {
  OverworldJournalDecisionBoundary,
  OverworldJournalEntry,
} from "../../src/world/session_snapshot.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());
const openingLeadSource = world.opening_lead_source;
const openingRegistration = world.opening_registration;
const openingReliefOath = world.opening_relief_oath;

if (!openingLeadSource || !openingRegistration || !openingReliefOath) {
  throw new Error(
    "The shipped Albany opening must author registration, relief-oath, and lead-source scenes.",
  );
}

const journalLeadSourceScene = openingLeadSource;
const journalRegistrationScene = openingRegistration;
const journalReliefOathScene = openingReliefOath;

function optionById(scene: OpeningLeadSource, optionId: string): OpeningLeadSourceOption {
  const option = scene.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`Missing test opening lead-source option ${optionId}.`);
  return option;
}

function profileCharacter(profileId: string): CampaignCharacterState {
  const profile = openingRegistration!.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Missing test opening registration profile ${profileId}.`);
  return profile.character;
}

function mutableOpeningScene(draft: OverworldManifest): OpeningLeadSource {
  const scene = draft.opening_lead_source;
  if (!scene) throw new Error("Missing mutable opening lead-source scene.");
  return scene;
}

function expectIntegrityFailure(
  mutate: (scene: OpeningLeadSource, draft: OverworldManifest) => void,
  pattern: RegExp,
): void {
  const draft = structuredClone(world);
  mutate(mutableOpeningScene(draft), draft);
  expect(() => assertOverworldIntegrity(draft)).toThrow(pattern);
}

function learnedKnowledgeEffect(
  option: OpeningLeadSourceOption,
): Extract<OpeningLeadSourceOption["effects"][number], { type: "learn_knowledge" }> {
  const effect = option.effects.find((candidate) => candidate.type === "learn_knowledge");
  if (!effect || effect.type !== "learn_knowledge") {
    throw new Error(`Opening lead-source option ${option.id} has no learned knowledge.`);
  }
  return effect;
}

function rememberedRelationshipEffect(
  option: OpeningLeadSourceOption,
): Extract<OpeningLeadSourceOption["effects"][number], { type: "remember_relationship" }> {
  const effect = option.effects.find((candidate) => candidate.type === "remember_relationship");
  if (!effect || effect.type !== "remember_relationship") {
    throw new Error(`Opening lead-source option ${option.id} has no relationship memory.`);
  }
  return effect;
}

describe("Albany opening lead-source authoring", () => {
  it("strictly parses the authored three-source scene with one default and two reports", () => {
    expect(OPENING_LEAD_SOURCE_MIN_OPTIONS).toBe(3);
    expect(OPENING_LEAD_SOURCE_MAX_OPTIONS).toBe(5);
    expect(openingLeadSource.options.map((option) => option.id)).toEqual([
      "albany:source_rowan_civic_docket",
      "albany:source_jamie_market_testimony",
      "albany:source_hayden_frost_report",
    ]);
    expect(openingLeadSource.options.map((option) => option.source_npc_id)).toEqual([
      "albany:rowan_quill",
      "albany:jamie_tanner",
      "albany:hayden_hale",
    ]);
    expect(openingLeadSource.options.filter((option) => option.effects.length === 0)).toHaveLength(
      1,
    );
    expect(
      openingLeadSource.options.filter((option) =>
        option.effects.some((effect) => effect.type === "learn_knowledge"),
      ),
    ).toHaveLength(2);

    expect(OpeningLeadSourceSchema.parse(openingLeadSource)).toEqual(openingLeadSource);
    expect(parseOpeningLeadSource(openingLeadSource)).toEqual(openingLeadSource);
    expect(parseOverworldManifest(structuredClone(world)).opening_lead_source).toEqual(
      openingLeadSource,
    );

    const clone = cloneOpeningLeadSource(openingLeadSource);
    expect(clone).not.toBe(openingLeadSource);
    expect(clone.options[0]).not.toBe(openingLeadSource.options[0]);
    clone.options[0]!.title = "Detached test title";
    expect(openingLeadSource.options[0]!.title).not.toBe("Detached test title");

    expect(() => parseOpeningLeadSource({ ...openingLeadSource, unexpected: true })).toThrow();
    expect(() =>
      OpeningLeadSourceOptionSchema.parse({
        ...openingLeadSource.options[0]!,
        terms: { ...openingLeadSource.options[0]!.terms, credit: true },
      }),
    ).toThrow();

    const duplicateIds = cloneOpeningLeadSource(openingLeadSource);
    duplicateIds.options[1]!.id = duplicateIds.options[0]!.id;
    expect(() => parseOpeningLeadSource(duplicateIds)).toThrow(/duplicate.*option id/i);

    expect(() =>
      parseOpeningLeadSource({
        ...openingLeadSource,
        options: openingLeadSource.options.slice(0, 2),
      }),
    ).toThrow();

    const noDefault = cloneOpeningLeadSource(openingLeadSource);
    noDefault.options[0]!.effects = [
      { type: "learn_knowledge", knowledge_id: "albany:knowledge_civic_docket" },
    ];
    expect(() => parseOpeningLeadSource(noDefault)).toThrow(/explicit.*default packet/i);

    const onlyOneReport = cloneOpeningLeadSource(openingLeadSource);
    onlyOneReport.options[2]!.effects = [];
    expect(() => parseOpeningLeadSource(onlyOneReport)).toThrow(/at least two.*reports/i);
  });

  it("resolves sponsor terms from registration memories and formats their exact cost", () => {
    const jamie = optionById(openingLeadSource, "albany:source_jamie_market_testimony");
    const hayden = optionById(openingLeadSource, "albany:source_hayden_frost_report");
    const rowan = optionById(openingLeadSource, "albany:source_rowan_civic_docket");

    const ledgerTerms = openingLeadSourceTerms(jamie, profileCharacter("albany:ledger_advocate"));
    expect(ledgerTerms).toEqual({
      minutes: 15,
      money: 0,
      sponsored: true,
      sponsorNote: expect.stringContaining("waiving $6"),
    });
    expect(Object.isFrozen(ledgerTerms)).toBe(true);
    expect(formatOpeningLeadSourceCost(ledgerTerms)).toBe("15 minutes and $0");

    expect(openingLeadSourceTerms(jamie, profileCharacter("albany:unaffiliated_courier"))).toEqual({
      minutes: 35,
      money: 6,
      sponsored: false,
      sponsorNote: null,
    });
    expect(openingLeadSourceTerms(hayden, profileCharacter("albany:road_warden"))).toEqual({
      minutes: 5,
      money: 0,
      sponsored: true,
      sponsorNote: expect.stringContaining("reduces the route-desk review"),
    });
    expect(openingLeadSourceTerms(hayden, profileCharacter("albany:ledger_advocate"))).toEqual({
      minutes: 20,
      money: 0,
      sponsored: false,
      sponsorNote: null,
    });
    expect(
      formatOpeningLeadSourceCost(
        openingLeadSourceTerms(rowan, profileCharacter("albany:unaffiliated_courier")),
      ),
    ).toBe("no added time and $0");

    expect(openingLeadSourceOptionById(openingLeadSource, "albany:source_missing")).toBeNull();
  });

  it("applies paid money, learned knowledge, and source memory as one detached result", () => {
    const source = profileCharacter("albany:unaffiliated_courier");
    const sourceBefore = cloneCampaignCharacterState(source);
    const sceneBefore = cloneOpeningLeadSource(openingLeadSource);
    const result = applyOpeningLeadSourceOption({
      scene: openingLeadSource,
      character: source,
      optionId: "albany:source_jamie_market_testimony",
    });

    expect(source).toEqual(sourceBefore);
    expect(openingLeadSource).toEqual(sceneBefore);
    expect(result.characterAfter).not.toBe(source);
    expect(result.characterAfter.money).toBe(source.money - 6);
    expect(result.characterAfter.knowledge).toContain("albany:knowledge_wolf_market_testimony");
    expect(result.characterAfter.relationships).toContainEqual({
      npcId: "albany:jamie_tanner",
      trust: 3,
      regard: 3,
      owesPlayer: 0,
      playerOwes: 0,
      memories: ["albany:memory_jamie_market_testimony_certified"],
    });
    expect(result.terms).toEqual({
      minutes: 35,
      money: 6,
      sponsored: false,
      sponsorNote: null,
    });
    expect(result).not.toHaveProperty("worldFactIds");

    const sponsored = applyOpeningLeadSourceOption({
      scene: openingLeadSource,
      character: profileCharacter("albany:ledger_advocate"),
      optionId: "albany:source_jamie_market_testimony",
    });
    expect(sponsored.characterAfter.money).toBe(25);
    expect(sponsored.characterAfter.knowledge).toContain("albany:knowledge_wolf_market_testimony");

    const underfunded = evolveCampaignCharacterState(source, (draft) => {
      draft.money = 5;
    });
    const underfundedBefore = cloneCampaignCharacterState(underfunded);
    expect(() =>
      applyOpeningLeadSourceOption({
        scene: openingLeadSource,
        character: underfunded,
        optionId: "albany:source_jamie_market_testimony",
      }),
    ).toThrow(/costs \$6.*only \$5/i);
    expect(underfunded).toEqual(underfundedBefore);
    expect(underfunded.knowledge).not.toContain("albany:knowledge_wolf_market_testimony");
  });

  it("rejects world facts and wounds because lead sources only gather reports", () => {
    const withWorldFact = cloneOpeningLeadSource(openingLeadSource);
    optionById(withWorldFact, "albany:source_jamie_market_testimony").effects.push({
      type: "set_world_fact",
      fact_id: "fact:opening_source_selected",
    });

    expect(() => parseOpeningLeadSource(withWorldFact)).toThrow(/not world facts/i);

    const rawWorld = structuredClone(world);
    rawWorld.opening_lead_source = withWorldFact;
    expect(() => parseOverworldManifest(rawWorld)).toThrow(/not world facts/i);

    const withWound = cloneOpeningLeadSource(openingLeadSource);
    optionById(withWound, "albany:source_jamie_market_testimony").effects.push({
      type: "suffer_wound",
      wound_id: "wound:opening_source_shortcut",
      severity: 2,
      treatment: "untreated",
      health_loss: 6,
    });
    expect(() => parseOpeningLeadSource(withWound)).toThrow(/not .*wounds/i);
  });

  it("enforces source, quest-import, contact-memory, and sponsor references", () => {
    expect(() => assertOverworldIntegrity(structuredClone(world))).not.toThrow();

    expectIntegrityFailure((scene) => {
      scene.after_registration = "albany:missing_registration";
    }, /must follow.*opening registration/i);
    expectIntegrityFailure((scene) => {
      scene.area = "albany_city__transport_hub";
    }, /share.*registration.*home and area/i);
    expectIntegrityFailure((scene) => {
      scene.target_quest = "missing_quest";
    }, /target an authored quest/i);
    expectIntegrityFailure((scene) => {
      optionById(scene, "albany:source_jamie_market_testimony").source_npc_id =
        "albany:missing_source";
    }, /unbound Albany source npc/i);
    expectIntegrityFailure((scene) => {
      const jamieKnowledge = learnedKnowledgeEffect(
        optionById(scene, "albany:source_jamie_market_testimony"),
      ).knowledge_id;
      learnedKnowledgeEffect(optionById(scene, "albany:source_hayden_frost_report")).knowledge_id =
        jamieKnowledge;
    }, /knowledge.*repeated across options/i);
    expectIntegrityFailure((scene) => {
      learnedKnowledgeEffect(optionById(scene, "albany:source_hayden_frost_report")).knowledge_id =
        "albany:knowledge_unimported_report";
    }, /no target-quest import consumer/i);
    expectIntegrityFailure((scene) => {
      rememberedRelationshipEffect(
        optionById(scene, "albany:source_jamie_market_testimony"),
      ).npc_id = "albany:rowan_quill";
    }, /different npc than its named source/i);
    expectIntegrityFailure((scene) => {
      rememberedRelationshipEffect(
        optionById(scene, "albany:source_jamie_market_testimony"),
      ).memory_id = "albany:memory_unconsumed_report";
    }, /memory.*no consuming contact variant/i);
    expectIntegrityFailure((scene) => {
      optionById(scene, "albany:source_jamie_market_testimony").sponsor!.memory_id =
        "albany:memory_missing_sponsor";
    }, /sponsor terms without a registration memory/i);
    expectIntegrityFailure((scene) => {
      delete optionById(scene, "albany:source_jamie_market_testimony").sponsor;
      delete optionById(scene, "albany:source_hayden_frost_report").sponsor;
    }, /at least one sponsor term mechanical/i);
  });
});

const JOURNAL_TOWN = "Albany city";
const JOURNAL_BASE_HASH = "a".repeat(64);
const JOURNAL_LEGACY_HASH = "7".repeat(64);
const JOURNAL_PROFILE_ID = "albany:unaffiliated_courier";
const JOURNAL_OATH_OPTION_ID = "albany:oath_unaffiliated_personal_bond";
const JOURNAL_SOURCE_OPTION_ID = "albany:source_jamie_market_testimony";

function journalRegistrationCharacter(): CampaignCharacterState {
  return cloneCampaignCharacterState(profileCharacter(JOURNAL_PROFILE_ID));
}

function journalRegistrationBoundary(): OverworldJournalDecisionBoundary {
  return {
    acceptedDecisions: 2,
    decisionProofHash: JOURNAL_BASE_HASH,
    townId: journalLeadSourceScene.home,
    areaId: journalLeadSourceScene.area,
    minutes: 60,
  };
}

function journalRegistrationEntry(
  boundary: OverworldJournalDecisionBoundary,
): OverworldJournalEntry {
  return {
    id: `registration:${journalRegistrationScene.id}:${JOURNAL_PROFILE_ID}`,
    kind: "registration",
    town: JOURNAL_TOWN,
    title: "Registered: Unaffiliated courier",
    text: "The courier registration was selected.",
    recordedAt: timeLabel(boundary.minutes),
    registrationBoundary: { ...boundary },
  };
}

function journalRegistrationProof(args: {
  character: CampaignCharacterState;
  boundary: OverworldJournalDecisionBoundary;
  journalIndex: number;
}): OpeningRegistrationJournalProof {
  const profile = journalRegistrationScene.profiles.find(
    (candidate) => candidate.id === JOURNAL_PROFILE_ID,
  );
  if (!profile) throw new Error(`Missing journal test profile ${JOURNAL_PROFILE_ID}.`);
  return {
    characterAtRegistration: cloneCampaignCharacterState(args.character),
    offered: true,
    offerBoundary: { ...args.boundary },
    profile,
    selectionBoundary: { ...args.boundary },
    journalIndex: args.journalIndex,
    recordedAt: args.boundary.minutes,
  };
}

function nextStoryBoundary(args: {
  previous: OverworldJournalDecisionBoundary;
  sceneId: string;
  optionId: string;
  minutes: number;
}): OverworldJournalDecisionBoundary {
  const number = args.previous.acceptedDecisions + 1;
  return {
    acceptedDecisions: number,
    decisionProofHash: hashState({
      previous: args.previous.decisionProofHash,
      number,
      surface: "overworld",
      actionId: `campaign_story:${args.sceneId}:${args.optionId}`,
      reason: "situation_changed",
    }),
    townId: args.previous.townId,
    areaId: args.previous.areaId,
    minutes: args.previous.minutes + args.minutes,
  };
}

function leadEvidence(args: {
  character: CampaignCharacterState;
  predecessorBoundary: OverworldJournalDecisionBoundary;
  olderEntries: readonly OverworldJournalEntry[];
}) {
  const terms = openingLeadSourceTerms(
    optionById(journalLeadSourceScene, JOURNAL_SOURCE_OPTION_ID),
    args.character,
  );
  const selectionBoundary = nextStoryBoundary({
    previous: args.predecessorBoundary,
    sceneId: journalLeadSourceScene.id,
    optionId: JOURNAL_SOURCE_OPTION_ID,
    minutes: terms.minutes,
  });
  const entries = [
    openingLeadSourceJournalEntry({
      scene: journalLeadSourceScene,
      character: args.character,
      optionId: JOURNAL_SOURCE_OPTION_ID,
      town: JOURNAL_TOWN,
      recordedAt: timeLabel(selectionBoundary.minutes),
      storyChoiceBoundary: selectionBoundary,
    }),
    openingLeadSourceOfferJournalEntry({
      scene: journalLeadSourceScene,
      town: JOURNAL_TOWN,
      recordedAt: timeLabel(args.predecessorBoundary.minutes),
      storyChoiceBoundary: args.predecessorBoundary,
    }),
    ...args.olderEntries,
  ];
  return { entries, selectionBoundary, terms };
}

function selectedOathLeadFixture() {
  const registrationCharacter = journalRegistrationCharacter();
  const registrationBoundary = journalRegistrationBoundary();
  const oathApplication = applyOpeningReliefOathOption({
    scene: journalReliefOathScene,
    character: registrationCharacter,
    optionId: JOURNAL_OATH_OPTION_ID,
  });
  const oathBoundary = nextStoryBoundary({
    previous: registrationBoundary,
    sceneId: journalReliefOathScene.id,
    optionId: JOURNAL_OATH_OPTION_ID,
    minutes: oathApplication.terms.minutes,
  });
  const oathSelection = openingReliefOathJournalEntry({
    scene: journalReliefOathScene,
    character: registrationCharacter,
    optionId: JOURNAL_OATH_OPTION_ID,
    town: JOURNAL_TOWN,
    recordedAt: timeLabel(oathBoundary.minutes),
    storyChoiceBoundary: oathBoundary,
  });
  const oathOffer = openingReliefOathOfferJournalEntry({
    scene: journalReliefOathScene,
    town: JOURNAL_TOWN,
    recordedAt: timeLabel(registrationBoundary.minutes),
    storyChoiceBoundary: registrationBoundary,
  });
  const lead = leadEvidence({
    character: oathApplication.characterAfter,
    predecessorBoundary: oathBoundary,
    olderEntries: [oathSelection, oathOffer, journalRegistrationEntry(registrationBoundary)],
  });
  const reliefOathProof: OpeningReliefOathJournalProof = {
    characterAfterOath: cloneCampaignCharacterState(oathApplication.characterAfter),
    offered: true,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: { ...registrationBoundary },
    option: oathApplication.option,
    selectionBoundary: { ...oathBoundary },
    terms: { ...oathApplication.terms },
    journalIndex: 2,
    recordedAt: oathBoundary.minutes,
  };
  return {
    ...lead,
    registrationCharacter,
    registrationBoundary,
    registrationProof: journalRegistrationProof({
      character: registrationCharacter,
      boundary: registrationBoundary,
      journalIndex: 4,
    }),
    reliefOathProof,
  };
}

function legacyOathLeadFixture() {
  const registrationCharacter = journalRegistrationCharacter();
  const registrationBoundary = journalRegistrationBoundary();
  const legacyMarker = openingReliefOathLegacyJournalEntry({
    sourceWorldHash: JOURNAL_LEGACY_HASH,
    town: JOURNAL_TOWN,
    recordedAt: timeLabel(registrationBoundary.minutes),
    storyChoiceBoundary: registrationBoundary,
  });
  const lead = leadEvidence({
    character: registrationCharacter,
    predecessorBoundary: registrationBoundary,
    olderEntries: [legacyMarker, journalRegistrationEntry(registrationBoundary)],
  });
  const reliefOathProof: OpeningReliefOathJournalProof = {
    characterAfterOath: cloneCampaignCharacterState(registrationCharacter),
    offered: false,
    legacy: true,
    legacySourceWorldHash: JOURNAL_LEGACY_HASH,
    offerBoundary: null,
    option: null,
    selectionBoundary: null,
    terms: null,
    journalIndex: 2,
    recordedAt: registrationBoundary.minutes,
  };
  return {
    ...lead,
    registrationCharacter,
    registrationBoundary,
    registrationProof: journalRegistrationProof({
      character: registrationCharacter,
      boundary: registrationBoundary,
      journalIndex: 3,
    }),
    reliefOathProof,
  };
}

function registrationAdjacentLeadFixture() {
  const registrationCharacter = journalRegistrationCharacter();
  const registrationBoundary = journalRegistrationBoundary();
  const lead = leadEvidence({
    character: registrationCharacter,
    predecessorBoundary: registrationBoundary,
    olderEntries: [journalRegistrationEntry(registrationBoundary)],
  });
  const registrationProof = journalRegistrationProof({
    character: registrationCharacter,
    boundary: registrationBoundary,
    journalIndex: 2,
  });
  const emptyReliefOathProof: OpeningReliefOathJournalProof = {
    characterAfterOath: cloneCampaignCharacterState(registrationCharacter),
    offered: false,
    legacy: false,
    legacySourceWorldHash: null,
    offerBoundary: null,
    option: null,
    selectionBoundary: null,
    terms: null,
    journalIndex: null,
    recordedAt: null,
  };
  return {
    ...lead,
    registrationCharacter,
    registrationBoundary,
    registrationProof,
    emptyReliefOathProof,
  };
}

describe("opening lead-source relief-oath chronology", () => {
  it("follows a selected oath exactly and applies source effects to characterAfterOath", () => {
    const fixture = selectedOathLeadFixture();
    const result = proveOpeningLeadSourceJournal({
      scene: journalLeadSourceScene,
      registrationProof: fixture.registrationProof,
      reliefOathProof: fixture.reliefOathProof,
      journalEntries: fixture.entries,
      expectedTown: JOURNAL_TOWN,
    });

    expect(result.selectionBoundary).toEqual(fixture.selectionBoundary);
    expect(result.characterAfterSource.knowledge).toContain(
      "albany:knowledge_wolf_unaffiliated_bond",
    );
    expect(result.characterAfterSource.knowledge).toContain(
      "albany:knowledge_wolf_market_testimony",
    );
    expect(result.characterAfterSource.promises).toContainEqual({
      promiseId: "albany:promise_wolf_unaffiliated_bond",
      recipientId: "albany:rowan_quill",
      status: "active",
    });

    const separated = structuredClone(fixture.entries);
    separated.splice(2, 0, {
      id: "area:interposed_oath",
      kind: "area",
      town: JOURNAL_TOWN,
      title: "Interposed",
      text: "This cannot divide the source offer from the oath.",
      recordedAt: timeLabel(fixture.reliefOathProof.recordedAt!),
    });
    expect(() =>
      proveOpeningLeadSourceJournal({
        scene: journalLeadSourceScene,
        registrationProof: { ...fixture.registrationProof, journalIndex: 5 },
        reliefOathProof: { ...fixture.reliefOathProof, journalIndex: 3 },
        journalEntries: separated,
        expectedTown: JOURNAL_TOWN,
      }),
    ).toThrow(/immediately follow the selected relief oath/i);
  });

  it("follows a trusted oath legacy marker at its exact neutral boundary", () => {
    const fixture = legacyOathLeadFixture();
    const result = proveOpeningLeadSourceJournal({
      scene: journalLeadSourceScene,
      registrationProof: fixture.registrationProof,
      reliefOathProof: fixture.reliefOathProof,
      journalEntries: fixture.entries,
      expectedTown: JOURNAL_TOWN,
    });

    expect(result.option?.id).toBe(JOURNAL_SOURCE_OPTION_ID);
    expect(result.characterAfterSource.knowledge).toContain(
      "albany:knowledge_wolf_market_testimony",
    );
    expect(result.characterAfterSource.knowledge).not.toContain(
      "albany:knowledge_wolf_unaffiliated_bond",
    );

    const forgedBoundary = structuredClone(fixture.entries);
    forgedBoundary[2]!.storyChoiceBoundary!.decisionProofHash = "0".repeat(64);
    expect(() =>
      proveOpeningLeadSourceJournal({
        scene: journalLeadSourceScene,
        registrationProof: fixture.registrationProof,
        reliefOathProof: fixture.reliefOathProof,
        journalEntries: forgedBoundary,
        expectedTown: JOURNAL_TOWN,
      }),
    ).toThrow(/trusted legacy relief-oath marker/i);

    const separated = structuredClone(fixture.entries);
    separated.splice(2, 0, {
      id: "area:interposed_legacy_oath",
      kind: "area",
      town: JOURNAL_TOWN,
      title: "Interposed",
      text: "This cannot divide the source offer from the legacy oath marker.",
      recordedAt: timeLabel(fixture.registrationBoundary.minutes),
    });
    expect(() =>
      proveOpeningLeadSourceJournal({
        scene: journalLeadSourceScene,
        registrationProof: { ...fixture.registrationProof, journalIndex: 4 },
        reliefOathProof: { ...fixture.reliefOathProof, journalIndex: 3 },
        journalEntries: separated,
        expectedTown: JOURNAL_TOWN,
      }),
    ).toThrow(/immediately follow the trusted legacy relief-oath marker/i);
  });

  it("fails closed on an empty oath proof and opens only the explicit migration gap", () => {
    const fixture = registrationAdjacentLeadFixture();
    const withoutOathWorld = proveOpeningLeadSourceJournal({
      scene: journalLeadSourceScene,
      registrationProof: fixture.registrationProof,
      journalEntries: fixture.entries,
      expectedTown: JOURNAL_TOWN,
    });
    expect(withoutOathWorld.option?.id).toBe(JOURNAL_SOURCE_OPTION_ID);

    expect(() =>
      proveOpeningLeadSourceJournal({
        scene: journalLeadSourceScene,
        registrationProof: fixture.registrationProof,
        reliefOathProof: fixture.emptyReliefOathProof,
        journalEntries: fixture.entries,
        expectedTown: JOURNAL_TOWN,
      }),
    ).toThrow(/missing.*relief-oath predecessor.*trusted migration/i);

    const migrated = proveOpeningLeadSourceJournal({
      scene: journalLeadSourceScene,
      registrationProof: fixture.registrationProof,
      reliefOathProof: fixture.emptyReliefOathProof,
      journalEntries: fixture.entries,
      expectedTown: JOURNAL_TOWN,
      allowMissingReliefOathForMigration: true,
    });
    expect(migrated.option?.id).toBe(JOURNAL_SOURCE_OPTION_ID);
    expect(migrated.characterAfterSource.knowledge).toContain(
      "albany:knowledge_wolf_market_testimony",
    );

    const pendingProof: OpeningReliefOathJournalProof = {
      ...fixture.emptyReliefOathProof,
      offered: true,
      offerBoundary: { ...fixture.registrationBoundary },
      recordedAt: fixture.registrationBoundary.minutes,
    };
    expect(() =>
      proveOpeningLeadSourceJournal({
        scene: journalLeadSourceScene,
        registrationProof: fixture.registrationProof,
        reliefOathProof: pendingProof,
        journalEntries: fixture.entries,
        expectedTown: JOURNAL_TOWN,
        allowMissingReliefOathForMigration: true,
      }),
    ).toThrow(/selected or trusted legacy relief-oath predecessor/i);
  });
});
