import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOverworldManifest } from "../../src/world/overworld.js";
import { OverworldSession } from "../../src/world/session.js";

const world = parseOverworldManifest(
  JSON.parse(readFileSync("content/world/new_york_overworld.json", "utf8")),
);

describe("overworld session view clone", () => {
  it("keeps returned full views from mutating cached session state", () => {
    const session = new OverworldSession(world);
    const first = session.view();
    session.scoutPoi(first.pois[0]!.id);

    const mutated = session.view();
    const originalJournalTitle = mutated.journal[0]!.title;
    mutated.discoveredAreaIds.push("mutated_by_test");
    mutated.regionRenown.mutated_by_test = 99;
    mutated.journal[0]!.title = "mutated_by_test";

    const fresh = session.view();

    expect(fresh.discoveredAreaIds).not.toContain("mutated_by_test");
    expect(fresh.regionRenown).not.toHaveProperty("mutated_by_test");
    expect(fresh.journal[0]!.title).toBe(originalJournalTitle);
  });
});
