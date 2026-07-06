import { describe, expect, it } from "vitest";
import type { OverworldNode, OverworldRegionalArc } from "../../src/world/overworld.js";
import {
  applyOverworldRegionalArcCompletions,
  buildOverworldRegionalArcProgress,
  cloneOverworldRegionalArcProgress,
  indexOverworldRegionalArcAnchorTowns,
  indexOverworldRegionalArcsByRegion,
  regionalArcCompletionsForRegion,
  resolvedOverworldRegionalArcAnchorTownIds,
} from "../../src/world/session_regional_arcs.js";

function node(id: string, region = "Test Region"): OverworldNode {
  return {
    id,
    name: id.toUpperCase(),
    kind: "town",
    source_geography: "incorporated_place",
    geoid: id,
    county_fips: "001",
    population_2025: 10_000,
    lat: 0,
    lon: 0,
    region,
    services: [],
    description: `${id} description`,
  };
}

function arc(
  id: string,
  region: string,
  anchorTowns: readonly string[],
  requiredResolutions: number,
): OverworldRegionalArc {
  return {
    id,
    region,
    title: `${id} title`,
    summary: `${id} summary`,
    required_resolutions: requiredResolutions,
    anchor_towns: [...anchorTowns],
    reward: `${id} reward`,
  };
}

describe("overworld session regional arcs", () => {
  it("indexes regional arcs and known anchor towns from manifest data", () => {
    const arcs = [
      arc("arc_a", "West", ["town_a", "missing_town"], 1),
      arc("arc_b", "East", ["town_b"], 1),
      arc("arc_c", "West", ["town_c"], 1),
    ];
    const nodes = new Map([
      ["town_a", node("town_a")],
      ["town_b", node("town_b")],
      ["town_c", node("town_c")],
    ]);

    expect(
      indexOverworldRegionalArcsByRegion(arcs)
        .get("West")
        ?.map((candidate) => candidate.id),
    ).toEqual(["arc_a", "arc_c"]);
    expect(
      indexOverworldRegionalArcAnchorTowns(arcs, nodes)
        .get("arc_a")
        ?.map((town) => town.id),
    ).toEqual(["town_a"]);
  });

  it("builds sorted progress with resolved anchor towns and cloned arrays", () => {
    const arcs = [
      arc("arc_a", "West", ["town_a", "town_b"], 2),
      arc("arc_b", "East", ["town_c"], 1),
      arc("arc_c", "West", ["town_d"], 1),
    ];
    const anchorTownsByArcId = new Map([
      ["arc_a", [node("town_a", "West"), node("town_b", "West")]],
      ["arc_b", [node("town_c", "East")]],
      ["arc_c", [node("town_d", "West")]],
    ]);

    const progress = buildOverworldRegionalArcProgress(
      arcs,
      "East",
      anchorTownsByArcId,
      new Set(["town_a", "town_c"]),
      new Set(["arc_c"]),
    );

    expect(progress.map((candidate) => candidate.id)).toEqual(["arc_b", "arc_a", "arc_c"]);
    expect(progress[0]).toMatchObject({
      id: "arc_b",
      completed: false,
      requiredResolutions: 1,
      resolvedInRegion: 1,
    });
    expect(progress[1]?.resolvedAnchorTowns.map((town) => town.id)).toEqual(["town_a"]);
    expect(progress[1]?.anchorTowns).not.toBe(anchorTownsByArcId.get("arc_a"));

    const cloned = cloneOverworldRegionalArcProgress(progress[1]!);
    expect(cloned).toEqual(progress[1]);
    expect(cloned.anchorTowns).not.toBe(progress[1]?.anchorTowns);
    expect(cloned.resolvedAnchorTowns).not.toBe(progress[1]?.resolvedAnchorTowns);
  });

  it("computes resolved anchor ids from event homes", () => {
    expect([
      ...resolvedOverworldRegionalArcAnchorTownIds(
        arc("arc_a", "West", ["town_a", "town_b"], 2),
        new Set(["town_b", "town_c"]),
      ),
    ]).toEqual(["town_b"]);
  });

  it("creates regional arc completion journal entries without mutating completion state", () => {
    const arcsByRegion = indexOverworldRegionalArcsByRegion([
      arc("arc_a", "West", ["town_a", "town_b"], 2),
      arc("arc_b", "West", ["town_c"], 1),
      arc("arc_c", "West", ["town_d"], 1),
      arc("arc_d", "East", ["town_e"], 1),
    ]);
    const completed = new Set(["arc_c"]);

    const completions = regionalArcCompletionsForRegion(
      "West",
      arcsByRegion,
      new Set(["town_a", "town_b", "town_d"]),
      completed,
      600,
    );

    expect(completions.map((completion) => completion.arc.id)).toEqual(["arc_a"]);
    expect(completions[0]?.entry).toEqual({
      id: "arc:arc_a",
      kind: "regional_arc",
      town: "West",
      title: "Completed arc_a title",
      text: "arc_a reward",
      recordedAt: "Day 1, 10:00",
    });
    expect([...completed]).toEqual(["arc_c"]);
  });

  it("applies regional arc completions to state and journal indexes", () => {
    const completion = {
      arc: arc("arc_a", "West", ["town_a"], 1),
      entry: {
        id: "arc:arc_a",
        kind: "regional_arc" as const,
        town: "West",
        title: "Completed arc_a title",
        text: "arc_a reward",
        recordedAt: "Day 1, 10:00",
      },
    };
    const state = {
      completedRegionalArcIds: new Set<string>(),
      journalEntries: [],
      journalEntriesById: new Map(),
    };

    expect(applyOverworldRegionalArcCompletions(state, [completion])).toBe(true);
    expect([...state.completedRegionalArcIds]).toEqual(["arc_a"]);
    expect(state.journalEntries).toEqual([completion.entry]);
    expect(state.journalEntriesById.get(completion.entry.id)).toBe(completion.entry);
    expect(applyOverworldRegionalArcCompletions(state, [completion])).toBe(false);
    expect(state.journalEntries).toEqual([completion.entry]);
  });
});
