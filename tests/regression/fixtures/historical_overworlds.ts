import type { OverworldManifest } from "../../../src/world/overworld.js";

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
  const predecessor = structuredClone(current);
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
