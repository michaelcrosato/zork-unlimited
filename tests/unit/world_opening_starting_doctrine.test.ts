import { describe, expect, it } from "vitest";

import { assertOverworldIntegrity, type OverworldManifest } from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const SHIPPED_WORLD = loadOverworldManifest(process.cwd());

function shippedDoctrines(draft: OverworldManifest) {
  const doctrines = draft.opening_registration?.doctrines;
  if (!doctrines) throw new Error("expected the shipped starting doctrines");
  return doctrines;
}

function expectIntegrityFailure(mutate: (draft: OverworldManifest) => void, pattern: RegExp): void {
  const draft = structuredClone(SHIPPED_WORLD);
  mutate(draft);
  expect(() => assertOverworldIntegrity(draft)).toThrow(pattern);
}

describe("opening starting doctrines", () => {
  it("authors the three truthful Civic paths without selecting later opening choices", () => {
    const doctrines = shippedDoctrines(SHIPPED_WORLD);

    expect(doctrines).toHaveLength(3);
    expect(doctrines).toMatchObject([
      {
        id: "albany:doctrine_fortify_breach",
        profile_id: "albany:ironhands_repairer",
        relief_oath_option_id: "albany:oath_full_compact_duty",
        lead_source_option_id: "albany:source_rowan_civic_docket",
        trigger_category: "Repair 4; first public-seal fortification check is 2 DC easier.",
        immediate_cost: "10 minutes and $0",
      },
      {
        id: "albany:doctrine_road_warden_aid_route",
        profile_id: "albany:road_warden",
        relief_oath_option_id: "albany:oath_limited_aid_only",
        lead_source_option_id: "albany:source_hayden_frost_report",
        immediate_cost: "10 minutes and $0",
      },
      {
        id: "albany:doctrine_independent_drive",
        profile_id: "albany:unaffiliated_courier",
        relief_oath_option_id: "albany:oath_unaffiliated_personal_bond",
        lead_source_option_id: "albany:source_rowan_civic_docket",
        trigger_category: "Streetwise 4; first shutter-signal check drops from DC 12 to DC 10.",
        immediate_cost: "no added time and $0",
      },
    ]);

    expect(doctrines[0]!.tradeoff).toContain("No Works packet");
    expect(doctrines[1]!.tradeoff).toContain("Rowan/Jamie sources");
    expect(doctrines[1]!.trigger_category).toContain("Fieldcraft 4");
    expect(doctrines[1]!.trigger_category).toContain("Aid-Only");
    expect(doctrines[1]!.trigger_category).toContain("HUNT");
    expect(doctrines[2]!.tradeoff).toContain("No drover packet");
    expect(doctrines.map((doctrine) => doctrine.id)).not.toContain("albany:doctrine_bounded_aid");
    for (const doctrine of doctrines) {
      expect(doctrine.consequence).toContain("relief allocation");
      expect(doctrine.consequence).toContain("June's field-team commitment");
      expect(doctrine.consequence).toContain("road approach remain unselected");
    }
  });

  it("cross-validates doctrine references and derived immediate costs", () => {
    expect(() => assertOverworldIntegrity(structuredClone(SHIPPED_WORLD))).not.toThrow();

    expectIntegrityFailure((draft) => {
      shippedDoctrines(draft)[0]!.profile_id = "albany:missing_profile";
    }, /references missing registration profile/i);
    expectIntegrityFailure((draft) => {
      shippedDoctrines(draft)[0]!.relief_oath_option_id = "albany:missing_oath";
    }, /references missing relief-oath option/i);
    expectIntegrityFailure((draft) => {
      shippedDoctrines(draft)[0]!.lead_source_option_id = "albany:missing_source";
    }, /references missing lead-source option/i);
    expectIntegrityFailure((draft) => {
      shippedDoctrines(draft)[0]!.immediate_cost = "no added time and $0";
    }, /immediate cost must be "10 minutes and \$0"/i);
  });
});
