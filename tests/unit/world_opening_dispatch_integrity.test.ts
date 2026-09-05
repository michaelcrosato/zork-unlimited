import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertOverworldIntegrity,
  parseOverworldManifest,
  type OverworldManifest,
} from "../../src/world/overworld.js";

const WORLD = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);
const PREPARATION_ID = "albany:prep_drover_route";
const ALLOCATION_ID = "albany:relief_cade_fodder";
const ORDER_ERROR =
  /Opening dispatch support albany:prep_drover_route, albany:relief_cade_fodder changes material state when chosen in a different order/;

function allocationGrantsPreparationSponsor(world: OverworldManifest): void {
  const preparation = world.opening_preparation!.profiles.find(
    (profile) => profile.id === PREPARATION_ID,
  )!;
  const allocation = world.opening_relief_allocation!.options.find(
    (option) => option.id === ALLOCATION_ID,
  )!;
  // Both orders finish with the same character and charge the same money.
  // Only elapsed time changes when the allocation grants sponsorship first.
  preparation.sponsor!.money = preparation.terms.money;
  allocation.effects.push({
    type: "remember_relationship",
    npc_id: preparation.provider_npc_id,
    memory_id: preparation.sponsor!.memory_id,
  });
}

describe("opening dispatch integrity", () => {
  it("preserves the world and rechecks changed support terms on the same manifest", () => {
    const world = structuredClone(WORLD);
    expect(() => assertOverworldIntegrity(world)).not.toThrow();
    expect(world).toEqual(WORLD);

    allocationGrantsPreparationSponsor(world);
    const beforeValidation = structuredClone(world);
    // An optional pair must be checked even without an ally choice.
    expect(() => assertOverworldIntegrity(world)).toThrow(ORDER_ERROR);
    expect(world).toEqual(beforeValidation);
  });

  it("checks later registration states even when the first already has sponsorship", () => {
    const world = structuredClone(WORLD);
    allocationGrantsPreparationSponsor(world);
    const profiles = world.opening_registration!.profiles;
    const courierIndex = profiles.findIndex(
      (profile) => profile.id === "albany:unaffiliated_courier",
    );
    expect(courierIndex).toBeGreaterThan(0);
    profiles.unshift(profiles.splice(courierIndex, 1)[0]!);

    // Every support order commutes for the sponsored courier, but later
    // backgrounds still pay different preparation times in the two orders.
    expect(() => assertOverworldIntegrity(world)).toThrow(ORDER_ERROR);
  });
});
