import type { CampaignCharacterState } from "../../../src/world/campaign_character_state.js";
import { DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW } from "../../../src/world/drover_route_fail_forward_legacy.js";
import type { OverworldManifest } from "../../../src/world/overworld.js";
import { FROST_JAMB_SIGNPOST_PREDECESSOR_COPY } from "../../../src/world/frost_jamb_signpost_legacy.js";
import { AUTHORED_ALBANY_STATION_PRE_STORY_PREDICATE_PASTURE_CONSEQUENCE } from "../../../src/world/local_job_scene_legacy.js";
import {
  RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW,
  RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY,
} from "../../../src/world/relief_protocol_trigger_copy_legacy.js";
import type { OverworldSessionSnapshot } from "../../../src/world/session_snapshot.js";

type ComparisonCardOption = { id: string; tradeoff?: string };

function comparisonCardOptionGroups(world: OverworldManifest): ComparisonCardOption[][] {
  return [
    world.opening_registration?.profiles ?? [],
    world.opening_relief_oath?.options ?? [],
    world.opening_lead_source?.options ?? [],
    world.opening_preparation?.profiles ?? [],
    world.opening_ally?.options ?? [],
  ];
}

/** Reconstruct the exact manifest before Civic choice cards gained trigger categories. */
export function exactCivicTriggerCategoryPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = structuredClone(current);
  for (const option of [
    ...(predecessor.opening_registration?.profiles ?? []),
    ...(predecessor.opening_relief_oath?.options ?? []),
    ...(predecessor.opening_lead_source?.options ?? []),
  ]) {
    delete option.trigger_category;
  }
  return predecessor;
}

/**
 * Remove the presentation-only fields that did not exist in historical
 * manifests reconstructed from the current world.
 */
export function withoutJourneyComparisonCards(world: OverworldManifest): OverworldManifest {
  const historical = structuredClone(world);
  for (const options of comparisonCardOptionGroups(historical)) {
    for (const option of options) delete option.tradeoff;
  }
  return historical;
}

/**
 * Current replay parsers require comparison-card authoring. Historical fixtures
 * expose it non-enumerably so replay can validate the content without changing
 * the exact serialized manifest hash under test.
 */
export function withRuntimeJourneyComparisonCards(
  historical: OverworldManifest,
  current: OverworldManifest,
): OverworldManifest {
  const historicalGroups = comparisonCardOptionGroups(historical);
  const currentGroups = comparisonCardOptionGroups(current);
  for (const [index, historicalOptions] of historicalGroups.entries()) {
    const currentOptions = currentGroups[index] ?? [];
    for (const option of historicalOptions) {
      const tradeoff = currentOptions.find((candidate) => candidate.id === option.id)?.tradeoff;
      if (!tradeoff) throw new Error(`Current comparison card is missing ${option.id}.`);
      Object.defineProperty(option, "tradeoff", {
        configurable: true,
        enumerable: false,
        value: tradeoff,
        writable: true,
      });
    }
  }
  return historical;
}

function historicalManifestClone(current: OverworldManifest): OverworldManifest {
  return withRuntimeJourneyComparisonCards(
    withoutJourneyComparisonCards(exactCivicTriggerCategoryPredecessor(current)),
    current,
  );
}

const RELIEF_OATH_SERVICE_IDS: ReadonlySet<string> = new Set([
  "albany:full_oath_authority_return_resupply",
  "albany:limited_oath_living_pack_return_rest",
  "albany:unaffiliated_bond_returned_rig_resupply",
]);

const RELIEF_OATH_CHARACTER_VARIANT_IDS: ReadonlySet<string> = new Set([
  "wolf_full_duty_kept",
  "wolf_full_duty_broken",
  "wolf_limited_duty_kept",
  "wolf_limited_duty_bent",
  "wolf_unaffiliated_bond_kept",
  "wolf_unaffiliated_bond_broken",
  "wolf_full_compact_duty_selected",
  "wolf_limited_aid_only_selected",
  "wolf_unaffiliated_bond_selected",
]);

const RELIEF_OATH_IMPORT_IDS: ReadonlySet<string> = new Set([
  "import:wolf_winter_full_compact_duty",
  "import:wolf_winter_limited_aid_only",
  "import:wolf_winter_unaffiliated_bond",
]);

const RELIEF_OATH_CONDITIONAL_EFFECT_IDS: ReadonlySet<string> = new Set([
  "albany:close_unaffiliated_courier_emergency_tag",
  "albany:resolve_full_relief_oath",
  "albany:resolve_limited_relief_oath",
  "albany:resolve_unaffiliated_relief_bond",
]);

const RELIEF_ALLOCATION_SERVICE_IDS: ReadonlySet<string> = new Set([
  "albany:resident_shelter_return_rest",
  "albany:mobile_reserve_return_resupply",
]);

const RELIEF_ALLOCATION_CHARACTER_VARIANT_IDS: ReadonlySet<string> = new Set([
  "relief_resident_shelter_allocated",
  "relief_mobile_reserve_allocated",
  "relief_cade_fodder_allocated",
]);

const RELIEF_ALLOCATION_IMPORT_IDS: ReadonlySet<string> = new Set([
  "import:wolf_winter_relief_cade_fodder",
  "import:wolf_winter_relief_resident_shelter",
  "import:wolf_winter_relief_mobile_reserve",
]);

const JUNE_LEFT_AFTER_BLOOD_PREDECESSOR_SUMMARY =
  "June's field seat is empty. Her separate return says the route crossed into combat before she could take the lower rail, ending the cattle-first field agreement.";

const CIVIC_PREPARATION_MESSAGE =
  "The hill dispatch can carry one specialist allocation before it leaves Rowan's counter. Reese Pryce can mark a cold-set repair sequence onto the failing paling, Emery Sloane can map a drover's cut that peels a fouled yearling away from the herd, or Jamie Tanner can seal a relief protocol for calming the cattle after an improvised recovery. Each plan remains usable by any registered traveler, but the provider who sponsored your registration can waive the public charge and shorten the handoff. Choose one: Albany cannot put three incompatible field plans into the same urgent packet.";

const CADE_RETURN_PACKET_SERVICE_IDS: ReadonlySet<string> = new Set([
  "albany:cade_paling_rebuild_works_rest",
  "albany:cade_evacuation_line_works_rest",
  "albany:cade_pasture_search_greenway_resupply",
  "albany:cade_pasture_search_unaffiliated_greenway_resupply",
]);

const CAMPUS_EVIDENCE_MANDATE_SERVICE_IDS: ReadonlySet<string> = new Set([
  "albany:campus_clinic_threshold_card_rest",
  "albany:campus_clinic_threshold_card_drover_rest",
  "albany:campus_traceable_route_digest_resupply",
  "albany:campus_traceable_route_digest_mobile_resupply",
]);

/**
 * Reconstruct the exact manifest before the bloodied-byre evacuation outcome
 * shipped. Every older exact-world helper must pass through this newest layer
 * first so later authored additions cannot leak backward into historical hashes.
 */
export function exactBloodiedByreEvacuationPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = exactCivicTriggerCategoryPredecessor(current);
  const emery = predecessor.characters.find(
    (candidate) => candidate.id === "albany_city__greenway__contact",
  );
  const wolf = predecessor.quests.find((candidate) => candidate.id === "wolf_winter");
  if (!emery?.variants || !wolf?.campaign_exports) {
    throw new Error(
      "Bloodied-byre evacuation predecessor requires Emery and Wolf-Winter campaign exports.",
    );
  }
  emery.variants = emery.variants.filter(
    (variant) => variant.id !== "wolf_bloodied_byre_evacuated",
  );
  wolf.campaign_exports = wolf.campaign_exports.filter(
    (campaignExport) => campaignExport.ending_id !== "ending_bloodied_byre_evacuated",
  );
  return predecessor;
}

/** Reconstruct the exact manifest before witnessed Station wound care shipped. */
export function exactWoundCarePredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactBloodiedByreEvacuationPredecessor(current);
  predecessor.campaign_service_rules = (predecessor.campaign_service_rules ?? []).filter(
    (rule) => rule.id !== "albany:cade_witnessed_gate_wound_station_care",
  );
  const options = predecessor.local_jobs.find((job) => job.id === "albany_city__greenway__job")
    ?.authored_scene?.options;
  if (!options) {
    throw new Error("Wound-care predecessor requires the Greenway corridor survey.");
  }
  const exactOption = (id: string) => {
    const option = options.find((candidate) => candidate.id === id);
    if (!option) throw new Error(`Wound-care predecessor requires Greenway option "${id}".`);
    return option;
  };
  exactOption("stake_shortest_accessible_detour").preview =
    "Spend 30 minutes staking the shortest passable public detour. Earn 3 Capital / Mohawk renown—enough after the truthful Wolf-Winter return and trail policy to reach Rowan's 13-standing Civic recovery threshold.";
  const publicDeep = exactOption("map_all_weather_public_loop");
  publicDeep.preview =
    "Spend 75 minutes mapping accessible grades, thaw drainage, and public crossings. Earn 5 Capital / Mohawk renown.";
  delete publicDeep.character_conditions;
  exactOption("reset_steward_markers").preview =
    "Spend 20 minutes resetting the minimum low-profile corridor marks. Earn 1 Capital / Mohawk renown.";
  const quietDeep = exactOption("trace_winter_wildlife_corridor_with_witness_points");
  quietDeep.preview =
    "Spend 60 minutes tracing winter movement and witnessed steward points without posting a public route. Earn 4 Capital / Mohawk renown.";
  delete quietDeep.character_conditions;
  return predecessor;
}

/** Reconstruct the exact manifest before the Station preparation comparison changed. */
export function exactReliefProtocolTriggerCopyPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = exactRegistrationPromiseClosurePredecessor(current);
  const preparation = predecessor.opening_preparation;
  const relief = preparation?.profiles.find(
    (profile) => profile.id === "albany:prep_relief_protocol",
  );
  if (!preparation || !relief) {
    throw new Error("Albany must retain Jamie's Relief Protocol preparation");
  }
  for (const option of predecessor.opening_relief_allocation?.options ?? []) {
    Reflect.deleteProperty(option, "trigger_category");
  }
  for (const profile of preparation.profiles) {
    Reflect.deleteProperty(profile, "trigger_category");
  }
  relief.summary = RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY;
  relief.preview = RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW;
  return predecessor;
}

/** Reconstruct the exact manifest before Relief Allocation comparison categories. */
export function exactReliefAllocationTriggerCategoryPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = exactRegistrationPromiseClosurePredecessor(current);
  const allocation = predecessor.opening_relief_allocation;
  if (!allocation) {
    throw new Error("Albany must retain the Wolf-Winter Relief Allocation");
  }
  for (const option of allocation.options) {
    Reflect.deleteProperty(option, "trigger_category");
  }
  return predecessor;
}

const REGISTRATION_PROMISE_CLOSURE_GROUP_IDS: ReadonlySet<string> = new Set([
  "albany:close_road_warden_return_packet",
  "albany:close_ledger_advocate_relief_account",
  "albany:close_ironhands_repairer_tools",
]);
const REGISTRATION_PROMISE_CLOSURE_BY_BACKGROUND: ReadonlyMap<string, string> = new Map([
  ["albany:road_warden", "albany:promise_return_hayden_packet"],
  ["albany:ledger_advocate", "albany:promise_truthful_relief_account"],
  ["albany:ironhands_repairer", "albany:promise_return_reese_tools"],
]);

/** Reconstruct the exact manifest before failed Drover checks became pressure-neutral. */
export function exactDroverRouteFailForwardPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = exactAlbanyCampusEventPredecessor(current);
  const preparation = predecessor.opening_preparation;
  const drover = preparation?.profiles.find((profile) => profile.id === "albany:prep_drover_route");
  if (!preparation || !drover) {
    throw new Error("Albany must retain Emery's Drover Route preparation");
  }
  for (const profile of preparation.profiles) {
    Reflect.deleteProperty(profile, "check_disclosure");
  }
  drover.preview = DROVER_ROUTE_FAIL_FORWARD_PREDECESSOR_PREVIEW;
  return predecessor;
}

/** Reconstruct the exact manifest before three background obligations closed on return. */
export function exactRegistrationPromiseClosurePredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = exactDroverRouteFailForwardPredecessor(current);
  const wolf = predecessor.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf?.campaign_exports) {
    throw new Error("Albany must retain Wolf-Winter's campaign exports");
  }
  for (const campaignExport of wolf.campaign_exports) {
    campaignExport.conditional_effects = campaignExport.conditional_effects?.filter(
      (group) => !REGISTRATION_PROMISE_CLOSURE_GROUP_IDS.has(group.id),
    );
  }
  return predecessor;
}

/** Reconstruct the exact manifest before Emery split bloodshed custody from quiet corridor work. */
export function exactEmeryEvidenceCustodyPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = exactWoundCarePredecessor(current);
  const emery = predecessor.characters.find(
    (candidate) => candidate.id === "albany_city__greenway__contact",
  );
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__greenway__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__greenway__job",
  );
  const wolf = predecessor.quests.find((candidate) => candidate.id === "wolf_winter");
  if (!emery || !event?.authored_scene || !job?.authored_scene || !wolf?.campaign_exports) {
    throw new Error("Emery evidence-custody predecessor requires the Greenway and Wolf-Winter.");
  }

  emery.variants = emery.variants?.filter((variant) => variant.id !== "wolf_full_combat_bloodshed");
  const hybridIndex = emery.variants?.findIndex(
    (variant) => variant.id === "wolf_pack_diverted_after_blood",
  );
  if (hybridIndex === undefined || hybridIndex < 0 || !emery.variants) {
    throw new Error("Emery must retain the hybrid after-blood variant.");
  }
  const [hybrid] = emery.variants.splice(hybridIndex, 1);
  const droverIndex = emery.variants.findIndex(
    (variant) => variant.id === "wolf_drover_route_allocated",
  );
  if (!hybrid || droverIndex < 0) {
    throw new Error("Emery predecessor requires the hybrid and drover variants.");
  }
  hybrid.agenda =
    "Emery will not call the result clean or useless; recovering the missing cattle and watching the two surviving wolves now outrank either reward or reprisal.";
  emery.variants.splice(droverIndex + 1, 0, hybrid);
  event.authored_scene.prompt =
    "Emery can post an obvious accessible public detour that any traveler can follow, or keep the crossing low-profile with quiet steward markers that preserve the wildlife corridor. Both make today's damaged junction safe, but the policy is public and irreversible: the later corridor survey must carry the same access promise into the field.";
  event.authored_scene.options = event.authored_scene.options.filter(
    (option) => option.id !== "open_bloodshed_evidence_custody",
  );
  const quiet = event.authored_scene.options.find(
    (option) => option.id === "place_quiet_corridor_markers",
  );
  if (!quiet) throw new Error("Emery must retain the quiet corridor option.");
  delete quiet.forbids_any_world_facts;

  job.summary =
    "Emery must carry the Greenway's irreversible trail policy from the damaged crossing into a finished corridor survey. Public-detour and quiet-corridor records authorize different field work; neither can be relabeled at the board.";
  job.objective =
    "Complete one survey action that honors the exact Greenway trail policy already entered with Emery.";
  job.reward =
    "Choose a faster field mark or a slower, higher-standing survey record under the policy you actually authored. Public work takes longer but earns more standing than the corresponding quiet-corridor work.";
  job.authored_scene.prompt =
    "Emery opens the permanent trail-policy entry beside the field board. The policy fixes which two survey actions are lawful; within that policy, you may finish a fast practical mark for modest standing or spend longer on a publicly useful record for greater standing.";
  job.authored_scene.options = job.authored_scene.options.filter(
    (option) =>
      option.id !== "secure_minimum_bloodshed_custody_marks" &&
      option.id !== "trace_bloodshed_chain_of_custody_with_witness_points",
  );

  const bloodshedEndings = new Set([
    "ending_pack_diverted_after_blood",
    "ending_held",
    "ending_held_gate_barred",
    "ending_held_timber_saved",
  ]);
  for (const campaignExport of wolf.campaign_exports) {
    if (!bloodshedEndings.has(campaignExport.ending_id)) continue;
    campaignExport.effects = campaignExport.effects.filter(
      (effect) =>
        !(
          (effect.type === "set_world_fact" && effect.fact_id === "fact:wolf_winter_bloodshed") ||
          (effect.type === "remember_relationship" &&
            effect.memory_id === "albany:memory_emery_wolf_full_combat_bloodshed")
        ),
    );
  }
  return predecessor;
}

/** Expected current character after migrating an older completed Wolf return. */
export function registrationPromiseClosureCurrentCharacter(
  historical: CampaignCharacterState,
): CampaignCharacterState {
  const current = structuredClone(historical);
  if (current.background === null) return current;
  const promiseId = REGISTRATION_PROMISE_CLOSURE_BY_BACKGROUND.get(current.background);
  const promise = current.promises.find((candidate) => candidate.promiseId === promiseId);
  if (promise?.status === "active") promise.status = "kept";
  return current;
}

/** Apply the current full-combat Emery consequence to an older replay expectation. */
export function fullCombatEmeryMemoryCurrentCharacter(
  historical: CampaignCharacterState,
  questOutcomes: readonly (readonly [string, string])[],
): CampaignCharacterState {
  const endingId = new Map(questOutcomes).get("wolf_winter");
  if (
    endingId !== "ending_held" &&
    endingId !== "ending_held_gate_barred" &&
    endingId !== "ending_held_timber_saved"
  ) {
    return structuredClone(historical);
  }
  const current = structuredClone(historical);
  let emery = current.relationships.find(
    (relationship) => relationship.npcId === "albany:emery_sloane",
  );
  if (!emery) {
    emery = {
      npcId: "albany:emery_sloane",
      trust: 0,
      regard: 0,
      owesPlayer: 0,
      playerOwes: 0,
      memories: [],
    };
    current.relationships.push(emery);
  }
  emery.trust = Math.max(emery.trust, 4);
  emery.regard = Math.max(emery.regard, 5);
  if (!emery.memories.includes("albany:memory_emery_wolf_full_combat_bloodshed")) {
    emery.memories.push("albany:memory_emery_wolf_full_combat_bloodshed");
  }
  current.relationships.sort((left, right) => left.npcId.localeCompare(right.npcId));
  return current;
}

/** Reverse only the new registration-promise closure in an exact historical snapshot fixture. */
export function exactRegistrationPromiseClosurePredecessorSnapshot(
  current: OverworldSessionSnapshot,
): OverworldSessionSnapshot {
  const predecessor = structuredClone(current);
  const completion = predecessor.journalEntries.find(
    (entry) => entry.id === "quest_done:wolf_winter",
  );
  if (completion) {
    completion.text = completion.text.replace(
      /\s(?:Legacy registration|Registration) receipt —.*$/u,
      "",
    );
  }
  if (
    predecessor.character.background === null ||
    !predecessor.completedQuestIds.includes("wolf_winter")
  ) {
    return predecessor;
  }
  const promiseId = REGISTRATION_PROMISE_CLOSURE_BY_BACKGROUND.get(
    predecessor.character.background,
  );
  if (!promiseId) return predecessor;
  const promise = predecessor.character.promises.find(
    (candidate) => candidate.promiseId === promiseId,
  );
  if (promise?.status === "active") return predecessor;
  if (promise?.status !== "kept") {
    throw new Error(`Expected current registration promise "${promiseId}" to be kept.`);
  }
  promise.status = "active";
  return predecessor;
}

/** Reverse only the persisted Relief Protocol copy for historical fixtures. */
export function exactReliefProtocolTriggerCopyPredecessorSnapshot(
  current: OverworldManifest,
  currentSnapshot: OverworldSessionSnapshot,
): OverworldSessionSnapshot {
  const predecessor = structuredClone(currentSnapshot);
  const preparation = current.opening_preparation;
  const relief = preparation?.profiles.find(
    (profile) => profile.id === "albany:prep_relief_protocol",
  );
  if (!preparation || !relief) {
    throw new Error("Albany must retain Jamie's current Relief Protocol preparation");
  }
  const selectionId = `preparation:${preparation.id}:${relief.id}`;
  predecessor.journalEntries = predecessor.journalEntries.map((entry) => {
    if (entry.id !== selectionId) return entry;
    if (
      entry.kind === "preparation" &&
      entry.text.includes(RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY) &&
      entry.text.includes(RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW)
    ) {
      return entry;
    }
    if (entry.kind !== "preparation") {
      throw new Error(
        `Current Relief Protocol fixture entry "${entry.id}" does not match its exact authored copy.`,
      );
    }
    let text = entry.text;
    for (const [before, after] of [
      [relief.summary, RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY],
      [relief.preview, RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW],
    ] as const) {
      const firstMatch = text.indexOf(before);
      if (firstMatch < 0 || text.indexOf(before, firstMatch + before.length) >= 0) {
        throw new Error(
          `Current Relief Protocol fixture entry "${entry.id}" does not match its exact authored copy.`,
        );
      }
      text = `${text.slice(0, firstMatch)}${after}${text.slice(firstMatch + before.length)}`;
    }
    return { ...entry, text };
  });
  return predecessor;
}

/** Reconstruct the exact manifest before Hayden's frost-jamb route was truthfully signposted. */
export function exactFrostJambSignpostPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactReliefProtocolTriggerCopyPredecessor(current);
  const leadSource = predecessor.opening_lead_source;
  const preparation = predecessor.opening_preparation;
  const haydenSource = leadSource?.options.find(
    (option) => option.id === "albany:source_hayden_frost_report",
  );
  const worksPreparation = preparation?.profiles.find(
    (profile) => profile.id === "albany:prep_works_fortification",
  );
  const hayden = predecessor.characters.find(
    (character) => character.campaign_npc_id === "albany:hayden_hale",
  );
  const frostReportVariant = hayden?.variants?.find(
    (variant) => variant.id === "frost_report_certified",
  );
  if (!leadSource || !haydenSource || !worksPreparation || !frostReportVariant) {
    throw new Error("Albany must retain Hayden's frost report and Reese's Works preparation");
  }
  leadSource.message = FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.leadMessage;
  haydenSource.preview = FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenPreview;
  haydenSource.consequence = FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenConsequence;
  worksPreparation.preview = FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.worksPreview;
  frostReportVariant.agenda = FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenAgenda;
  return predecessor;
}

/**
 * Reverse the current frost signpost journal copy when a regression fixture
 * intentionally reconstructs an older exact-world snapshot from a newer run.
 */
export function exactFrostJambSignpostPredecessorSnapshot(
  current: OverworldManifest,
  currentSnapshot: OverworldSessionSnapshot,
): OverworldSessionSnapshot {
  const predecessor = exactReliefProtocolTriggerCopyPredecessorSnapshot(current, currentSnapshot);
  const leadSource = current.opening_lead_source;
  const preparation = current.opening_preparation;
  const haydenSource = leadSource?.options.find(
    (option) => option.id === "albany:source_hayden_frost_report",
  );
  const worksPreparation = preparation?.profiles.find(
    (profile) => profile.id === "albany:prep_works_fortification",
  );
  const hayden = current.characters.find(
    (character) => character.campaign_npc_id === "albany:hayden_hale",
  );
  const frostReportVariant = hayden?.variants?.find(
    (variant) => variant.id === "frost_report_certified",
  );
  if (
    !leadSource ||
    !preparation ||
    !haydenSource ||
    !worksPreparation ||
    !hayden ||
    !frostReportVariant
  ) {
    throw new Error("Albany must retain the current frost-jamb authored copy");
  }
  const offerId = `lead_source_offer:${leadSource.id}`;
  const haydenSelectionId = `lead_source:${leadSource.id}:${haydenSource.id}`;
  const worksSelectionId = `preparation:${preparation.id}:${worksPreparation.id}`;
  const frostContactId = `talk:${hayden.id}@${frostReportVariant.id}`;
  const currentFrostContactText = `${frostReportVariant.summary ?? hayden.summary} ${frostReportVariant.agenda ?? hayden.agenda}`;
  const predecessorFrostContactText = `${frostReportVariant.summary ?? hayden.summary} ${FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenAgenda}`;

  const replaceExact = (entryId: string, text: string, before: string, after: string): string => {
    const firstMatch = text.indexOf(before);
    if (firstMatch < 0 || text.indexOf(before, firstMatch + before.length) >= 0) {
      throw new Error(
        `Current frost-jamb fixture entry "${entryId}" does not match its exact authored copy.`,
      );
    }
    return `${text.slice(0, firstMatch)}${after}${text.slice(firstMatch + before.length)}`;
  };

  predecessor.journalEntries = predecessor.journalEntries.map((entry) => {
    if (entry.id === offerId) {
      if (
        entry.kind === "lead_source_offer" &&
        entry.text === FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.leadMessage
      ) {
        return entry;
      }
      if (entry.kind !== "lead_source_offer" || entry.text !== leadSource.message) {
        throw new Error(`Current frost-jamb fixture entry "${entry.id}" is not its exact offer.`);
      }
      return { ...entry, text: FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.leadMessage };
    }
    if (entry.id === haydenSelectionId) {
      if (
        entry.text.includes(FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenPreview) &&
        entry.text.includes(FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenConsequence)
      ) {
        return entry;
      }
      const withOldPreview = replaceExact(
        entry.id,
        entry.text,
        haydenSource.preview,
        FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenPreview,
      );
      return {
        ...entry,
        text: replaceExact(
          entry.id,
          withOldPreview,
          haydenSource.consequence,
          FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.haydenConsequence,
        ),
      };
    }
    if (entry.id === worksSelectionId) {
      if (entry.text.includes(FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.worksPreview)) {
        return entry;
      }
      return {
        ...entry,
        text: replaceExact(
          entry.id,
          entry.text,
          worksPreparation.preview,
          FROST_JAMB_SIGNPOST_PREDECESSOR_COPY.worksPreview,
        ),
      };
    }
    if (entry.id === frostContactId || entry.id.startsWith(`${frostContactId}:`)) {
      if (entry.kind === "contact" && entry.text === predecessorFrostContactText) {
        return entry;
      }
      if (entry.kind !== "contact" || entry.text !== currentFrostContactText) {
        throw new Error(
          `Current frost-jamb fixture entry "${entry.id}" is not its exact Hayden contact.`,
        );
      }
      return { ...entry, text: predecessorFrostContactText };
    }
    return entry;
  });
  return predecessor;
}

/** Reconstruct the exact manifest before Cade's structural packet honored dawn dispatch. */
export function exactCadeStoryPredicatePredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactFrostJambSignpostPredecessor(current);
  const scene = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__transport_hub__job",
  )?.authored_scene;
  if (!scene) throw new Error("Albany Station must have Cade's authored return packet");
  for (const option of scene.options) {
    if (option.id === "dispatch_pasture_search") {
      option.consequence = AUTHORED_ALBANY_STATION_PRE_STORY_PREDICATE_PASTURE_CONSEQUENCE;
    }
    if (option.id !== "dispatch_paling_rebuild" && option.id !== "dispatch_evacuation_line") {
      continue;
    }
    delete option.requires_all_story_choices;
    delete option.forbids_any_story_choices;
  }
  return predecessor;
}

/** Reconstruct the exact manifest immediately before Works gained its hazard-shift charter. */
export function exactAlbanyWorksHazardPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactCadeStoryPredicatePredecessor(current);
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__industrial__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__industrial__job",
  );
  if (!event || !job?.authored_scene) {
    throw new Error("Albany Works event and authored job must exist");
  }
  event.title = "Albany Works District: hazard shift";
  event.summary =
    "Albany Works District is under hazard pressure around locked yards, bad machinery, and crews staying past dusk. Resolving it requires scouting this area, talking to its contact, and investigating on site.";
  delete event.authored_scene;
  job.reward = "Earn 2 or 5 Capital / Mohawk renown according to the Works priority you complete.";
  job.authored_scene.prompt =
    "Reese has a public shift warm behind a jammed safety gate, while the outbound municipal cold-set reserve needs an accountable count before dispatch. You can own only one line before your shift closes; Reese routes the other to his crew.";
  job.authored_scene.options = job.authored_scene.options.filter(
    (option) =>
      option.id === "protect_trapped_public_shift" ||
      option.id === "inventory_outbound_cold_set_stock",
  );
  return predecessor;
}

/** Reconstruct the exact manifest before Station gained its return-filing standard. */
export function exactAlbanyStationEventPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = historicalManifestClone(exactEmeryEvidenceCustodyPredecessor(current));
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__transport_hub__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__transport_hub__job",
  );
  if (!event || !job?.authored_scene) {
    throw new Error("Albany Station event and authored Cade return packet must exist");
  }

  event.title = "Albany Station Quarter: winter relief packet";
  event.summary =
    "A northbound relief packet sits open at the route desk: Rowan's docket mark, Hayden's route pin, no team back from the hill road, Old Cade's cattle penned at a byre, and the weather report worsening. Resolving it requires scouting this area, talking to its contact, and investigating on site.";
  delete event.authored_scene;

  job.summary =
    "Cade's field dispatch is closed, but Hayden's return packet still carries the exact repair, abandoned-line, or missing-cattle claim certified by the Wolf-Winter return.";
  job.objective =
    "Commit Albany's one immediate follow-up crew to one loss the certified Cade return actually left behind.";
  job.reward =
    "Earn 2-4 Capital / Mohawk renown and create one exact downstream recovery or create/consolidate one stores line; any other simultaneous loss remains deferred.";
  job.authored_scene.prompt =
    "Hayden can release one immediate follow-up crew before the next snow closes the hill road. Every available option below comes from the certified Cade return. If two losses remain, choosing one retires this packet and leaves the other honestly deferred.";
  job.authored_scene.options = job.authored_scene.options.filter(
    (option) =>
      option.id !== "close_packet_under_route_abstract" &&
      option.id !== "close_packet_under_witnessed_record",
  );
  return predecessor;
}

/** Reconstruct the exact manifest before Campus gained its return-evidence mandate. */
export function exactAlbanyCampusEventPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactAlbanyStationEventPredecessor(current);
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__campus__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__campus__job",
  );
  if (!event || !job?.authored_scene) {
    throw new Error("Albany Campus event and authored archive job must exist");
  }

  event.title = "Albany Campus Row: missing research request";
  event.summary =
    "Albany Campus Row is under rumor pressure around old maps, clinic notes, and experts with narrow hours. Resolving it requires scouting this area, talking to its contact, and investigating on site.";
  delete event.authored_scene;

  job.summary =
    "After Wolf-Winter closes, Blair can either send a fast confidence-labelled warning to road crews or preserve the uncertain route evidence as a traceable field archive. The choice is operational, not a Civic public-versus-protected policy.";
  job.reward =
    "Choose either 2 Capital / Mohawk renown for a 35-minute calibrated warning or 5 renown for a 75-minute traceable archive, with one exclusive 15-minute Campus service after each exact proof.";
  job.authored_scene.options = job.authored_scene.options.filter(
    (option) =>
      option.id === "issue_calibrated_road_warning" ||
      option.id === "prepare_traceable_field_archive",
  );

  predecessor.campaign_service_rules = (predecessor.campaign_service_rules ?? []).filter(
    (rule) => !CAMPUS_EVIDENCE_MANDATE_SERVICE_IDS.has(rule.id),
  );
  for (const rule of predecessor.campaign_service_rules ?? []) {
    if (
      rule.id !== "albany:mobile_reserve_return_resupply" &&
      rule.id !== "albany:wolf_drover_route_return_rest"
    ) {
      continue;
    }
    rule.forbids_any_local_job_options = rule.forbids_any_local_job_options?.filter(
      (condition) =>
        condition.option_id !== "issue_clinic_threshold_card" &&
        condition.option_id !== "index_traceable_route_digest",
    );
  }
  return predecessor;
}

/** Reconstruct the Market-authored manifest immediately before Greenway's causal pair. */
export function exactAlbanyGreenwayDepthPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactAlbanyWorksHazardPredecessor(current);
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__greenway__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__greenway__job",
  );
  if (!event || !job) throw new Error("Albany Greenway event and job must exist");
  event.title = "Albany Greenway: trail sign damage";
  event.summary =
    "Albany Greenway is under hazard pressure around tracks, utility cuts, and witnesses who avoid main streets. Resolving it requires scouting this area, talking to its contact, and investigating on site.";
  delete event.authored_scene;
  job.title = "Albany Greenway: Greenway Survey";
  job.summary =
    "Albany Greenway has trailheads, utility cuts, camps, and quiet witnesses. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.";
  job.objective =
    "Spend time in Albany Greenway to walk the paths, mark fresh tracks, and confirm which approach is still passable.";
  job.reward = "Earn 4 Capital / Mohawk renown and a concrete lead about Albany City.";
  delete job.authored_scene;
  return predecessor;
}

/** Reconstruct the foundation manifest immediately before Albany Market's policy pair. */
export function exactAlbanyMarketDepthPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactAlbanyGreenwayDepthPredecessor(current);
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__market__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__market__job",
  );
  if (!event || !job) throw new Error("Albany Market event and job must exist");
  event.title = "Albany Market Streets: supply price spike";
  event.summary =
    "Albany Market Streets is under opportunity pressure around shortages, disputed deliveries, and late counters. Resolving it requires scouting this area, talking to its contact, and investigating on site.";
  delete event.authored_scene;
  job.title = "Albany Market Streets: Market Shortfall";
  job.summary =
    "Albany Market Streets has trade gossip, missing crates, and practical bargaining. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.";
  job.objective =
    "Spend time in Albany Market Streets to move supplies between stalls, kitchens, and a buyer who cannot wait for a formal posting.";
  job.reward = "Earn 3 Capital / Mohawk renown and a concrete lead about Albany City.";
  delete job.authored_scene;
  return predecessor;
}

/** Reconstruct the exact manifest immediately before Cade's authored Station return packet. */
export function exactCadeReturnPacketPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactAlbanyMarketDepthPredecessor(current);
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__transport_hub__job",
  );
  if (!job) throw new Error("Albany Station must have its local job");
  job.title = "Albany Station Quarter: Relief Packet";
  job.summary =
    "Drivers and dispatchers sort road reports beside crates marked for hill farms; one packet keeps returning with the words wolf-winter penciled on the tag.";
  job.objective =
    "Spend time in Albany Station Quarter to match route notes, passenger names, and weather warnings to the relief wagon that never checked in.";
  job.reward =
    "Earn 4 Capital / Mohawk renown and a concrete lead about Albany's hill-country relief work.";
  delete job.authored_scene;
  predecessor.campaign_service_rules = (predecessor.campaign_service_rules ?? []).filter(
    (rule) => !CADE_RETURN_PACKET_SERVICE_IDS.has(rule.id),
  );
  const unaffiliated = predecessor.campaign_service_rules?.find(
    (rule) => rule.id === "albany:unaffiliated_bond_returned_rig_resupply",
  );
  if (!unaffiliated) throw new Error("Albany must retain its unaffiliated return service");
  delete unaffiliated.forbids_any_local_job_options;
  return predecessor;
}

/** Reconstruct the manifest immediately before preparation moved to the Station board. */
export function exactCivicPreparationPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactCadeReturnPacketPredecessor(current);
  const preparation = predecessor.opening_preparation;
  if (!preparation) throw new Error("Albany must have Wolf-Winter preparation");
  preparation.area = "albany_city__civic_core";
  preparation.message = CIVIC_PREPARATION_MESSAGE;
  return predecessor;
}

/** Reconstruct ff630a1e, immediately before the Winter Return Docket conversion. */
export function exactWinterReturnDocketPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactCampusArchiveQueryPredecessor(current);
  const event = predecessor.local_events.find(
    (candidate) => candidate.id === "albany_city__civic_core__event",
  );
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__civic_core__job",
  );
  if (!event || !job) throw new Error("Albany Civic event and job must exist");
  delete event.authored_scene;
  job.title = "Albany Civic Center: Civic Ledger Run";
  job.summary =
    "The Civic Ledger Run is not make-work: a relief petition, a market license, and a basement seal all need matching before noon.";
  job.objective =
    "Verify the Notice Hall mark, witness names, and counter records before Rowan has to close the file.";
  job.reward = "Earn 3 Capital / Mohawk renown and leave with a cleaner Albany lead.";
  delete job.authored_scene;
  return predecessor;
}

/** Reconstruct the exact manifest immediately before Albany Campus got its authored archive query. */
export function exactCampusArchiveQueryPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactCivicPreparationPredecessor(current);
  const job = predecessor.local_jobs.find(
    (candidate) => candidate.id === "albany_city__campus__job",
  );
  if (!job) throw new Error("Albany Campus must have its local job");
  job.title = "Albany Campus Row: Archive Query";
  job.summary =
    "Albany Campus Row has archives, labs, libraries, and student messengers. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.";
  job.objective =
    "Spend time in Albany Campus Row to compare notes, maps, and local testimony for a researcher who needs field confirmation.";
  job.reward = "Earn 4 Capital / Mohawk renown and a concrete lead about Albany City.";
  delete job.authored_scene;
  const contact = predecessor.characters.find(
    (candidate) => candidate.id === "albany_city__campus__contact",
  );
  if (!contact) throw new Error("Albany Campus must have Blair's contact");
  contact.summary =
    "Blair Drake works as the field archivist in Albany Campus Row, watching how old maps, clinic notes, and experts with narrow hours affect Albany city.";
  contact.agenda =
    "Wants a traveler to handle Albany Campus Row's local problems before they spread through the Capital / Mohawk road network.";
  predecessor.campaign_service_rules = (predecessor.campaign_service_rules ?? []).filter(
    (rule) =>
      rule.id !== "albany:campus_calibrated_warning_rest" &&
      rule.id !== "albany:campus_calibrated_warning_drover_rest" &&
      rule.id !== "albany:campus_traceable_archive_resupply" &&
      rule.id !== "albany:campus_traceable_archive_mobile_resupply",
  );
  for (const rule of predecessor.campaign_service_rules ?? []) {
    delete rule.forbids_any_local_job_options;
  }
  return predecessor;
}

/** Reconstruct the exact first-authored-scene manifest before its renown consumer was added. */
export function exactAuthoredAlbanyWorksFirstSceneWorld(
  current: OverworldManifest,
): OverworldManifest {
  const firstScene = exactWinterReturnDocketPredecessor(current);
  firstScene.campaign_service_rules = (firstScene.campaign_service_rules ?? []).filter(
    (rule) => rule.id !== "albany:works_public_shift_civic_rest",
  );
  return firstScene;
}

/** Reconstruct the exact manifest immediately before the first authored local-job scene. */
export function exactAuthoredAlbanyWorksPredecessor(current: OverworldManifest): OverworldManifest {
  const predecessor = exactAuthoredAlbanyWorksFirstSceneWorld(current);
  const worksJob = predecessor.local_jobs.find((job) => job.id === "albany_city__industrial__job");
  if (!worksJob) throw new Error("Albany Works must have its local job");
  worksJob.title = "Albany Works District: Works Yard Repair";
  worksJob.summary =
    "Albany Works District has loading doors, tools, machine noise, and labor disputes. The job is small enough to finish locally but specific enough to make Albany City feel worked-in rather than decorative.";
  worksJob.objective =
    "Spend time in Albany Works District to trace a failing piece of infrastructure before it turns into a wider hazard.";
  worksJob.reward = "Earn 4 Capital / Mohawk renown and a concrete lead about Albany City.";
  delete worksJob.authored_scene;
  return predecessor;
}

/** Reconstruct exact F06 by restoring its return copy and reversing F02 oath authorship. */
export function exactF06World(current: OverworldManifest): OverworldManifest {
  const predecessor = exactAuthoredAlbanyWorksPredecessor(current);
  const june = predecessor.characters.find(
    (character) => character.id === "albany_city__transport_hub__june_pike",
  );
  const leftAfterBlood = june?.variants?.find((variant) => variant.id === "left_after_blood");
  if (!leftAfterBlood) throw new Error("June must have a left-after-blood presentation");
  leftAfterBlood.summary = JUNE_LEFT_AFTER_BLOOD_PREDECESSOR_SUMMARY;
  delete predecessor.opening_relief_oath;
  predecessor.campaign_service_rules = (predecessor.campaign_service_rules ?? []).filter(
    (rule) => !RELIEF_OATH_SERVICE_IDS.has(rule.id),
  );
  for (const character of predecessor.characters) {
    if (!character.variants) continue;
    character.variants = character.variants.filter(
      (variant) => !RELIEF_OATH_CHARACTER_VARIANT_IDS.has(variant.id),
    );
  }
  const wolf = predecessor.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf?.campaign_imports || !wolf.campaign_exports) {
    throw new Error("Wolf-Winter must have campaign imports and exports");
  }
  wolf.campaign_imports.rules = wolf.campaign_imports.rules.filter(
    (rule) => !RELIEF_OATH_IMPORT_IDS.has(rule.id),
  );
  for (const campaignExport of wolf.campaign_exports) {
    campaignExport.conditional_effects = campaignExport.conditional_effects?.filter(
      (group) => !RELIEF_OATH_CONDITIONAL_EFFECT_IDS.has(group.id),
    );
  }
  return predecessor;
}

/** Reconstruct exact F12 by reversing F02 oath and F06 relief-allocation authorship. */
export function exactF12World(current: OverworldManifest): OverworldManifest {
  const predecessor = exactF06World(current);
  delete predecessor.opening_relief_allocation;
  predecessor.campaign_service_rules = (predecessor.campaign_service_rules ?? []).filter(
    (rule) => !RELIEF_ALLOCATION_SERVICE_IDS.has(rule.id),
  );
  for (const character of predecessor.characters) {
    if (!character.variants) continue;
    character.variants = character.variants.filter(
      (variant) => !RELIEF_ALLOCATION_CHARACTER_VARIANT_IDS.has(variant.id),
    );
  }
  const wolf = predecessor.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf?.campaign_imports) throw new Error("Wolf-Winter must have campaign imports");
  wolf.campaign_imports.rules = wolf.campaign_imports.rules.filter(
    (rule) => !RELIEF_ALLOCATION_IMPORT_IDS.has(rule.id),
  );
  return predecessor;
}

/** Reconstruct F11 from exact F12 by reversing the hill-approach launch layer. */
export function exactF11World(current: OverworldManifest): OverworldManifest {
  const predecessor = exactF12World(current);
  const wolf = predecessor.quests.find((quest) => quest.id === "wolf_winter");
  if (!wolf?.campaign_imports) throw new Error("Wolf-Winter must have campaign imports");
  delete wolf.launch;
  wolf.campaign_imports.rules = wolf.campaign_imports.rules.filter(
    (rule) => !rule.id.startsWith("import:wolf_winter_approach_"),
  );
  return predecessor;
}
