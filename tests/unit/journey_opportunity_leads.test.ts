import { describe, expect, it } from "vitest";

import {
  OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT,
  compactJourneyOpportunityLeads,
} from "../../src/world/compact_view.js";
import {
  JOURNEY_OPPORTUNITY_GUIDANCE,
  cloneJourneyOpportunityPresentation,
  createInitialJourneyContractSnapshot,
  journeyPresentation,
  type JourneyOpportunityPresentation,
} from "../../src/world/journey_contract.js";
import { projectJourneyOpportunities } from "../../src/world/journey_opportunity_leads.js";
import type {
  OverworldArea,
  OverworldLocalEvent,
  OverworldLocalJob,
} from "../../src/world/overworld.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

function genericOpportunityState() {
  const sourceArea = WORLD.areas.find((area) => area.id === "albany_city__market");
  const sourceEvent = WORLD.local_events.find((event) => event.id === "albany_city__market__event");
  const sourceJob = WORLD.local_jobs.find((job) => job.id === "albany_city__transport_hub__job");
  if (!sourceArea || !sourceEvent?.authored_scene || !sourceJob?.authored_scene) {
    throw new Error("Expected generic authored opportunity fixtures.");
  }
  const area: OverworldArea = {
    ...sourceArea,
    id: "utica_city__canal_ward",
    home: "utica_city",
    name: "Utica Canal Ward",
  };
  const event: OverworldLocalEvent = {
    ...sourceEvent,
    id: "utica_city__canal_ward__event",
    home: "utica_city",
    area: area.id,
    title: "Canal Ward Winter Hearing",
  };
  const job: OverworldLocalJob = {
    ...sourceJob,
    id: "utica_city__canal_ward__job",
    home: "utica_city",
    area: area.id,
    title: "Canal Ward Repair Ledger",
  };
  return {
    area,
    event,
    job,
    state: {
      currentAreaId: area.id,
      areasById: new Map([[area.id, area]]),
      events: [event],
      jobs: [job],
      visitedTownIds: new Set(["utica_city"]),
      completedQuestIds: new Set(["wolf_winter"]),
      resolvedEventIds: new Set<string>(),
      discoveredAreaIds: new Set([area.id]),
      discoveredJobIds: new Set([job.id]),
      completedJobIds: new Set<string>(),
      worldFactIds: new Set(["fact:wolf_winter_outer_paling_broken"]),
      eventOptionIdFor: () => null,
    },
  };
}

describe("journey opportunity projection", () => {
  it("keeps return-opportunity guidance neutral about the active journey state", () => {
    expect(JOURNEY_OPPORTUNITY_GUIDANCE).toContain("leave these leads for later");
    expect(JOURNEY_OPPORTUNITY_GUIDANCE).not.toContain("keep your objective");
  });

  it("derives generic non-Albany event roots and only actually discovered eligible jobs", () => {
    const { event, job, state } = genericOpportunityState();
    const opportunities = projectJourneyOpportunities(state);

    expect(opportunities).toEqual({
      guidance: JOURNEY_OPPORTUNITY_GUIDANCE,
      leads: [
        {
          id: job.id,
          kind: "job",
          title: job.title,
          area: "Utica Canal Ward",
          access: "here",
        },
        {
          id: event.id,
          kind: "event",
          title: event.title,
          area: "Utica Canal Ward",
          access: "here",
        },
      ],
    });
    expect(Object.isFrozen(opportunities)).toBe(true);
    expect(Object.isFrozen(opportunities?.leads)).toBe(true);
    expect(opportunities?.leads.every(Object.isFrozen)).toBe(true);

    expect(
      projectJourneyOpportunities({ ...state, discoveredJobIds: new Set<string>() })?.leads,
    ).toEqual([expect.objectContaining({ id: event.id, kind: "event" })]);
    expect(projectJourneyOpportunities({ ...state, visitedTownIds: new Set<string>() })).toBeNull();
    expect(
      projectJourneyOpportunities({ ...state, completedJobIds: new Set([job.id]) })?.leads,
    ).toEqual([expect.objectContaining({ id: event.id })]);
    expect(
      projectJourneyOpportunities({ ...state, resolvedEventIds: new Set([event.id]) })?.leads,
    ).toEqual([expect.objectContaining({ id: job.id })]);
  });

  it("freezes the journey contract, clones it deeply, and bounds the additive v25 tuple", () => {
    const base = projectJourneyOpportunities(genericOpportunityState().state)!;
    const presented = journeyPresentation(createInitialJourneyContractSnapshot(), {
      opportunities: base,
    });
    const clone = cloneJourneyOpportunityPresentation(presented.opportunities);

    expect(presented.opportunities).toEqual(base);
    expect(Object.isFrozen(presented.opportunities)).toBe(true);
    expect(Object.isFrozen(presented.opportunities?.leads)).toBe(true);
    expect(clone).toEqual(base);
    expect(clone).not.toBe(presented.opportunities);
    expect(clone?.leads).not.toBe(presented.opportunities?.leads);

    const many: JourneyOpportunityPresentation = {
      guidance: JOURNEY_OPPORTUNITY_GUIDANCE,
      leads: Array.from({ length: OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT + 3 }, (_, index) => ({
        id: `root:${String(index)}`,
        kind: index % 2 === 0 ? "event" : "job",
        title: `Optional root ${String(index)}`,
        area: `District ${String(index)}`,
        access: index === 0 ? "here" : index % 2 === 0 ? "mapped" : "route_unmapped",
      })),
    };
    const compact = compactJourneyOpportunityLeads(many);
    expect(compact).toHaveLength(OVERWORLD_COMPACT_OPPORTUNITY_LEAD_LIMIT);
    expect(compact[0]).toEqual(["event", "root:0", "Optional root 0", "District 0", "here"]);
    expect(JSON.stringify(compact)).not.toMatch(
      /"guidance"|option_id|reward|consequence|preview|terms/i,
    );
  });
});
