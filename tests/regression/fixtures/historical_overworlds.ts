import type { OverworldManifest } from "../../../src/world/overworld.js";
import { FROST_JAMB_SIGNPOST_PREDECESSOR_COPY } from "../../../src/world/frost_jamb_signpost_legacy.js";
import { AUTHORED_ALBANY_STATION_PRE_STORY_PREDICATE_PASTURE_CONSEQUENCE } from "../../../src/world/local_job_scene_legacy.js";
import {
  RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW,
  RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY,
} from "../../../src/world/relief_protocol_trigger_copy_legacy.js";
import type { OverworldSessionSnapshot } from "../../../src/world/session_snapshot.js";

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

/** Reconstruct the exact manifest before the Station preparation comparison changed. */
export function exactReliefProtocolTriggerCopyPredecessor(
  current: OverworldManifest,
): OverworldManifest {
  const predecessor = structuredClone(current);
  const preparation = predecessor.opening_preparation;
  const relief = preparation?.profiles.find(
    (profile) => profile.id === "albany:prep_relief_protocol",
  );
  if (!preparation || !relief) {
    throw new Error("Albany must retain Jamie's Relief Protocol preparation");
  }
  for (const profile of preparation.profiles) {
    Reflect.deleteProperty(profile, "trigger_category");
  }
  relief.summary = RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_SUMMARY;
  relief.preview = RELIEF_PROTOCOL_TRIGGER_COPY_PREDECESSOR_PREVIEW;
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
