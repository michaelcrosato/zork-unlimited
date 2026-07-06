import { describe, it, expect, beforeAll } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createToolApi } from "../../src/mcp/tools.js";
import {
  COMPACT_DESCRIPTION_CHAR_LIMIT,
  COMPACT_DIALOGUE_CHAR_LIMIT,
  RPG_COMPACT_OBSERVATION_VERSION,
} from "../../src/mcp/compact_rpg_observation.js";
import {
  COMPACT_EVENT_JOURNAL_CHAR_LIMIT,
  COMPACT_EVENT_NARRATION_CHAR_LIMIT,
  RPG_COMPACT_EVENT_VERSION,
} from "../../src/mcp/compact_rpg_event.js";
import { RPG_COMPACT_STATE_VERSION } from "../../src/mcp/compact_rpg_state.js";
import {
  publicRpgStateHash,
  RPG_PUBLIC_STATE_HASH_LENGTH,
} from "../../src/mcp/rpg_state_guards.js";
import {
  publicOverworldSnapshotHash,
  OVERWORLD_PUBLIC_SNAPSHOT_HASH_LENGTH,
} from "../../src/mcp/overworld_sessions.js";
import {
  hashTranscript,
  publicRpgTranscriptHash,
  RPG_PUBLIC_TRANSCRIPT_HASH_LENGTH,
} from "../../src/mcp/transcript_projection.js";
import { PathEscapeError } from "../../src/mcp/paths.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../../src/rpg/runner.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { makeStep } from "../../src/core/engine.js";
import { recordTrace } from "../../src/trace/record.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { hashState } from "../../src/core/hash.js";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import type { RpgAction } from "../../src/api/types.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";

const ROOT = process.cwd();
const PACK = "content/rpg/quests/sunken_barrow.yaml";
const NON_RPG_PACK = "content/broken-fixtures/duplicate_id.yaml";
const api = () => createToolApi({ root: ROOT });
const overworld = loadOverworldManifest(ROOT);
const FULL_OVERWORLD_RESPONSE = {
  compact_context: false,
  compact_result: false,
} as const;
const FULL_OVERWORLD_QUEST_START = {
  ...FULL_OVERWORLD_RESPONSE,
  compact_observation: false,
} as const;
const PUBLIC_RPG_STATE_HASH_RE = new RegExp(`^[0-9a-f]{${RPG_PUBLIC_STATE_HASH_LENGTH}}$`);
const PUBLIC_RPG_TRANSCRIPT_HASH_RE = new RegExp(
  `^[0-9a-f]{${RPG_PUBLIC_TRANSCRIPT_HASH_LENGTH}}$`,
);
const PUBLIC_OVERWORLD_SNAPSHOT_HASH_RE = new RegExp(
  `^[0-9a-f]{${OVERWORLD_PUBLIC_SNAPSHOT_HASH_LENGTH}}$`,
);

function numberedIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}_${i.toString().padStart(2, "0")}`);
}

function actionIdByCommand(a: ReturnType<typeof api>, sessionId: string, needle: string): string {
  const actions = a.list_legal_actions({ session_id: sessionId, compact_actions: false })
    .actions as {
    id: string;
    command?: string;
  }[];
  const found = actions.find((action) => action.command?.includes(needle));
  if (!found) throw new Error(`No legal action containing "${needle}".`);
  return found.id;
}

function stepByCommand(a: ReturnType<typeof api>, sessionId: string, needle: string) {
  return a.step_action({
    session_id: sessionId,
    action_id: actionIdByCommand(a, sessionId, needle),
    compact_events: false,
    compact_observation: false,
  });
}

function playSunkenBarrowToVictory(a: ReturnType<typeof api>, sessionId: string) {
  let last = stepByCommand(a, sessionId, "go down");
  expect(last.ok).toBe(true);
  last = stepByCommand(a, sessionId, "take iron bar");
  expect(last.ok).toBe(true);
  last = stepByCommand(a, sessionId, "go north");

  for (let i = 0; i < 40 && !last.observation.ended; i += 1) {
    if (last.observation.mode !== "rpg") throw new Error("expected RPG observation");
    if (!last.observation.enemies_present.some((enemy) => enemy.id === "barrow_wight")) break;
    last = stepByCommand(a, sessionId, "attack");
  }

  last = stepByCommand(a, sessionId, "go east");
  for (let i = 0; i < 40 && !last.observation.ended; i += 1) {
    const stage = a.get_state({ session_id: sessionId, include_state: true }).state.questStage[
      "barrow"
    ];
    if (stage === "slab_moved") break;
    last = stepByCommand(a, sessionId, "lever stone slab");
  }
  stepByCommand(a, sessionId, "go down");
  return stepByCommand(a, sessionId, "take Barrow");
}

function overworldRoadPath(from: string, to: string): string[] {
  const queue: { town: string; roadIds: string[] }[] = [{ town: from, roadIds: [] }];
  const seen = new Set<string>([from]);
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i]!;
    if (cur.town === to) return cur.roadIds;
    for (const edge of overworld.edges.filter(
      (candidate) => candidate.from === cur.town || candidate.to === cur.town,
    )) {
      const next = edge.from === cur.town ? edge.to : edge.from;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ town: next, roadIds: [...cur.roadIds, edge.id] });
    }
  }
  throw new Error(`No road path from ${from} to ${to}.`);
}

function overworldAreaPath(from: string, to: string): string[] {
  const queue: { area: string; routeIds: string[] }[] = [{ area: from, routeIds: [] }];
  const seen = new Set<string>([from]);
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i]!;
    if (cur.area === to) return cur.routeIds;
    for (const edge of overworld.area_edges.filter(
      (candidate) => candidate.from_area === cur.area || candidate.to_area === cur.area,
    )) {
      const next = edge.from_area === cur.area ? edge.to_area : edge.from_area;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ area: next, routeIds: [...cur.routeIds, edge.id] });
    }
  }
  throw new Error(`No area path from ${from} to ${to}.`);
}

function travelOverworldSessionTo(
  a: ReturnType<typeof api>,
  sessionId: string,
  townId: string,
): void {
  const start = a.get_overworld_session({ include_observation: true, session_id: sessionId })
    .observation.current.id;
  for (const roadId of overworldRoadPath(start, townId)) {
    a.travel_overworld_session({ session_id: sessionId, road_id: roadId });
    const observation = a.get_overworld_session({
      include_observation: true,
      session_id: sessionId,
    }).observation;
    if (observation.pendingRoadEncounter) {
      a.resolve_overworld_session_road_encounter({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: sessionId,
        strategy: "press_on",
      });
    }
  }
}

function revealOverworldQuest(a: ReturnType<typeof api>, sessionId: string, questId: string): void {
  const quest = overworld.quests.find((candidate) => candidate.id === questId);
  if (!quest) throw new Error(`Unknown overworld quest "${questId}".`);

  for (const roadId of overworldRoadPath(
    a.get_overworld_session({ include_observation: true, session_id: sessionId }).observation
      .current.id,
    quest.home,
  )) {
    a.travel_overworld_session({ session_id: sessionId, road_id: roadId });
    let view = a.get_overworld_session({
      include_observation: true,
      session_id: sessionId,
    }).observation;
    if (view.pendingRoadEncounter) {
      a.resolve_overworld_session_road_encounter({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: sessionId,
        strategy: "press_on",
      });
      view = a.get_overworld_session({
        include_observation: true,
        session_id: sessionId,
      }).observation;
    }
    if (view.supplies <= 2) a.resupply_overworld_session({ session_id: sessionId });
    if (view.fatigue >= 70) a.rest_overworld_session({ session_id: sessionId });
  }

  let view = a.get_overworld_session({
    include_observation: true,
    session_id: sessionId,
  }).observation;
  for (let i = 0; i < 8 && !view.discoveredAreaIds.includes(quest.area); i += 1) {
    if (!view.currentArea) throw new Error(`No current area in ${view.current.id}.`);
    a.explore_overworld_session_area({ session_id: sessionId, area_id: view.currentArea.id });
    view = a.get_overworld_session({
      include_observation: true,
      session_id: sessionId,
    }).observation;
  }
  if (!view.discoveredAreaIds.includes(quest.area)) {
    throw new Error(`Quest area "${quest.area}" was not discovered.`);
  }

  for (const routeId of overworldAreaPath(view.currentArea!.id, quest.area)) {
    a.move_overworld_session_area({ session_id: sessionId, area_route_id: routeId });
  }

  const revealActions = [
    () => {
      const poi = a.get_overworld_session({ include_observation: true, session_id: sessionId })
        .observation.pois[0];
      if (poi) a.scout_overworld_session_poi({ session_id: sessionId, poi_id: poi.id });
    },
    () => {
      const contact = a.get_overworld_session({ include_observation: true, session_id: sessionId })
        .observation.characters[0];
      if (contact) {
        a.talk_overworld_session_contact({
          ...FULL_OVERWORLD_RESPONSE,
          session_id: sessionId,
          character_id: contact.id,
        });
      }
    },
    () => {
      const event = a.get_overworld_session({ include_observation: true, session_id: sessionId })
        .observation.events[0];
      if (event) {
        a.investigate_overworld_session_event({ session_id: sessionId, event_id: event.id });
      }
    },
  ];
  for (const action of revealActions) {
    view = a.get_overworld_session({
      include_observation: true,
      session_id: sessionId,
    }).observation;
    if (view.discoveredQuestIds.includes(quest.id)) return;
    action();
  }

  view = a.get_overworld_session({ include_observation: true, session_id: sessionId }).observation;
  if (!view.discoveredQuestIds.includes(quest.id)) {
    throw new Error(`Quest "${quest.id}" was not discovered.`);
  }
}

function resolveCurrentOverworldSessionEvent(
  a: ReturnType<typeof api>,
  sessionId: string,
): ReturnType<ReturnType<typeof api>["resolve_overworld_session_event"]> {
  const view = a.get_overworld_session({
    include_observation: true,
    session_id: sessionId,
  }).observation;
  const event = view.events.find((candidate) => !view.resolvedEventIds.includes(candidate.id));
  if (!event) throw new Error(`No unresolved event in ${view.current.id}.`);
  a.scout_overworld_session_poi({ session_id: sessionId, poi_id: view.pois[0]!.id });
  a.talk_overworld_session_contact({
    ...FULL_OVERWORLD_RESPONSE,
    session_id: sessionId,
    character_id: view.characters[0]!.id,
  });
  a.investigate_overworld_session_event({ session_id: sessionId, event_id: event.id });
  return a.resolve_overworld_session_event({ session_id: sessionId, event_id: event.id });
}

describe("MCP tools — validate / load (§9.4)", () => {
  it("keeps world discovery RPG-only and removes the legacy story catalog", () => {
    const a = api();
    expect((a as unknown as Record<string, unknown>).list_stories).toBeUndefined();
    const world = a.list_world();
    const titled = a.list_world({ include_titles: true });
    const detailed = a.list_world({ include_details: true });
    const expanded = a.list_world({ include_graph: true, include_routes: true });
    expect("main_story" in world).toBe(false);
    expect("main_world_quest_id" in world).toBe(false);
    expect("graph" in world).toBe(false);
    expect("graph" in world.world).toBe(false);
    expect(world.quests).toHaveLength(16);
    expect(world.quests.every((q) => Array.isArray(q))).toBe(true);
    expect(world.quests.every((q) => q.length === 2)).toBe(true);
    expect(world.quests.every((q) => typeof q[1] === "boolean")).toBe(true);
    expect(titled.quests.every((q) => q.length === 3)).toBe(true);
    expect(titled.quests.find((q) => q[0] === "breaking_weir")).toEqual([
      "breaking_weir",
      "The Breaking Weir",
      true,
    ]);
    expect(world.quests.every((q) => !("path" in q))).toBe(true);
    expect(world.quests.every((q) => !("path_from_hub" in q))).toBe(true);
    expect(world.quests.every((q) => !("mode" in q))).toBe(true);
    expect(world.quests.every((q) => !("id" in q))).toBe(true);
    expect(world.quests.every((q) => !("graph_node" in q))).toBe(true);
    expect(world.quests.every((q) => !("district" in q))).toBe(true);
    expect(world.quests.every((q) => !("quest" in q))).toBe(true);
    expect(world.quests.every((q) => !("role" in q))).toBe(true);
    expect(world.quests.every((q) => !("connection" in q))).toBe(true);
    expect(detailed.quests.find((s) => s.world_quest_id === "breaking_weir")?.connection).toContain(
      "Charterhaven",
    );
    expect(detailed.quests.every((q) => !("path_from_hub" in q))).toBe(true);
    expect(expanded.graph.nodes.every((node) => !("pack" in node))).toBe(true);
    expect(expanded.graph.nodes.every((node) => !("source" in node))).toBe(true);
    expect(
      expanded.quests.find((s) => s.world_quest_id === "breaking_weir")?.path_from_hub.at(-1)?.name,
    ).toBe("The Breaking Weir");
    expect(expanded.graph.nodes.find((node) => node.id === "breaking_weir")?.name).toBe(
      "The Breaking Weir",
    );
    expect(world.hub).toBe("Charterhaven");
    expect(world.world.hub).toBe("Charterhaven");
    expect(expanded.graph.hub).toBe("charterhaven");
    expect(world.quests.some((s) => s[0] === "sunken_barrow")).toBe(true);
    expect(world.quests.some((s) => s[0] === "breaking_weir")).toBe(true);
    expect(world.quests.map((q) => q[0])).toEqual(
      expanded.graph.nodes.filter((node) => node.kind === "quest").map((node) => node.id),
    );
    expect(JSON.stringify(world).length).toBeLessThan(JSON.stringify(detailed).length);
    expect(JSON.stringify(world).length).toBeLessThan(JSON.stringify(titled).length);
    expect(JSON.stringify(world).length).toBeLessThanOrEqual(650);
  });

  it("lists the unified world as a hub plus quest areas", () => {
    const r = api().list_world({ include_graph: true, include_routes: true });
    expect(r.world.id).toBe("charter_marches");
    expect(r.hub).toBe("Charterhaven");
    expect(r.graph.hub).toBe("charterhaven");
    expect(r.graph.edges.find((edge) => edge.route === "moor road")).toMatchObject({
      from_coord: [0, 0],
      to_coord: [-2, 2],
      delta: [-2, 2],
      distance: 4,
    });
    expect(r.quest_count).toBe(16);
    expect(r.quests.every((q) => !("mode" in q))).toBe(true);
    expect(r.quests.every((q) => !("id" in q))).toBe(true);
    expect(r.quests.every((q) => !("graph_node" in q))).toBe(true);
    const breakingWeir = r.quests.find((q) => q.world_quest_id === "breaking_weir");
    expect(breakingWeir).toMatchObject({
      district: "Breaking Weir",
      quest: "restore the flood works before the village breaks",
      role: "weir keeper",
      playable: true,
      world_quest_id: "breaking_weir",
    });
    expect("path" in (breakingWeir ?? {})).toBe(false);
    expect(breakingWeir?.path_from_hub.map((step) => step.name)).toEqual([
      "Charterhaven",
      "Industrial Cut",
      "The Breaking Weir",
    ]);
  });

  it("returns the graph path from Charterhaven to a quest", () => {
    const r = api().world_path({ world_quest_id: "sunken_barrow" });
    expect(r.graph_node).toBe("sunken_barrow");
    expect(r.world_quest_id).toBe("sunken_barrow");
    expect(r.path_v).toBe(1);
    expect(r.path).toEqual([
      ["charterhaven", "Charterhaven", "hub", [0, 0], null, null],
      ["moor_road", "Moor Road", "route", [-2, 2], "moor road", 4],
      ["sunken_barrow", "The Sunken Barrow", "quest", [-3, 3], "barrow causeway", 2],
    ]);
    expect("world" in r).toBe(false);
    expect("path_from_hub" in r).toBe(false);

    const full = api().world_path({ world_quest_id: "sunken_barrow", compact_path: false });
    expect(full.world.hub).toBe("Charterhaven");
    expect(full.graph_node).toBe("sunken_barrow");
    expect(full.world_quest_id).toBe("sunken_barrow");
    expect("quest_path" in r).toBe(false);
    expect(full.path_from_hub.map((step) => step.name)).toEqual([
      "Charterhaven",
      "Moor Road",
      "The Sunken Barrow",
    ]);
    expect(full.path_from_hub.map((step) => step.coord)).toEqual([
      [0, 0],
      [-2, 2],
      [-3, 3],
    ]);
    expect(full.path_from_hub[1]?.route_from_previous).toBe("moor road");
    expect(full.path_from_hub[1]?.delta_from_previous).toEqual([-2, 2]);
    expect(full.path_from_hub[1]?.distance_from_previous).toBe(4);
    expect(full.path_from_hub[2]?.delta_from_previous).toEqual([-1, 1]);
    expect(full.path_from_hub[2]?.distance_from_previous).toBe(2);

    const byCoord = api().world_path({ coord: [-2, 2] });
    expect(byCoord.world_quest_id).toBeNull();
    expect(byCoord.graph_node).toBe("moor_road");
    expect(byCoord.path.map((step) => step[1])).toEqual(["Charterhaven", "Moor Road"]);
    expect(byCoord.path.at(-1)?.[3]).toEqual([-2, 2]);

    expect(() => api().world_path({})).toThrow(/requires world_quest_id or coord/);
    expect(() => api().world_path({ world_quest_id: "sunken_barrow", coord: [-2, 2] })).toThrow(
      /either world_quest_id or coord/,
    );
    expect(() => api().world_path({ coord: [99, 99] })).toThrow(/Unknown world graph coord/);
    expect(() => api().world_path({ quest_path: PACK } as never)).toThrow(/not quest_path/);
  });

  it("starts shipped quests by world graph id instead of raw pack path", () => {
    const a = api();
    const started = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
      include_world_context: true,
    });
    expect(started.quest).toMatchObject({
      id: "sunken_barrow",
    });
    expect("pack" in started.quest).toBe(false);
    expect(started.quest.path_from_hub.map((step) => step.name)).toEqual([
      "Charterhaven",
      "Moor Road",
      "The Sunken Barrow",
    ]);
    expect("mode" in started).toBe(false);
    expect("pack_path" in started).toBe(false);
    expect("packPath" in a.sessions.get(started.session_id)).toBe(false);
    expect(started.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in started).toBe(false);
    expect(started.observation.world?.id).toBe("charter_marches");
    const followUp = a.get_observation({
      session_id: started.session_id,
      compact_observation: false,
    }).observation;
    expect(followUp.title).toBe(started.observation.title);
    expect(followUp).not.toHaveProperty("world");

    const viaWorldQuest = a.start_world_quest({ world_quest_id: "breaking_weir", seed: 1 });
    expect("pack_path" in viaWorldQuest).toBe(false);
    expect("world" in viaWorldQuest).toBe(false);
    expect("quest" in viaWorldQuest).toBe(false);
    expect(viaWorldQuest.world_quest_id).toBe("breaking_weir");
    expect("generated_rpg_seed" in viaWorldQuest).toBe(false);
    expect(() => a.new_game({ world_quest_id: "breaking_weir" } as never)).toThrow(
      /start_world_quest/,
    );
    expect(() => a.start_world_quest({} as never)).toThrow(/requires world_quest_id/);
    expect(() => a.start_world_quest({ quest_id: "sunken_barrow" } as never)).toThrow(
      /not quest_id/,
    );
    expect(() => a.start_world_quest({ world_quest_id: "missing_quest" })).toThrow(
      /Unknown Charter Marches quest/,
    );
  });

  it("reuses unchanged RPG quest load reports inside one MCP API instance", () => {
    const a = api();
    const first = a.validate_quest({ world_quest_id: "sunken_barrow" });
    const second = a.validate_quest({ world_quest_id: "sunken_barrow" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.report).toBe(first.report);
    expect(Object.isFrozen(first.report)).toBe(true);
    expect(Object.isFrozen(first.report.findings)).toBe(true);
    expect(() => {
      first.report.findings.push({
        severity: "error",
        code: "MUTATED",
        message: "mutated report",
        where: ["test"],
      });
    }).toThrow();
    expect(a.validate_quest({ world_quest_id: "sunken_barrow" }).report.findings).toEqual([]);
  });

  it("reuses generated RPG packs by seed inside one MCP API instance", () => {
    const a = api();
    const preview = a.generate_rpg_pack({ seed: 7 });
    const first = a.new_game({ generate_rpg_seed: 7 });
    const second = a.new_game({ generate_rpg_seed: 7 });
    const other = a.new_game({ generate_rpg_seed: 8 });
    const firstSession = a.sessions.get(first.session_id);
    const secondSession = a.sessions.get(second.session_id);
    const otherSession = a.sessions.get(other.session_id);

    expect(preview.ok).toBe(true);
    expect(first.generated_rpg_seed).toBe(7);
    expect(firstSession.contentHash).toBe(preview.content_hash);
    expect(secondSession.index.pack).toBe(firstSession.index.pack);
    expect(otherSession.index.pack).not.toBe(firstSession.index.pack);
    expect(Object.isFrozen(preview.report)).toBe(true);
    expect(Object.isFrozen(preview.meta)).toBe(true);
    expect(Object.isFrozen(firstSession.index.pack)).toBe(true);
    expect(() => {
      preview.meta.title = "Mutated generated title";
    }).toThrow();
    expect(a.generate_rpg_pack({ seed: 7 }).meta.title).toBe(preview.meta.title);
  });

  it("rejects unsafe runtime seeds before RPG session creation", () => {
    const a = api();
    const unsafeSeed = Number.MAX_SAFE_INTEGER + 1;

    expect(() =>
      a.start_world_quest({ world_quest_id: "sunken_barrow", seed: unsafeSeed }),
    ).toThrow(/safe range/);
    expect(() => a.new_game({ generate_rpg_seed: 7, seed: unsafeSeed })).toThrow(/safe range/);
  });

  it("reuses RPG runtime indexes and rules inside one MCP API instance", () => {
    const a = api();
    const first = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const second = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 2 });
    const saved = a.save_game({ session_id: first.session_id });
    const loaded = a.load_game({ save: saved.save, compact_observation: false });
    const firstSession = a.sessions.get(first.session_id);
    const secondSession = a.sessions.get(second.session_id);
    const loadedSession = a.sessions.get(loaded.session_id);

    expect(secondSession.index).toBe(firstSession.index);
    expect(secondSession.rules).toBe(firstSession.rules);
    expect(secondSession.step).toBe(firstSession.step);
    expect(loadedSession.index).toBe(firstSession.index);
    expect(loadedSession.rules).toBe(firstSession.rules);
    expect(loadedSession.step).toBe(firstSession.step);

    const startRoom = firstSession.index.rooms.get(firstSession.index.pack.meta.start_room);
    if (!startRoom) throw new Error("expected runtime start room");
    expect(Object.isFrozen(firstSession.index)).toBe(true);
    expect(Object.isFrozen(firstSession.index.rooms)).toBe(true);
    expect(Object.isFrozen(firstSession.index.enemies)).toBe(true);
    expect(Object.isFrozen(firstSession.index.enemyByRoom)).toBe(true);
    expect(Object.isFrozen(firstSession.index.pack)).toBe(true);
    expect(Object.isFrozen(firstSession.index.pack.rooms)).toBe(true);
    expect(Object.isFrozen(startRoom)).toBe(true);
    expect(Object.isFrozen(firstSession.rules)).toBe(true);
    expect(() => {
      firstSession.index.rooms.set("__mutated_room", startRoom);
    }).toThrow(/immutable/);
    expect(() => {
      firstSession.index.enemyByRoom.clear();
    }).toThrow(/immutable/);
    expect(() => {
      firstSession.index.pack.rooms.push(startRoom);
    }).toThrow();
    expect(() => {
      startRoom.name = "Mutated Room";
    }).toThrow();
    expect(() => {
      (firstSession.rules as { legalActions: unknown }).legalActions = () => [];
    }).toThrow();

    const third = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 3 });
    const thirdSession = a.sessions.get(third.session_id);
    expect(thirdSession.index).toBe(firstSession.index);
    expect(thirdSession.index.rooms.has("__mutated_room")).toBe(false);
    expect(thirdSession.index.rooms.get(firstSession.index.pack.meta.start_room)?.name).toBe(
      startRoom.name,
    );
  });

  it("lists the New York overworld as a start town plus weighted roads", () => {
    const a = api();
    const r = a.list_overworld();
    const withDesignNotes = a.list_overworld({ include_design_notes: true });
    const canonicalQuestIds = new Set(a.list_world().quests.map((quest) => quest[0]));
    expect(r.world.id).toBe("new_york_overworld");
    expect(r.start.id).toBe("albany_city");
    expect(r.town_count).toBeGreaterThanOrEqual(240);
    expect(r.road_count).toBeGreaterThan(r.town_count);
    expect(r.region_count).toBe(9);
    expect(r.regional_arc_count).toBe(r.region_count);
    expect(r.area_count).toBeGreaterThan(r.town_count * 2);
    expect(r.area_route_count).toBeGreaterThan(r.area_count - r.town_count);
    expect(r.character_count).toBeGreaterThanOrEqual(r.town_count);
    expect(r.local_event_count).toBeGreaterThanOrEqual(r.town_count);
    expect(r.local_job_count).toBe(r.area_count);
    expect(r.road_event_count).toBe(r.road_count);
    expect(r.exploration_site_count).toBeGreaterThanOrEqual(r.region_count * 3);
    expect(r.quest_count).toBe(11);
    expect(r).not.toHaveProperty("sources");
    expect(r).not.toHaveProperty("design_rules");
    expect(JSON.stringify(r).length).toBeLessThan(1700);
    expect(withDesignNotes.sources.length).toBeGreaterThan(0);
    expect(withDesignNotes.design_rules.join(" ")).toContain("not globally selectable");
    expect(overworld.quests.every((quest) => canonicalQuestIds.has(quest.id))).toBe(true);
  });

  it("plays a stateful New York overworld session through MCP", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    expect(started.session_id).toMatch(/^o\d+$/);
    expect(started.observation.current.id).toBe("albany_city");
    expect(started.observation.journal).toEqual([]);
    expect(started.observation.areas).toHaveLength(1);
    expect(started.observation.currentArea?.id).toBe(started.observation.areas[0]?.id);
    expect(started.observation.areaExits).toEqual([]);
    expect(started.observation.hiddenAreaCount).toBeGreaterThan(0);
    expect(started.observation.discoveredAreaIds).toEqual(
      started.observation.areas.map((area) => area.id),
    );
    expect(started.observation.visitedAreaIds).toEqual([]);
    expect(started.observation.sites).toEqual([]);
    expect(started.observation.hiddenSiteCount).toBeGreaterThan(0);
    expect(started.observation.jobs).toEqual([]);
    expect(started.observation.hiddenJobCount).toBeGreaterThan(0);
    expect(started.observation.discoveredJobIds).toEqual([]);
    expect(started.observation.completedJobIds).toEqual([]);
    expect(started.observation.quests).toEqual([]);
    expect(started.observation.hiddenQuestCount).toBeGreaterThan(0);
    expect(started.observation.discoveredQuestIds).toEqual([]);
    expect(started.observation.supplies).toBe(6);
    expect(started.observation.maxSupplies).toBe(8);
    expect(started.observation.fatigue).toBe(0);
    expect(started.observation.travelCondition).toBe("ready");
    expect(started.observation.pendingRoadEncounter).toBeNull();
    expect(started.observation.routeOptions.map((route) => route.destination.id)).toContain(
      "colonie_town",
    );
    expect(started.observation.regionalArcs[0]).toMatchObject({
      region: "Capital / Mohawk",
      completed: false,
      resolvedInRegion: 0,
    });

    const poi = started.observation.pois[0]!;
    const contact = started.observation.characters[0]!;
    const event = started.observation.events[0]!;
    const localQuests = overworld.quests
      .filter((quest) => quest.home === started.observation.current.id)
      .sort((a, b) => a.title.localeCompare(b.title));
    expect(localQuests.length).toBeGreaterThan(0);
    const planned = a.plan_overworld_session_route({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      destination_town_id: "colonie_town",
    });
    expect(planned.route.destination.id).toBe("colonie_town");
    expect(planned.route.steps[0]?.to.id).toBe("colonie_town");
    expect(planned.route.estimate).toMatchObject({
      baseMinutes: planned.route.totalMinutes,
      delayMinutes: 0,
      elapsedMinutes: planned.route.totalMinutes,
      supplyDeficit: 0,
    });
    expect(planned.observation.routeOptions[0]?.estimate.suppliesNeeded).toBeGreaterThan(0);
    expect(() =>
      a.plan_overworld_session_route({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        destination_town_id: "buffalo_city",
      }),
    ).toThrow(/not discovered/i);

    expect(() =>
      a.resolve_overworld_session_event({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        event_id: event.id,
      }),
    ).toThrow(/Before resolving/i);

    const scouted = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      poi_id: poi.id,
    });
    expect(scouted.result.minutes).toBe(20);
    expect(scouted.result.discoveredJobs).toHaveLength(1);
    expect(scouted.result.discoveredSites).toHaveLength(1);
    expect(scouted.result.discoveredQuests).toEqual([]);
    expect(scouted.observation.sites.map((site) => site.id)).toEqual(
      scouted.result.discoveredSites?.map((site) => site.id),
    );
    expect(scouted.observation.jobs.map((job) => job.id)).toEqual(
      scouted.result.discoveredJobs?.map((job) => job.id),
    );
    expect(scouted.observation.quests).toEqual([]);
    expect(scouted.observation.hiddenQuestCount).toBe(localQuests.length);
    expect(scouted.observation.journal[0]?.title).toContain(poi.title);

    const questAreaId = localQuests[0]!.area;
    const stagingRoute = scouted.observation.areaExits[0]!;
    expect(stagingRoute.destination.id).not.toBe(questAreaId);
    let areaObservation = a.move_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_route_id: stagingRoute.id,
    }).observation;
    expect(areaObservation.currentArea?.id).not.toBe(questAreaId);

    const questLeadPoi = areaObservation.pois[0]!;
    const scoutedQuestLead = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      poi_id: questLeadPoi.id,
    });
    expect(scoutedQuestLead.result.discoveredQuests?.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(scoutedQuestLead.result.discoveredQuests?.every((quest) => !("pack" in quest))).toBe(
      true,
    );
    expect(scoutedQuestLead.observation.quests.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(scoutedQuestLead.observation.quests.every((quest) => !("pack" in quest))).toBe(true);
    expect(
      a.get_overworld_session_context({ session_id: started.session_id }).context.quests?.[0],
    ).toEqual([
      scoutedQuestLead.observation.quests[0]!.id,
      scoutedQuestLead.observation.quests[0]!.title,
    ]);
    expect(scoutedQuestLead.observation.hiddenQuestCount).toBe(localQuests.length - 1);

    const discoveredQuests = scoutedQuestLead.result.discoveredQuests ?? [];
    expect(discoveredQuests).toHaveLength(1);
    const discoveredQuest = discoveredQuests[0]!;
    expect(discoveredQuest.area).toBeDefined();
    expect(scoutedQuestLead.observation.currentArea?.id).not.toBe(discoveredQuest.area);
    expect(() =>
      a.start_overworld_session_quest({
        ...FULL_OVERWORLD_QUEST_START,
        session_id: started.session_id,
        quest_id: discoveredQuest.id,
      }),
    ).toThrow(/Move to/i);

    const routeToQuestArea = scoutedQuestLead.observation.areaExits.find(
      (exit) => exit.destination.id === discoveredQuest.area,
    );
    expect(routeToQuestArea).toBeDefined();
    areaObservation = a.move_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_route_id: routeToQuestArea!.id,
    }).observation;
    expect(areaObservation.currentArea?.id).toBe(discoveredQuest.area);
    const beforeQuestStart = a.export_overworld_session({
      session_id: started.session_id,
    });
    expect(beforeQuestStart.ok).toBe(true);
    if (!beforeQuestStart.ok) throw new Error("expected pre-quest export");
    const originalStartWorldQuest = a.start_world_quest;
    a.start_world_quest = (() => {
      throw new Error("simulated RPG startup failure");
    }) as typeof a.start_world_quest;
    try {
      expect(() =>
        a.start_overworld_session_quest({
          ...FULL_OVERWORLD_QUEST_START,
          session_id: started.session_id,
          quest_id: discoveredQuest.id,
        }),
      ).toThrow(/simulated RPG startup failure/);
    } finally {
      a.start_world_quest = originalStartWorldQuest;
    }
    const afterFailedQuestStart = a.export_overworld_session({
      session_id: started.session_id,
    });
    expect(afterFailedQuestStart.ok).toBe(true);
    if (!afterFailedQuestStart.ok) throw new Error("expected post-failure export");
    expect(afterFailedQuestStart.snapshot_hash).toBe(beforeQuestStart.snapshot_hash);
    expect(afterFailedQuestStart.snapshot).toEqual(beforeQuestStart.snapshot);
    expect(afterFailedQuestStart.snapshot.startedQuestIds).toEqual([]);
    const startedQuest = a.start_overworld_session_quest({
      ...FULL_OVERWORLD_QUEST_START,
      session_id: started.session_id,
      quest_id: discoveredQuest.id,
    });
    expect(startedQuest.quest).toMatchObject({
      id: discoveredQuest.id,
      area: discoveredQuest.area,
    });
    expect("pack" in startedQuest.quest).toBe(false);
    expect(startedQuest.rpg_session_id).toBe(startedQuest.rpg_session.session_id);
    expect("mode" in startedQuest.rpg_session).toBe(false);
    expect(startedQuest.rpg_session.world_quest_id).toBe(discoveredQuest.id);
    expect("generated_rpg_seed" in startedQuest.rpg_session).toBe(false);
    expect("pack_path" in startedQuest.rpg_session).toBe(false);
    expect(startedQuest.rpg_session.observation.mode).toBe("rpg");
    expect(startedQuest.rpg_session.observation.ended).toBe(false);
    expect(startedQuest.rpg_session.observation.available_actions.length).toBeGreaterThan(0);
    expect(startedQuest.observation.startedQuestIds).toEqual([discoveredQuest.id]);
    expect(startedQuest.observation.journal[0]).toMatchObject({
      id: `quest:${discoveredQuest.id}`,
      kind: "quest",
    });
    expect(() =>
      a.start_overworld_session_quest({
        ...FULL_OVERWORLD_QUEST_START,
        session_id: started.session_id,
        quest_id: discoveredQuest.id,
      }),
    ).toThrow(/already been started/i);
    expect(() =>
      a.complete_overworld_session_quest({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        rpg_session_id: startedQuest.rpg_session_id,
      }),
    ).toThrow(/has not ended/i);
    const afterQuestStart = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: startedQuest.snapshot_hash,
    });
    expect(afterQuestStart.ok).toBe(true);
    if (!afterQuestStart.ok) throw new Error("expected post-quest export");
    expect(afterQuestStart.snapshot.startedQuestIds).toEqual([discoveredQuest.id]);
    expect(() =>
      a.restore_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        snapshot: { ...afterQuestStart.snapshot, startedQuestIds: [] },
      }),
    ).toThrow(/started quest id/i);
    expect(() =>
      a.restore_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        snapshot: {
          ...afterQuestStart.snapshot,
          journalEntries: afterQuestStart.snapshot.journalEntries.filter(
            (entry) => entry.id !== `quest:${discoveredQuest.id}`,
          ),
        },
      }),
    ).toThrow(/started quest id/i);
    expect(
      a.get_observation({
        session_id: startedQuest.rpg_session_id,
        compact_observation: false,
      }).observation.title,
    ).toBe(startedQuest.rpg_session.observation.title);
    const compactSource = a.restore_overworld_session({
      snapshot: beforeQuestStart.snapshot,
      compact_context: true,
    });
    const compactStartedQuest = a.start_overworld_session_quest({
      session_id: compactSource.session_id,
      quest_id: discoveredQuest.id,
      compact_context: true,
      compact_actions: true,
      compact_observation: true,
      include_actions: true,
    });
    expect(compactStartedQuest.context.here[0]).toBe(started.observation.current.id);
    expect("observation" in compactStartedQuest).toBe(false);
    expect(compactStartedQuest.rpg_session.context.actions?.[0]).toEqual(expect.any(String));
    expect("observation" in compactStartedQuest.rpg_session).toBe(false);
    expect(JSON.stringify(compactStartedQuest).length).toBeLessThan(
      JSON.stringify(startedQuest).length,
    );

    expect(() =>
      a.scout_overworld_session_poi({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        poi_id: poi.id,
      }),
    ).toThrow(/Move to that local area/i);
    for (const routeId of overworldAreaPath(
      areaObservation.currentArea!.id,
      started.observation.currentArea!.id,
    )) {
      a.move_overworld_session_area({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        area_route_id: routeId,
      });
    }

    const repeated = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      poi_id: poi.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.minutes).toBe(0);
    expect(repeated.result.discoveredSites).toEqual([]);
    expect(repeated.result.discoveredJobs).toEqual([]);
    expect(repeated.result.discoveredQuests).toEqual([]);
    expect(repeated.observation.journal).toHaveLength(3);

    const talked = a.talk_overworld_session_contact({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      character_id: contact.id,
    });
    expect(talked.result.discoveredQuests).toEqual([]);
    expect(talked.observation.quests.map((quest) => quest.id)).toEqual(
      localQuests.slice(0, 1).map((quest) => quest.id),
    );
    expect(talked.observation.journal).toHaveLength(4);

    const investigated = a.investigate_overworld_session_event({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      event_id: event.id,
    });
    expect(investigated.result.discoveredQuests).toEqual([]);
    expect(investigated.observation.journal).toHaveLength(5);
    expect(investigated.observation.timeLabel).not.toBe(started.observation.timeLabel);

    const resolved = a.resolve_overworld_session_event({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      event_id: event.id,
    });
    expect(resolved.result.minutes).toBe(30 + event.intensity * 10);
    expect(resolved.result.entry.kind).toBe("resolution");
    expect(resolved.observation.journal).toHaveLength(6);
    expect(resolved.observation.resolvedEventIds).toContain(event.id);
    expect(resolved.observation.regionRenown[started.observation.current.region]).toBe(
      event.intensity,
    );
    expect(resolved.observation.regionalArcs[0]).toMatchObject({
      region: "Capital / Mohawk",
      resolvedInRegion: 1,
      completed: false,
    });
    const repeatedResolved = a.resolve_overworld_session_event({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      event_id: event.id,
    });
    expect(repeatedResolved.result.alreadyKnown).toBe(true);
    expect(repeatedResolved.result.minutes).toBe(0);
    expect(repeatedResolved.result.discoveredAreas).toEqual([]);
    expect(repeatedResolved.result.discoveredJobs).toEqual([]);
    expect(repeatedResolved.result.discoveredSites).toEqual([]);
    expect(repeatedResolved.result.discoveredQuests).toEqual([]);
    expect(repeatedResolved.snapshot_hash).toBe(resolved.snapshot_hash);

    const road = resolved.observation.exits.find((edge) => edge.destination.id === "colonie_town");
    expect(road).toBeTruthy();
    const traveled = a.travel_overworld_session({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      road_id: road!.id,
    });
    expect(traveled.travel.baseMinutes).toBe(road!.travel_minutes);
    expect(traveled.travel.delayMinutes).toBe(0);
    expect(traveled.travel.minutes).toBe(road!.travel_minutes);
    expect(traveled.travel.suppliesUsed).toBeGreaterThan(0);
    expect(traveled.travel.suppliesAfter).toBeLessThan(resolved.observation.supplies);
    expect(traveled.travel.fatigueGained).toBeGreaterThan(0);
    expect(traveled.travel.fatigueAfter).toBeGreaterThan(resolved.observation.fatigue);
    expect(traveled.observation.current.id).toBe("colonie_town");
    expect(traveled.observation.areas).toHaveLength(1);
    expect(traveled.observation.currentArea?.id).toBe(traveled.observation.areas[0]?.id);
    expect(traveled.observation.supplies).toBe(traveled.travel.suppliesAfter);
    expect(traveled.observation.fatigue).toBe(traveled.travel.fatigueAfter);
    expect(traveled.observation.pendingRoadEncounter).toMatchObject({
      edgeId: road!.id,
      from: "Albany city",
      to: "Colonie town",
    });
    expect(
      traveled.observation.pendingRoadEncounter?.options.map((option) => option.strategy),
    ).toEqual(["cautious_scout", "assist_travelers", "press_on"]);
    expect(traveled.observation.log[0]?.to).toBe("Colonie town");
    expect(traveled.observation.journal).toHaveLength(6);

    expect(() =>
      a.travel_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        road_id: traveled.observation.exits[0]!.id,
      }),
    ).toThrow(/pending road encounter/i);
    expect(() =>
      a.resupply_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
      }),
    ).toThrow(/pending road encounter/i);
    expect(() =>
      a.plan_overworld_session_route({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        destination_town_id: traveled.observation.exits[0]!.destination.id,
      }),
    ).toThrow(/pending road encounter/i);

    const roadEncounter = a.resolve_overworld_session_road_encounter({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      strategy: "cautious_scout",
    });
    expect(roadEncounter.result).toMatchObject({
      strategy: "cautious_scout",
      suppliesUsed: 0,
      renownGained: 1,
    });
    expect(roadEncounter.result.entry.kind).toBe("road");
    expect(roadEncounter.observation.pendingRoadEncounter).toBeNull();
    expect(roadEncounter.observation.journal[0]?.kind).toBe("road");

    const resupplied = a.resupply_overworld_session({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
    });
    expect(resupplied.result).toMatchObject({
      action: "resupply",
      changed: true,
      minutes: 45,
      suppliesBefore: roadEncounter.observation.supplies,
      suppliesAfter: traveled.observation.maxSupplies,
      fatigueBefore: roadEncounter.observation.fatigue,
      fatigueAfter: roadEncounter.observation.fatigue,
    });
    expect(resupplied.result.entry?.kind).toBe("service");
    expect(resupplied.observation.supplies).toBe(resupplied.observation.maxSupplies);
    expect(resupplied.observation.journal[0]?.title).toContain("Resupplied");

    const rested = a.rest_overworld_session({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
    });
    expect(rested.result.action).toBe("rest");
    expect(rested.result.changed).toBe(true);
    expect(rested.result.minutes).toBeGreaterThan(0);
    expect(rested.result.fatigueBefore).toBe(roadEncounter.observation.fatigue);
    expect(rested.result.fatigueAfter).toBe(0);
    expect(rested.result.entry?.kind).toBe("service");
    expect(rested.observation.fatigue).toBe(0);
    expect(rested.observation.travelCondition).toBe("ready");

    expect(() =>
      a.talk_overworld_session_contact({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        character_id: contact.id,
      }),
    ).toThrow(/not in this town/i);
    expect(() =>
      a.travel_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        road_id: "road_buffalo_city__tonawanda_town",
      }),
    ).toThrow(/not reachable/i);
  });

  it("syncs ended RPG quest sessions back into overworld progress", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    revealOverworldQuest(a, started.session_id, "sunken_barrow");

    const launched = a.start_overworld_session_quest({
      ...FULL_OVERWORLD_QUEST_START,
      session_id: started.session_id,
      quest_id: "sunken_barrow",
      seed: 1,
    });
    const generated = a.new_game({ generate_rpg_seed: 1 });
    expect(() =>
      a.complete_overworld_session_quest({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        rpg_session_id: generated.session_id,
      }),
    ).toThrow(/Only shipped world quest/i);
    const directWorldQuest = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    expect(() =>
      a.complete_overworld_session_quest({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        rpg_session_id: directWorldQuest.session_id,
      }),
    ).toThrow(/not started from this overworld session/i);

    const ended = playSunkenBarrowToVictory(a, launched.rpg_session_id);
    const fullEndedStateHash = hashState(
      a.get_state({ session_id: launched.rpg_session_id, include_state: true }).state,
    );
    expect(ended.observation.ended).toBe(true);
    expect(ended.observation.ending_id).toBe("ending_victory");
    expect(ended.state_hash).toBe(publicRpgStateHash(fullEndedStateHash));

    const staleCompletion = a.complete_overworld_session_quest({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      rpg_session_id: launched.rpg_session_id,
      expected_snapshot_hash: started.snapshot_hash,
    });
    expect(staleCompletion.ok).toBe(false);
    if (staleCompletion.ok) throw new Error("expected stale completion rejection");
    expect(staleCompletion.rejection_reason).toMatch(/Snapshot hash mismatch/i);
    expect("context" in staleCompletion).toBe(false);
    expect("observation" in staleCompletion).toBe(false);

    const staleRpgCompletion = a.complete_overworld_session_quest({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      rpg_session_id: launched.rpg_session_id,
      expected_snapshot_hash: launched.snapshot_hash,
      expected_rpg_state_hash: launched.rpg_session.state_hash,
    });
    expect(staleRpgCompletion.ok).toBe(false);
    if (staleRpgCompletion.ok) throw new Error("expected stale RPG completion rejection");
    expect("state_hash" in staleRpgCompletion).toBe(true);
    if (!("state_hash" in staleRpgCompletion)) {
      throw new Error("expected RPG state hash rejection");
    }
    expect(staleRpgCompletion.state_hash).toBe(ended.state_hash);
    expect(staleRpgCompletion.rejection_reason).toMatch(/state hash mismatch/i);
    expect("snapshot_hash" in staleRpgCompletion).toBe(false);
    expect("result" in staleRpgCompletion).toBe(false);
    expect("context" in staleRpgCompletion).toBe(false);
    expect("observation" in staleRpgCompletion).toBe(false);

    const completed = a.complete_overworld_session_quest({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      rpg_session_id: launched.rpg_session_id,
      expected_snapshot_hash: launched.snapshot_hash,
      expected_rpg_state_hash: fullEndedStateHash,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error("expected quest completion");
    expect(completed.result).toMatchObject({
      alreadyKnown: false,
      endingId: "ending_victory",
      quest: { id: "sunken_barrow" },
    });
    expect(completed.result.entry).toMatchObject({
      id: "quest_done:sunken_barrow",
      kind: "quest_done",
    });
    expect(completed.observation.completedQuestIds).toEqual(["sunken_barrow"]);
    expect(completed.observation.journal[0]).toMatchObject({
      id: "quest_done:sunken_barrow",
      kind: "quest_done",
    });
    expect(
      a.get_overworld_session_context({ session_id: started.session_id, include_ids: true }).context
        .ids?.completed_quests,
    ).toEqual(["sunken_barrow"]);

    const repeated = a.complete_overworld_session_quest({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      rpg_session_id: launched.rpg_session_id,
    });
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) throw new Error("expected idempotent quest completion");
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.snapshot_hash).toBe(completed.snapshot_hash);

    const exported = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: completed.snapshot_hash,
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("expected completed quest export");
    expect(exported.snapshot.completedQuestIds).toEqual(["sunken_barrow"]);
    expect(() =>
      a.restore_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        snapshot: { ...exported.snapshot, completedQuestIds: [] },
      }),
    ).toThrow(/completed quest id/i);
    expect(() =>
      a.restore_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        snapshot: {
          ...exported.snapshot,
          journalEntries: exported.snapshot.journalEntries.filter(
            (entry) => entry.id !== "quest_done:sunken_barrow",
          ),
        },
      }),
    ).toThrow(/completed quest id/i);
  });

  it("returns compact stateful overworld context for repeated loop turns", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const startedSnapshotExport = a.export_overworld_session({ session_id: started.session_id });
    expect(startedSnapshotExport.ok).toBe(true);
    if (!startedSnapshotExport.ok) throw new Error("expected start snapshot export");
    const fullStartedSnapshotHash = hashState(startedSnapshotExport.snapshot);
    expect(fullStartedSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(started.snapshot_hash).toMatch(PUBLIC_OVERWORLD_SNAPSHOT_HASH_RE);
    expect(started.snapshot_hash).toBe(publicOverworldSnapshotHash(fullStartedSnapshotHash));
    const fullRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    });
    const full = fullRead.observation;
    const defaultRead = a.get_overworld_session({ session_id: started.session_id });
    const compact = a.get_overworld_session_context({ session_id: started.session_id });
    const compactStarted = a.start_overworld({ compact_context: true });
    const defaultStarted = a.start_overworld();

    expect(defaultRead).toMatchObject({ ok: true, session_id: started.session_id });
    expect(defaultRead.context).toEqual(compact.context);
    expect("observation" in defaultRead).toBe(false);
    expect("world" in defaultRead.context).toBe(false);
    expect("route_options" in defaultRead.context).toBe(false);
    expect("ids" in defaultRead.context).toBe(false);
    expect("world" in compact.context).toBe(false);
    expect("route_options" in compact.context).toBe(false);
    expect("ids" in compact.context).toBe(false);
    expect(compact).toMatchObject({ ok: true, session_id: started.session_id });
    expect(fullRead.snapshot_hash).toBe(started.snapshot_hash);
    expect(defaultRead.snapshot_hash).toBe(started.snapshot_hash);
    expect(compact.snapshot_hash).toBe(started.snapshot_hash);
    expect(compactStarted.snapshot_hash).toMatch(PUBLIC_OVERWORLD_SNAPSHOT_HASH_RE);
    expect(defaultStarted.snapshot_hash).toMatch(PUBLIC_OVERWORLD_SNAPSHOT_HASH_RE);
    expect(defaultStarted.context.v).toBe(10);
    expect("observation" in defaultStarted).toBe(false);
    expect("world" in defaultStarted.context).toBe(false);
    expect("route_options" in defaultStarted.context).toBe(false);
    const worldNamedRead = a.get_overworld_session_context({
      session_id: started.session_id,
      include_world_name: true,
    });
    expect(worldNamedRead.context.world).toBe(full.world);
    expect("route_options" in worldNamedRead.context).toBe(false);
    const defaultRoute = a.plan_overworld_session_route({
      session_id: started.session_id,
      destination_town_id: full.exits[0]!.destination.id,
    });
    expect(defaultRoute.route).toHaveLength(5);
    expect("destination" in defaultRoute.route).toBe(false);
    expect(defaultRoute.context.here[0]).toBe(full.current.id);
    expect("observation" in defaultRoute).toBe(false);
    expect("route_options" in defaultRoute.context).toBe(false);
    const defaultTravelRoad = defaultStarted.context.roads[0]!;
    const defaultTravel = a.travel_overworld_session({
      session_id: defaultStarted.session_id,
      destination_town_id: defaultTravelRoad[0],
      expected_snapshot_hash: defaultStarted.snapshot_hash,
    });
    expect(defaultTravel.ok).toBe(true);
    if (!defaultTravel.ok) throw new Error("default compact travel should pass snapshot guard");
    expect(defaultTravel.travel).toHaveLength(7);
    expect("baseMinutes" in defaultTravel.travel).toBe(false);
    expect(defaultTravel.context.here[0]).toBe(defaultTravelRoad[0]);
    expect("observation" in defaultTravel).toBe(false);
    const exportedForRestore = a.export_overworld_session({ session_id: started.session_id });
    expect(exportedForRestore.ok).toBe(true);
    if (!exportedForRestore.ok) throw new Error("expected export for compact restore default");
    const defaultRestored = a.restore_overworld_session({
      snapshot: exportedForRestore.snapshot,
    });
    expect(defaultRestored.snapshot_hash).toBe(exportedForRestore.snapshot_hash);
    expect(defaultRestored.context.here[0]).toBe(full.current.id);
    expect("observation" in defaultRestored).toBe(false);
    const repeatedCompactRead = a.get_overworld_session_context({
      session_id: started.session_id,
    });
    expect(repeatedCompactRead.snapshot_hash).toBe(started.snapshot_hash);
    expect(repeatedCompactRead.context).toEqual(compact.context);
    expect(repeatedCompactRead.context).not.toBe(compact.context);
    expect(repeatedCompactRead.context.roads).not.toBe(compact.context.roads);
    expect("world" in repeatedCompactRead.context).toBe(false);
    (repeatedCompactRead.context.here as unknown as string[])[0] = "mutated_by_test";
    const afterCompactMutationRead = a.get_overworld_session_context({
      session_id: started.session_id,
    });
    expect(afterCompactMutationRead.context.here[0]).toBe(full.current.id);
    expect("world" in afterCompactMutationRead.context).toBe(false);
    expect("ids" in afterCompactMutationRead.context).toBe(false);
    worldNamedRead.context.world = "mutated_by_test";
    const afterWorldNamedMutationRead = a.get_overworld_session_context({
      session_id: started.session_id,
      include_world_name: true,
    });
    expect(afterWorldNamedMutationRead.context.world).toBe(full.world);
    const idBundledRead = a.get_overworld_session_context({
      session_id: started.session_id,
      include_ids: true,
    });
    expect(idBundledRead.context.ids?.discovered_towns).toEqual(
      full.discovered.map((town) => town.id),
    );
    const expectedDiscoveredTownIds = [...(idBundledRead.context.ids?.discovered_towns ?? [])];
    idBundledRead.context.ids?.discovered_towns?.push("mutated_by_test");
    const afterIdBundledMutationRead = a.get_overworld_session_context({
      session_id: started.session_id,
      include_ids: true,
    });
    expect(afterIdBundledMutationRead.context.ids?.discovered_towns).toEqual(
      expectedDiscoveredTownIds,
    );
    const routedCompactRead = a.get_overworld_session_context({
      session_id: started.session_id,
      include_route_options: true,
    });
    expect(routedCompactRead.context.route_options?.[0]?.[4]).toBeDefined();
    const expectedRouteOptionIds = [...(routedCompactRead.context.route_options?.[0]?.[4] ?? [])];
    (routedCompactRead.context.route_options?.[0]?.[4] as unknown as string[] | undefined)?.push(
      "mutated_by_test",
    );
    const afterRoutedMutationRead = a.get_overworld_session_context({
      session_id: started.session_id,
      include_route_options: true,
    });
    expect(afterRoutedMutationRead.context.route_options?.[0]?.[4]).toEqual(expectedRouteOptionIds);
    const repeatedFullRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    });
    expect(repeatedFullRead.snapshot_hash).toBe(started.snapshot_hash);
    expect(repeatedFullRead.observation).toEqual(full);
    expect(repeatedFullRead.observation).not.toBe(full);
    expect(full.exits.length).toBeGreaterThan(0);
    expect(repeatedFullRead.observation.exits).not.toBe(full.exits);
    expect(repeatedFullRead.observation.exits[0]).not.toBe(full.exits[0]);
    expect(repeatedFullRead.observation.discoveredAreaIds).not.toBe(full.discoveredAreaIds);
    expect(repeatedFullRead.observation.routeOptions).toEqual(full.routeOptions);
    expect(repeatedFullRead.observation.routeOptions).not.toBe(full.routeOptions);
    expect(repeatedFullRead.observation.routeOptions[0]).not.toBe(full.routeOptions[0]);
    repeatedFullRead.observation.exits[0]!.travel_minutes = -1;
    repeatedFullRead.observation.discoveredAreaIds.push("mutated_by_test");
    repeatedFullRead.observation.routeOptions[0]!.estimate.elapsedMinutes = -1;
    const afterRouteMutationRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    });
    expect(afterRouteMutationRead.observation.exits[0]?.travel_minutes).toBe(
      full.exits[0]?.travel_minutes,
    );
    expect(afterRouteMutationRead.observation.discoveredAreaIds).toEqual(full.discoveredAreaIds);
    expect(afterRouteMutationRead.observation.routeOptions[0]?.estimate.elapsedMinutes).toBe(
      full.routeOptions[0]?.estimate.elapsedMinutes,
    );
    expect(full.regionalArcs.length).toBeGreaterThan(0);
    expect(repeatedFullRead.observation.regionalArcs).toEqual(full.regionalArcs);
    expect(repeatedFullRead.observation.regionalArcs).not.toBe(full.regionalArcs);
    expect(repeatedFullRead.observation.regionalArcs[0]).not.toBe(full.regionalArcs[0]);
    expect(repeatedFullRead.observation.regionalArcs[0]?.anchorTowns).not.toBe(
      full.regionalArcs[0]?.anchorTowns,
    );
    repeatedFullRead.observation.regionalArcs[0]!.resolvedInRegion = -1;
    repeatedFullRead.observation.regionalArcs[0]!.anchorTowns.length = 0;
    const afterArcMutationRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    });
    expect(afterArcMutationRead.observation.regionalArcs[0]?.resolvedInRegion).toBe(
      full.regionalArcs[0]?.resolvedInRegion,
    );
    expect(
      afterArcMutationRead.observation.regionalArcs[0]?.anchorTowns.map((town) => town.id),
    ).toEqual(full.regionalArcs[0]?.anchorTowns.map((town) => town.id));

    const unchangedFullRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
      if_snapshot_hash: started.snapshot_hash,
    });
    expect("unchanged" in unchangedFullRead).toBe(true);
    if (!("unchanged" in unchangedFullRead)) throw new Error("expected unchanged full read");
    expect("session_id" in unchangedFullRead).toBe(false);
    expect(unchangedFullRead.snapshot_hash).toBe(started.snapshot_hash);
    expect("observation" in unchangedFullRead).toBe(false);

    const unchangedCompactRead = a.get_overworld_session_context({
      session_id: started.session_id,
      if_snapshot_hash: started.snapshot_hash,
    });
    expect("unchanged" in unchangedCompactRead).toBe(true);
    if (!("unchanged" in unchangedCompactRead)) {
      throw new Error("expected unchanged compact read");
    }
    expect("session_id" in unchangedCompactRead).toBe(false);
    expect(unchangedCompactRead.snapshot_hash).toBe(started.snapshot_hash);
    expect("context" in unchangedCompactRead).toBe(false);
    expect(JSON.stringify(unchangedCompactRead).length).toBeLessThan(
      JSON.stringify(compact).length,
    );

    const compactWithRoutes = a.get_overworld_session_context({
      session_id: started.session_id,
      include_route_options: true,
    });
    const compactWithIds = a.get_overworld_session_context({
      session_id: started.session_id,
      include_ids: true,
    });
    expect(compact.context.v).toBe(10);
    expect(compact.context.here).toEqual([
      full.current.id,
      full.current.name,
      full.current.region,
      full.currentArea?.id ?? null,
      full.currentArea?.name ?? null,
    ]);
    expect(compact.context.vitals).toEqual([
      full.supplies,
      full.maxSupplies,
      full.fatigue,
      full.travelCondition,
    ]);
    expect(compact.context.hidden).toEqual([
      full.hiddenAreaCount,
      full.hiddenJobCount,
      full.hiddenSiteCount,
      full.hiddenQuestCount,
    ]);
    expect(compact.context.roads.map(([destinationTownId]) => destinationTownId)).toEqual(
      full.exits.map((edge) => edge.destination.id),
    );
    expect(compactStarted.context.here[0]).toBe("albany_city");
    expect("observation" in compactStarted).toBe(false);
    expect(compact.context.poi.map(([id]) => id)).toEqual(full.pois.map((poi) => poi.id));
    expect(compact.context.roads[0]).toHaveLength(4);
    expect(compact.context.roads[0]?.[1]).toEqual(expect.any(Number));
    if (compact.context.area_routes?.[0]) {
      expect(compact.context.area_routes[0]).toHaveLength(3);
      expect(compact.context.area_routes[0][2]).toEqual(expect.any(Number));
    }
    expect("route_options" in compact.context).toBe(false);
    expect(compactWithRoutes.context.route_options?.length).toBeLessThanOrEqual(8);
    expect(compactWithRoutes.context.route_options?.[0]?.[1]).toEqual(expect.any(Number));
    expect("area_routes" in compact.context).toBe(false);
    expect("jobs" in compact.context).toBe(false);
    expect("sites" in compact.context).toBe(false);
    expect("quests" in compact.context).toBe(false);
    expect("journal" in compact.context).toBe(false);
    expect("travel_log" in compact.context).toBe(false);
    expect(compact.context.progress).toEqual([full.visitedCount, full.totalTowns]);
    expect("renown" in compact.context).toBe(false);
    expect("completed_arcs" in compact.context).toBe(false);
    expect("ids" in compact.context).toBe(false);
    expect(compactWithIds.context.ids?.discovered_towns).toEqual(
      full.discovered.map((town) => town.id),
    );
    expect(compactWithIds.context.ids?.discovered_areas).toEqual(full.discoveredAreaIds);
    expect("visited_areas" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("discovered_jobs" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("completed_jobs" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("discovered_sites" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("explored_sites" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("discovered_quests" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("started_quests" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("completed_quests" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("resolved_events" in (compactWithIds.context.ids ?? {})).toBe(false);
    expect("pending_road" in compact.context).toBe(false);
    expect("route_options_truncated" in compact.context).toBe(false);
    expect("route_paths_truncated" in compact.context).toBe(false);
    expect("travel_log_truncated" in compact.context).toBe(false);
    expect("ids_truncated" in compact.context).toBe(false);
    expect(JSON.stringify(compact.context).length).toBeLessThan(JSON.stringify(full).length);

    const road = full.exits.find((edge) => edge.destination.id === "colonie_town");
    expect(road).toBeDefined();
    const compactPlan = a.plan_overworld_session_route({
      session_id: started.session_id,
      destination_town_id: "colonie_town",
      compact_context: true,
      compact_result: false,
      include_route_options: true,
    });
    expect(compactPlan.route.destination.id).toBe("colonie_town");
    expect(compactPlan.snapshot_hash).toBe(started.snapshot_hash);
    expect(compactPlan.context.route_options?.[0]).toHaveLength(5);
    expect(compactPlan.context.here[0]).toBe(full.current.id);
    expect("observation" in compactPlan).toBe(false);
    expect(() => a.travel_overworld_session({ session_id: started.session_id } as never)).toThrow(
      /exactly one of road_id or destination_town_id/,
    );
    expect(() =>
      a.travel_overworld_session({
        session_id: started.session_id,
        road_id: road!.id,
        destination_town_id: road!.destination.id,
      } as never),
    ).toThrow(/exactly one of road_id or destination_town_id/);

    const compactTravel = a.travel_overworld_session({
      session_id: started.session_id,
      road_id: road!.id,
      expected_snapshot_hash: started.snapshot_hash,
      compact_context: true,
      compact_result: false,
    });
    expect(compactTravel.ok).toBe(true);
    if (!compactTravel.ok) throw new Error("matching snapshot hash should travel");
    expect(compactTravel.travel.baseMinutes).toBe(road!.travel_minutes);
    expect(compactTravel.snapshot_hash).not.toBe(started.snapshot_hash);
    expect(compactTravel.context.here[0]).toBe("colonie_town");
    expect(compactTravel.context.travel_log?.[0]).toEqual([
      road!.id,
      full.current.id,
      road!.destination.id,
      compactTravel.travel.minutes,
      compactTravel.travel.suppliesUsed,
      compactTravel.travel.fatigueGained,
      compactTravel.travel.roadEvent?.id ?? null,
    ]);
    expect("travel_log_truncated" in compactTravel.context).toBe(false);
    expect("observation" in compactTravel).toBe(false);

    const staleTravel = a.travel_overworld_session({
      session_id: started.session_id,
      road_id: road!.id,
      expected_snapshot_hash: started.snapshot_hash,
      compact_context: true,
    });
    expect(staleTravel.ok).toBe(false);
    if (staleTravel.ok) throw new Error("stale snapshot hash should reject");
    expect("session_id" in staleTravel).toBe(false);
    expect("events" in staleTravel).toBe(false);
    expect(staleTravel.rejection_reason).toMatch(/snapshot hash/i);
    expect(staleTravel.snapshot_hash).toBe(compactTravel.snapshot_hash);
    expect("context" in staleTravel).toBe(false);
    expect("observation" in staleTravel).toBe(false);
    expect("travel" in staleTravel).toBe(false);
    expect(JSON.stringify(staleTravel).length).toBeLessThan(JSON.stringify(compactTravel).length);

    const traveledFullRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
      if_snapshot_hash: started.snapshot_hash,
    });
    expect("unchanged" in traveledFullRead).toBe(false);
    if ("unchanged" in traveledFullRead) throw new Error("expected changed full read");
    const traveledFull = traveledFullRead.observation;
    const traveledCompactRead = a.get_overworld_session_context({
      session_id: started.session_id,
      if_snapshot_hash: started.snapshot_hash,
    });
    expect("unchanged" in traveledCompactRead).toBe(false);
    if ("unchanged" in traveledCompactRead) throw new Error("expected changed compact read");
    const traveledCompact = traveledCompactRead.context;

    expect(traveledFullRead.snapshot_hash).toBe(compactTravel.snapshot_hash);
    expect(traveledCompactRead.snapshot_hash).toBe(compactTravel.snapshot_hash);
    expect(traveledCompact.here[0]).toBe("colonie_town");
    expect("pending_road" in traveledCompact).toBe(true);
    expect(traveledCompact.pending_road).toMatchObject({
      edge: road!.id,
      event: [
        traveledFull.pendingRoadEncounter!.event.id,
        traveledFull.pendingRoadEncounter!.event.risk,
      ],
    });
    expect(traveledCompact.pending_road?.options.map(([strategy]) => strategy)).toEqual([
      "cautious_scout",
      "assist_travelers",
      "press_on",
    ]);
    expect(traveledCompact.pending_road?.options[0]?.[1]).toEqual(expect.any(Number));
    expect(traveledCompact.travel_log).toEqual(compactTravel.context.travel_log);
    expect(JSON.stringify(traveledCompact).length).toBeLessThan(
      JSON.stringify(traveledFull).length,
    );
  });

  it("invalidates cached compact overworld context after local discovery actions", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const poi = started.observation.pois[0]!;
    const before = a.get_overworld_session_context({
      session_id: started.session_id,
      include_ids: true,
    });

    expect(before.snapshot_hash).toBe(started.snapshot_hash);
    expect("journal" in before.context).toBe(false);
    const beforeIds = before.context.ids;
    if (!beforeIds) throw new Error("expected opt-in compact ids before discovery");
    expect("discovered_jobs" in beforeIds).toBe(false);
    expect("discovered_sites" in beforeIds).toBe(false);

    const scouted = a.scout_overworld_session_poi({
      session_id: started.session_id,
      poi_id: poi.id,
      compact_context: true,
      compact_result: false,
      include_ids: true,
    });
    const discoveredJobIds = scouted.result.discoveredJobs?.map((job) => job.id) ?? [];
    const discoveredSiteIds = scouted.result.discoveredSites?.map((site) => site.id) ?? [];

    expect(scouted.snapshot_hash).not.toBe(before.snapshot_hash);
    expect(discoveredJobIds.length).toBeGreaterThan(0);
    expect(discoveredSiteIds.length).toBeGreaterThan(0);
    const scoutedIds = scouted.context.ids;
    if (!scoutedIds) throw new Error("expected opt-in compact ids after discovery");
    expect(scoutedIds.discovered_jobs).toEqual(discoveredJobIds);
    expect(scoutedIds.discovered_sites).toEqual(discoveredSiteIds);
    expect(scouted.context.journal?.[0]).toEqual([
      scouted.result.entry.kind,
      scouted.result.entry.title,
      scouted.result.entry.recordedAt,
    ]);

    const changed = a.get_overworld_session_context({
      session_id: started.session_id,
      if_snapshot_hash: before.snapshot_hash,
      include_ids: true,
    });
    expect("unchanged" in changed).toBe(false);
    if ("unchanged" in changed) throw new Error("expected changed compact context");
    expect(changed.snapshot_hash).toBe(scouted.snapshot_hash);
    const changedIds = changed.context.ids;
    if (!changedIds) throw new Error("expected opt-in compact ids on changed context");
    expect(changedIds.discovered_jobs).toEqual(discoveredJobIds);
    expect(changedIds.discovered_sites).toEqual(discoveredSiteIds);
    expect(changed.context.journal).toEqual(scouted.context.journal);
  });

  it("returns compact overworld action results when requested", () => {
    const a = api();
    const fullAreaStart = a.start_overworld({ compact_context: false });
    const area = fullAreaStart.observation.areas[0]!;
    const fullExplore = a.explore_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: fullAreaStart.session_id,
      area_id: area.id,
    });

    const compactAreaStart = a.start_overworld({ compact_context: true });
    const compactExplore = a.explore_overworld_session_area({
      session_id: compactAreaStart.session_id,
      area_id: area.id,
      compact_context: true,
      compact_result: true,
    });

    expect(compactExplore.result.m).toBe(fullExplore.result.minutes);
    expect(compactExplore.result.entry).toEqual([
      fullExplore.result.entry.kind,
      fullExplore.result.entry.title,
      fullExplore.result.entry.recordedAt,
    ]);
    expect(compactExplore.result.areas?.map(([id]) => id)).toEqual(
      fullExplore.result.discoveredAreas?.map((candidate) => candidate.id),
    );
    expect("text" in compactExplore.result.entry).toBe(false);
    expect(JSON.stringify(compactExplore.result).length).toBeLessThan(
      JSON.stringify(fullExplore.result).length,
    );
    expect("observation" in compactExplore).toBe(false);

    const fullTravelStart = a.start_overworld({ compact_context: false });
    const road = fullTravelStart.observation.exits.find(
      (candidate) => candidate.destination.id === "colonie_town",
    );
    expect(road).toBeDefined();
    const fullTravel = a.travel_overworld_session({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: fullTravelStart.session_id,
      road_id: road!.id,
    });
    const compactTravelStart = a.start_overworld({ compact_context: true });
    const compactTravel = a.travel_overworld_session({
      session_id: compactTravelStart.session_id,
      road_id: road!.id,
      compact_context: true,
      compact_result: true,
    });

    expect(compactTravel.travel).toEqual([
      road!.id,
      fullTravelStart.observation.current.id,
      road!.destination.id,
      fullTravel.travel.minutes,
      fullTravel.travel.suppliesUsed,
      fullTravel.travel.fatigueGained,
      fullTravel.travel.roadEvent?.id ?? null,
    ]);
    expect(JSON.stringify(compactTravel.travel).length).toBeLessThan(
      JSON.stringify(fullTravel.travel).length,
    );

    const fullResolved = a.resolve_overworld_session_road_encounter({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: fullTravelStart.session_id,
      strategy: "press_on",
    });
    const compactResolved = a.resolve_overworld_session_road_encounter({
      session_id: compactTravelStart.session_id,
      strategy: "press_on",
      compact_context: true,
      compact_result: true,
    });

    expect(compactResolved.result).toMatchObject({
      strategy: "press_on",
      m: fullResolved.result.minutes,
      supplies: fullResolved.result.suppliesUsed,
      fatigue: fullResolved.result.fatigueGained,
      renown: fullResolved.result.renownGained,
    });
    expect(compactResolved.result.encounter.event[0]).toBe(fullResolved.result.encounter.event.id);
    expect(compactResolved.result.entry).toEqual([
      fullResolved.result.entry.kind,
      fullResolved.result.entry.title,
      fullResolved.result.entry.recordedAt,
    ]);
    expect(JSON.stringify(compactResolved.result).length).toBeLessThan(
      JSON.stringify(fullResolved.result).length,
    );
  });

  it("exports and restores stateful New York overworld sessions through MCP", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    a.scout_overworld_session_poi({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
    });
    const road = a
      .get_overworld_session({ include_observation: true, session_id: started.session_id })
      .observation.exits.find((exit) => exit.destination.id === "colonie_town");
    expect(road).toBeDefined();
    a.travel_overworld_session({ session_id: started.session_id, road_id: road!.id });
    const beforeRead = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    });
    const before = beforeRead.observation;
    expect(before.pendingRoadEncounter).toBeDefined();

    const staleExport = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: started.snapshot_hash,
    });
    expect(staleExport.ok).toBe(false);
    if (staleExport.ok) throw new Error("expected stale export rejection");
    expect("session_id" in staleExport).toBe(false);
    expect("events" in staleExport).toBe(false);
    expect(staleExport.snapshot_hash).toBe(beforeRead.snapshot_hash);
    expect(staleExport.rejection_reason).toMatch(/snapshot hash mismatch/i);
    expect("snapshot" in staleExport).toBe(false);

    const exported = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: beforeRead.snapshot_hash,
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("expected guarded export success");
    expect(exported.snapshot.worldId).toBe("new_york_overworld");
    expect(exported.snapshot.worldHash).toMatch(/^[0-9a-f]{64}$/);
    const fullExportedSnapshotHash = hashState(exported.snapshot);
    expect(fullExportedSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(exported.snapshot_hash).toBe(publicOverworldSnapshotHash(fullExportedSnapshotHash));
    expect(JSON.stringify(staleExport).length).toBeLessThan(JSON.stringify(exported).length);
    const unchangedExport = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: fullExportedSnapshotHash,
      if_snapshot_hash: fullExportedSnapshotHash,
    });
    expect(unchangedExport).toEqual({
      snapshot_hash: exported.snapshot_hash,
      unchanged: true,
    });
    expect("ok" in unchangedExport).toBe(false);
    expect("session_id" in unchangedExport).toBe(false);
    expect("snapshot" in unchangedExport).toBe(false);
    const repeatedExport = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: fullExportedSnapshotHash,
    });
    expect(repeatedExport.ok).toBe(true);
    if (!repeatedExport.ok) throw new Error("expected repeated guarded export success");
    expect(repeatedExport.snapshot_hash).toBe(exported.snapshot_hash);
    expect(repeatedExport.snapshot).toEqual(exported.snapshot);
    expect(repeatedExport.snapshot).not.toBe(exported.snapshot);
    expect(repeatedExport.snapshot.discoveredIds).not.toBe(exported.snapshot.discoveredIds);
    expect(repeatedExport.snapshot.travelLog).not.toBe(exported.snapshot.travelLog);
    expect(repeatedExport.snapshot.travelLog[0]).not.toBe(exported.snapshot.travelLog[0]);
    expect(repeatedExport.snapshot.pendingRoadEncounter).not.toBe(
      exported.snapshot.pendingRoadEncounter,
    );
    repeatedExport.snapshot.currentId = "mutated_by_test";
    repeatedExport.snapshot.discoveredIds[0] = "mutated_by_test";
    repeatedExport.snapshot.travelLog[0]!.edgeId = "mutated_by_test";
    repeatedExport.snapshot.pendingRoadEncounter!.edgeId = "mutated_by_test";
    const afterMutationExport = a.export_overworld_session({
      session_id: started.session_id,
      expected_snapshot_hash: repeatedExport.snapshot_hash,
    });
    expect(afterMutationExport.ok).toBe(true);
    if (!afterMutationExport.ok) throw new Error("expected export after caller mutation");
    expect(afterMutationExport.snapshot.currentId).toBe(exported.snapshot.currentId);
    expect(afterMutationExport.snapshot.currentId).not.toBe("mutated_by_test");
    expect(afterMutationExport.snapshot.discoveredIds[0]).toBe(exported.snapshot.discoveredIds[0]);
    expect(afterMutationExport.snapshot.discoveredIds[0]).not.toBe("mutated_by_test");
    expect(afterMutationExport.snapshot.travelLog[0]?.edgeId).toBe(
      exported.snapshot.travelLog[0]?.edgeId,
    );
    expect(afterMutationExport.snapshot.travelLog[0]?.edgeId).not.toBe("mutated_by_test");
    expect(afterMutationExport.snapshot.pendingRoadEncounter?.edgeId).toBe(
      exported.snapshot.pendingRoadEncounter?.edgeId,
    );
    expect(afterMutationExport.snapshot.pendingRoadEncounter?.edgeId).not.toBe("mutated_by_test");

    const restored = a.restore_overworld_session({
      ...FULL_OVERWORLD_RESPONSE,
      snapshot: exported.snapshot,
    });
    expect(restored.session_id).not.toBe(started.session_id);
    expect(restored.snapshot_hash).toBe(exported.snapshot_hash);
    expect(restored.observation).toEqual(before);
    const compactRestored = a.restore_overworld_session({
      snapshot: exported.snapshot,
      compact_context: true,
    });
    expect(compactRestored.session_id).not.toBe(started.session_id);
    expect(compactRestored.snapshot_hash).toBe(exported.snapshot_hash);
    expect(compactRestored.context.here[0]).toBe(before.current.id);
    expect(compactRestored.context.pending_road?.edge).toBe(before.pendingRoadEncounter?.edgeId);
    expect("observation" in compactRestored).toBe(false);
    expect(() =>
      a.travel_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: restored.session_id,
        road_id: restored.observation.exits[0]!.id,
      }),
    ).toThrow(/pending road encounter/i);

    a.resolve_overworld_session_road_encounter({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: restored.session_id,
      strategy: "press_on",
    });
    expect(
      a.get_overworld_session({ include_observation: true, session_id: restored.session_id })
        .observation.pendingRoadEncounter,
    ).toBeNull();
    expect(
      a.get_overworld_session({ include_observation: true, session_id: started.session_id })
        .observation.pendingRoadEncounter,
    ).not.toBeNull();

    expect(() =>
      a.restore_overworld_session({
        ...FULL_OVERWORLD_RESPONSE,
        snapshot: { ...exported.snapshot, worldHash: "0".repeat(64) },
      }),
    ).toThrow(/different world manifest/i);
  });

  it("maps local areas through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const area = started.observation.areas[0]!;
    const localAreas = overworld.areas
      .filter((candidate) => candidate.home === started.observation.current.id)
      .sort(
        (left, right) =>
          left.travel_minutes - right.travel_minutes || left.name.localeCompare(right.name),
      );

    expect(localAreas.length).toBeGreaterThan(1);
    const explored = a.explore_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_id: area.id,
    });
    expect(explored.result.entry.kind).toBe("area");
    expect(explored.result.minutes).toBe(area.travel_minutes);
    expect(explored.result.discoveredAreas?.map((candidate) => candidate.id)).toEqual([
      localAreas[1]!.id,
    ]);
    expect(explored.observation.visitedAreaIds).toContain(area.id);
    expect(explored.observation.areas.map((candidate) => candidate.id)).toEqual(
      localAreas.slice(0, 2).map((candidate) => candidate.id),
    );
    expect(explored.observation.hiddenAreaCount).toBe(localAreas.length - 2);

    const repeated = a.explore_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_id: area.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.discoveredAreas).toEqual([]);
  });

  it("moves through local area routes through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const firstArea = started.observation.areas[0]!;
    const explored = a.explore_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_id: firstArea.id,
    });
    const route = explored.observation.areaExits[0]!;
    const destination = route.destination;

    expect(() =>
      a.explore_overworld_session_area({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        area_id: destination.id,
      }),
    ).toThrow(/Move to that local area/i);

    const moved = a.move_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_route_id: route.id,
    });
    expect(moved.result).toMatchObject({
      from: firstArea,
      to: destination,
      route: route.route,
      minutes: route.travel_minutes,
    });
    expect(moved.observation.currentArea?.id).toBe(destination.id);
    expect(moved.observation.areaExits.map((exit) => exit.destination.id)).toContain(firstArea.id);

    const exploredDestination = a.explore_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_id: destination.id,
    });
    expect(exploredDestination.result.entry.kind).toBe("area");
    expect(exploredDestination.result.entry.title).toContain(destination.name);
  });

  it("discovers and works local jobs through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const area = started.observation.areas[0]!;
    const hiddenJob = overworld.local_jobs.find(
      (candidate) => candidate.home === started.observation.current.id,
    );
    expect(hiddenJob).toBeDefined();
    expect(started.observation.jobs).toEqual([]);
    expect(() =>
      a.work_overworld_session_job({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        job_id: hiddenJob!.id,
      }),
    ).toThrow(/Explore local areas/i);

    const explored = a.explore_overworld_session_area({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      area_id: area.id,
    });
    expect(explored.result.discoveredJobs).toHaveLength(1);
    const job = explored.observation.jobs[0]!;
    expect(job.home).toBe(started.observation.current.id);
    expect(explored.observation.discoveredJobIds).toContain(job.id);
    expect(explored.observation.hiddenJobCount).toBeGreaterThan(0);

    const worked = a.work_overworld_session_job({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      job_id: job.id,
    });
    expect(worked.result.entry).toMatchObject({
      kind: "job",
      title: `Completed ${job.title}`,
    });
    expect(worked.result.minutes).toBe(job.minutes);
    expect(worked.observation.completedJobIds).toContain(job.id);
    expect(worked.observation.regionRenown[started.observation.current.region]).toBe(
      job.difficulty,
    );
    expect(worked.observation.journal[0]?.kind).toBe("job");

    const repeated = a.work_overworld_session_job({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      job_id: job.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.minutes).toBe(0);
    expect(repeated.result.discoveredJobs).toEqual([]);
  });

  it("adds elapsed travel delay to MCP overworld sessions when condition degrades", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    travelOverworldSessionTo(a, started.session_id, "buffalo_city");
    const worn = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    }).observation;
    expect(worn.fatigue).toBeGreaterThanOrEqual(25);

    const nextRoad = worn.exits[0]!;
    const planned = a.plan_overworld_session_route({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      destination_town_id: nextRoad.destination.id,
    });
    expect(planned.route.estimate.delayMinutes).toBeGreaterThan(0);
    expect(planned.route.estimate.elapsedMinutes).toBe(
      planned.route.estimate.baseMinutes + planned.route.estimate.delayMinutes,
    );

    const traveled = a.travel_overworld_session({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      road_id: nextRoad.id,
    });
    expect(traveled.travel.baseMinutes).toBe(nextRoad.travel_minutes);
    expect(traveled.travel.delayMinutes).toBeGreaterThan(0);
    expect(traveled.travel.minutes).toBe(
      traveled.travel.baseMinutes + traveled.travel.delayMinutes,
    );
  });

  it("discovers and explores regional sites through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const site = overworld.exploration_sites.find(
      (candidate) => candidate.area === started.observation.currentArea?.id,
    );
    expect(site).toBeDefined();

    expect(() =>
      a.explore_overworld_session_site({
        ...FULL_OVERWORLD_RESPONSE,
        session_id: started.session_id,
        site_id: site!.id,
      }),
    ).toThrow(/Scout a local point of interest/i);

    const scouted = a.scout_overworld_session_poi({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      poi_id: started.observation.pois[0]!.id,
    });
    expect(scouted.observation.discoveredSiteIds).toContain(site!.id);

    const explored = a.explore_overworld_session_site({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      site_id: site!.id,
    });
    expect(explored.result.minutes).toBe(45 + site!.danger * 15);
    expect(explored.result.entry).toMatchObject({
      kind: "site",
      title: `Explored ${site!.title}`,
    });
    expect(explored.observation.exploredSiteIds).toContain(site!.id);
    expect(explored.observation.regionRenown[started.observation.current.region]).toBe(
      site!.danger,
    );
    const repeated = a.explore_overworld_session_site({
      ...FULL_OVERWORLD_RESPONSE,
      session_id: started.session_id,
      site_id: site!.id,
    });
    expect(repeated.result.alreadyKnown).toBe(true);
    expect(repeated.result.minutes).toBe(0);
    expect(repeated.result.discoveredAreas).toEqual([]);
    expect(repeated.result.discoveredJobs).toEqual([]);
    expect(repeated.result.discoveredSites).toEqual([]);
    expect(repeated.result.discoveredQuests).toEqual([]);
    expect(repeated.snapshot_hash).toBe(explored.snapshot_hash);
  });

  it("completes a regional arc through stateful MCP overworld play", () => {
    const a = api();
    const started = a.start_overworld({ compact_context: false });
    const arc = overworld.regional_arcs.find(
      (candidate) => candidate.region === "Capital / Mohawk",
    );
    expect(arc).toBeDefined();

    for (const townId of arc!.anchor_towns.slice(0, arc!.required_resolutions)) {
      travelOverworldSessionTo(a, started.session_id, townId);
      resolveCurrentOverworldSessionEvent(a, started.session_id);
    }

    const after = a.get_overworld_session({
      include_observation: true,
      session_id: started.session_id,
    }).observation;
    expect(after.completedRegionalArcIds).toContain(arc!.id);
    expect(after.regionalArcs.find((candidate) => candidate.id === arc!.id)).toMatchObject({
      completed: true,
      resolvedInRegion: arc!.required_resolutions,
    });
    expect(after.journal[0]).toMatchObject({
      kind: "regional_arc",
      title: `Completed ${arc!.title}`,
    });
  });

  it("validate_quest reports the shipped quest as green", () => {
    const r = api().validate_quest({ world_quest_id: "sunken_barrow" });
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect(r.world_quest_id).toBe("sunken_barrow");
    expect(r.report.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("story validation aliases are retired from the live RPG API", () => {
    const tools = api() as unknown as Record<string, unknown>;
    expect("validate_story" in tools).toBe(false);
    expect("start_game" in tools).toBe(false);
    expect("start_quest" in tools).toBe(false);
    expect("get_scene" in tools).toBe(false);
    expect("choose_option" in tools).toBe(false);
  });

  it("validate_quest uses world_quest_id only", () => {
    const r = api().validate_quest({ world_quest_id: "sunken_barrow" });
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect(r.world_quest_id).toBe("sunken_barrow");

    expect(() => api().validate_quest({})).toThrow(/requires world_quest_id/);
    expect(() => api().validate_quest({ quest_id: "sunken_barrow" } as never)).toThrow(
      /not quest_id/,
    );
    expect(() => api().validate_quest({ quest_path: PACK } as never)).toThrow(/not quest_path/);
  });

  it("load_quest returns meta + content hash", () => {
    const r = api().load_quest({ world_quest_id: "sunken_barrow" });
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect(r.world_quest_id).toBe("sunken_barrow");
    expect("mode" in r).toBe(false);
    expect(r.meta?.id).toBe("sunken_barrow_v1");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validate/load quest reject missing or raw path source identity", () => {
    expect(() => api().validate_quest({})).toThrow(/requires world_quest_id/);
    expect(() => api().load_quest({})).toThrow(/requires world_quest_id/);
    expect(() => api().load_quest({ quest_id: "sunken_barrow" } as never)).toThrow(/not quest_id/);
    expect(() => api().validate_quest({ pack_path: PACK } as never)).toThrow(/not pack_path/);
    expect(() => api().load_quest({ pack_path: PACK } as never)).toThrow(/not pack_path/);
    expect(() =>
      api().validate_quest({ world_quest_id: "sunken_barrow", pack_path: PACK } as never),
    ).toThrow(/not pack_path/);
    expect(() =>
      api().load_quest({ world_quest_id: "sunken_barrow", pack_path: PACK } as never),
    ).toThrow(/not pack_path/);
  });

  it("adapt_story authors a green RPG pack from a premise (§12.1–3)", async () => {
    const r = await api().adapt_story({ premise: "A keeper relights a dead lighthouse." });
    expect(r.ok).toBe(true);
    expect("mode" in r).toBe(false);
    expect(r.report.ok).toBe(true);
    expect("pack" in r).toBe(false);
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.classifications.length).toBeGreaterThanOrEqual(3);

    const withPack = await api().adapt_story({
      premise: "A keeper relights a dead lighthouse.",
      include_pack: true,
    });
    expect(withPack.pack?.meta.id).toBe("lighthouse_rpg_v1");
    expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(withPack).length);
  });

  it("retired pack-named validation/loading tools are absent", () => {
    const tools = api() as unknown as Record<string, unknown>;
    expect(tools.validate_pack).toBeUndefined();
    expect(tools.load_pack).toBeUndefined();
    expect(() => api().validate_quest({ pack_path: NON_RPG_PACK } as never)).toThrow(
      /not pack_path/,
    );
  });
});

describe("MCP tools — the play loop (§9.1)", () => {
  it("start_world_quest can play and transcript a shipped world quest", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    expect("mode" in game).toBe(false);
    expect("pack_path" in game).toBe(false);
    expect(game.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in game).toBe(false);
    expect(game.observation.mode).toBe("rpg");
    expect(
      a.get_observation({
        session_id: game.session_id,
        compact_observation: false,
      }).observation.available_actions.length,
    ).toBeGreaterThan(0);

    const last = playSunkenBarrowToVictory(a, game.session_id);
    expect(last.ok).toBe(true);
    expect(last.observation.ending_id).toBe("ending_victory");
    const stepEvent = last.events.find((event) => event.type === "ending");
    expect(stepEvent).toBeDefined();
    if (stepEvent === undefined) throw new Error("expected final step ending event");
    (stepEvent as { type: string }).type = "rejected";
    (stepEvent as { reason?: string }).reason = "mutated_step_event";
    const defaultTranscript = a.get_transcript({ session_id: game.session_id });
    expect("turns" in defaultTranscript).toBe(false);
    expect(defaultTranscript.summary.ended).toBe(true);
    expect(defaultTranscript.summary.ending_id).toBe("ending_victory");
    const transcript = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_events: false,
      compact_summary: false,
    });
    expect("pack_id" in transcript).toBe(false);
    expect("pack_path" in transcript).toBe(false);
    expect("mode" in transcript).toBe(false);
    expect("world_quest_id" in transcript).toBe(false);
    expect("generated_rpg_seed" in transcript).toBe(false);
    const sourcedTranscript = a.get_transcript({
      session_id: game.session_id,
      include_source: true,
    });
    expect(sourcedTranscript.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in sourcedTranscript).toBe(false);
    expect(transcript.summary.ended).toBe(true);
    expect(transcript.summary.ending_id).toBe("ending_victory");
    expect(JSON.stringify(defaultTranscript).length).toBeLessThan(
      JSON.stringify(transcript).length,
    );
    expect(transcript.turns.map((t) => t.action_id)).toContain("take_circlet");
    expect(transcript.turns[0]).toMatchObject({
      scene_id: game.observation.room,
      title: game.observation.title,
      action_id: null,
      result_scene_id: game.observation.room,
      ended: game.observation.ended,
      ending_id: game.observation.ending_id,
    });
    const currentStateHash = a.get_state({ session_id: game.session_id }).state_hash;
    expect(transcript.state_hash).toBe(currentStateHash);
    const currentSession = a.sessions.get(game.session_id);
    const fullTranscriptHash = hashTranscript(currentSession, currentSession.stateHash);
    expect(fullTranscriptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(transcript.transcript_hash).toMatch(PUBLIC_RPG_TRANSCRIPT_HASH_RE);
    expect(transcript.transcript_hash).toBe(publicRpgTranscriptHash(fullTranscriptHash));
    const hashOnlyState = a.get_state({ session_id: game.session_id });
    expect(hashOnlyState).toEqual({ state_hash: currentStateHash });
    expect("state" in hashOnlyState).toBe(false);
    const rawState = a.get_state({ session_id: game.session_id, include_state: true });
    expect(rawState.state_hash).toBe(currentStateHash);
    expect(rawState.state.current).toBe(last.observation.room);
    expect(rawState.state).not.toBe(a.sessions.get(game.session_id).state);
    const compactState = a.get_state({ session_id: game.session_id, compact_state: true });
    expect(compactState.state_hash).toBe(currentStateHash);
    expect("state" in compactState).toBe(false);
    expect(compactState.compact_state.v).toBe(RPG_COMPACT_STATE_VERSION);
    expect(compactState.compact_state.at).toBe(last.observation.room);
    expect(compactState.compact_state.vitals).toEqual([
      last.observation.stats.hp,
      last.observation.stats.attack,
      last.observation.stats.defense,
      last.observation.score,
      last.observation.max_score,
    ]);
    expect("mode" in compactState.compact_state).toBe(false);
    expect(JSON.stringify(compactState).length).toBeLessThan(JSON.stringify(rawState).length);
    expect(a.sessions.get(game.session_id).stateProjectionCaches?.size).toBe(1);
    const compactStateRoom = compactState.compact_state.at;
    (compactState.compact_state as { at: string }).at = "mutated_room";
    (compactState.compact_state.vitals as unknown as number[])[0] = -999;
    const afterCompactStateMutation = a.get_state({
      session_id: game.session_id,
      compact_state: true,
    });
    expect(afterCompactStateMutation.compact_state.at).toBe(compactStateRoom);
    expect(afterCompactStateMutation.compact_state.vitals[0]).toBe(last.observation.stats.hp);
    expect(a.sessions.get(game.session_id).stateProjectionCaches?.size).toBe(1);
    const rawAndCompactState = a.get_state({
      session_id: game.session_id,
      include_state: true,
      compact_state: true,
    });
    expect(rawAndCompactState.state_hash).toBe(currentStateHash);
    expect(rawAndCompactState.state.current).toBe(last.observation.room);
    expect(rawAndCompactState.compact_state.at).toBe(last.observation.room);
    const rawStateRoom = rawState.state.current;
    rawState.state.current = "mutated_room";
    rawState.state.inventory.push("mutated_item");
    rawState.state.visited.mutated_room = true;
    rawState.state.objectState.mutated_object = { contents: ["mutated_child"] };
    const afterRawStateMutation = a.get_state({
      session_id: game.session_id,
      include_state: true,
    });
    expect(afterRawStateMutation.state.current).toBe(rawStateRoom);
    expect(afterRawStateMutation.state.inventory).not.toContain("mutated_item");
    expect(afterRawStateMutation.state.visited).not.toHaveProperty("mutated_room");
    expect(afterRawStateMutation.state.objectState).not.toHaveProperty("mutated_object");
    expect(afterRawStateMutation.state_hash).toBe(currentStateHash);
    const unchangedRawState = a.get_state({
      session_id: game.session_id,
      include_state: true,
      if_state_hash: currentStateHash,
    });
    expect(unchangedRawState).toEqual({ state_hash: currentStateHash, unchanged: true });
    expect("state" in unchangedRawState).toBe(false);
    const unchangedCompactState = a.get_state({
      session_id: game.session_id,
      compact_state: true,
      if_state_hash: currentStateHash,
    });
    expect(unchangedCompactState).toEqual({ state_hash: currentStateHash, unchanged: true });
    expect("compact_state" in unchangedCompactState).toBe(false);
    const summaryOnlyTranscript = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: false,
    });
    expect(summaryOnlyTranscript.state_hash).toBe(currentStateHash);
    expect(summaryOnlyTranscript.transcript_hash).toBe(transcript.transcript_hash);
    expect("mode" in summaryOnlyTranscript).toBe(false);
    expect(summaryOnlyTranscript.summary).toEqual(transcript.summary);
    expect("turns" in summaryOnlyTranscript).toBe(false);
    expect(JSON.stringify(summaryOnlyTranscript).length).toBeLessThan(
      JSON.stringify(transcript).length,
    );
    const compactEndedSummary = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
    });
    expect(compactEndedSummary.summary.ending_id).toBe("ending_victory");
    const freshGame = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const freshCompactSummary = a.get_transcript({
      session_id: freshGame.session_id,
      summary_only: true,
      compact_summary: true,
    });
    expect(freshCompactSummary.summary.scenes).toEqual(["barrow_mouth"]);
    expect("inventory" in freshCompactSummary.summary).toBe(false);
    expect("flags" in freshCompactSummary.summary).toBe(false);
    expect("journal" in freshCompactSummary.summary).toBe(false);
    const unchangedTranscript = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
      if_transcript_hash: fullTranscriptHash,
    });
    expect("unchanged" in unchangedTranscript).toBe(true);
    if (!("unchanged" in unchangedTranscript)) throw new Error("expected unchanged transcript");
    expect("session_id" in unchangedTranscript).toBe(false);
    expect(unchangedTranscript.unchanged).toBe(true);
    expect(unchangedTranscript.state_hash).toBe(currentStateHash);
    expect(unchangedTranscript.transcript_hash).toBe(transcript.transcript_hash);
    expect("summary" in unchangedTranscript).toBe(false);
    expect("turns" in unchangedTranscript).toBe(false);
    expect(JSON.stringify(unchangedTranscript).length).toBeLessThan(
      JSON.stringify(summaryOnlyTranscript).length,
    );
    const transcriptHashUnchanged = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
      if_transcript_hash: transcript.transcript_hash,
    });
    expect("unchanged" in transcriptHashUnchanged).toBe(true);
    if (!("unchanged" in transcriptHashUnchanged)) {
      throw new Error("expected unchanged transcript hash response");
    }
    expect(transcriptHashUnchanged.state_hash).toBe(currentStateHash);
    expect(transcriptHashUnchanged.transcript_hash).toBe(transcript.transcript_hash);
    const compactTranscript = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_turns: true,
      compact_summary: false,
    });
    expect(compactTranscript.state_hash).toBe(currentStateHash);
    expect(compactTranscript.transcript_hash).toBe(transcript.transcript_hash);
    expect("mode" in compactTranscript).toBe(false);
    expect(compactTranscript.summary).toEqual(transcript.summary);
    expect(compactTranscript.turns.map(([, , actionId]) => actionId)).toEqual(
      transcript.turns.map((t) => t.action_id),
    );
    expect(compactTranscript.turns[0]).toEqual([
      transcript.turns[0]!.step,
      transcript.turns[0]!.scene_id,
      transcript.turns[0]!.action_id,
      transcript.turns[0]!.result_scene_id,
    ]);
    expect(compactTranscript.turns[0]).not.toHaveProperty("events");
    expect(compactTranscript.turns[0]).not.toHaveProperty("action_text");
    expect(compactTranscript.turns[0]).not.toHaveProperty("ended");
    expect(compactTranscript.turns[0]).not.toHaveProperty("ending_id");
    expect(JSON.stringify(compactTranscript).length).toBeLessThan(
      JSON.stringify(transcript).length,
    );
    const cappedCompactTranscript = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_turns: true,
      compact_summary: false,
      turn_limit: 2,
    });
    expect(cappedCompactTranscript.state_hash).toBe(currentStateHash);
    expect(cappedCompactTranscript.transcript_hash).toBe(transcript.transcript_hash);
    expect(cappedCompactTranscript.summary).toEqual(transcript.summary);
    expect(cappedCompactTranscript.turns).toEqual(compactTranscript.turns.slice(-2));
    expect(cappedCompactTranscript.turns_omitted).toBe(compactTranscript.turns.length - 2);
    const compactEventTranscript = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_events: true,
    });
    expect(compactEventTranscript.event_v).toBe(RPG_COMPACT_EVENT_VERSION);
    const compactEventTurn = compactEventTranscript.turns.find((turn) => turn.events.length > 0);
    const fullEventTurn = transcript.turns.find((turn) => turn.events.length > 0);
    expect(compactEventTurn).toBeDefined();
    expect(fullEventTurn).toBeDefined();
    expect(Array.isArray(compactEventTurn?.events[0])).toBe(true);
    expect(compactEventTurn?.events[0]).not.toHaveProperty("type");
    expect(JSON.stringify(compactEventTranscript.turns).length).toBeLessThan(
      JSON.stringify(transcript.turns).length,
    );
    const compactTurnsWithCompactEvents = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_turns: true,
      compact_events: true,
    });
    expect("event_v" in compactTurnsWithCompactEvents).toBe(false);
    expect(compactTurnsWithCompactEvents.turns[0]).not.toHaveProperty("events");
    expect(currentStateHash).toMatch(PUBLIC_RPG_STATE_HASH_RE);
    expect(
      transcript.turns.some((turn) =>
        turn.events.some(
          (event) =>
            event.type === "rejected" && "reason" in event && event.reason === "mutated_step_event",
        ),
      ),
    ).toBe(false);
    const transcriptEvent = fullEventTurn?.events[0];
    expect(transcriptEvent).toBeDefined();
    if (transcriptEvent === undefined) throw new Error("expected full transcript event");
    const transcriptEventType = transcriptEvent.type;
    (transcriptEvent as { type: string }).type = "rejected";
    (transcriptEvent as { reason?: string }).reason = "mutated_transcript_event";
    transcript.summary.scenes.push("mutated_scene");
    (compactTranscript.turns[0] as unknown as string[])[1] = "mutated_scene";
    (compactEventTurn!.events[0] as unknown as string[])[0] = "x";
    const afterTranscriptMutation = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_events: false,
      compact_summary: false,
    });
    expect(afterTranscriptMutation.summary.scenes).not.toContain("mutated_scene");
    expect(afterTranscriptMutation.turns[0]?.scene_id).toBe(game.observation.room);
    expect(
      afterTranscriptMutation.turns.some((turn) => turn.events[0]?.type === transcriptEventType),
    ).toBe(true);
    expect(
      afterTranscriptMutation.turns.some((turn) =>
        turn.events.some(
          (event) =>
            event.type === "rejected" &&
            "reason" in event &&
            event.reason === "mutated_transcript_event",
        ),
      ),
    ).toBe(false);
    const afterCompactTranscriptMutation = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_turns: true,
    });
    expect(afterCompactTranscriptMutation.turns[0]?.[1]).toBe(game.observation.room);
    const afterCompactEventTranscriptMutation = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_events: true,
    });
    const afterCompactEventTurn = afterCompactEventTranscriptMutation.turns.find(
      (turn) => turn.events.length > 0,
    );
    expect(afterCompactEventTurn?.events[0]?.[0]).not.toBe("x");

    const byWorldQuestId = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    expect("mode" in byWorldQuestId).toBe(false);
    expect("pack_path" in byWorldQuestId).toBe(false);
    expect(byWorldQuestId.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in byWorldQuestId).toBe(false);
  });

  it("can cap transcript summaries for token-light end-of-run audits", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    const session = a.sessions.get(game.session_id);
    a.sessions.replaceTranscript(
      game.session_id,
      Array.from({ length: 20 }, (_, i) => ({
        step: i,
        scene_id: `scene_${i.toString().padStart(2, "0")}`,
        title: `Scene ${i}`,
        action_id: `action_${i}`,
        action_text: `Action ${i}`,
        events: [],
        result_scene_id: `scene_${(i + 1).toString().padStart(2, "0")}`,
        ended: false,
        ending_id: null,
      })),
    );
    a.sessions.update(game.session_id, {
      ...session.state,
      inventory: numberedIds("item", 20),
      flags: {
        ...Object.fromEntries(numberedIds("flag", 20).map((flag) => [flag, true])),
        __internal_bookkeeping: true,
      },
      journal: numberedIds("journal", 10),
    });

    const full = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: false,
    });
    const compact = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
    });
    const compactState = a.get_state({ session_id: game.session_id, compact_state: true });
    const currentStateHash = a.get_state({ session_id: game.session_id }).state_hash;

    expect(full.state_hash).toBe(currentStateHash);
    expect(compact.state_hash).toBe(currentStateHash);
    expect(compactState.state_hash).toBe(currentStateHash);
    expect(full.summary.scenes).toHaveLength(21);
    expect(full.summary.inventory).toHaveLength(20);
    expect(full.summary.flags).toHaveLength(20);
    expect(full.summary.flags).not.toContain("__internal_bookkeeping");
    expect(full.summary.journal).toHaveLength(10);
    expect(full.summary.ending_id).toBeNull();
    expect(full.summary).not.toHaveProperty("more");
    expect("turns" in full).toBe(false);
    expect("turns" in compact).toBe(false);
    expect(compact.summary).not.toHaveProperty("ending_id");
    expect(compact.summary.scenes).toEqual(full.summary.scenes.slice(0, 16));
    expect(compact.summary.inventory).toEqual(numberedIds("item", 16));
    expect(compact.summary.flags).toEqual(numberedIds("flag", 16));
    expect(compact.summary.journal).toEqual(numberedIds("journal", 10).slice(-5));
    expect(compact.summary.more).toEqual([5, 4, 4, 5]);
    expect(compactState.compact_state.flags).toEqual(numberedIds("flag", 16));
    expect(JSON.stringify(compactState.compact_state)).not.toContain("__internal_bookkeeping");
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length);
  });

  it("uses transcript_hash for transcript-only freshness checks", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    const before = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
    });
    const session = a.sessions.get(game.session_id);
    a.sessions.appendTranscript(game.session_id, {
      step: session.state.step,
      scene_id: session.state.current,
      title: "Synthetic transcript-only row",
      action_id: "synthetic_no_state_change",
      action_text: "synthetic no state change",
      events: [],
      result_scene_id: session.state.current,
      ended: session.state.ended,
      ending_id: session.state.endingId,
    });

    const staleStateOnlyArgs = {
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
      if_state_hash: before.state_hash,
    } as unknown as Parameters<typeof a.get_transcript>[0];
    const stateOnlyPoll = a.get_transcript(staleStateOnlyArgs);
    expect("unchanged" in stateOnlyPoll).toBe(false);
    if ("unchanged" in stateOnlyPoll) {
      throw new Error("state hash alone must not hide transcript-only changes");
    }
    expect(stateOnlyPoll.state_hash).toBe(before.state_hash);
    expect(stateOnlyPoll.transcript_hash).not.toBe(before.transcript_hash);
    expect(stateOnlyPoll.summary.steps).toBe(before.summary.steps + 1);

    const changed = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
      compact_summary: true,
      if_transcript_hash: before.transcript_hash,
    });
    expect("unchanged" in changed).toBe(false);
    if ("unchanged" in changed) throw new Error("expected changed transcript");
    expect(changed.state_hash).toBe(before.state_hash);
    expect(changed.transcript_hash).not.toBe(before.transcript_hash);
    expect(changed.summary.steps).toBe(before.summary.steps + 1);
  });

  it("start_world_quest can play and transcript a route", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    expect("mode" in game).toBe(false);
    expect(game.observation.mode).toBe("rpg");

    const last = playSunkenBarrowToVictory(a, game.session_id);
    expect(last.observation.ending_id).toBe("ending_victory");
    expect(a.get_transcript({ session_id: game.session_id }).summary.ended).toBe(true);

    const byWorldQuestId = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      include_world_context: true,
    }) as unknown as {
      world_quest_id: string | null;
      quest: { id: string; path_from_hub: { name: string }[] };
    };
    expect("mode" in byWorldQuestId).toBe(false);
    expect("pack_path" in byWorldQuestId).toBe(false);
    expect(byWorldQuestId.world_quest_id).toBe("sunken_barrow");
    expect(byWorldQuestId.quest.id).toBe("sunken_barrow");
    expect(byWorldQuestId.quest.path_from_hub.map((step) => step.name)).toEqual([
      "Charterhaven",
      "Moor Road",
      "The Sunken Barrow",
    ]);
  });

  it("an agent can play a whole game via observe → choose → step", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    expect(game.session_id).toBe("r1");
    expect("mode" in game).toBe(false);
    expect(game.observation.available_actions.map((x) => x.id)).toContain("go_down");

    const last = playSunkenBarrowToVictory(a, game.session_id);
    expect(last.observation.ended).toBe(true);
    expect(last.observation.ending_id).toBe("ending_victory");
    expect(a.list_legal_actions({ session_id: game.session_id }).actions).toEqual([]);
  });

  it("keeps reducer action payloads out of MCP-facing action menus", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: false,
    });
    const assertPublicAction = (action: unknown): void => {
      expect(action).toMatchObject({ id: expect.any(String), command: expect.any(String) });
      expect(action).not.toHaveProperty("action");
    };
    const assertCompactAction = (action: unknown): void => {
      expect(action).toMatchObject({ id: expect.any(String) });
      expect(action).not.toHaveProperty("command");
      expect(action).not.toHaveProperty("action");
    };
    const assertCompactActionId = (action: unknown): void => {
      expect(action).toEqual(expect.any(String));
    };

    assertPublicAction(game.observation.available_actions[0]);
    const compactWorldQuest = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_actions: true,
      compact_observation: false,
    });
    assertCompactAction(compactWorldQuest.observation.available_actions[0]);
    assertPublicAction(
      a.get_observation({
        session_id: game.session_id,
        compact_observation: false,
      }).observation.available_actions[0],
    );
    const listed = a.list_legal_actions({ session_id: game.session_id });
    expect(listed.state_hash).toBe(game.state_hash);
    assertCompactActionId(listed.actions[0]);
    const fullListed = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: false,
    });
    expect(fullListed.state_hash).toBe(game.state_hash);
    assertPublicAction(fullListed.actions[0]);

    const compact = a.get_observation({
      session_id: game.session_id,
      compact_actions: true,
      compact_observation: false,
    }).observation;
    assertCompactAction(compact.available_actions[0]);
    expect(JSON.stringify(compact.available_actions).length).toBeLessThan(
      JSON.stringify(game.observation.available_actions).length,
    );
    const compactListed = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: true,
    });
    expect(compactListed.state_hash).toBe(game.state_hash);
    assertCompactActionId(compactListed.actions[0]);
    expect(compactListed.actions).toEqual(listed.actions);
    expect(JSON.stringify(compactListed.actions).length).toBeLessThan(
      JSON.stringify(fullListed.actions).length,
    );
    const repeatedCompactListed = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: true,
    });
    expect(repeatedCompactListed.actions).toEqual(compactListed.actions);
    expect(repeatedCompactListed.actions).not.toBe(compactListed.actions);
    const repeatedListed = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: false,
    });
    expect(repeatedListed.actions).toEqual(fullListed.actions);
    expect(repeatedListed.actions).not.toBe(fullListed.actions);
    compactListed.actions.push("mutated_action");
    fullListed.actions[0]!.id = "mutated_action";
    const afterActionMutation = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: true,
    });
    expect(afterActionMutation.actions).toEqual(repeatedCompactListed.actions);
    expect(afterActionMutation.actions).not.toContain("mutated_action");
    const afterFullActionMutation = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: false,
    });
    expect(afterFullActionMutation.actions).toEqual(repeatedListed.actions);
    expect(afterFullActionMutation.actions[0]?.id).not.toBe("mutated_action");
    const unchangedMenu = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: true,
      if_state_hash: game.state_hash,
    });
    expect("unchanged" in unchangedMenu).toBe(true);
    if (!("unchanged" in unchangedMenu)) throw new Error("expected unchanged action menu");
    expect("session_id" in unchangedMenu).toBe(false);
    expect(unchangedMenu.unchanged).toBe(true);
    expect(unchangedMenu.state_hash).toBe(game.state_hash);
    expect("actions" in unchangedMenu).toBe(false);
    expect(JSON.stringify(unchangedMenu).length).toBeLessThan(JSON.stringify(compactListed).length);

    const rejected = a.step_action({
      session_id: game.session_id,
      action_id: "missing",
      compact_events: false,
      compact_observation: false,
    });
    expect(rejected.ok).toBe(false);
    expect("rejection_reason" in rejected).toBe(true);
    expect("event_v" in rejected).toBe(false);
    assertPublicAction(rejected.observation.available_actions[0]);

    const compactRejected = a.step_action({
      session_id: game.session_id,
      action_id: "missing",
      compact_actions: true,
      compact_events: false,
      compact_observation: false,
    });
    expect(compactRejected.ok).toBe(false);
    expect("rejection_reason" in compactRejected).toBe(true);
    assertCompactAction(compactRejected.observation.available_actions[0]);
    const compactEventRejected = a.step_action({
      session_id: game.session_id,
      action_id: "missing",
      compact_events: true,
      compact_observation: true,
    });
    expect(compactEventRejected.events[0]).toEqual([
      "r",
      "That action is not available right now.",
    ]);
    expect(compactEventRejected.event_v).toBe(RPG_COMPACT_EVENT_VERSION);
    expect(JSON.stringify(compactEventRejected.events).length).toBeLessThan(
      JSON.stringify(rejected.events).length,
    );

    const moveActionId = compact.available_actions.find((action) => action.id === "go_down")?.id;
    expect(moveActionId).toBe("go_down");
    const moved = a.step_action({
      session_id: game.session_id,
      action_id: moveActionId!,
      compact_actions: true,
      compact_events: false,
      compact_observation: false,
    });
    expect(moved.ok).toBe(true);
    expect("rejection_reason" in moved).toBe(false);
    expect("event_v" in moved).toBe(false);
    assertCompactAction(moved.observation.available_actions[0]);
    const moveEvent = moved.events[0];
    if (moveEvent?.type !== "move") throw new Error("expected full move event object");
    const compactEventGame = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_actions: true,
      compact_observation: false,
    });
    const compactEventMoved = a.step_action({
      session_id: compactEventGame.session_id,
      action_id: moveActionId!,
      compact_events: true,
      compact_observation: true,
    });
    expect(compactEventMoved.events[0]).toEqual(["m", moveEvent.from, moveEvent.to]);
    expect(compactEventMoved.event_v).toBe(RPG_COMPACT_EVENT_VERSION);
    expect(JSON.stringify(compactEventMoved.events).length).toBeLessThan(
      JSON.stringify(moved.events).length,
    );

    const proseEventGame = a.start_world_quest({ world_quest_id: "breaking_weir" });
    const compactProseStep = a.step_action({
      session_id: proseEventGame.session_id,
      action_id: "read_flood_book",
    });
    const fullProseEventGame = a.start_world_quest({ world_quest_id: "breaking_weir" });
    const fullProseStep = a.step_action({
      session_id: fullProseEventGame.session_id,
      action_id: "read_flood_book",
      compact_events: false,
    });
    const compactNarration = compactProseStep.events.find((event) => event[0] === "n");
    const compactJournal = compactProseStep.events.find(
      (event) => event[0] === "s" && event[1] === "j",
    );
    expect(compactProseStep.event_v).toBe(RPG_COMPACT_EVENT_VERSION);
    expect(compactNarration).toBeDefined();
    expect(compactJournal).toBeDefined();
    expect(String(compactNarration?.[1]).length).toBeLessThanOrEqual(
      COMPACT_EVENT_NARRATION_CHAR_LIMIT,
    );
    expect(String(compactJournal?.[2]).length).toBeLessThanOrEqual(
      COMPACT_EVENT_JOURNAL_CHAR_LIMIT,
    );
    expect(JSON.stringify(compactProseStep).length).toBeLessThan(1800);
    expect(JSON.stringify(compactProseStep.events).length).toBeLessThan(
      JSON.stringify(fullProseStep.events).length,
    );
    expect(
      a.list_legal_actions({ session_id: game.session_id, compact_actions: true }).state_hash,
    ).toBe(moved.state_hash);
    const changedMenu = a.list_legal_actions({
      session_id: game.session_id,
      compact_actions: true,
      if_state_hash: game.state_hash,
    });
    expect("unchanged" in changedMenu).toBe(false);
    if ("unchanged" in changedMenu) throw new Error("expected changed action menu");
    expect(changedMenu.state_hash).toBe(moved.state_hash);
    assertCompactActionId(changedMenu.actions[0]);

    const saved = a.save_game({ session_id: game.session_id });
    expect("pack_id" in saved).toBe(false);
    expect("pack_path" in saved).toBe(false);
    expect("mode" in saved).toBe(false);
    expect("world_quest_id" in saved).toBe(false);
    expect("generated_rpg_seed" in saved).toBe(false);
    expect("content_hash" in saved).toBe(false);
    const loaded = a.load_game({
      save: saved.save,
      compact_observation: false,
    });
    expect("pack_path" in loaded).toBe(false);
    expect("packPath" in a.sessions.get(loaded.session_id)).toBe(false);
    expect(loaded.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in loaded).toBe(false);
    expect(loaded.observation.world?.id).toBe("charter_marches");
    expect(
      a.get_observation({
        session_id: loaded.session_id,
        compact_observation: false,
      }).observation,
    ).not.toHaveProperty("world");
    assertPublicAction(loaded.observation.available_actions[0]);
  });

  it("reuses cached legal actions when building MCP observations", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const session = a.sessions.get(game.session_id);
    const cachedActions: RpgActionOption[] = [
      {
        id: "cached_inventory",
        command: "inventory",
        action: { type: "INVENTORY" },
      },
    ];

    session.legalActionsCache = {
      stateHash: session.stateHash,
      actions: cachedActions,
    };

    const full = a.get_observation({
      session_id: game.session_id,
      compact_observation: false,
    }).observation;
    expect(full.available_actions).toEqual([{ id: "cached_inventory", command: "inventory" }]);

    const compact = a.get_observation({
      session_id: game.session_id,
      compact_actions: true,
      compact_observation: false,
    }).observation;
    expect(compact.available_actions).toEqual([{ id: "cached_inventory" }]);
  });

  it("returns compact RPG context for repeated MCP loop turns", () => {
    const a = api();
    const fullStart = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      hide_graph: true,
      compact_actions: true,
      compact_observation: false,
    });
    const compactStart = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      hide_graph: true,
      compact_observation: true,
    });
    const defaultStart = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      hide_graph: true,
    });
    const introStart = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      hide_graph: true,
      compact_observation: true,
      include_world_intro: true,
    });

    expect("observation" in compactStart).toBe(false);
    expect("world" in compactStart).toBe(false);
    expect("quest" in compactStart).toBe(false);
    expect("mode" in compactStart.context).toBe(false);
    expect(defaultStart.context).toEqual(compactStart.context);
    expect("observation" in defaultStart).toBe(false);
    expect("world" in defaultStart).toBe(false);
    expect("quest" in defaultStart).toBe(false);
    expect(compactStart.context).toMatchObject({
      v: RPG_COMPACT_OBSERVATION_VERSION,
      here: [fullStart.observation.room, fullStart.observation.title],
    });
    expect(fullStart.observation.world?.id).toBe("charter_marches");
    expect(fullStart.observation.description).toContain("You have come from Charterhaven");
    expect(compactStart.context.text).not.toContain("You have come from Charterhaven");
    expect(introStart.context.text).toContain("You have come from Charterhaven");
    expect(JSON.stringify(compactStart.context).length).toBeLessThan(
      JSON.stringify(introStart.context).length,
    );
    const startSave = a.save_game({ session_id: compactStart.session_id });
    const compactReload = a.load_game({ save: startSave.save });
    const introReload = a.load_game({ save: startSave.save, include_world_intro: true });
    expect(compactReload.context.text).not.toContain("You have come from Charterhaven");
    expect(introReload.context.text).toContain("You have come from Charterhaven");
    expect(compactStart.context.vitals).toEqual([
      fullStart.observation.stats.hp,
      fullStart.observation.stats.attack,
      fullStart.observation.stats.defense,
      fullStart.observation.score,
      fullStart.observation.max_score,
    ]);
    expect("actions" in compactStart.context).toBe(false);
    const actionBundledStart = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    });
    expect(actionBundledStart.context.actions?.[0]).toEqual(expect.any(String));
    expect(compactStart.context.vars).toMatchObject({ might: expect.any(Number) });
    expect(compactStart.context.vars).not.toHaveProperty("hp");
    expect(compactStart.context.vars).not.toHaveProperty("score");
    expect(JSON.stringify(compactStart.context).length).toBeLessThan(
      JSON.stringify(fullStart.observation).length,
    );
    const proseBudgetStart = a.start_world_quest({ world_quest_id: "breaking_weir" });
    expect(proseBudgetStart.context.text.length).toBeLessThanOrEqual(
      COMPACT_DESCRIPTION_CHAR_LIMIT,
    );
    expect(proseBudgetStart.context.objects).toEqual(["flood_book", "life_line", "weir_iron"]);
    expect(proseBudgetStart.context.npcs).toEqual(["pell"]);
    expect(JSON.stringify(proseBudgetStart).length).toBeLessThan(750);
    const proseBudgetTalk = a.step_action({
      session_id: proseBudgetStart.session_id,
      action_id: "talk_pell",
    });
    expect(proseBudgetTalk.context.text.length).toBeLessThanOrEqual(COMPACT_DESCRIPTION_CHAR_LIMIT);
    expect(proseBudgetTalk.context.dialogue?.[1].length).toBeLessThanOrEqual(
      COMPACT_DIALOGUE_CHAR_LIMIT,
    );
    expect(JSON.stringify(proseBudgetTalk).length).toBeLessThan(1450);
    const compactStartSession = a.sessions.get(compactStart.session_id);
    expect(compactStartSession.observationCache).toBeUndefined();
    expect(compactStartSession.observationProjectionCaches?.size).toBe(1);

    const compactWorldQuest = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      hide_graph: true,
      compact_observation: true,
    });
    expect(compactWorldQuest.context.here[0]).toBe(fullStart.observation.room);
    expect("observation" in compactWorldQuest).toBe(false);
    expect("mode" in compactWorldQuest.context).toBe(false);
    expect(a.sessions.get(compactWorldQuest.session_id).observationCache).toBeUndefined();

    const compactObservation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
    });
    const defaultObservation = a.get_observation({ session_id: fullStart.session_id });
    expect(defaultObservation.context).toEqual(compactObservation.context);
    expect("observation" in defaultObservation).toBe(false);
    expect(compactObservation.context.exits?.[0]).toEqual(expect.any(String));
    expect("actions" in compactObservation.context).toBe(false);
    expect("mode" in compactObservation.context).toBe(false);

    const repeatedCompactObservation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
    });
    expect(repeatedCompactObservation.context).toEqual(compactObservation.context);
    expect(repeatedCompactObservation.context).not.toBe(compactObservation.context);
    expect(repeatedCompactObservation.context.here).not.toBe(compactObservation.context.here);
    const compactRoom = compactObservation.context.here[0];
    (repeatedCompactObservation.context.here as [string, string])[0] = "mutated_room";
    const afterCompactObservationMutation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
    });
    expect(afterCompactObservationMutation.context.here[0]).toBe(compactRoom);
    const refStart = a.start_world_quest({ world_quest_id: "breaking_weir" });
    const repeatedRefObservation = a.get_observation({ session_id: refStart.session_id });
    repeatedRefObservation.context.objects![0] = "mutated_object";
    repeatedRefObservation.context.npcs![0] = "mutated_npc";
    const afterRefMutation = a.get_observation({ session_id: refStart.session_id });
    expect(afterRefMutation.context.objects).toEqual(["flood_book", "life_line", "weir_iron"]);
    expect(afterRefMutation.context.npcs).toEqual(["pell"]);
    expect("actions" in afterCompactObservationMutation.context).toBe(false);

    const actionBundledObservation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    });
    expect(actionBundledObservation.context.actions?.[0]).toEqual(expect.any(String));
    const repeatedActionBundledObservation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    });
    const compactActions = [...(actionBundledObservation.context.actions ?? [])];
    repeatedActionBundledObservation.context.actions?.push("mutated_action");
    const afterActionBundledObservationMutation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    });
    expect(afterActionBundledObservationMutation.context.actions).toEqual(compactActions);

    const fullObservation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: false,
    });
    const repeatedFullObservation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: false,
    });
    expect(repeatedFullObservation.observation).toEqual(fullObservation.observation);
    expect(repeatedFullObservation.observation).not.toBe(fullObservation.observation);
    expect(repeatedFullObservation.observation.exits).not.toBe(fullObservation.observation.exits);
    expect(repeatedFullObservation.observation.state.flags).not.toBe(
      fullObservation.observation.state.flags,
    );
    expect(repeatedFullObservation.observation.available_actions).not.toBe(
      fullObservation.observation.available_actions,
    );
    const fullExitDirection = fullObservation.observation.exits[0]?.direction;
    const fullFlags = [...fullObservation.observation.state.flags];
    const fullActionId = fullObservation.observation.available_actions[0]?.id;
    repeatedFullObservation.observation.exits[0]!.direction = "mutated_direction";
    repeatedFullObservation.observation.state.flags.push("mutated_flag");
    repeatedFullObservation.observation.available_actions[0]!.id = "mutated_action";
    const afterFullObservationMutation = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: false,
    });
    expect(afterFullObservationMutation.observation.exits[0]?.direction).toBe(fullExitDirection);
    expect(afterFullObservationMutation.observation.state.flags).toEqual(fullFlags);
    expect(afterFullObservationMutation.observation.available_actions[0]?.id).toBe(fullActionId);

    const unchangedObservation = a.get_observation({
      session_id: fullStart.session_id,
      if_state_hash: compactObservation.state_hash,
      compact_observation: true,
    });
    expect("unchanged" in unchangedObservation).toBe(true);
    if (!("unchanged" in unchangedObservation)) throw new Error("expected unchanged response");
    expect("session_id" in unchangedObservation).toBe(false);
    expect(unchangedObservation.unchanged).toBe(true);
    expect(unchangedObservation.state_hash).toBe(compactObservation.state_hash);
    expect("context" in unchangedObservation).toBe(false);
    expect("observation" in unchangedObservation).toBe(false);
    expect(JSON.stringify(unchangedObservation).length).toBeLessThan(
      JSON.stringify(compactObservation).length,
    );

    const defaultRejectedStep = a.step_action({
      session_id: fullStart.session_id,
      action_id: "missing",
    });
    expect(defaultRejectedStep.ok).toBe(false);
    expect("observation" in defaultRejectedStep).toBe(false);
    expect(defaultRejectedStep.context.here[0]).toBe(fullStart.observation.room);
    expect(defaultRejectedStep.event_v).toBe(RPG_COMPACT_EVENT_VERSION);
    expect(defaultRejectedStep.events[0]).toEqual(["r", "That action is not available right now."]);

    const rejected = a.step_action({
      session_id: fullStart.session_id,
      action_id: "missing",
      hide_graph: true,
      compact_observation: true,
    });
    expect(rejected.ok).toBe(false);
    expect("rejection_reason" in rejected).toBe(true);
    expect("observation" in rejected).toBe(false);
    expect(rejected.context.here[0]).toBe(fullStart.observation.room);

    const legalMenu = a.list_legal_actions({
      session_id: fullStart.session_id,
      compact_actions: true,
    });
    const moveActionId = legalMenu.actions.find((action) => action === "go_down");
    expect(moveActionId).toBe("go_down");
    const moved = a.step_action({
      session_id: fullStart.session_id,
      action_id: moveActionId!,
      expected_state_hash: compactObservation.state_hash,
      hide_graph: true,
      compact_observation: true,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error("expected state-matched action to move");
    expect("rejection_reason" in moved).toBe(false);
    expect(moved.context.here[0]).not.toBe(fullStart.observation.room);

    const changedObservation = a.get_observation({
      session_id: fullStart.session_id,
      if_state_hash: compactObservation.state_hash,
      compact_observation: true,
    });
    expect("unchanged" in changedObservation).toBe(false);
    if ("unchanged" in changedObservation) throw new Error("expected changed observation");
    expect(changedObservation.state_hash).toBe(moved.state_hash);
    expect(changedObservation.context.here).toEqual(moved.context.here);

    const scene = a.get_observation({
      session_id: fullStart.session_id,
      hide_graph: true,
      compact_observation: true,
    });
    expect(scene.context.here[0]).toBe(moved.context.here[0]);

    const terminalGame = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const ended = playSunkenBarrowToVictory(a, terminalGame.session_id);
    expect(ended.observation.ended).toBe(true);
    const terminal = a.get_observation({
      session_id: terminalGame.session_id,
      hide_graph: true,
      compact_observation: true,
    });
    expect(terminal.context.ended).toBe(true);
    expect("actions" in terminal.context).toBe(false);
  });

  it("step_action rejects an illegal action without changing state", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      compact_observation: false,
    });
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    const transcriptBefore = a.get_transcript({
      session_id: game.session_id,
      summary_only: true,
    });
    const longActionId = `not_a_real_choice_${"x".repeat(500)}a`;
    const samePrefixActionId = `not_a_real_choice_${"x".repeat(500)}b`;
    const r = a.step_action({ session_id: game.session_id, action_id: longActionId });
    const second = a.step_action({ session_id: game.session_id, action_id: samePrefixActionId });
    expect(r.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect("rejection_reason" in r).toBe(true);
    if (r.ok) throw new Error("expected illegal action rejection");
    expect(r.rejection_reason).toBeTruthy();
    expect(r.state_hash).toBe(before);
    expect(second.state_hash).toBe(before);
    const transcriptAfter = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_events: false,
      compact_summary: false,
    });
    const rejectedTurn = transcriptAfter.turns[transcriptAfter.turns.length - 2]!;
    const secondRejectedTurn = transcriptAfter.turns[transcriptAfter.turns.length - 1]!;
    expect(transcriptAfter.state_hash).toBe(before);
    expect(transcriptAfter.transcript_hash).not.toBe(transcriptBefore.transcript_hash);
    expect(transcriptAfter.summary.steps).toBe(transcriptBefore.summary.steps + 2);
    expect(rejectedTurn).toMatchObject({
      action_text: null,
      scene_id: game.observation.room,
      result_scene_id: game.observation.room,
      ended: game.observation.ended,
      ending_id: game.observation.ending_id,
    });
    expect(rejectedTurn.action_id).not.toBe(longActionId);
    expect(rejectedTurn.action_id?.length).toBeLessThanOrEqual(128);
    expect(rejectedTurn.action_id).toMatch(/^not_a_real_choice_x+/);
    expect(rejectedTurn.action_id).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(secondRejectedTurn.action_id).not.toBe(samePrefixActionId);
    expect(secondRejectedTurn.action_id?.length).toBeLessThanOrEqual(128);
    expect(secondRejectedTurn.action_id).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(secondRejectedTurn.action_id).not.toBe(rejectedTurn.action_id);
    expect(rejectedTurn.events).toEqual([
      { type: "rejected", reason: "That action is not available right now." },
    ]);
    expect(secondRejectedTurn.events).toEqual(rejectedTurn.events);
  });

  it("step_action rejects stale expected_state_hash before mutating state", () => {
    const a = api();
    const game = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      compact_observation: true,
    });
    const menu = a.list_legal_actions({ session_id: game.session_id, compact_actions: true });
    const moveActionId = menu.actions.find((action) => action === "go_down");
    const initialState = a.get_state({ session_id: game.session_id, include_state: true });
    const fullInitialStateHash = hashState(initialState.state);

    expect(menu.state_hash).toMatch(PUBLIC_RPG_STATE_HASH_RE);
    expect(menu.state_hash).toBe(publicRpgStateHash(fullInitialStateHash));
    expect(moveActionId).toBe("go_down");
    const moved = a.step_action({
      session_id: game.session_id,
      action_id: moveActionId!,
      expected_state_hash: menu.state_hash,
      compact_observation: true,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) throw new Error("expected state-matched action to move");
    expect("rejection_reason" in moved).toBe(false);
    expect(moved.state_hash).not.toBe(menu.state_hash);
    expect(moved.state_hash).toMatch(PUBLIC_RPG_STATE_HASH_RE);
    const transcriptRowsAfterMove = a.get_transcript({
      session_id: game.session_id,
      summary_only: false,
      compact_events: false,
      compact_summary: false,
    }).turns.length;

    const stale = a.step_action({
      session_id: game.session_id,
      action_id: "not_a_real_choice",
      expected_state_hash: menu.state_hash,
      compact_observation: true,
    });
    expect(stale.ok).toBe(false);
    expect("rejection_reason" in stale).toBe(true);
    if (stale.ok) throw new Error("expected stale action rejection");
    expect(stale.rejection_reason).toMatch(/state hash/i);
    expect(stale.state_hash).toBe(moved.state_hash);
    expect("events" in stale).toBe(false);
    expect("event_v" in stale).toBe(false);
    expect("context" in stale).toBe(false);
    expect("observation" in stale).toBe(false);
    expect(JSON.stringify(stale).length).toBeLessThan(JSON.stringify(moved).length);
    expect(
      a.get_transcript({
        session_id: game.session_id,
        summary_only: false,
        compact_events: false,
        compact_summary: false,
      }).turns,
    ).toHaveLength(transcriptRowsAfterMove);
  });

  it("refuses to start a game from a raw pack path", () => {
    expect(() =>
      api().new_game({ pack_path: "content/broken-fixtures/rpg_unwinnable.yaml" } as never),
    ).toThrow(/not pack_path/i);
  });

  it("refuses legacy pack paths at the gameplay source boundary", () => {
    expect(() => api().new_game({ pack_path: NON_RPG_PACK } as never)).toThrow(/not pack_path/);
  });
});

describe("MCP tools — save / load round-trip (§8.7)", () => {
  it("a saved game reloads to the identical state hash", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    stepByCommand(a, game.session_id, "go down");
    const after = a.get_observation({ session_id: game.session_id }).state_hash;

    const saved = a.save_game({ session_id: game.session_id });
    const sourcedSave = a.save_game({ session_id: game.session_id, include_source: true });
    const hashedSave = a.save_game({ session_id: game.session_id, include_content_hash: true });
    const reloaded = a.load_game({ save: saved.save });
    const saveBundle = JSON.parse(saved.save) as {
      contentHash?: unknown;
      mode?: string;
      packId?: unknown;
      source_ref?: unknown;
      worldQuestId?: unknown;
      generatedRpgSeed?: unknown;
    };
    expect("pack_id" in saved).toBe(false);
    expect("pack_path" in saved).toBe(false);
    expect("mode" in saved).toBe(false);
    expect("world_quest_id" in saved).toBe(false);
    expect("generated_rpg_seed" in saved).toBe(false);
    expect("content_hash" in saved).toBe(false);
    expect("content_hash" in sourcedSave).toBe(false);
    expect(sourcedSave.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in sourcedSave).toBe(false);
    expect(sourcedSave.save).toBe(saved.save);
    expect(hashedSave.save).toBe(saved.save);
    expect(hashedSave.content_hash).toBe(saveBundle.contentHash);
    expect(hashedSave.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.state_hash).toBe(after);
    expect(saveBundle.mode).toBe("rpg");
    expect("packId" in saveBundle).toBe(false);
    expect(saveBundle.source_ref).toEqual(["wq", "sunken_barrow"]);
    expect(saveBundle.worldQuestId).toBeUndefined();
    expect(saveBundle.generatedRpgSeed).toBeUndefined();
    expect("pack_path" in reloaded).toBe(false);
    expect(reloaded.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in reloaded).toBe(false);
    expect(reloaded.state_hash).toBe(after);
  });

  it("save_game rejects stale expected_state_hash without serializing a save blob", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const before = a.get_observation({ session_id: game.session_id }).state_hash;
    stepByCommand(a, game.session_id, "go down");
    const after = a.get_observation({ session_id: game.session_id }).state_hash;
    const afterFullStateHash = hashState(
      a.get_state({ session_id: game.session_id, include_state: true }).state,
    );
    expect(afterFullStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(after).toBe(publicRpgStateHash(afterFullStateHash));

    const stale = a.save_game({
      session_id: game.session_id,
      expected_state_hash: before,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("expected stale save rejection");
    expect("session_id" in stale).toBe(false);
    expect("events" in stale).toBe(false);
    expect(stale.state_hash).toBe(after);
    expect(stale.rejection_reason).toMatch(/state hash mismatch/i);
    expect("save" in stale).toBe(false);

    const saved = a.save_game({
      session_id: game.session_id,
      expected_state_hash: afterFullStateHash,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("expected guarded save success");
    expect("pack_id" in saved).toBe(false);
    expect("mode" in saved).toBe(false);
    expect("content_hash" in saved).toBe(false);
    expect(saved.state_hash).toBe(after);
    expect(a.load_game({ save: saved.save }).state_hash).toBe(after);
    expect(JSON.stringify(stale).length).toBeLessThan(JSON.stringify(saved).length);

    const unchanged = a.save_game({
      session_id: game.session_id,
      expected_state_hash: afterFullStateHash,
      if_state_hash: afterFullStateHash,
    });
    expect(unchanged).toEqual({ state_hash: after, unchanged: true });
    expect("ok" in unchanged).toBe(false);
    expect("save" in unchanged).toBe(false);
    expect(JSON.stringify(unchanged).length).toBeLessThan(JSON.stringify(saved).length);
  });

  it("can reload saves into compact RPG context for resumed MCP loops", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    stepByCommand(a, game.session_id, "go down");
    const after = a.get_observation({ session_id: game.session_id }).state_hash;
    const saved = a.save_game({ session_id: game.session_id });
    const fullReload = a.load_game({
      save: saved.save,
      hide_graph: true,
      compact_actions: true,
      compact_observation: false,
    });
    const defaultReload = a.load_game({
      save: saved.save,
      hide_graph: true,
    });
    const compactReload = a.load_game({
      save: saved.save,
      hide_graph: true,
      compact_observation: true,
    });

    expect(saved.state_hash).toBe(after);
    expect(compactReload.state_hash).toBe(after);
    expect(defaultReload.context).toEqual(compactReload.context);
    expect("observation" in defaultReload).toBe(false);
    expect("pack_path" in compactReload).toBe(false);
    expect(compactReload.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in compactReload).toBe(false);
    expect("observation" in compactReload).toBe(false);
    expect(compactReload.context.here).toEqual([
      fullReload.observation.room,
      fullReload.observation.title,
    ]);
    expect(compactReload.context.exits?.[0]).toEqual(expect.any(String));
    expect("actions" in compactReload.context).toBe(false);
    expect(JSON.stringify(compactReload).length).toBeLessThan(JSON.stringify(fullReload).length);

    const actionBundledReload = a.load_game({
      save: saved.save,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    });
    expect(actionBundledReload.context.actions?.[0]).toEqual(expect.any(String));
  });

  it("a shipped world quest save reloads by world graph id", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    stepByCommand(a, game.session_id, "go down");
    const after = a.get_observation({ session_id: game.session_id }).state_hash;

    const saved = a.save_game({ session_id: game.session_id });
    const reloaded = a.load_game({
      world_quest_id: "sunken_barrow",
      save: saved.save,
      compact_observation: false,
    });
    const inferred = a.load_game({ save: saved.save });
    expect("mode" in reloaded).toBe(false);
    expect("pack_id" in saved).toBe(false);
    expect("pack_path" in saved).toBe(false);
    expect("world_quest_id" in saved).toBe(false);
    expect("generated_rpg_seed" in saved).toBe(false);
    expect(saved.state_hash).toBe(after);
    expect("pack_path" in reloaded).toBe(false);
    expect(reloaded.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in reloaded).toBe(false);
    expect(reloaded.state_hash).toBe(after);
    expect(reloaded.observation.world?.id).toBe("charter_marches");
    expect("pack_path" in inferred).toBe(false);
    expect(inferred.world_quest_id).toBe("sunken_barrow");
    expect("generated_rpg_seed" in inferred).toBe(false);
    expect(inferred.state_hash).toBe(after);
  });

  it("load_game rejects ambiguous restore sources", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const saved = a.save_game({ session_id: game.session_id });

    expect(() =>
      a.load_game({
        world_quest_id: "sunken_barrow",
        generate_rpg_seed: 3,
        save: saved.save,
      }),
    ).toThrow(/exactly one/);
    expect(() => a.load_game({ pack_path: PACK, save: saved.save } as never)).toThrow(
      /not pack_path/,
    );
  });

  it("load_game rejects a source that conflicts with the save source_ref", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: "sunken_barrow", seed: 1 });
    const saved = a.save_game({ session_id: game.session_id });

    expect(() => a.load_game({ world_quest_id: "cold_forge", save: saved.save })).toThrow(
      /source_ref/,
    );
  });
});

describe("MCP tools — replay + path confinement", () => {
  beforeAll(() => {
    // Record a trace to disk for replay_trace to read.
    const compiled = loadRpgSourceFile(PACK);
    if (!compiled.ok) throw new Error("pack must compile");
    const index = indexRpgPack(compiled.compiled.pack);
    const rules = buildRpgRules(index);
    const step = makeStep(rules);
    const state0 = initStateForRpgPack(index, 1);
    const actions: RpgAction[] = [];
    let state = state0;
    const push = (action: RpgAction): void => {
      const result = step(state, action);
      if (!result.ok) throw new Error(`Trace action failed: ${JSON.stringify(action)}`);
      actions.push(action);
      state = result.state;
    };

    push({ type: "MOVE", direction: "down" });
    push({ type: "TAKE", item: "iron_bar" });
    push({ type: "MOVE", direction: "north" });
    for (let i = 0; i < 40 && !state.ended; i += 1) {
      const obs = buildRpgObservation(index, state);
      if (!obs.enemies_present.some((enemy) => enemy.id === "barrow_wight")) break;
      push({ type: "ATTACK", enemy: "barrow_wight" });
    }
    push({ type: "MOVE", direction: "east" });
    for (let i = 0; i < 40 && state.questStage["barrow"] !== "slab_moved"; i += 1) {
      push({ type: "USE", item: "iron_bar", target: "stone_slab" });
    }
    push({ type: "MOVE", direction: "down" });
    push({ type: "TAKE", item: "circlet" });

    const trace = recordTrace(rules, state0, actions, {
      trace_id: "tr_mcp",
      content_hash: compiled.compiled.contentHash,
      worldQuestId: "sunken_barrow",
    });
    mkdirSync("traces", { recursive: true });
    writeFileSync("traces/mcp_replay.json", JSON.stringify(trace));

    const generatedPack = generateRpgPack(3);
    const generatedIndex = indexRpgPack(generatedPack);
    const generatedRules = buildRpgRules(generatedIndex);
    const generatedTrace = recordTrace(generatedRules, initStateForRpgPack(generatedIndex, 7), [], {
      trace_id: "tr_mcp_generated",
      content_hash: hashState(generatedPack),
      generatedRpgSeed: 3,
    });
    writeFileSync("traces/mcp_generated_replay.json", JSON.stringify(generatedTrace));
  });

  it("replay_trace reproduces the recorded final hash", () => {
    const r = api().replay_trace({ trace_path: "traces/mcp_replay.json" });
    expect(r.ok).toBe(true);
  });

  it("replay_trace accepts a world graph quest id for shipped traces", () => {
    const r = api().replay_trace({
      trace_path: "traces/mcp_replay.json",
      world_quest_id: "sunken_barrow",
    });
    expect(r.ok).toBe(true);
  });

  it("replay_trace can infer a shipped trace source from embedded source_ref", () => {
    const r = api().replay_trace({ trace_path: "traces/mcp_replay.json" });
    expect(r.ok).toBe(true);
  });

  it("replay_trace can infer a generated trace source from embedded source_ref", () => {
    const r = api().replay_trace({ trace_path: "traces/mcp_generated_replay.json" });
    expect(r.ok).toBe(true);
  });

  it("inspect_trace summarizes steps and finds no failure on a winning route (§9.4)", () => {
    const r = api().inspect_trace({ trace_path: "traces/mcp_replay.json" }) as {
      ok: boolean;
      world_quest_id: string | null;
      hash_ok: boolean;
      steps: number;
      diverged_at_step: number | null;
      diagnosis: { type: string };
      step_summary_v: number;
      step_summary: ReadonlyArray<
        readonly [
          i: number,
          action: string,
          ok: boolean,
          location: string,
          ended: boolean,
          ending_id: string | null,
        ]
      >;
    };
    expect(r.ok).toBe(true);
    expect("mode" in r).toBe(false);
    expect("pack_id" in r).toBe(false);
    expect(r.world_quest_id).toBe("sunken_barrow");
    expect(r.hash_ok).toBe(true);
    expect(r.steps).toBeGreaterThan(5);
    // A faithful Trace-v2 trace (mcp_replay.json carries per_step_hashes) has no
    // divergence to localize.
    expect(r.diverged_at_step).toBeNull();
    expect(r.diagnosis.type).toBe("no_failure");
    expect(r.step_summary_v).toBe(1);
    expect(r.step_summary.at(-1)?.[5]).toBe("ending_victory");
    expect("action" in (r.step_summary[0] as object)).toBe(false);
  });

  it("inspect_trace full step rows are opt-in", () => {
    const compact = api().inspect_trace({ trace_path: "traces/mcp_replay.json" });
    const full = api().inspect_trace({
      trace_path: "traces/mcp_replay.json",
      compact_summary: false,
    }) as {
      step_summary_v?: number;
      step_summary: { action: RpgAction; ended: boolean; ending_id: string | null }[];
    };
    expect("step_summary_v" in full).toBe(false);
    expect(full.step_summary.at(-1)?.ending_id).toBe("ending_victory");
    expect(full.step_summary[0]?.action).toMatchObject({ type: "MOVE" });
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length);
  });

  it("inspect_trace accepts a world graph quest id for shipped traces", () => {
    const r = api().inspect_trace({
      trace_path: "traces/mcp_replay.json",
      world_quest_id: "sunken_barrow",
    }) as {
      ok: boolean;
      world_quest_id: string | null;
      hash_ok: boolean;
      diagnosis: { type: string };
    };
    expect(r.ok).toBe(true);
    expect("mode" in r).toBe(false);
    expect("pack_id" in r).toBe(false);
    expect(r.world_quest_id).toBe("sunken_barrow");
    expect(r.hash_ok).toBe(true);
    expect(r.diagnosis.type).toBe("no_failure");
  });

  it("inspect_trace can infer a shipped trace source from embedded source_ref", () => {
    const r = api().inspect_trace({ trace_path: "traces/mcp_replay.json" }) as {
      ok: boolean;
      world_quest_id: string | null;
      hash_ok: boolean;
      diagnosis: { type: string };
    };
    expect(r.ok).toBe(true);
    expect("mode" in r).toBe(false);
    expect("pack_id" in r).toBe(false);
    expect(r.world_quest_id).toBe("sunken_barrow");
    expect(r.hash_ok).toBe(true);
    expect(r.diagnosis.type).toBe("no_failure");
  });

  it("inspect_trace can infer a generated trace source from embedded source_ref", () => {
    const r = api().inspect_trace({ trace_path: "traces/mcp_generated_replay.json" }) as {
      ok: boolean;
      world_quest_id: string | null;
      generated_rpg_seed: number;
      hash_ok: boolean;
      steps: number;
      diagnosis: { type: string };
    };
    expect(r.ok).toBe(true);
    expect("mode" in r).toBe(false);
    expect("pack_id" in r).toBe(false);
    expect(r.world_quest_id).toBeNull();
    expect(r.generated_rpg_seed).toBe(3);
    expect(r.hash_ok).toBe(true);
    expect(r.steps).toBe(0);
    expect(r.diagnosis.type).toBe("no_failure");
  });

  it("trace tools reject raw pack paths on the ToolApi surface", () => {
    const a = api();
    expect(() =>
      a.replay_trace({
        trace_path: "traces/mcp_replay.json",
        pack_path: PACK,
      } as never),
    ).toThrow(/not pack_path/);
    expect(() =>
      a.inspect_trace({
        trace_path: "traces/mcp_replay.json",
        pack_path: PACK,
      } as never),
    ).toThrow(/not pack_path/);
  });

  it("trace tools reject loose legacy source metadata without source_ref", () => {
    const trace = JSON.parse(readFileSync("traces/mcp_replay.json", "utf8")) as {
      source_ref?: unknown;
    };
    delete trace.source_ref;
    writeFileSync("traces/mcp_replay_missing_source_ref.json", JSON.stringify(trace));

    const a = api();
    expect(() =>
      a.replay_trace({ trace_path: "traces/mcp_replay_missing_source_ref.json" }),
    ).toThrow(/source_ref/);
    expect(() =>
      a.inspect_trace({ trace_path: "traces/mcp_replay_missing_source_ref.json" }),
    ).toThrow(/source_ref/);
  });

  it("trace tools reject a source that conflicts with the trace source_ref", () => {
    const a = api();
    expect(() =>
      a.replay_trace({
        trace_path: "traces/mcp_replay.json",
        world_quest_id: "cold_forge",
      }),
    ).toThrow(/source_ref/);
    expect(() =>
      a.inspect_trace({
        trace_path: "traces/mcp_replay.json",
        world_quest_id: "cold_forge",
      }),
    ).toThrow(/source_ref/);
    expect(() =>
      a.replay_trace({
        trace_path: "traces/mcp_generated_replay.json",
        world_quest_id: "sunken_barrow",
      }),
    ).toThrow(/source_ref/);
    expect(() =>
      a.inspect_trace({
        trace_path: "traces/mcp_generated_replay.json",
        world_quest_id: "sunken_barrow",
      }),
    ).toThrow(/source_ref/);
  });

  it("rejects a path that escapes the project root", () => {
    expect(() => api().replay_trace({ trace_path: "../../../etc/passwd" })).toThrow(
      PathEscapeError,
    );
  });
});

describe("MCP tools — apply_content_patch (§9.4, §16)", () => {
  it("applies a whitelisted hint patch and re-validates green", () => {
    const proposal = {
      layer: "hint_text",
      summary: "signpost the start room",
      ops: [
        {
          op: "add_room_journal_hint",
          room: "forge_steps",
          text: "The forge below answers only to a delver who reads the room carefully.",
        },
      ],
    } as never;

    const a = api();
    a.start_world_quest({ world_quest_id: "cold_forge" });
    const r = a.apply_content_patch({
      world_quest_id: "cold_forge",
      proposal,
    }) as {
      ok: boolean;
      world_quest_id: string | null;
      report: { ok: boolean; source_id: string };
    };
    expect(r.ok).toBe(true);
    expect("pack_path" in r).toBe(false);
    expect("pack" in r).toBe(false);
    expect(r.world_quest_id).toBe("cold_forge");
    expect("pack_id" in r.report).toBe(false);
    expect(r.report.source_id).toBe("cold_forge_v1");
    expect(r.report.source_id).not.toContain("/");
    expect(r.report.source_id).not.toContain("\\");
    expect(r.report.ok).toBe(true);

    const withPack = a.apply_content_patch({
      world_quest_id: "cold_forge",
      include_pack: true,
      proposal,
    }) as {
      ok: boolean;
      pack?: { meta: { id: string } };
    };
    expect(withPack.ok).toBe(true);
    expect(withPack.pack?.meta.id).toBe("cold_forge_v1");
    expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(withPack).length);
  });

  it("refuses a patch whose target is missing (no file written)", () => {
    const r = api().apply_content_patch({
      world_quest_id: "cold_forge",
      proposal: {
        layer: "content",
        summary: "x",
        ops: [{ op: "set_object_field", id: "ghost", field: "takeable", value: true }],
      } as never,
    }) as {
      ok: boolean;
      world_quest_id: string | null;
      report: { source_id: string; findings: { code: string }[] };
    };
    expect(r.ok).toBe(false);
    expect("pack_path" in r).toBe(false);
    expect(r.world_quest_id).toBe("cold_forge");
    expect("pack_id" in r.report).toBe(false);
    expect(r.report.source_id).toBe("cold_forge_v1");
    expect(r.report.source_id).not.toContain("/");
    expect(r.report.source_id).not.toContain("\\");
    expect(r.report.findings[0]?.code).toBe("PATCH_TARGET_MISSING");
  });

  it("rejects missing or ambiguous patch source identity", () => {
    const proposal = {
      layer: "content",
      summary: "x",
      ops: [{ op: "set_object_field", id: "ghost", field: "takeable", value: true }],
    } as never;
    expect(() => api().apply_content_patch({ proposal })).toThrow(/requires world_quest_id/);
    expect(() =>
      api().apply_content_patch({
        pack_path: "content/rpg/quests/cold_forge.yaml",
        proposal,
      } as never),
    ).toThrow(/not pack_path/);
    expect(() =>
      api().apply_content_patch({
        world_quest_id: "cold_forge",
        pack_path: "content/rpg/quests/cold_forge.yaml",
        proposal,
      } as never),
    ).toThrow(/not pack_path/);
  });

  it("rejects the retired proposal mode discriminator", () => {
    expect(() =>
      api().apply_content_patch({
        world_quest_id: "cold_forge",
        proposal: {
          layer: "content",
          mode: "rpg",
          summary: "x",
          ops: [],
        } as never,
      }),
    ).toThrow(/mode/);
  });
});
