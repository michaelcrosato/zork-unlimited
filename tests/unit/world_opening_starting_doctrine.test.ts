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
  it("authors the three truthful Civic paths", () => {
    const doctrines = shippedDoctrines(SHIPPED_WORLD);

    expect(doctrines).toHaveLength(3);
    expect(doctrines).toMatchObject([
      {
        id: "albany:doctrine_fortify_breach",
        profile_id: "albany:ironhands_repairer",
        relief_oath_option_id: "albany:oath_full_compact_duty",
        lead_source_option_id: "albany:source_rowan_civic_docket",
        trigger_category: "Repair 4; first public-seal FORTIFY Repair is DC 12 instead of 14.",
        immediate_cost: "10 minutes and $0",
      },
      {
        id: "albany:doctrine_road_warden_aid_route",
        profile_id: "albany:road_warden",
        relief_oath_option_id: "albany:oath_limited_aid_only",
        lead_source_option_id: "albany:source_hayden_frost_report",
        trigger_category:
          "Defense 4. First LURE LAY still +1; last feed skips +1 if that LAY succeeded. Split rail can help HUNT.",
        preview:
          "Defense starts at 4 instead of 3. The first successful LURE LAY still raises cattle alarm as listed; Aid-Only then skips the last feed's +1, not the first. Hayden's report can unlock a HUNT brace after a rail splits. Cost: 10 minutes and $0.",
        consequence: "Specialist preparation, the wagon, June, and both roads remain available.",
        immediate_cost: "10 minutes and $0",
      },
      {
        id: "albany:doctrine_independent_drive",
        profile_id: "albany:unaffiliated_courier",
        relief_oath_option_id: "albany:oath_unaffiliated_personal_bond",
        lead_source_option_id: "albany:source_rowan_civic_docket",
        trigger_category:
          "Streetwise 4; first DRIVE shutter-signal check drops from DC 12 to DC 10.",
        immediate_cost: "no added time and $0",
      },
    ]);
  });

  it("keeps each starting-doctrine tradeoff explicit", () => {
    const doctrines = shippedDoctrines(SHIPPED_WORLD);

    expect(doctrines[0]!.tradeoff).toContain("No specialist kit");
    expect(doctrines[0]!.tradeoff).toContain("wagon assignment");
    expect(doctrines[0]!.tradeoff).toContain("second rider");
    expect(doctrines[0]!.tradeoff).toContain("road is selected");
    expect(doctrines[1]!.tradeoff).toContain("Rowan's and Jamie's reports close");
    expect(doctrines[1]!.tradeoff).toContain("Optional support and both roads remain available");
    expect(doctrines[2]!.tradeoff).toContain("No specialist kit");
    expect(doctrines.map((doctrine) => doctrine.id)).not.toContain("albany:doctrine_bounded_aid");
  });

  it("keeps Road-Warden mechanics inspectable while its confirmation stays branch-neutral", () => {
    const doctrines = shippedDoctrines(SHIPPED_WORLD);

    expect(doctrines[1]!.trigger_category).toContain("Defense 4");
    expect(doctrines[1]!.summary).toContain("Aid-Only");
    expect(doctrines[1]!.trigger_category).toContain("LURE");
    expect(doctrines[1]!.trigger_category).toContain("HUNT");
    expect(doctrines[1]!.consequence).not.toMatch(
      /\b(?:DEF|HUNT|LURE|DRIVE|FORTIFY|Works)\b|imported starting|ordinary-hunt|frost[- ](?:brace|jamb)|public (?:fence )?(?:brace|wedge)|yearling|bare spear|field-team|relief allocation/gu,
    );
  });

  it("leaves later opening choices unselected for the other doctrines", () => {
    const doctrines = shippedDoctrines(SHIPPED_WORLD);

    for (const doctrine of doctrines.filter(
      (candidate) => candidate.id !== "albany:doctrine_road_warden_aid_route",
    )) {
      expect(doctrine.consequence).toBe("All optional support and both roads remain available.");
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
