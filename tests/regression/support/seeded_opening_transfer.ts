import type { RpgPack, Interaction } from "../../../src/rpg/schema.js";
import { hashState } from "../../../src/core/hash.js";

type PathPart = string | number;

type ExactReference = Readonly<{
  path: readonly PathPart[];
  value: string;
}>;

type FamilyKind = "hunt" | "lure" | "drive" | "fortify";

type FamilyCertificate = Readonly<{
  kind: FamilyKind;
  flag: string;
  objectId: string;
  matchingCount: number;
  ordinaryCount: number;
  itemIds: readonly string[];
  ordinaryFailureByCommand: Readonly<Record<string, string>>;
}>;

type TransferCertificate = Readonly<{
  packId: string;
  families: readonly FamilyCertificate[];
  /** Exact non-mechanical AST reads. Moving, adding, or deleting one requires review. */
  presentationReferences: readonly string[];
  /** Exact full interaction contexts after removing only the seeded polarity leaf. */
  mechanicalContexts: readonly string[];
  /** Exact durable ordinary failure and conditional-failure subgraphs (a sorted multiset). */
  ordinaryFailureSignatures: readonly string[];
}>;

export type SeededOpeningTransferSupport = Readonly<{
  /** True only when this pack declares seeded openings and passed the narrow certificate. */
  certified: boolean;
  /** A proof must fail when this is true. */
  unsupported: boolean;
  /** Exact, player-actionable reasons the certificate failed. */
  diagnostics: readonly string[];
  /** Non-mechanical text-selection reads found by the recursive census. */
  presentationReads: number;
  /** Approved interaction-condition reads found by the recursive census. */
  mechanicalReads: number;
}>;

const WOLF_WINTER_CERTIFICATE: TransferCertificate = {
  packId: "wolf_winter_v1",
  families: [
    {
      kind: "hunt",
      flag: "opening_condition_firm_frozen_rail",
      objectId: "paling_rail",
      matchingCount: 1,
      ordinaryCount: 2,
      itemIds: [],
      ordinaryFailureByCommand: {
        "set:": "works_fortification_splice_needed",
        "wedge:": "rail_split",
      },
    },
    {
      kind: "lure",
      flag: "opening_condition_steady_scent_channel",
      objectId: "downwind_feed_line",
      matchingCount: 4,
      ordinaryCount: 4,
      itemIds: ["winter_feed_sack"],
      ordinaryFailureByCommand: { "lay:winter_feed_sack": "lure_trail_fouled" },
    },
    {
      kind: "drive",
      flag: "opening_condition_open_ash_lane",
      objectId: "drive_breach_signal",
      matchingCount: 1,
      ordinaryCount: 2,
      itemIds: ["drive_signal_rope_kit"],
      ordinaryFailureByCommand: { "fire:drive_signal_rope_kit": "drive_opening_fouled" },
    },
    {
      kind: "fortify",
      flag: "opening_condition_sound_lower_frame",
      objectId: "fortify_outer_seal",
      matchingCount: 2,
      ordinaryCount: 6,
      itemIds: ["cade_household_shutters", "albany_relief_seals"],
      ordinaryFailureByCommand: {
        "seat:cade_household_shutters": "fortify_outer_seal_failed",
        "seat:albany_relief_seals": "fortify_outer_seal_failed",
      },
    },
  ],
  presentationReferences: [
    "rooms[1].variants[11].when[0].has_flag=opening_condition_firm_frozen_rail",
    "rooms[4].variants[1].when[0].has_flag=opening_condition_firm_frozen_rail",
    "rooms[4].variants[41].when[0].has_flag=opening_condition_sound_lower_frame",
    "rooms[4].variants[42].when[0].has_flag=opening_condition_sound_lower_frame",
    "rooms[4].variants[43].when[2].not_flag=opening_condition_sound_lower_frame",
    "rooms[4].variants[44].when[2].not_flag=opening_condition_sound_lower_frame",
    "objects[0].variants[0].when[0].has_flag=opening_condition_firm_frozen_rail",
    "objects[0].variants[1].when[0].has_flag=opening_condition_steady_scent_channel",
    "objects[0].variants[2].when[0].has_flag=opening_condition_open_ash_lane",
    "objects[0].variants[3].when[0].has_flag=opening_condition_sound_lower_frame",
    "objects[1].variants[0].when[0].has_flag=opening_condition_firm_frozen_rail",
    "objects[1].variants[1].when[0].has_flag=opening_condition_steady_scent_channel",
    "objects[1].variants[2].when[0].has_flag=opening_condition_open_ash_lane",
    "objects[1].variants[3].when[0].has_flag=opening_condition_sound_lower_frame",
    "objects[6].variants[0].when[0].has_flag=opening_condition_open_ash_lane",
    "objects[18].variants[0].when[0].has_flag=opening_condition_sound_lower_frame",
    "objects[25].variants[0].when[0].has_flag=opening_condition_steady_scent_channel",
    "objects[35].variants[0].when[0].has_flag=opening_condition_firm_frozen_rail",
    "npcs[0].dialogue.nodes[0].variants[2].when[1].has_flag=opening_condition_open_ash_lane",
    "npcs[0].dialogue.nodes[0].variants[6].when[1].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[0].variants[8].when[1].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[0].variants[9].when[1].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[0].append_variants[0].when[0].has_flag=opening_condition_firm_frozen_rail",
    "npcs[0].dialogue.nodes[0].append_variants[1].when[0].has_flag=opening_condition_steady_scent_channel",
    "npcs[0].dialogue.nodes[0].append_variants[2].when[0].has_flag=opening_condition_open_ash_lane",
    "npcs[0].dialogue.nodes[0].append_variants[3].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[2].append_variants[0].when[1].has_flag=opening_condition_steady_scent_channel",
    "npcs[0].dialogue.nodes[2].append_variants[1].when[1].has_flag=opening_condition_open_ash_lane",
    "npcs[0].dialogue.nodes[2].append_variants[2].when[1].not_flag=opening_condition_steady_scent_channel",
    "npcs[0].dialogue.nodes[2].append_variants[2].when[2].not_flag=opening_condition_open_ash_lane",
    "npcs[0].dialogue.nodes[2].append_variants[2].when[3].not_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[2].append_variants[3].when[1].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[2].append_variants[6].when[1].not_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[2].append_variants[7].when[1].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[2].append_variants[8].when[1].not_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[2].append_variants[9].when[1].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[5].append_variants[0].when[0].has_flag=opening_condition_steady_scent_channel",
    "npcs[0].dialogue.nodes[7].append_variants[0].when[0].has_flag=opening_condition_open_ash_lane",
    "npcs[0].dialogue.nodes[8].append_variants[0].when[0].has_flag=opening_condition_open_ash_lane",
    "npcs[0].dialogue.nodes[9].variants[0].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[9].variants[1].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[9].variants[2].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[9].variants[3].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[10].variants[0].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[10].variants[1].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[11].variants[0].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[11].variants[1].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[11].variants[2].when[0].has_flag=opening_condition_sound_lower_frame",
    "npcs[0].dialogue.nodes[11].variants[3].when[0].has_flag=opening_condition_sound_lower_frame",
  ],
  mechanicalContexts: [
    'opening_condition_open_ash_lane|has_flag|drive_breach_signal|fire|drive_signal_rope_kit|[{"has_item":"drive_signal_rope_kit"},{"has_flag":"strategy_drive_committed"},{"has_flag":"drive_combat_withheld"},{"var_gte":{"name":"drive_kit_charges","value":2}},{"not_flag":"drive_opening_fouled"},{"not_flag":"june_blood_condition_broken"},{"not_flag":"yearling_down"},{"not_flag":"drive_yearling_turned"}]',
    'opening_condition_open_ash_lane|not_flag|drive_breach_signal|fire|drive_signal_rope_kit|[{"has_item":"drive_signal_rope_kit"},{"has_flag":"strategy_drive_committed"},{"has_flag":"drive_combat_withheld"},{"has_flag":"relief_oath_unaffiliated_bond"},{"var_gte":{"name":"drive_kit_charges","value":2}},{"not_flag":"drive_opening_fouled"},{"not_flag":"june_blood_condition_broken"},{"not_flag":"yearling_down"},{"not_flag":"drive_yearling_turned"}]',
    'opening_condition_open_ash_lane|not_flag|drive_breach_signal|fire|drive_signal_rope_kit|[{"has_item":"drive_signal_rope_kit"},{"has_flag":"strategy_drive_committed"},{"has_flag":"drive_combat_withheld"},{"not_flag":"relief_oath_unaffiliated_bond"},{"var_gte":{"name":"drive_kit_charges","value":2}},{"not_flag":"drive_opening_fouled"},{"not_flag":"june_blood_condition_broken"},{"not_flag":"yearling_down"},{"not_flag":"drive_yearling_turned"}]',
    'opening_condition_sound_lower_frame|has_flag|fortify_outer_seal|seat|cade_household_shutters|[{"has_item":"cade_household_shutters"},{"has_flag":"fortify_cade_terms_accepted"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|has_flag|fortify_outer_seal|seat|albany_relief_seals|[{"has_item":"albany_relief_seals"},{"has_flag":"fortify_albany_authority_invoked"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|not_flag|fortify_outer_seal|seat|cade_household_shutters|[{"has_item":"cade_household_shutters"},{"has_flag":"fortify_cade_terms_accepted"},{"has_flag":"works_fortification_prepared"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|not_flag|fortify_outer_seal|seat|cade_household_shutters|[{"has_item":"cade_household_shutters"},{"has_flag":"fortify_cade_terms_accepted"},{"not_flag":"works_fortification_prepared"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|not_flag|fortify_outer_seal|seat|albany_relief_seals|[{"has_item":"albany_relief_seals"},{"has_flag":"fortify_albany_authority_invoked"},{"has_flag":"relief_oath_full_duty"},{"has_flag":"works_fortification_prepared"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|not_flag|fortify_outer_seal|seat|albany_relief_seals|[{"has_item":"albany_relief_seals"},{"has_flag":"fortify_albany_authority_invoked"},{"has_flag":"relief_oath_full_duty"},{"not_flag":"works_fortification_prepared"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|not_flag|fortify_outer_seal|seat|albany_relief_seals|[{"has_item":"albany_relief_seals"},{"has_flag":"fortify_albany_authority_invoked"},{"not_flag":"relief_oath_full_duty"},{"has_flag":"works_fortification_prepared"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_sound_lower_frame|not_flag|fortify_outer_seal|seat|albany_relief_seals|[{"has_item":"albany_relief_seals"},{"has_flag":"fortify_albany_authority_invoked"},{"not_flag":"relief_oath_full_duty"},{"not_flag":"works_fortification_prepared"},{"not_flag":"fortify_outer_seal_attempted"}]',
    'opening_condition_steady_scent_channel|has_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"has_flag":"approach_exposed_ridge"},{"not_flag":"approach_sheltered_stockway"},{"has_flag":"relief_cade_fodder_allocated"},{"not_flag":"relief_resident_shelter_allocated"},{"not_flag":"relief_mobile_reserve_allocated"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|has_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"has_flag":"approach_exposed_ridge"},{"not_flag":"approach_sheltered_stockway"},{"not_flag":"relief_cade_fodder_allocated"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|has_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"has_flag":"approach_sheltered_stockway"},{"not_flag":"approach_exposed_ridge"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|has_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"not_flag":"approach_exposed_ridge"},{"not_flag":"approach_sheltered_stockway"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|not_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"has_flag":"approach_exposed_ridge"},{"not_flag":"approach_sheltered_stockway"},{"has_flag":"relief_cade_fodder_allocated"},{"not_flag":"relief_resident_shelter_allocated"},{"not_flag":"relief_mobile_reserve_allocated"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|not_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"has_flag":"approach_exposed_ridge"},{"not_flag":"approach_sheltered_stockway"},{"not_flag":"relief_cade_fodder_allocated"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|not_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"has_flag":"approach_sheltered_stockway"},{"not_flag":"approach_exposed_ridge"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_steady_scent_channel|not_flag|downwind_feed_line|lay|winter_feed_sack|[{"has_item":"winter_feed_sack"},{"has_flag":"strategy_lure_committed"},{"not_flag":"approach_exposed_ridge"},{"not_flag":"approach_sheltered_stockway"},{"not_flag":"lure_trail_fouled"},{"not_flag":"yearling_down"},{"not_flag":"yearling_redirected"}]',
    'opening_condition_firm_frozen_rail|has_flag|paling_rail|brace||[{"not_flag":"lure_hybrid_combat_entered"},{"not_flag":"rail_attempted"},{"not_flag":"breach_braced"},{"not_flag":"strategy_lure_committed"},{"not_flag":"strategy_drive_committed"},{"not_flag":"strategy_fortify_committed"}]',
    'opening_condition_firm_frozen_rail|not_flag|paling_rail|set||[{"has_flag":"works_fortification_prepared"},{"not_flag":"lure_hybrid_combat_entered"},{"not_flag":"rail_attempted"},{"not_flag":"breach_braced"},{"any_of":[{"all_of":[{"not_flag":"strategy_lure_committed"}]},{"all_of":[{"has_flag":"strategy_lure_committed"},{"has_flag":"lure_trail_fouled"}]}]},{"any_of":[{"not_flag":"strategy_drive_committed"},{"has_flag":"june_blood_condition_broken"}]},{"not_flag":"strategy_fortify_committed"}]',
    'opening_condition_firm_frozen_rail|not_flag|paling_rail|wedge||[{"not_flag":"works_fortification_prepared"},{"not_flag":"lure_hybrid_combat_entered"},{"not_flag":"rail_attempted"},{"not_flag":"breach_braced"},{"any_of":[{"all_of":[{"not_flag":"strategy_lure_committed"}]},{"all_of":[{"has_flag":"strategy_lure_committed"},{"has_flag":"lure_trail_fouled"}]}]},{"any_of":[{"not_flag":"strategy_drive_committed"},{"has_flag":"june_blood_condition_broken"}]},{"not_flag":"strategy_fortify_committed"}]',
  ].sort(),
  ordinaryFailureSignatures: [
    'opening_condition_firm_frozen_rail|paling_rail|set||{"on_failure":[{"set_flag":"works_fortification_splice_needed"}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"},{"not_flag":"strategy_lure_committed"},{"not_flag":"strategy_drive_committed"},{"not_flag":"strategy_fortify_committed"}],"effects":[{"inc_var":{"name":"cattle_alarm","by":1}}]}]}',
    'opening_condition_firm_frozen_rail|paling_rail|wedge||{"on_failure":[{"set_flag":"rail_split"}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"},{"not_flag":"strategy_lure_committed"},{"not_flag":"strategy_drive_committed"},{"not_flag":"strategy_fortify_committed"}],"effects":[{"inc_var":{"name":"cattle_alarm","by":1}}]}]}',
    'opening_condition_steady_scent_channel|downwind_feed_line|lay|winter_feed_sack|{"on_failure":[{"set_flag":"lure_trail_fouled"},{"inc_var":{"name":"cattle_alarm","by":2}}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"}],"effects":[{"inc_var":{"name":"cattle_alarm","by":1}}]}]}',
    ...Array.from(
      { length: 3 },
      () =>
        'opening_condition_steady_scent_channel|downwind_feed_line|lay|winter_feed_sack|{"on_failure":[{"set_flag":"lure_trail_fouled"},{"inc_var":{"name":"cattle_alarm","by":1}}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"}],"effects":[{"inc_var":{"name":"cattle_alarm","by":1}}]}]}',
    ),
    ...Array.from(
      { length: 2 },
      () =>
        'opening_condition_open_ash_lane|drive_breach_signal|fire|drive_signal_rope_kit|{"on_failure":[{"set_flag":"drive_opening_fouled"},{"inc_var":{"name":"pack_drive","by":1}},{"inc_var":{"name":"cattle_alarm","by":1}}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"}],"effects":[{"inc_var":{"name":"cattle_alarm","by":1}}]}]}',
    ),
    ...Array.from(
      { length: 2 },
      () =>
        'opening_condition_sound_lower_frame|fortify_outer_seal|seat|cade_household_shutters|{"on_failure":[{"set_flag":"fortify_outer_seal_failed"},{"inc_var":{"name":"fortification_pressure","by":1}}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"}],"effects":[{"inc_var":{"name":"fortification_pressure","by":1}}]}]}',
    ),
    ...Array.from(
      { length: 4 },
      () =>
        'opening_condition_sound_lower_frame|fortify_outer_seal|seat|albany_relief_seals|{"on_failure":[{"set_flag":"fortify_outer_seal_failed"},{"inc_var":{"name":"fortification_pressure","by":1}}],"on_failure_when":[{"conditions":[{"has_flag":"dispatch_opening_delayed"}],"effects":[{"inc_var":{"name":"fortification_pressure","by":1}}]}]}',
    ),
  ].sort(),
};

/**
 * Whole-pack authority pins close every seeded-opening dependency path, including
 * downstream flags/vars/HP gates which do not mention an opening flag directly.
 * Advancing either hash is an explicit certification review, never an incidental
 * consequence of editing Wolf-Winter or the deterministic relabel oracle.
 */
const CERTIFIED_WOLF_WINTER_PACK_HASH =
  "08ddb7ce41d319fa34db896ba032cbf69edcf0b0d2a5fd413c457b28091be777";
const CERTIFIED_WOLF_WINTER_RELABELED_PACK_HASH =
  "fe16b3687c8d10037073515a7073661ef4b1adf52152140fad18959642d7813e";

const pathText = (path: readonly PathPart[]): string =>
  path
    .map((part, index) =>
      typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${part}`,
    )
    .join("");

function collectExactReferences(node: unknown, values: ReadonlySet<string>): ExactReference[] {
  const found: ExactReference[] = [];
  const visit = (value: unknown, path: PathPart[]): void => {
    if (typeof value === "string") {
      if (values.has(value)) found.push({ path, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...path, index]));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      visit(entry, [...path, key]);
    }
  };
  visit(node, []);
  return found;
}

function isConditionLeaf(reference: ExactReference): boolean {
  const leaf = reference.path.at(-1);
  return leaf === "has_flag" || leaf === "not_flag";
}

function isDeclaration(reference: ExactReference): boolean {
  return (
    reference.path.length === 3 &&
    reference.path[0] === "meta" &&
    reference.path[1] === "seeded_opening_flags" &&
    typeof reference.path[2] === "number"
  );
}

/**
 * Presentation reads may select prose (and an object variant's displayed name), never
 * location, dialogue routing, visibility, legality, combat, score, or an ending id.
 * Exact-string census plus these path shapes makes a future schema location fail closed.
 */
function isPresentationRead(reference: ExactReference): boolean {
  if (!isConditionLeaf(reference)) return false;
  const p = reference.path;
  if (
    p[0] === "rooms" &&
    typeof p[1] === "number" &&
    p[2] === "variants" &&
    typeof p[3] === "number" &&
    p[4] === "when"
  ) {
    return true;
  }
  if (
    p[0] === "objects" &&
    typeof p[1] === "number" &&
    p[2] === "variants" &&
    typeof p[3] === "number" &&
    p[4] === "when"
  ) {
    return true;
  }
  if (
    p[0] === "npcs" &&
    typeof p[1] === "number" &&
    p[2] === "dialogue" &&
    p[3] === "nodes" &&
    typeof p[4] === "number" &&
    (p[5] === "variants" || p[5] === "append_variants") &&
    typeof p[6] === "number" &&
    p[7] === "when"
  ) {
    return true;
  }
  return (
    p[0] === "endings" &&
    typeof p[1] === "number" &&
    (p[2] === "variants" || p[2] === "append_variants") &&
    typeof p[3] === "number" &&
    p[4] === "when"
  );
}

function interactionCoordinates(
  reference: ExactReference,
): { objectIndex: number; interactionIndex: number; conditionPath: readonly PathPart[] } | null {
  const p = reference.path;
  if (
    !isConditionLeaf(reference) ||
    p[0] !== "objects" ||
    typeof p[1] !== "number" ||
    p[2] !== "interactions" ||
    typeof p[3] !== "number" ||
    p[4] !== "conditions"
  ) {
    return null;
  }
  return { objectIndex: p[1], interactionIndex: p[3], conditionPath: p.slice(5) };
}

function mapCertifiedTree(node: unknown, mapId: (id: string) => string): unknown {
  if (Array.isArray(node)) return node.map((entry) => mapCertifiedTree(entry, mapId));
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const reservedVars = new Set(["score", "hp", "attack", "defense"]);
  const idKeys = new Set([
    "has_flag",
    "not_flag",
    "has_item",
    "not_item",
    "visited",
    "not_visited",
    "in_room",
    "is_open",
    "is_explicitly_unlocked",
    "quest",
    "stage",
    "set_flag",
    "clear_flag",
    "add_item",
    "remove_item",
    "goto",
    "open_object",
    "close_object",
    "end_game",
    "item",
    "target",
    "skill",
  ]);
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (idKeys.has(key) && typeof value === "string") {
        return [key, key === "skill" && reservedVars.has(value) ? value : mapId(value)];
      }
      if (key === "name" && typeof value === "string") {
        return [key, reservedVars.has(value) ? value : mapId(value)];
      }
      return [key, mapCertifiedTree(value, mapId)];
    }),
  );
}

function mapCertificate(
  certificate: TransferCertificate,
  mapId: (id: string) => string,
): TransferCertificate {
  return {
    packId: mapId(certificate.packId),
    families: certificate.families.map((family) => ({
      ...family,
      flag: mapId(family.flag),
      objectId: mapId(family.objectId),
      itemIds: family.itemIds.map(mapId),
      ordinaryFailureByCommand: Object.fromEntries(
        Object.entries(family.ordinaryFailureByCommand).map(([commandAndItem, failure]) => {
          const [command, item = ""] = commandAndItem.split(":");
          return [`${command}:${item ? mapId(item) : ""}`, mapId(failure)];
        }),
      ),
    })),
    presentationReferences: certificate.presentationReferences.map((reference) => {
      const separator = reference.lastIndexOf("=");
      return `${reference.slice(0, separator + 1)}${mapId(reference.slice(separator + 1))}`;
    }),
    mechanicalContexts: certificate.mechanicalContexts
      .map((context) => {
        const [flag, polarity, objectId, command, itemId, ...conditionParts] = context.split("|");
        return `${mapId(flag!)}|${polarity}|${mapId(objectId!)}|${command}|${itemId ? mapId(itemId) : ""}|${JSON.stringify(mapCertifiedTree(JSON.parse(conditionParts.join("|")), mapId))}`;
      })
      .sort(),
    ordinaryFailureSignatures: certificate.ordinaryFailureSignatures
      .map((signature) => {
        const [flag, objectId, command, itemId, ...failureParts] = signature.split("|");
        return `${mapId(flag!)}|${mapId(objectId!)}|${command}|${itemId ? mapId(itemId) : ""}|${JSON.stringify(mapCertifiedTree(JSON.parse(failureParts.join("|")), mapId))}`;
      })
      .sort(),
  };
}

function effectKey(effect: unknown): string {
  return JSON.stringify(effect);
}

function durableSuccessEffects(interaction: Interaction): string[] {
  return [...interaction.effects, ...(interaction.skill_check?.on_success ?? [])]
    .filter((effect) => !("narrate" in effect) && !("add_journal" in effect))
    .map(effectKey);
}

function durableEffects(effects: Interaction["effects"]): unknown[] {
  return effects.filter((effect) => !("narrate" in effect) && !("add_journal" in effect));
}

function ordinaryFailureSignature(row: MechanicalRow, objectId: string): string {
  const skillCheck = row.interaction.skill_check;
  return `${row.family.flag}|${objectId}|${row.interaction.command_verb ?? ""}|${row.interaction.item ?? ""}|${JSON.stringify(
    {
      on_failure: durableEffects(skillCheck?.on_failure ?? []),
      on_failure_when: (skillCheck?.on_failure_when ?? []).map((branch) => ({
        conditions: branch.conditions,
        effects: durableEffects(branch.effects),
      })),
    },
  )}`;
}

function scoreWrites(node: unknown): unknown[] {
  const found: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const kind of ["set_var", "inc_var", "dec_var"] as const) {
      const write = record[kind];
      if (
        write &&
        typeof write === "object" &&
        (write as Record<string, unknown>).name === "score"
      ) {
        found.push({ [kind]: write });
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(node);
  return found;
}

function containsKey(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some((entry) => containsKey(entry, key));
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  return (
    Object.hasOwn(record, key) || Object.values(record).some((entry) => containsKey(entry, key))
  );
}

function containsSetFlag(node: unknown, flags: ReadonlySet<string>): boolean {
  if (Array.isArray(node)) return node.some((entry) => containsSetFlag(entry, flags));
  if (!node || typeof node !== "object") return false;
  const record = node as Record<string, unknown>;
  if (typeof record.set_flag === "string" && flags.has(record.set_flag)) return true;
  return Object.values(record).some((entry) => containsSetFlag(entry, flags));
}

const OMIT = Symbol("omit-seeded-condition");

function withoutSeededCondition(node: unknown, flags: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) {
    return node
      .map((entry) => withoutSeededCondition(entry, flags))
      .filter((entry) => entry !== OMIT);
  }
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  if (
    (typeof record.has_flag === "string" && flags.has(record.has_flag)) ||
    (typeof record.not_flag === "string" && flags.has(record.not_flag))
  ) {
    return OMIT;
  }

  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, withoutSeededCondition(value, flags)] as const)
      .filter(([, value]) => value !== OMIT),
  );
}

function contextKey(interaction: Interaction, flags: ReadonlySet<string>): string {
  return JSON.stringify(withoutSeededCondition(interaction.conditions, flags));
}

function expectedConditionPath(
  kind: FamilyKind,
  polarity: "has_flag" | "not_flag",
  command: string,
): string {
  if (kind === "hunt") {
    return polarity === "has_flag" ? "[0].has_flag" : "[4].any_of[0].all_of[1].not_flag";
  }
  if (kind === "lure" || kind === "fortify") return `[2].${polarity}`;
  if (kind === "drive") return `[3].${polarity}`;
  return command;
}

function expectedCommandCounts(family: FamilyCertificate): Readonly<Record<string, number>> {
  const [firstItem = "", secondItem = ""] = family.itemIds;
  switch (family.kind) {
    case "hunt":
      return { "has_flag:brace:": 1, "not_flag:set:": 1, "not_flag:wedge:": 1 };
    case "lure":
      return { [`has_flag:lay:${firstItem}`]: 4, [`not_flag:lay:${firstItem}`]: 4 };
    case "drive":
      return {
        [`has_flag:fire:${firstItem}`]: 1,
        [`not_flag:fire:${firstItem}`]: 2,
      };
    case "fortify":
      return {
        [`has_flag:seat:${firstItem}`]: 1,
        [`has_flag:seat:${secondItem}`]: 1,
        [`not_flag:seat:${firstItem}`]: 2,
        [`not_flag:seat:${secondItem}`]: 4,
      };
  }
}

type MechanicalRow = Readonly<{
  family: FamilyCertificate;
  polarity: "has_flag" | "not_flag";
  interaction: Interaction;
  conditionPath: readonly PathPart[];
  objectIndex: number;
  interactionIndex: number;
}>;

function certifyWith(
  pack: RpgPack,
  certificate: TransferCertificate,
  expectedPackHash: string,
  hashLabel: string,
): SeededOpeningTransferSupport {
  const diagnostics: string[] = [];
  const actualPackHash = hashState(pack);
  if (actualPackHash !== expectedPackHash) {
    diagnostics.push(
      `${hashLabel} hash changed; expected ${expectedPackHash}, got ${actualPackHash}. Advance this authority pin only after explicit seeded-opening transfer review`,
    );
  }
  const declared = pack.meta.seeded_opening_flags ?? [];
  const expectedFlags = certificate.families.map((family) => family.flag);
  if (pack.meta.id !== certificate.packId) {
    diagnostics.push(`unknown seeded-opening pack id "${pack.meta.id}"`);
  }
  if (JSON.stringify(declared) !== JSON.stringify(expectedFlags)) {
    diagnostics.push(
      `seeded_opening_flags must preserve the certified order ${JSON.stringify(expectedFlags)}; got ${JSON.stringify(declared)}`,
    );
  }

  const flagSet = new Set(declared);
  const references = collectExactReferences(pack, flagSet);
  const actualPresentationReferences: string[] = [];
  const mechanicalRows: MechanicalRow[] = [];
  const seenRows = new Set<string>();

  for (const reference of references) {
    if (isDeclaration(reference)) continue;
    if (isPresentationRead(reference)) {
      actualPresentationReferences.push(`${pathText(reference.path)}=${reference.value}`);
      continue;
    }
    const coordinates = interactionCoordinates(reference);
    if (!coordinates) {
      diagnostics.push(
        `seeded opening reference at ${pathText(reference.path)} is neither a text-selection variant nor an approved interaction condition`,
      );
      continue;
    }
    const object = pack.objects[coordinates.objectIndex];
    const interaction = object?.interactions[coordinates.interactionIndex];
    const family = certificate.families.find((candidate) => candidate.flag === reference.value);
    const polarity = reference.path.at(-1);
    if (
      !object ||
      !interaction ||
      !family ||
      (polarity !== "has_flag" && polarity !== "not_flag")
    ) {
      diagnostics.push(`malformed mechanical seeded reference at ${pathText(reference.path)}`);
      continue;
    }
    const rowKey = `${coordinates.objectIndex}:${coordinates.interactionIndex}`;
    if (seenRows.has(rowKey)) {
      diagnostics.push(
        `interaction ${object.id}[${coordinates.interactionIndex}] reads seeded openings more than once`,
      );
      continue;
    }
    seenRows.add(rowKey);
    mechanicalRows.push({
      family,
      polarity,
      interaction,
      conditionPath: coordinates.conditionPath,
      objectIndex: coordinates.objectIndex,
      interactionIndex: coordinates.interactionIndex,
    });
  }

  if (
    JSON.stringify(actualPresentationReferences) !==
    JSON.stringify(certificate.presentationReferences)
  ) {
    diagnostics.push(
      "seeded presentation reference census changed; every exact path, polarity, and flag must remain reviewed",
    );
  }

  const actualMechanicalContexts = mechanicalRows
    .map(
      (row) =>
        `${row.family.flag}|${row.polarity}|${pack.objects[row.objectIndex]!.id}|${row.interaction.command_verb ?? ""}|${row.interaction.item ?? ""}|${contextKey(row.interaction, flagSet)}`,
    )
    .sort();
  if (JSON.stringify(actualMechanicalContexts) !== JSON.stringify(certificate.mechanicalContexts)) {
    diagnostics.push(
      "seeded mechanical context census changed; every complete condition partition must remain reviewed",
    );
  }
  const actualOrdinaryFailureSignatures = mechanicalRows
    .filter((row) => row.polarity === "not_flag")
    .map((row) => ordinaryFailureSignature(row, pack.objects[row.objectIndex]!.id))
    .sort();
  if (
    JSON.stringify(actualOrdinaryFailureSignatures) !==
    JSON.stringify(certificate.ordinaryFailureSignatures)
  ) {
    diagnostics.push(
      "ordinary seeded failure/recovery subgraph changed; durable failure effects and conditional branches must remain exact",
    );
  }
  for (const family of certificate.families) {
    const rows = mechanicalRows.filter((row) => row.family === family);
    const matching = rows.filter((row) => row.polarity === "has_flag");
    const ordinary = rows.filter((row) => row.polarity === "not_flag");
    if (matching.length !== family.matchingCount || ordinary.length !== family.ordinaryCount) {
      diagnostics.push(
        `${family.kind} family must contain exactly ${family.matchingCount} matching and ${family.ordinaryCount} ordinary rows; got ${matching.length}/${ordinary.length}`,
      );
    }

    const commandCounts: Record<string, number> = {};
    for (const row of rows) {
      const object = pack.objects[row.objectIndex]!;
      const interaction = row.interaction;
      if (object.id !== family.objectId) {
        diagnostics.push(
          `${family.kind} seeded row moved to object "${object.id}"; certified object is "${family.objectId}"`,
        );
      }
      if (interaction.verb !== "USE" || interaction.target !== family.objectId) {
        diagnostics.push(
          `${family.kind} seeded row must remain a USE on target "${family.objectId}"`,
        );
      }
      const item = interaction.item ?? "";
      if (family.itemIds.length === 0 ? item !== "" : !family.itemIds.includes(item)) {
        diagnostics.push(`${family.kind} seeded row has uncertified item "${item || "(none)"}"`);
      }
      const command = interaction.command_verb ?? "";
      const expectedPath = expectedConditionPath(family.kind, row.polarity, command);
      const actualPath = pathText(row.conditionPath);
      if (actualPath !== expectedPath) {
        diagnostics.push(
          `${family.kind} ${row.polarity} condition moved within interaction ${row.interactionIndex}: expected ${expectedPath}, got ${actualPath}`,
        );
      }
      const commandKey = `${row.polarity}:${command}:${item}`;
      commandCounts[commandKey] = (commandCounts[commandKey] ?? 0) + 1;
      if (row.polarity === "has_flag" && interaction.skill_check !== undefined) {
        diagnostics.push(`${family.kind} matching row must remain no-roll`);
      }
      if (row.polarity === "not_flag" && interaction.skill_check === undefined) {
        diagnostics.push(
          `${family.kind} ordinary row must retain its skill check and failure branch`,
        );
      }
      if (containsKey(interaction, "end_game")) {
        diagnostics.push(`${family.kind} seeded family must not select a terminal end_game effect`);
      }
      const allScoreWrites = scoreWrites(interaction);
      const successScoreWrites = scoreWrites([
        ...interaction.effects,
        ...(interaction.skill_check?.on_success ?? []),
      ]);
      if (family.kind === "lure") {
        if (
          successScoreWrites.length !== 1 ||
          JSON.stringify(successScoreWrites[0]) !==
            JSON.stringify({ inc_var: { name: "score", by: 10 } }) ||
          allScoreWrites.length !== 1
        ) {
          diagnostics.push(
            "lure seeded rows must retain exactly the shared +10 successful redirect award and no failure score write",
          );
        }
      } else if (allScoreWrites.length !== 0) {
        diagnostics.push(`${family.kind} seeded family must not select a score write`);
      }
    }

    const expectedCommands = expectedCommandCounts(family);
    if (JSON.stringify(commandCounts) !== JSON.stringify(expectedCommands)) {
      diagnostics.push(
        `${family.kind} action partitions changed: expected ${JSON.stringify(expectedCommands)}, got ${JSON.stringify(commandCounts)}`,
      );
    }

    for (const row of ordinary) {
      const commandAndItem = `${row.interaction.command_verb ?? ""}:${row.interaction.item ?? ""}`;
      const expectedFailure = family.ordinaryFailureByCommand[commandAndItem];
      if (
        expectedFailure === undefined ||
        !containsSetFlag(row.interaction.skill_check?.on_failure ?? [], new Set([expectedFailure]))
      ) {
        diagnostics.push(
          `${family.kind} ordinary ${commandAndItem} row ${row.interactionIndex} lost its exact certified failure marker/recovery entry`,
        );
      }
    }

    const compareEffects = (left: MechanicalRow, right: MechanicalRow): void => {
      const leftEffects = durableSuccessEffects(left.interaction);
      const rightEffects = durableSuccessEffects(right.interaction);
      if (JSON.stringify(leftEffects) !== JSON.stringify(rightEffects)) {
        diagnostics.push(
          `${family.kind} matching success is no longer durable-state equivalent to ordinary success`,
        );
      }
    };

    if (family.kind === "lure") {
      const matchingByContext = new Map(
        matching.map((row) => [contextKey(row.interaction, flagSet), row] as const),
      );
      const ordinaryByContext = new Map(
        ordinary.map((row) => [contextKey(row.interaction, flagSet), row] as const),
      );
      if (
        matchingByContext.size !== matching.length ||
        ordinaryByContext.size !== ordinary.length ||
        JSON.stringify([...matchingByContext.keys()]) !==
          JSON.stringify([...ordinaryByContext.keys()])
      ) {
        diagnostics.push(
          "lure matching/ordinary approach-and-allocation context partitions changed",
        );
      } else {
        for (const [key, matchingRow] of matchingByContext) {
          const ordinaryRow = ordinaryByContext.get(key);
          if (ordinaryRow) compareEffects(matchingRow, ordinaryRow);
        }
      }
    } else if (family.kind === "fortify") {
      for (const matchingRow of matching) {
        const peers = ordinary.filter(
          (row) => row.interaction.item === matchingRow.interaction.item,
        );
        if (peers.length === 0) diagnostics.push("fortify matching stance lost its ordinary peers");
        peers.forEach((peer) => compareEffects(matchingRow, peer));
      }
    } else if (matching[0]) {
      ordinary.forEach((row) => compareEffects(matching[0]!, row));
    }
  }

  return {
    certified: diagnostics.length === 0,
    unsupported: diagnostics.length !== 0,
    diagnostics,
    presentationReads: actualPresentationReferences.length,
    mechanicalReads: mechanicalRows.length,
  };
}

/**
 * Certify that a fixed-seed exhaustive proof may transfer across the pack's seeded opening
 * identity. Packs without seeded openings need no transfer. Every seeded pack is rejected
 * unless it is the explicitly reviewed Wolf-Winter certificate above.
 */
export function seededOpeningTransferSupportForPack(pack: RpgPack): SeededOpeningTransferSupport {
  if (pack.meta.seeded_opening_flags === undefined) {
    if (pack.meta.id === WOLF_WINTER_CERTIFICATE.packId) {
      return {
        certified: false,
        unsupported: true,
        diagnostics: [
          `known certified pack "${pack.meta.id}" is missing meta.seeded_opening_flags`,
        ],
        presentationReads: 0,
        mechanicalReads: 0,
      };
    }
    return {
      certified: false,
      unsupported: false,
      diagnostics: [],
      presentationReads: 0,
      mechanicalReads: 0,
    };
  }
  return certifyWith(
    pack,
    WOLF_WINTER_CERTIFICATE,
    CERTIFIED_WOLF_WINTER_PACK_HASH,
    "certified Wolf-Winter pack",
  );
}

/**
 * Apply the same certificate at the relabel boundary. Authored order is preserved, all
 * identifier-bearing certificate fields are mapped through the oracle's bijection, and
 * command vocabulary / reserved score semantics remain fixed.
 */
export function seededOpeningRelabelTransferSupportForPacks(
  original: RpgPack,
  twin: RpgPack,
  mapId: (id: string) => string,
): SeededOpeningTransferSupport {
  const originalSupport = seededOpeningTransferSupportForPack(original);
  if (originalSupport.unsupported) return originalSupport;
  if (original.meta.seeded_opening_flags === undefined) {
    return seededOpeningTransferSupportForPack(twin);
  }
  return certifyWith(
    twin,
    mapCertificate(WOLF_WINTER_CERTIFICATE, mapId),
    CERTIFIED_WOLF_WINTER_RELABELED_PACK_HASH,
    "certified Wolf-Winter relabeled twin",
  );
}

export function seededOpeningTransferFailureMessage(
  label: string,
  support: SeededOpeningTransferSupport,
): string {
  return `${label}: seeded-opening structural transfer is unsupported:\n  ${support.diagnostics.join("\n  ")}`;
}
