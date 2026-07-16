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

/** Reconstruct the exact F06 manifest by reversing only F02 relief-oath authorship. */
export function exactF06World(current: OverworldManifest): OverworldManifest {
  const predecessor = structuredClone(current);
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
