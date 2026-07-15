import type { OverworldManifest } from "../../../src/world/overworld.js";

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

/** Reconstruct the exact F12 manifest by reversing only F06 relief-allocation authorship. */
export function exactF12World(current: OverworldManifest): OverworldManifest {
  const predecessor = structuredClone(current);
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
