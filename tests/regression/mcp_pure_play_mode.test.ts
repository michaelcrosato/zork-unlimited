import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PURE_PLAYER_TOOLS,
  resolveAreaMoveSelector,
  resolveVisibleAreaRouteId,
  toolAvailableInPlayMode,
} from "../../src/mcp/server.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const MCP_SERVER = join(ROOT, "src", "mcp", "server.ts");
const TEST_RUN_SEED = 2731;
const TEST_BUILD_COMMIT = "b".repeat(40);

async function withPureServer<T>(
  evidencePath: string,
  body: (client: Client) => Promise<T>,
  runSeed = TEST_RUN_SEED,
  root = ROOT,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      TSX,
      MCP_SERVER,
      "--play-mode",
      "pure",
      "--run-evidence",
      evidencePath,
      "--run-seed",
      String(runSeed),
      "--build-commit",
      TEST_BUILD_COMMIT,
      "--tracked-worktree-clean",
      "true",
    ],
    cwd: root,
    stderr: "pipe",
  });
  const client = new Client({ name: "pure-play-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await body(client);
  } finally {
    await client.close();
  }
}

async function withFullServer<T>(body: (client: Client) => Promise<T>, root = ROOT): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX, MCP_SERVER, "--play-mode", "full"],
    cwd: root,
    stderr: "pipe",
  });
  const client = new Client({ name: "full-play-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await body(client);
  } finally {
    await client.close();
  }
}

function textPayload(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  return JSON.parse(textResult(result)) as Record<string, unknown>;
}

function textResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text?: string }[];
  const first = content[0];
  if (!first || first.type !== "text") throw new Error("expected text tool result");
  return first.text ?? "";
}

function expectAliasedToolSchema(
  listed: Awaited<ReturnType<Client["listTools"]>>,
  name: string,
  canonicalName: string,
  aliasName: string,
): void {
  const schema = listed.tools.find((tool) => tool.name === name)?.inputSchema;
  expect(schema, name).toBeDefined();
  expect(schema?.type, name).toBe("object");
  expect(schema?.properties, name).toHaveProperty(canonicalName);
  expect(schema?.properties, name).toHaveProperty(aliasName);
  const schemaWithGroups = schema as
    | {
        anyOf?: { required?: string[] }[];
        allOf?: { anyOf?: { required?: string[] }[] }[];
      }
    | undefined;
  const presenceOptions = [
    ...(schemaWithGroups?.anyOf ? [schemaWithGroups] : []),
    ...(schemaWithGroups?.allOf ?? []),
  ].find((part) => part.anyOf?.some((option) => option.required?.[0] === canonicalName))?.anyOf;
  expect(presenceOptions, name).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ required: [canonicalName] }),
      expect.objectContaining({ required: [aliasName] }),
    ]),
  );
}

function expectOneOfToolSchema(
  listed: Awaited<ReturnType<Client["listTools"]>>,
  name: string,
  argumentNames: readonly string[],
): void {
  const schema = listed.tools.find((tool) => tool.name === name)?.inputSchema;
  expect(schema, name).toBeDefined();
  expect(schema?.type, name).toBe("object");
  for (const argumentName of argumentNames) {
    expect(schema?.properties, name).toHaveProperty(argumentName);
  }
  expect(schema?.anyOf, name).toEqual(
    argumentNames.map((argumentName) => ({ required: [argumentName] })),
  );
}

function expectToolSchemaFields(
  listed: Awaited<ReturnType<Client["listTools"]>>,
  name: string,
  fieldNames: readonly string[],
): void {
  const schema = listed.tools.find((tool) => tool.name === name)?.inputSchema;
  expect(schema, name).toBeDefined();
  expect(schema?.type, name).toBe("object");
  for (const fieldName of fieldNames) {
    expect(schema?.properties, name).toHaveProperty(fieldName);
  }
}

async function callPlayerTool(
  client: Client,
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: argumentsValue });
  const payload = textPayload(result);
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(payload)}`);
  return payload;
}

function compactAreaRoute(payload: Record<string, unknown>, destination: string): string {
  const context = payload.context as { area_routes?: [string, string, number][] };
  const route = context.area_routes?.find(
    ([, routeDestination]) => routeDestination === destination,
  );
  if (!route) throw new Error(`expected a visible area route to ${destination}`);
  return route[0];
}

async function launchPreparedPureWolf(client: Client): Promise<{
  overworldSessionId: string;
  rpgSessionId: string;
  stateHash: string;
}> {
  const started = await callPlayerTool(client, "start_overworld", {});
  const overworldSessionId = String(started.session_id);
  const parent = { session_id: overworldSessionId };
  await callPlayerTool(client, "scout_overworld_session_poi", {
    ...parent,
    poi_id: "albany_city__civic_core__poi",
  });
  await callPlayerTool(client, "talk_overworld_session_contact", {
    ...parent,
    character_id: "albany_city__civic_core__contact",
  });
  for (const choice of [
    "albany:ledger_advocate",
    "albany:oath_limited_aid_only",
    "albany:source_rowan_civic_docket",
    "albany:prep_works_fortification",
  ]) {
    await callPlayerTool(client, "choose_overworld_session_story", { ...parent, choice });
  }
  let view = await callPlayerTool(client, "get_overworld_session_context", parent);
  await callPlayerTool(client, "move_overworld_session_area", {
    ...parent,
    area_route_id: compactAreaRoute(view, "albany_city__market"),
  });
  await callPlayerTool(client, "scout_overworld_session_poi", {
    ...parent,
    poi_id: "albany_city__market__poi",
  });
  view = await callPlayerTool(client, "get_overworld_session_context", parent);
  expect((view.context as { quest_starts?: unknown }).quest_starts).toBeUndefined();
  const departure = await callPlayerTool(client, "move_overworld_session_area", {
    ...parent,
    area_route_id: compactAreaRoute(view, "albany_city__transport_hub"),
  });
  expect((departure.journey as { storyChoice?: unknown }).storyChoice).not.toBeNull();
  expect((departure.context as { quest_starts?: unknown }).quest_starts).toBeUndefined();
  const ready = await callPlayerTool(client, "choose_overworld_session_story", {
    ...parent,
    choice: "albany:relief_resident_shelter",
  });
  expect((ready.context as { quest_starts?: unknown }).quest_starts).toEqual([
    ["wolf_winter", "albany:wolf_approach_exposed_ridge"],
    ["wolf_winter", "albany:wolf_approach_sheltered_stockway"],
  ]);
  const launched = await callPlayerTool(client, "start_overworld_session_quest", {
    ...parent,
    quest_id: "wolf_winter",
    approach_id: "albany:wolf_approach_sheltered_stockway",
  });
  expect(
    (launched.context as { quest_starts?: unknown } | undefined)?.quest_starts,
  ).toBeUndefined();
  const rpgSession = launched.rpg_session as { state_hash: string };
  return {
    overworldSessionId,
    rpgSessionId: String(launched.rpg_session_id),
    stateHash: rpgSession.state_hash,
  };
}

async function playPureQuestActions(
  client: Client,
  launch: { rpgSessionId: string; stateHash: string },
  actions: readonly string[],
): Promise<Record<string, unknown>> {
  let stateHash = launch.stateHash;
  let response: Record<string, unknown> = {};
  for (const action_id of actions) {
    response = await callPlayerTool(client, "step_action", {
      session_id: launch.rpgSessionId,
      action_id,
      expected_state_hash: stateHash,
    });
    expect(response.ok, action_id).toBe(true);
    stateHash = String(response.state_hash);
  }
  return response;
}

type MutableDenseWorld = {
  areas: Record<string, unknown>[];
  points_of_interest: Record<string, unknown>[];
  characters: Record<string, unknown>[];
  local_events: Record<string, unknown>[];
  local_jobs: Record<string, unknown>[];
  exploration_sites: Record<string, unknown>[];
  area_edges: Record<string, unknown>[];
};

function fixtureEntry(
  values: readonly Record<string, unknown>[],
  predicate: (value: Record<string, unknown>) => boolean,
  label: string,
): Record<string, unknown> {
  const value = values.find(predicate);
  if (!value) throw new Error(`expected ${label} fixture source`);
  return value;
}

function createDenseAreaFixture(root: string): {
  revealPoiIds: string[];
  hiddenDestinationId: string;
  hiddenRouteId: string;
} {
  cpSync(join(ROOT, "content"), join(root, "content"), { recursive: true });
  const worldPath = join(root, "content", "world", "new_york_overworld.json");
  const world = JSON.parse(readFileSync(worldPath, "utf8")) as MutableDenseWorld;
  const sourceArea = fixtureEntry(
    world.areas,
    (area) => area.id === "airmont_village__civic_core",
    "area",
  );
  const sourcePoi = fixtureEntry(
    world.points_of_interest,
    (poi) => poi.id === "airmont_village__civic_core__poi",
    "point of interest",
  );
  const sourceCharacter = fixtureEntry(
    world.characters,
    (character) => character.id === "airmont_village__civic_core__contact",
    "character",
  );
  const sourceEvent = fixtureEntry(
    world.local_events,
    (event) => event.id === "airmont_village__civic_core__event",
    "local event",
  );
  const sourceJob = fixtureEntry(
    world.local_jobs,
    (job) => job.id === "airmont_village__civic_core__job",
    "local job",
  );
  const sourceSite = fixtureEntry(
    world.exploration_sites,
    (site) => site.id === "airmont_village__civic_core__site",
    "exploration site",
  );

  const denseAreaIds = Array.from(
    { length: 14 },
    (_, index) => `albany_city__dense_alias_${String(index).padStart(2, "0")}`,
  );
  for (const [index, areaId] of denseAreaIds.entries()) {
    const suffix = String(index).padStart(2, "0");
    const title = `ZZ Dense Alias District ${suffix}`;
    world.areas.push({
      ...sourceArea,
      id: areaId,
      home: "albany_city",
      name: title,
      summary: `${title} exists only in the dense MCP visibility regression fixture.`,
      discovery: `A local Albany lead maps ${title}.`,
      travel_minutes: 100 + index,
    });
    world.points_of_interest.push({
      ...sourcePoi,
      id: `${areaId}__poi`,
      home: "albany_city",
      area: areaId,
      title: `${title} Marker`,
      summary: `${title} has a concrete marker for fixture integrity.`,
    });
    world.characters.push({
      ...sourceCharacter,
      id: `${areaId}__contact`,
      home: "albany_city",
      area: areaId,
      name: `Dense Guide ${suffix}`,
      summary: `Dense Guide ${suffix} watches the fixture district.`,
      agenda: `Keep ${title} legible to the visibility regression.`,
    });
    world.local_events.push({
      ...sourceEvent,
      id: `${areaId}__event`,
      home: "albany_city",
      area: areaId,
      title: `${title}: visibility check`,
      summary: `${title} carries a harmless fixture event.`,
    });
    world.local_jobs.push({
      ...sourceJob,
      id: `${areaId}__job`,
      home: "albany_city",
      area: areaId,
      title: `${title}: Route Ledger`,
      summary: `${title} has a bounded route-ledger fixture job.`,
      objective: `Verify the route ledger in ${title}.`,
      reward: "Earn 1 Capital / Mohawk renown for checking the fixture route.",
    });
    world.exploration_sites.push({
      ...sourceSite,
      id: `${areaId}__site`,
      region: "Capital / Mohawk",
      nearest_town: "albany_city",
      area: areaId,
      title: `${title} Archive`,
      summary: `${title} contains a bounded fixture archive.`,
      discovery: `The route ledger points toward the ${title} archive.`,
      reward: "You verify the fixture archive and gain 2 Capital / Mohawk renown.",
    });
    world.area_edges.push({
      id: `albany_city__area_route__civic_core__dense_alias_${suffix}`,
      home: "albany_city",
      from_area: "albany_city__civic_core",
      to_area: areaId,
      route: `Albany Civic Center to ${title}`,
      travel_minutes: 20 + index,
    });
  }
  for (let index = 0; index < 4; index += 1) {
    world.area_edges.push({
      id: `albany_city__area_route__dense_alias_${index}__${index + 1}`,
      home: "albany_city",
      from_area: denseAreaIds[index]!,
      to_area: denseAreaIds[index + 1]!,
      route: `Dense fixture cross-route ${index} to ${index + 1}`,
      travel_minutes: 8,
    });
  }

  const revealPoiIds = Array.from({ length: 18 }, (_, index) => {
    const suffix = String(index).padStart(2, "0");
    const id = `albany_city__civic_core__dense_reveal_${suffix}`;
    world.points_of_interest.push({
      ...sourcePoi,
      id,
      home: "albany_city",
      area: "albany_city__civic_core",
      title: `ZZ Dense Route Notice ${suffix}`,
      summary: `This fixture notice reveals the next local area in deterministic order ${suffix}.`,
    });
    return id;
  });

  writeFileSync(worldPath, JSON.stringify(world));
  return {
    revealPoiIds,
    hiddenDestinationId: denseAreaIds.at(-1)!,
    hiddenRouteId: "albany_city__area_route__civic_core__dense_alias_13",
  };
}

async function prepareDenseAreaSession(
  client: Client,
  revealPoiIds: readonly string[],
): Promise<string> {
  const startResult = await client.callTool({ name: "start_overworld", arguments: {} });
  if (startResult.isError) throw new Error(textResult(startResult));
  const started = textPayload(startResult);
  const sessionId = String(started.session_id);
  const contact = await client.callTool({
    name: "talk_overworld_session_contact",
    arguments: {
      session_id: sessionId,
      character_id: "albany_city__civic_core__contact",
    },
  });
  expect(contact.isError).not.toBe(true);
  for (const choice of [
    "albany:ledger_advocate",
    "albany:oath_limited_aid_only",
    "albany:source_rowan_civic_docket",
    "albany:prep_works_fortification",
  ]) {
    const chosen = await client.callTool({
      name: "choose_overworld_session_story",
      arguments: { session_id: sessionId, choice },
    });
    expect(chosen.isError, choice).not.toBe(true);
  }
  for (const poiId of revealPoiIds) {
    const scouted = await client.callTool({
      name: "scout_overworld_session_poi",
      arguments: { session_id: sessionId, poi_id: poiId },
    });
    expect(scouted.isError, poiId).not.toBe(true);
  }
  return sessionId;
}

describe("MCP pure play mode", () => {
  it("requires a unique currently visible route for the destination-area alias", () => {
    expect(resolveVisibleAreaRouteId([["r1", "market", 5]], "market")).toBe("r1");
    expect(() => resolveVisibleAreaRouteId([["r1", "market", 5]], "campus")).toThrow(
      /not a currently visible destination/,
    );
    expect(() =>
      resolveVisibleAreaRouteId(
        [
          ["r1", "market", 5],
          ["r2", "market", 7],
        ],
        "market",
      ),
    ).toThrow(/multiple currently visible routes/);
  });

  it("lets a visible exact selector resolve an otherwise ambiguous area_id", () => {
    const routes = [
      ["market_short", "market", 5],
      ["market_safe", "market", 9],
      ["campus_loop", "campus", 7],
    ] as const;
    expect(() => resolveAreaMoveSelector(routes, { area_id: "market" })).toThrow(
      /multiple currently visible routes.*area_route_id or route_id/,
    );
    expect(
      resolveAreaMoveSelector(routes, { area_route_id: "market_short", area_id: "market" }, true),
    ).toBe("market_short");
    expect(
      resolveAreaMoveSelector(routes, { route_id: "market_safe", area_id: "market" }, true),
    ).toBe("market_safe");
    expect(() =>
      resolveAreaMoveSelector(routes, { route_id: "hidden_edge", area_id: "market" }, true),
    ).toThrow(/not a currently visible route/);
    expect(() =>
      resolveAreaMoveSelector(routes, { route_id: "market_short", area_id: "campus" }, true),
    ).toThrow(/Conflicting route_id and area_id/);
  });

  it("accepts the reported Civic-to-Transport-Hub edge through compact route_id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-route-id-alias-"));
    const evidence = join(dir, "run.jsonl");
    try {
      await withPureServer(evidence, async (client) => {
        const started = await callPlayerTool(client, "start_overworld", {});
        const sessionId = String(started.session_id);
        const parent = { session_id: sessionId };
        await callPlayerTool(client, "scout_overworld_session_poi", {
          ...parent,
          poi_id: "albany_city__civic_core__poi",
        });
        await callPlayerTool(client, "talk_overworld_session_contact", {
          ...parent,
          contact_id: "albany_city__civic_core__contact",
        });
        for (const choice of [
          "albany:ledger_advocate",
          "albany:oath_limited_aid_only",
          "albany:source_rowan_civic_docket",
          "albany:prep_works_fortification",
        ]) {
          await callPlayerTool(client, "choose_overworld_session_story", { ...parent, choice });
        }
        const context = await callPlayerTool(client, "get_overworld_session_context", parent);
        const exactRouteId = "albany_city__area_route__civic_core__transport_hub__shortcut_1";
        const routes = (context.context as { area_routes?: [string, string, number][] })
          .area_routes;
        expect(routes).toContainEqual([exactRouteId, "albany_city__transport_hub", 5]);

        const moved = await callPlayerTool(client, "move_overworld_session_area", {
          ...parent,
          route_id: exactRouteId,
        });
        expect((moved.context as { here?: unknown[] }).here?.[3]).toBe(
          "albany_city__transport_hub",
        );
        expect(
          (moved.journey as { decisionProof?: { last?: { actionId?: string } } }).decisionProof
            ?.last?.actionId,
        ).toBe(`move_area:${exactRouteId}`);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("uses verbose full visibility beyond the compact route cap without widening pure play", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-dense-area-alias-"));
    const fixtureRoot = join(dir, "fixture");
    mkdirSync(fixtureRoot, { recursive: true });
    const { revealPoiIds, hiddenDestinationId, hiddenRouteId } =
      createDenseAreaFixture(fixtureRoot);
    try {
      await withFullServer(async (client) => {
        const sessionId = await prepareDenseAreaSession(client, revealPoiIds);
        const compactBefore = textPayload(
          await client.callTool({
            name: "get_overworld_session_context",
            arguments: { session_id: sessionId },
          }),
        );
        const compactContext = compactBefore.context as {
          area_routes?: [string, string, number][];
          area_routes_truncated?: true;
        };
        expect(compactContext.area_routes).toHaveLength(12);
        expect(compactContext.area_routes_truncated).toBe(true);
        expect(
          compactContext.area_routes?.some(([, areaId]) => areaId === hiddenDestinationId),
        ).toBe(false);

        const verbose = textPayload(
          await client.callTool({
            name: "get_overworld_session",
            arguments: { session_id: sessionId, include_observation: true },
          }),
        );
        const fullRoutes = (
          verbose.observation as {
            areaExits: { id: string; destination: { id: string }; travel_minutes: number }[];
          }
        ).areaExits;
        expect(fullRoutes.length).toBeGreaterThan(12);
        expect(fullRoutes.some((route) => route.destination.id === hiddenDestinationId)).toBe(true);

        const compactRejected = await client.callTool({
          name: "move_overworld_session_area",
          arguments: { session_id: sessionId, area_id: hiddenDestinationId },
        });
        expect(compactRejected.isError).toBe(true);
        expect(textResult(compactRejected)).toMatch(/not a currently visible destination/);
        const afterCompactRejection = textPayload(
          await client.callTool({
            name: "get_overworld_session_context",
            arguments: { session_id: sessionId },
          }),
        );
        expect(afterCompactRejection.snapshot_hash).toBe(compactBefore.snapshot_hash);

        const moved = textPayload(
          await client.callTool({
            name: "move_overworld_session_area",
            arguments: {
              session_id: sessionId,
              area_id: hiddenDestinationId,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        expect((moved.observation as { currentArea?: { id: string } }).currentArea?.id).toBe(
          hiddenDestinationId,
        );
      }, fixtureRoot);

      await withPureServer(
        join(dir, "pure-evidence.jsonl"),
        async (client) => {
          const sessionId = await prepareDenseAreaSession(client, revealPoiIds);
          const compactBefore = textPayload(
            await client.callTool({
              name: "get_overworld_session_context",
              arguments: { session_id: sessionId },
            }),
          );
          const compactRoutes = (
            compactBefore.context as { area_routes?: [string, string, number][] }
          ).area_routes;
          expect(compactRoutes).toHaveLength(12);
          expect(compactRoutes?.some(([, areaId]) => areaId === hiddenDestinationId)).toBe(false);

          expect(compactRoutes?.some(([routeId]) => routeId === hiddenRouteId)).toBe(false);
          for (const [selectorName, selectorValue] of [
            ["area_route_id", { area_route_id: hiddenRouteId }],
            ["route_id", { route_id: hiddenRouteId }],
          ] as const) {
            const rejected = await client.callTool({
              name: "move_overworld_session_area",
              arguments: {
                session_id: sessionId,
                ...selectorValue,
                // Pure strips this unadvertised escape attempt and remains compact.
                compact_context: false,
              },
            });
            expect(rejected.isError, selectorName).toBe(true);
            expect(textPayload(rejected).error, selectorName).toMatch(
              /not a currently visible route/i,
            );
            const afterSelectorRejection = textPayload(
              await client.callTool({
                name: "get_overworld_session_context",
                arguments: { session_id: sessionId },
              }),
            );
            expect(afterSelectorRejection.snapshot_hash, selectorName).toBe(
              compactBefore.snapshot_hash,
            );
          }

          const destinationRejected = await client.callTool({
            name: "move_overworld_session_area",
            arguments: {
              session_id: sessionId,
              area_id: hiddenDestinationId,
              // Pure strips this unadvertised escape attempt and remains compact.
              compact_context: false,
            },
          });
          expect(destinationRejected.isError).toBe(true);
          expect(textPayload(destinationRejected).error).toMatch(
            /not a currently visible destination/,
          );
          const after = textPayload(
            await client.callTool({
              name: "get_overworld_session_context",
              arguments: { session_id: sessionId },
            }),
          );
          expect(after.snapshot_hash).toBe(compactBefore.snapshot_hash);
        },
        TEST_RUN_SEED,
        fixtureRoot,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("keeps structural QA on the full tool surface", () => {
    expect(toolAvailableInPlayMode("start_world_quest", "structural")).toBe(true);
    expect(toolAvailableInPlayMode("start_world_quest", "full")).toBe(true);
    expect(toolAvailableInPlayMode("start_world_quest", "pure")).toBe(false);
    expect(toolAvailableInPlayMode("plan_overworld_session_route", "pure")).toBe(true);
    expect(toolAvailableInPlayMode("follow_overworld_session_goal", "pure")).toBe(true);
    expect(toolAvailableInPlayMode("choose_overworld_session_story", "pure")).toBe(true);
    expect(PURE_PLAYER_TOOLS.has("follow_overworld_session_goal")).toBe(true);
    expect(PURE_PLAYER_TOOLS.has("choose_overworld_session_story")).toBe(true);
  });

  it("keeps singleton recovery handles out of full multi-session errors", async () => {
    await withFullServer(async (client) => {
      const listed = await client.listTools();
      const fullRead = listed.tools.find((tool) => tool.name === "get_overworld_session_context");
      expect(fullRead?.inputSchema.required).toContain("session_id");

      const first = textPayload(await client.callTool({ name: "start_overworld", arguments: {} }));
      const second = textPayload(await client.callTool({ name: "start_overworld", arguments: {} }));
      expect(first.session_id).not.toBe(second.session_id);
      expect(first).not.toHaveProperty("overworld_session_id");
      expect(second).not.toHaveProperty("overworld_session_id");

      const rejected = await client.callTool({
        name: "get_overworld_session_context",
        arguments: { session_id: "not-a-live-handle" },
      });
      expect(rejected.isError).toBe(true);
      const text = (rejected.content as { type: string; text?: string }[])[0]?.text ?? "";
      expect(text).not.toContain(String(first.session_id));
      expect(text).not.toContain(String(second.session_id));
      expect(text).not.toContain("overworld_session_id");
      expect(text).not.toContain("rpg_session_id");
    });
  });

  it("publishes and honors the full-mode alias matrix", async () => {
    await withFullServer(async (client) => {
      const listed = await client.listTools();
      for (const [name, canonicalName, aliasName] of [
        ["talk_overworld_session_contact", "character_id", "contact_id"],
        ["move_overworld_session_area", "area_route_id", "area_id"],
        ["plan_overworld_session_route", "destination_town_id", "dest_town_id"],
        ["get_observation", "session_id", "rpg_session_id"],
        ["list_legal_actions", "session_id", "rpg_session_id"],
        ["step_action", "session_id", "rpg_session_id"],
        ["get_state", "session_id", "rpg_session_id"],
        ["get_transcript", "session_id", "rpg_session_id"],
        ["save_game", "session_id", "rpg_session_id"],
      ] as const) {
        expectAliasedToolSchema(listed, name, canonicalName, aliasName);
      }
      expectAliasedToolSchema(listed, "step_action", "action_id", "action");
      expectToolSchemaFields(listed, "travel_overworld_session", [
        "destination_town_id",
        "dest_town_id",
      ]);
      expectOneOfToolSchema(listed, "move_overworld_session_area", [
        "area_route_id",
        "route_id",
        "area_id",
      ]);

      for (const [name, argumentsValue, message] of [
        ["talk_overworld_session_contact", {}, /Provide character_id or contact_id/],
        ["move_overworld_session_area", {}, /Provide area_route_id, route_id, or area_id/],
        ["get_state", {}, /Provide session_id or rpg_session_id/],
      ] as const) {
        const omitted = await client.callTool({ name, arguments: argumentsValue });
        expect(omitted.isError, name).toBe(true);
        expect(textResult(omitted), name).toMatch(message);
      }

      const started = textPayload(
        await client.callTool({ name: "start_overworld", arguments: {} }),
      );
      const overworldSessionId = String(started.session_id);
      const planBefore = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: overworldSessionId },
        }),
      );
      const plannedByAlias = await client.callTool({
        name: "plan_overworld_session_route",
        arguments: { session_id: overworldSessionId, dest_town_id: "colonie_town" },
      });
      expect(plannedByAlias.isError).not.toBe(true);
      const plannedBySameDual = await client.callTool({
        name: "plan_overworld_session_route",
        arguments: {
          session_id: overworldSessionId,
          destination_town_id: "colonie_town",
          dest_town_id: "colonie_town",
        },
      });
      expect(plannedBySameDual.isError).not.toBe(true);
      const planConflict = await client.callTool({
        name: "plan_overworld_session_route",
        arguments: {
          session_id: overworldSessionId,
          destination_town_id: "colonie_town",
          dest_town_id: "bethlehem_town",
        },
      });
      expect(planConflict.isError).toBe(true);
      expect(textResult(planConflict)).toMatch(/Conflicting destination_town_id and dest_town_id/);
      const planAfter = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: overworldSessionId },
        }),
      );
      expect(planAfter.snapshot_hash).toBe(planBefore.snapshot_hash);

      const travelAliasStarted = textPayload(
        await client.callTool({ name: "start_overworld", arguments: {} }),
      );
      const travelAliasId = String(travelAliasStarted.session_id);
      const traveledByAlias = await client.callTool({
        name: "travel_overworld_session",
        arguments: { session_id: travelAliasId, dest_town_id: "colonie_town" },
      });
      expect(traveledByAlias.isError).not.toBe(true);
      const travelAliasAfter = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: travelAliasId },
        }),
      );
      expect(travelAliasAfter.snapshot_hash).not.toBe(travelAliasStarted.snapshot_hash);

      const travelDualStarted = textPayload(
        await client.callTool({ name: "start_overworld", arguments: {} }),
      );
      const travelDual = await client.callTool({
        name: "travel_overworld_session",
        arguments: {
          session_id: String(travelDualStarted.session_id),
          destination_town_id: "colonie_town",
          dest_town_id: "colonie_town",
        },
      });
      expect(travelDual.isError).not.toBe(true);

      const travelConflictStarted = textPayload(
        await client.callTool({ name: "start_overworld", arguments: {} }),
      );
      const travelConflictId = String(travelConflictStarted.session_id);
      const travelConflictBefore = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: travelConflictId },
        }),
      );
      const travelConflict = await client.callTool({
        name: "travel_overworld_session",
        arguments: {
          session_id: travelConflictId,
          destination_town_id: "colonie_town",
          dest_town_id: "bethlehem_town",
        },
      });
      expect(travelConflict.isError).toBe(true);
      expect(textResult(travelConflict)).toMatch(
        /Conflicting destination_town_id and dest_town_id/,
      );
      const travelConflictAfter = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: travelConflictId },
        }),
      );
      expect(travelConflictAfter.snapshot_hash).toBe(travelConflictBefore.snapshot_hash);
      const roadDestinationConflict = await client.callTool({
        name: "travel_overworld_session",
        arguments: {
          session_id: travelConflictId,
          road_id: "road_albany_city__colonie_town",
          dest_town_id: "colonie_town",
        },
      });
      expect(roadDestinationConflict.isError).toBe(true);
      expect(textResult(roadDestinationConflict)).toMatch(
        /exactly one of road_id or destination_town_id/,
      );
      const roadDestinationAfter = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: travelConflictId },
        }),
      );
      expect(roadDestinationAfter.snapshot_hash).toBe(travelConflictBefore.snapshot_hash);
      const contactId = "albany_city__civic_core__contact";
      const scouted = await client.callTool({
        name: "scout_overworld_session_poi",
        arguments: { session_id: overworldSessionId, poi_id: "albany_city__civic_core__poi" },
      });
      expect(scouted.isError).not.toBe(true);
      const contacted = await client.callTool({
        name: "talk_overworld_session_contact",
        arguments: { session_id: overworldSessionId, contact_id: contactId },
      });
      expect(contacted.isError).not.toBe(true);
      for (const choice of [
        "albany:ledger_advocate",
        "albany:oath_limited_aid_only",
        "albany:source_rowan_civic_docket",
        "albany:prep_works_fortification",
      ]) {
        const chosen = await client.callTool({
          name: "choose_overworld_session_story",
          arguments: { session_id: overworldSessionId, choice },
        });
        expect(chosen.isError, choice).not.toBe(true);
      }
      const dualStarted = textPayload(
        await client.callTool({ name: "start_overworld", arguments: {} }),
      );
      const sameContact = await client.callTool({
        name: "talk_overworld_session_contact",
        arguments: {
          session_id: String(dualStarted.session_id),
          character_id: contactId,
          contact_id: contactId,
        },
      });
      expect(sameContact.isError).not.toBe(true);
      const moveContext = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: overworldSessionId },
        }),
      );
      const transportHubRoute = (
        moveContext.context as { area_routes?: [string, string, number][] }
      ).area_routes?.find(([, destination]) => destination === "albany_city__transport_hub");
      if (!transportHubRoute) throw new Error("expected a visible Albany transport-hub route");
      const moved = textPayload(
        await client.callTool({
          name: "move_overworld_session_area",
          arguments: {
            session_id: overworldSessionId,
            route_id: transportHubRoute[0],
            compact_context: false,
            compact_result: false,
          },
        }),
      );
      expect((moved.observation as { currentArea?: { id: string } }).currentArea?.id).toBe(
        "albany_city__transport_hub",
      );

      const created = textPayload(
        await client.callTool({ name: "new_game", arguments: { generate_rpg_seed: 3 } }),
      );
      const rpgSessionId = String(created.session_id);
      const initialStateHash = String(created.state_hash);
      for (const name of [
        "get_observation",
        "list_legal_actions",
        "get_state",
        "get_transcript",
        "save_game",
      ]) {
        const aliasOnly = await client.callTool({
          name,
          arguments: { rpg_session_id: rpgSessionId },
        });
        expect(aliasOnly.isError, `${name} alias-only`).not.toBe(true);
        const sameDual = await client.callTool({
          name,
          arguments: { session_id: rpgSessionId, rpg_session_id: rpgSessionId },
        });
        expect(sameDual.isError, `${name} same dual`).not.toBe(true);
        const conflict = await client.callTool({
          name,
          arguments: { session_id: rpgSessionId, rpg_session_id: "r-conflict" },
        });
        expect(conflict.isError, `${name} conflict`).toBe(true);
        expect(textResult(conflict), name).toMatch(/Conflicting session_id and rpg_session_id/);
      }

      const menu = textPayload(
        await client.callTool({
          name: "list_legal_actions",
          arguments: { rpg_session_id: rpgSessionId, compact_actions: true },
        }),
      );
      const actionId = (menu.actions as string[])[0];
      if (!actionId) throw new Error("expected a legal opening RPG action");
      const stepConflict = await client.callTool({
        name: "step_action",
        arguments: {
          session_id: rpgSessionId,
          rpg_session_id: "r-conflict",
          action_id: actionId,
        },
      });
      expect(stepConflict.isError).toBe(true);
      expect(textResult(stepConflict)).toMatch(/Conflicting session_id and rpg_session_id/);
      const actionConflictBefore = textPayload(
        await client.callTool({
          name: "get_state",
          arguments: { rpg_session_id: rpgSessionId },
        }),
      );
      const actionConflict = await client.callTool({
        name: "step_action",
        arguments: {
          rpg_session_id: rpgSessionId,
          action_id: actionId,
          action: "not_the_same_action",
          expected_state_hash: initialStateHash,
        },
      });
      expect(actionConflict.isError).toBe(true);
      expect(textResult(actionConflict)).toMatch(/Conflicting action_id and action/);
      const actionConflictAfter = textPayload(
        await client.callTool({
          name: "get_state",
          arguments: { rpg_session_id: rpgSessionId },
        }),
      );
      expect(actionConflictAfter.state_hash).toBe(actionConflictBefore.state_hash);
      const stepped = textPayload(
        await client.callTool({
          name: "step_action",
          arguments: {
            rpg_session_id: rpgSessionId,
            action: actionId,
            expected_state_hash: initialStateHash,
          },
        }),
      );
      expect(stepped.ok).toBe(true);
      const sameDualGame = textPayload(
        await client.callTool({ name: "new_game", arguments: { generate_rpg_seed: 3 } }),
      );
      const sameDualId = String(sameDualGame.session_id);
      const sameDualMenu = textPayload(
        await client.callTool({
          name: "list_legal_actions",
          arguments: { session_id: sameDualId, compact_actions: true },
        }),
      );
      const sameDualAction = (sameDualMenu.actions as string[])[0];
      if (!sameDualAction) throw new Error("expected a legal opening RPG action");
      const sameDualStep = await client.callTool({
        name: "step_action",
        arguments: {
          session_id: sameDualId,
          action_id: sameDualAction,
          action: sameDualAction,
          expected_state_hash: String(sameDualGame.state_hash),
        },
      });
      expect(sameDualStep.isError).not.toBe(true);
    });
  }, 120_000);

  it("reports unrelated full-mode alias validation failures without mutation", async () => {
    await withFullServer(async (client) => {
      const started = textPayload(
        await client.callTool({ name: "start_overworld", arguments: {} }),
      );
      const overworldSessionId = String(started.session_id);
      const parentBefore = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: overworldSessionId },
        }),
      );

      for (const [name, argumentsValue, aliasPresenceMessage] of [
        [
          "talk_overworld_session_contact",
          { contact_id: "albany_city__civic_core__contact" },
          /Provide character_id or contact_id/,
        ],
        [
          "move_overworld_session_area",
          { area_id: "albany_city__market" },
          /Provide area_route_id, route_id, or area_id/,
        ],
        [
          "move_overworld_session_area",
          { route_id: "albany_city__area_route__civic_core__market__1" },
          /Provide area_route_id, route_id, or area_id/,
        ],
      ] as const) {
        const rejected = await client.callTool({ name, arguments: argumentsValue });
        expect(rejected.isError, name).toBe(true);
        const error = textResult(rejected);
        expect(error, name).toMatch(/session_id/);
        expect(error, name).toMatch(/Required/);
        expect(error, name).not.toMatch(aliasPresenceMessage);
      }
      const malformedRouteId = await client.callTool({
        name: "move_overworld_session_area",
        arguments: { session_id: overworldSessionId, route_id: 7 },
      });
      expect(malformedRouteId.isError).toBe(true);
      expect(textResult(malformedRouteId)).toMatch(/route_id/);
      expect(textResult(malformedRouteId)).toMatch(/Expected string/);
      const parentAfter = textPayload(
        await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: overworldSessionId },
        }),
      );
      expect(parentAfter.snapshot_hash).toBe(parentBefore.snapshot_hash);

      const created = textPayload(
        await client.callTool({ name: "new_game", arguments: { generate_rpg_seed: 3 } }),
      );
      const rpgSessionId = String(created.session_id);
      const rpgBefore = textPayload(
        await client.callTool({
          name: "get_state",
          arguments: { session_id: rpgSessionId },
        }),
      );
      for (const [argumentsValue, expectedField, expectedMessage] of [
        [{ rpg_session_id: rpgSessionId }, "action_id", /Required/],
        [
          { rpg_session_id: rpgSessionId, action_id: 7 },
          "action_id",
          /Expected string, received number/,
        ],
        [{ rpg_session_id: rpgSessionId, action: 7 }, "action", /Expected string, received number/],
      ] as const) {
        const rejected = await client.callTool({
          name: "step_action",
          arguments: argumentsValue,
        });
        expect(rejected.isError).toBe(true);
        const error = textResult(rejected);
        expect(error).toMatch(new RegExp(expectedField));
        expect(error).toMatch(expectedMessage);
        expect(error).not.toMatch(/Provide session_id or rpg_session_id/);
      }
      const missingSessionWrongAliasAction = await client.callTool({
        name: "step_action",
        arguments: { action: 7 },
      });
      expect(missingSessionWrongAliasAction.isError).toBe(true);
      expect(textResult(missingSessionWrongAliasAction)).toMatch(/session_id/);
      expect(textResult(missingSessionWrongAliasAction)).toMatch(/action/);
      expect(textResult(missingSessionWrongAliasAction)).toMatch(
        /Expected string, received number/,
      );
      for (const [name, argumentsValue, fieldName] of [
        ["plan_overworld_session_route", { session_id: overworldSessionId }, "destination_town_id"],
        [
          "plan_overworld_session_route",
          { session_id: overworldSessionId, dest_town_id: 7 },
          "dest_town_id",
        ],
        [
          "travel_overworld_session",
          { session_id: overworldSessionId, dest_town_id: 7 },
          "dest_town_id",
        ],
      ] as const) {
        const rejected = await client.callTool({ name, arguments: argumentsValue });
        expect(rejected.isError, name).toBe(true);
        expect(textResult(rejected), name).toMatch(new RegExp(fieldName));
      }
      const rpgAfter = textPayload(
        await client.callTool({
          name: "get_state",
          arguments: { session_id: rpgSessionId },
        }),
      );
      expect(rpgAfter.state_hash).toBe(rpgBefore.state_hash);
    });
  }, 120_000);

  it("accepts player-facing MCP aliases and rejects conflicts without changing state", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pure-aliases-"));
    const evidence = join(dir, "run.jsonl");
    try {
      await withPureServer(evidence, async (client) => {
        const listed = await client.listTools();
        for (const [name, canonicalName, aliasName] of [
          ["talk_overworld_session_contact", "character_id", "contact_id"],
          ["move_overworld_session_area", "area_route_id", "area_id"],
          ["plan_overworld_session_route", "destination_town_id", "dest_town_id"],
          ["get_observation", "session_id", "rpg_session_id"],
          ["list_legal_actions", "session_id", "rpg_session_id"],
          ["step_action", "session_id", "rpg_session_id"],
        ] as const) {
          expectAliasedToolSchema(listed, name, canonicalName, aliasName);
        }
        expectAliasedToolSchema(listed, "step_action", "action_id", "action");
        expectToolSchemaFields(listed, "travel_overworld_session", [
          "destination_town_id",
          "dest_town_id",
        ]);
        expectOneOfToolSchema(listed, "move_overworld_session_area", [
          "area_route_id",
          "route_id",
          "area_id",
        ]);
        for (const [name, message] of [
          ["talk_overworld_session_contact", /Provide character_id or contact_id/],
          ["move_overworld_session_area", /Provide area_route_id, route_id, or area_id/],
          ["get_observation", /Provide session_id or rpg_session_id/],
        ] as const) {
          const omitted = await client.callTool({ name, arguments: {} });
          expect(omitted.isError, name).toBe(true);
          expect(textResult(omitted), name).toMatch(message);
        }

        const started = await callPlayerTool(client, "start_overworld", {});
        const sessionId = String(started.session_id);
        const parent = { session_id: sessionId };
        const parentState = async () => {
          const read = await callPlayerTool(client, "get_overworld_session_context", parent);
          return {
            snapshot_hash: read.snapshot_hash,
            journey: read.journey,
          };
        };

        for (const [name, argumentsValue, fieldName] of [
          ["plan_overworld_session_route", { ...parent, dest_town_id: 7 }, "dest_town_id"],
          ["travel_overworld_session", { ...parent, dest_town_id: 7 }, "dest_town_id"],
          ["step_action", { action: 7 }, "action"],
        ] as const) {
          const rejected = await client.callTool({ name, arguments: argumentsValue });
          expect(rejected.isError, name).toBe(true);
          expect(textResult(rejected), name).toMatch(new RegExp(fieldName));
          expect(textResult(rejected), name).toMatch(/Expected string, received number/);
        }

        const beforeContactConflict = await parentState();
        const contactConflict = await client.callTool({
          name: "talk_overworld_session_contact",
          arguments: {
            ...parent,
            character_id: "albany_city__civic_core__contact",
            contact_id: "albany_city__market__contact",
          },
        });
        expect(contactConflict.isError).toBe(true);
        expect(textPayload(contactConflict).error).toMatch(
          /Conflicting character_id and contact_id/,
        );
        expect(await parentState()).toEqual(beforeContactConflict);

        await callPlayerTool(client, "talk_overworld_session_contact", {
          ...parent,
          character_id: "albany_city__civic_core__contact",
          contact_id: "albany_city__civic_core__contact",
        });
        for (const choice of [
          "albany:ledger_advocate",
          "albany:oath_limited_aid_only",
          "albany:source_rowan_civic_docket",
          "albany:prep_works_fortification",
        ]) {
          await callPlayerTool(client, "choose_overworld_session_story", { ...parent, choice });
        }

        let context = await callPlayerTool(client, "get_overworld_session_context", parent);
        let areaRoutes = (context.context as { area_routes?: [string, string, number][] })
          .area_routes;
        const marketRoute = areaRoutes?.find(
          ([, destination]) => destination === "albany_city__market",
        );
        if (!marketRoute) throw new Error("expected a visible Albany market route");
        await callPlayerTool(client, "move_overworld_session_area", {
          ...parent,
          route_id: marketRoute[0],
        });
        await callPlayerTool(client, "scout_overworld_session_poi", {
          ...parent,
          poi_id: "albany_city__market__poi",
        });
        await callPlayerTool(client, "talk_overworld_session_contact", {
          ...parent,
          contact_id: "albany_city__market__contact",
        });
        context = await callPlayerTool(client, "get_overworld_session_context", parent);
        areaRoutes = (context.context as { area_routes?: [string, string, number][] }).area_routes;
        const civicRoute = areaRoutes?.find(
          ([, destination]) => destination === "albany_city__civic_core",
        );
        const stationRoute = areaRoutes?.find(
          ([, destination]) => destination === "albany_city__transport_hub",
        );
        if (!civicRoute || !stationRoute) throw new Error("expected two visible Albany routes");

        const beforeAreaConflict = await parentState();
        const areaConflict = await client.callTool({
          name: "move_overworld_session_area",
          arguments: {
            ...parent,
            area_route_id: stationRoute[0],
            area_id: civicRoute[1],
          },
        });
        expect(areaConflict.isError).toBe(true);
        expect(textPayload(areaConflict).error).toMatch(/Conflicting area_route_id and area_id/);
        expect(await parentState()).toEqual(beforeAreaConflict);

        const beforeRouteAliasConflict = await parentState();
        const routeAliasConflict = await client.callTool({
          name: "move_overworld_session_area",
          arguments: {
            ...parent,
            area_route_id: stationRoute[0],
            route_id: civicRoute[0],
          },
        });
        expect(routeAliasConflict.isError).toBe(true);
        expect(textPayload(routeAliasConflict).error).toMatch(
          /Conflicting area_route_id and route_id/,
        );
        expect(await parentState()).toEqual(beforeRouteAliasConflict);

        const beforeRouteDestinationConflict = await parentState();
        const routeDestinationConflict = await client.callTool({
          name: "move_overworld_session_area",
          arguments: {
            ...parent,
            route_id: stationRoute[0],
            area_id: civicRoute[1],
          },
        });
        expect(routeDestinationConflict.isError).toBe(true);
        expect(textPayload(routeDestinationConflict).error).toMatch(
          /Conflicting route_id and area_id/,
        );
        expect(await parentState()).toEqual(beforeRouteDestinationConflict);

        const beforeTripleConflict = await parentState();
        const tripleConflict = await client.callTool({
          name: "move_overworld_session_area",
          arguments: {
            ...parent,
            area_route_id: stationRoute[0],
            route_id: stationRoute[0],
            area_id: civicRoute[1],
          },
        });
        expect(tripleConflict.isError).toBe(true);
        expect(textPayload(tripleConflict).error).toMatch(/Conflicting route selector and area_id/);
        expect(await parentState()).toEqual(beforeTripleConflict);

        await callPlayerTool(client, "move_overworld_session_area", {
          ...parent,
          area_route_id: stationRoute[0],
          route_id: stationRoute[0],
          area_id: stationRoute[1],
        });
        const ready = await callPlayerTool(client, "choose_overworld_session_story", {
          ...parent,
          choice: "albany:relief_resident_shelter",
        });
        expect((ready.context as { quest_starts?: unknown }).quest_starts).toBeDefined();
        const launched = await callPlayerTool(client, "start_overworld_session_quest", {
          ...parent,
          quest_id: "wolf_winter",
          approach_id: "albany:wolf_approach_sheltered_stockway",
        });
        const rpgSessionId = String(launched.rpg_session_id);
        const rpgStateHash = String((launched.rpg_session as { state_hash: string }).state_hash);

        const aliasRead = await callPlayerTool(client, "get_observation", {
          rpg_session_id: rpgSessionId,
        });
        expect(aliasRead.state_hash).toBe(rpgStateHash);
        const sameHandleRead = await callPlayerTool(client, "list_legal_actions", {
          session_id: rpgSessionId,
          rpg_session_id: rpgSessionId,
        });
        expect(sameHandleRead.rpg_session_id).toBe(rpgSessionId);

        const beforeRpgConflict = await parentState();
        const rpgConflict = await client.callTool({
          name: "step_action",
          arguments: {
            session_id: rpgSessionId,
            rpg_session_id: "r-conflict",
            action_id: "use_sheltered_stockway_last_mile",
            expected_state_hash: rpgStateHash,
          },
        });
        expect(rpgConflict.isError).toBe(true);
        expect(textPayload(rpgConflict).error).toMatch(/Conflicting session_id and rpg_session_id/);
        expect(await parentState()).toEqual(beforeRpgConflict);
        const afterConflictRead = await callPlayerTool(client, "get_observation", {
          rpg_session_id: rpgSessionId,
        });
        expect(afterConflictRead.state_hash).toBe(rpgStateHash);

        const wrongDomain = await client.callTool({
          name: "list_legal_actions",
          arguments: { session_id: sessionId },
        });
        expect(wrongDomain.isError).toBe(true);
        expect(textPayload(wrongDomain)).toMatchObject({
          expected_session_field: "rpg_session_id",
          expected_argument: "session_id",
          returned_handle_field: "rpg_session_id",
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });

        const beforeActionAliasConflict = await parentState();
        const actionAliasConflict = await client.callTool({
          name: "step_action",
          arguments: {
            rpg_session_id: rpgSessionId,
            action_id: "use_sheltered_stockway_last_mile",
            action: "look_around",
            expected_state_hash: rpgStateHash,
          },
        });
        expect(actionAliasConflict.isError).toBe(true);
        expect(textPayload(actionAliasConflict).error).toMatch(/Conflicting action_id and action/);
        expect(await parentState()).toEqual(beforeActionAliasConflict);

        const stepped = await callPlayerTool(client, "step_action", {
          rpg_session_id: rpgSessionId,
          action: "use_sheltered_stockway_last_mile",
          expected_state_hash: rpgStateHash,
        });
        expect(stepped.ok).toBe(true);
        expect(stepped.state_hash).not.toBe(rpgStateHash);
        const afterStepActions = await callPlayerTool(client, "list_legal_actions", {
          rpg_session_id: rpgSessionId,
          compact_actions: true,
        });
        const sameAction = (afterStepActions.actions as string[])[0];
        if (!sameAction) throw new Error("expected a legal post-step RPG action");
        const sameDualAction = await callPlayerTool(client, "step_action", {
          session_id: rpgSessionId,
          rpg_session_id: rpgSessionId,
          action_id: sameAction,
          action: sameAction,
          expected_state_hash: String(afterStepActions.state_hash),
        });
        expect(sameDualAction.ok).toBe(true);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("honors destination-town aliases in pure play without weakening travel exclusivity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pure-destination-aliases-"));
    try {
      await withPureServer(join(dir, "alias-only.jsonl"), async (client) => {
        const started = await callPlayerTool(client, "start_overworld", {});
        const sessionId = String(started.session_id);
        const parent = { session_id: sessionId };
        const beforePlan = await callPlayerTool(client, "get_overworld_session_context", parent);
        await callPlayerTool(client, "plan_overworld_session_route", {
          ...parent,
          dest_town_id: "colonie_town",
        });
        await callPlayerTool(client, "plan_overworld_session_route", {
          ...parent,
          destination_town_id: "colonie_town",
          dest_town_id: "colonie_town",
        });
        const planConflict = await client.callTool({
          name: "plan_overworld_session_route",
          arguments: {
            ...parent,
            destination_town_id: "colonie_town",
            dest_town_id: "bethlehem_town",
          },
        });
        expect(planConflict.isError).toBe(true);
        expect(textPayload(planConflict).error).toMatch(
          /Conflicting destination_town_id and dest_town_id/,
        );
        const afterPlan = await callPlayerTool(client, "get_overworld_session_context", parent);
        expect(afterPlan.snapshot_hash).toBe(beforePlan.snapshot_hash);

        const traveled = await callPlayerTool(client, "travel_overworld_session", {
          ...parent,
          dest_town_id: "colonie_town",
        });
        expect(traveled.ok).toBe(true);
        const beforeRoadDestinationConflict = await callPlayerTool(
          client,
          "get_overworld_session_context",
          parent,
        );
        const roadDestinationConflict = await client.callTool({
          name: "travel_overworld_session",
          arguments: {
            ...parent,
            road_id: "road_albany_city__colonie_town",
            dest_town_id: "colonie_town",
          },
        });
        expect(roadDestinationConflict.isError).toBe(true);
        expect(textPayload(roadDestinationConflict).error).toMatch(
          /exactly one of road_id or destination_town_id/,
        );
        const afterRoadDestinationConflict = await callPlayerTool(
          client,
          "get_overworld_session_context",
          parent,
        );
        expect(afterRoadDestinationConflict.snapshot_hash).toBe(
          beforeRoadDestinationConflict.snapshot_hash,
        );
      });

      await withPureServer(join(dir, "same-dual.jsonl"), async (client) => {
        const started = await callPlayerTool(client, "start_overworld", {});
        const traveled = await callPlayerTool(client, "travel_overworld_session", {
          session_id: String(started.session_id),
          destination_town_id: "colonie_town",
          dest_town_id: "colonie_town",
        });
        expect(traveled.ok).toBe(true);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("fails closed when private pure-evidence provenance is missing or malformed", () => {
    const cases = [
      {
        label: "missing seed",
        args: ["--build-commit", TEST_BUILD_COMMIT, "--tracked-worktree-clean", "true"],
        message: /requires --run-seed/i,
      },
      {
        label: "unsafe seed",
        args: [
          "--run-seed",
          "9007199254740992",
          "--build-commit",
          TEST_BUILD_COMMIT,
          "--tracked-worktree-clean",
          "true",
        ],
        message: /safe integer/i,
      },
      {
        label: "malformed commit",
        args: [
          "--run-seed",
          String(TEST_RUN_SEED),
          "--build-commit",
          "abc",
          "--tracked-worktree-clean",
          "true",
        ],
        message: /40-character lowercase Git commit hash/i,
      },
      {
        label: "malformed clean flag",
        args: [
          "--run-seed",
          String(TEST_RUN_SEED),
          "--build-commit",
          TEST_BUILD_COMMIT,
          "--tracked-worktree-clean",
          "yes",
        ],
        message: /exactly "true" or "false"/i,
      },
    ];
    for (const testCase of cases) {
      const evidence = join(tmpdir(), `mcp-pure-invalid-${testCase.label.replaceAll(" ", "-")}`);
      const result = spawnSync(
        process.execPath,
        [
          TSX,
          "src/mcp/server.ts",
          "--play-mode",
          "pure",
          "--run-evidence",
          evidence,
          ...testCase.args,
        ],
        { cwd: ROOT, encoding: "utf8", timeout: 15_000 },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
      expect(result.status, `${testCase.label}: ${output}`).not.toBe(0);
      expect(output, testCase.label).toMatch(testCase.message);
    }
  }, 60_000);

  it("advertises only player tools and records exactly one fresh overworld start", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pure-"));
    const evidence = join(dir, "run.jsonl");
    try {
      let sessionId = "";
      await withPureServer(evidence, async (client) => {
        const listed = await client.listTools();
        expect(new Set(listed.tools.map((tool) => tool.name))).toEqual(PURE_PLAYER_TOOLS);
        expect(listed.tools.map((tool) => tool.name)).not.toEqual(
          expect.arrayContaining([
            "list_overworld",
            "restore_overworld_session",
            "start_world_quest",
            "complete_overworld_session_quest",
          ]),
        );

        const storyChoiceTool = listed.tools.find(
          (tool) => tool.name === "choose_overworld_session_story",
        );
        expect(storyChoiceTool).toBeDefined();
        const storyChoiceProperties = storyChoiceTool?.inputSchema.properties as
          | Record<string, { description?: unknown; enum?: unknown; type?: unknown }>
          | undefined;
        expect(storyChoiceProperties?.choice).toMatchObject({
          type: "string",
          description: "Choice id from journey.storyChoice.options.",
        });
        expect(storyChoiceProperties?.choice).not.toHaveProperty("enum");
        expect(JSON.stringify(storyChoiceTool)).not.toMatch(
          /targetQuestId|endingId|ending_held|wolf_winter|content\/rpg|win_conditions|maneuver_/i,
        );
        expect(JSON.stringify(storyChoiceTool)).not.toMatch(
          /send_wagon_to_cade|send_wardens_north|keep_household_correction|publish_dosage_warning|advocate|cold_forge|Edric|Godwin|wormwood|public scrutiny|family's trust/i,
        );

        const goalPassageTool = listed.tools.find(
          (tool) => tool.name === "follow_overworld_session_goal",
        );
        expect(goalPassageTool).toBeDefined();
        const goalPassageProperties = goalPassageTool?.inputSchema.properties as
          | Record<string, unknown>
          | undefined;
        expect(goalPassageTool?.inputSchema.required ?? []).not.toContain("session_id");
        expect(goalPassageProperties).toHaveProperty("session_id");
        expect(
          (goalPassageProperties?.session_id as { description?: string } | undefined)?.description,
        ).toMatch(/parent.*overworld_session_id.*(?:not|never) rpg_session_id/i);
        expect(goalPassageProperties).toHaveProperty("expected_snapshot_hash");
        expect(goalPassageProperties).not.toHaveProperty("destination_town_id");
        expect(goalPassageProperties).not.toHaveProperty("road_id");
        expect(goalPassageProperties).not.toHaveProperty("choice");
        expect(JSON.stringify(goalPassageTool)).not.toMatch(
          /targetQuestId|targetTownId|targetAreaId|endingId|wolf_winter|gallowmere|content\/rpg|win_conditions|maneuver_/i,
        );

        const beforeStart = await client.callTool({
          name: "get_overworld_session_context",
          arguments: {},
        });
        expect(beforeStart.isError).toBe(true);
        const beforeStartPayload = textPayload(beforeStart);
        expect(beforeStartPayload).toMatchObject({
          ok: false,
          error: expect.stringMatching(/must begin with start_overworld/i),
        });
        expect(beforeStartPayload).not.toHaveProperty("expected_session_field");
        expect(beforeStartPayload).not.toHaveProperty("overworld_session_id");
        expect(beforeStartPayload).not.toHaveProperty("rpg_session_id");

        const started = await client.callTool({
          name: "start_overworld",
          arguments: {},
        });
        const payload = textPayload(started);
        sessionId = String(payload.session_id);
        expect(payload.overworld_session_id).toBe(sessionId);
        expect(sessionId).toMatch(
          /^o-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );

        const invalidStoryChoice = await client.callTool({
          name: "choose_overworld_session_story",
          arguments: { session_id: sessionId, choice: "not-a-visible-choice" },
        });
        expect(invalidStoryChoice.isError).toBe(true);
        expect((invalidStoryChoice.content as unknown[])[0]).toMatchObject({
          type: "text",
          text: expect.stringMatching(/no story consequence to choose/i),
        });

        const second = await client.callTool({
          name: "start_overworld",
          arguments: {},
        });
        expect(second.isError).toBe(true);
        const recovery = textPayload(second);
        expect(recovery).toMatchObject({
          ok: false,
          error: expect.stringMatching(/already has exactly one fresh overworld session/i),
          expected_session_field: "overworld_session_id",
          overworld_session_id: sessionId,
        });
        const recoveredRead = await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: recovery.overworld_session_id },
        });
        expect(recoveredRead.isError).not.toBe(true);
        expect(textPayload(recoveredRead).overworld_session_id).toBe(sessionId);
      });

      const lines = readFileSync(evidence, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lines).toEqual([
        expect.objectContaining({
          schema_version: 2,
          play_mode: "pure",
          event: "fresh_start",
          start_surface: "fresh_overworld",
          session_id: sessionId,
          run_seed: TEST_RUN_SEED,
          build: {
            git_commit: TEST_BUILD_COMMIT,
            tracked_worktree_clean: true,
            world_id: "new_york_overworld",
            world_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
        }),
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("does not advertise or honor QA-only quest graph and seed overrides", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pure-visibility-"));
    const evidence = join(dir, "run.jsonl");
    type AreaView = {
      pois: { id: string }[];
      characters: { id: string }[];
      areaExits: { id: string; destination: { id: string } }[];
      quests: { id: string; area: string }[];
    };
    type CompactAreaContext = {
      poi?: [string, string][];
      contacts?: [string, string][];
      area_routes?: [string, string, number][];
      quests?: [string, string, string, unknown?][];
    };
    type RpgObservation = {
      exits: { direction: string; to?: string }[];
      available_actions: { id: string; command?: string }[];
    };
    type RpgCompactContext = { actions?: string[] };
    const areaView = (payload: Record<string, unknown>): AreaView => {
      const context = payload.context as CompactAreaContext;
      return {
        pois: (context.poi ?? []).map(([id]) => ({ id })),
        characters: (context.contacts ?? []).map(([id]) => ({ id })),
        areaExits: (context.area_routes ?? []).map(([id, destination]) => ({
          id,
          destination: { id: destination },
        })),
        quests: (context.quests ?? []).map(([id, _title, area]) => ({ id, area })),
      };
    };
    try {
      await withPureServer(evidence, async (client) => {
        const listed = await client.listTools();
        for (const name of [
          "start_overworld_session_quest",
          "choose_overworld_session_journey",
          "get_observation",
          "step_action",
        ]) {
          const registered = listed.tools.find((candidate) => candidate.name === name);
          expect(registered).toBeDefined();
          const properties = registered?.inputSchema.properties ?? {};
          expect(properties).not.toHaveProperty("hide_graph");
          expect(properties).toHaveProperty("include_actions");
        }
        const questStartSchema = listed.tools.find(
          (candidate) => candidate.name === "start_overworld_session_quest",
        )?.inputSchema.properties;
        expect(questStartSchema).not.toHaveProperty("seed");
        expect(JSON.stringify(listed.tools)).not.toMatch(
          /run_seed|build_commit|tracked_worktree_clean|quest_outcomes/i,
        );
        const legalActionSchema = listed.tools.find(
          (candidate) => candidate.name === "list_legal_actions",
        )?.inputSchema.properties as Record<string, { description?: string }> | undefined;
        expect(legalActionSchema?.compact_actions?.description).toMatch(
          /true returns bare action ids.*defaults to labeled options/i,
        );
        expect(legalActionSchema?.session_id?.description).toMatch(
          /child.*rpg_session_id.*(?:not|never) overworld_session_id/i,
        );

        const started = textPayload(
          await client.callTool({
            name: "start_overworld",
            arguments: {},
          }),
        );
        const sessionId = String(started.session_id);
        expect(started.overworld_session_id).toBe(sessionId);
        let view = areaView(started);
        const openingPoi = view.pois[0]?.id;
        if (!openingPoi) throw new Error("expected opening Albany point of interest");

        const openingScout = textPayload(
          await client.callTool({
            name: "scout_overworld_session_poi",
            arguments: {
              session_id: sessionId,
              poi_id: openingPoi,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        view = areaView(openingScout);
        const rowan = view.characters[0];
        if (!rowan) throw new Error("expected Albany registration contact");
        const registration = textPayload(
          await client.callTool({
            name: "talk_overworld_session_contact",
            arguments: {
              session_id: sessionId,
              character_id: rowan.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const registrationChoice = (
          registration.journey as {
            storyChoice?: {
              kind?: string;
              options?: { id: string }[];
            };
          }
        ).storyChoice;
        expect(registrationChoice?.kind).toBe("registration");
        const ledgerAdvocate = registrationChoice?.options?.find(
          (option) => option.id === "albany:ledger_advocate",
        );
        if (!ledgerAdvocate) throw new Error("expected visible Ledger Advocate profile");
        const wolfBeforeSource = areaView(registration).quests.find(
          (quest) => quest.id === "wolf_winter",
        );
        expect(wolfBeforeSource).toBeUndefined();
        const selected = textPayload(
          await client.callTool({
            name: "choose_overworld_session_story",
            arguments: {
              session_id: sessionId,
              choice: ledgerAdvocate.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const oathChoice = (
          selected.journey as {
            storyChoice?: {
              kind?: string;
              options?: { id: string }[];
            };
          }
        ).storyChoice;
        expect(oathChoice?.kind).toBe("relief_oath");
        const limitedOath = oathChoice?.options?.find(
          (option) => option.id === "albany:oath_limited_aid_only",
        );
        if (!limitedOath) throw new Error("expected visible limited aid-only oath");
        const oathed = textPayload(
          await client.callTool({
            name: "choose_overworld_session_story",
            arguments: {
              session_id: sessionId,
              choice: limitedOath.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const sourceChoice = (
          oathed.journey as {
            storyChoice?: {
              kind?: string;
              options?: { id: string }[];
            };
          }
        ).storyChoice;
        expect(sourceChoice?.kind).toBe("lead_source");
        const rowanDocket = sourceChoice?.options?.find(
          (option) => option.id === "albany:source_rowan_civic_docket",
        );
        if (!rowanDocket) throw new Error("expected visible Rowan civic-docket source");
        const sourced = textPayload(
          await client.callTool({
            name: "choose_overworld_session_story",
            arguments: {
              session_id: sessionId,
              choice: rowanDocket.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const preparationChoice = (
          sourced.journey as {
            storyChoice?: {
              kind?: string;
              options?: { id: string }[];
            };
          }
        ).storyChoice;
        expect(preparationChoice?.kind).toBe("preparation");
        expect(areaView(sourced).quests.map((quest) => quest.id)).toContain("wolf_winter");
        const worksFortification = preparationChoice?.options?.find(
          (option) => option.id === "albany:prep_works_fortification",
        );
        if (!worksFortification)
          throw new Error("expected visible works-fortification preparation");
        const prepared = textPayload(
          await client.callTool({
            name: "choose_overworld_session_story",
            arguments: {
              session_id: sessionId,
              choice: worksFortification.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const wolfWinter = areaView(prepared).quests.find((quest) => quest.id === "wolf_winter");
        if (!wolfWinter) throw new Error("expected selected preparation to reveal Wolf-Winter");
        view = areaView(prepared);
        const marketRoute = view.areaExits.find(
          (route) => route.destination.id === "albany_city__market",
        );
        if (!marketRoute) throw new Error("expected route to Albany market");

        const market = textPayload(
          await client.callTool({
            name: "move_overworld_session_area",
            arguments: {
              session_id: sessionId,
              area_route_id: marketRoute.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        view = areaView(market);
        const marketPoi = view.pois[0]?.id;
        if (!marketPoi) throw new Error("expected Albany market point of interest");

        const lead = textPayload(
          await client.callTool({
            name: "scout_overworld_session_poi",
            arguments: {
              session_id: sessionId,
              poi_id: marketPoi,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const quest = wolfWinter;
        view = areaView(lead);
        const questRoute = view.areaExits.find((route) => route.destination.id === quest.area);
        if (!questRoute) throw new Error("expected route to the discovered lead");
        const departure = textPayload(
          await client.callTool({
            name: "move_overworld_session_area",
            arguments: {
              session_id: sessionId,
              area_route_id: questRoute.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const allocationChoice = (
          departure.journey as {
            storyChoice?: {
              kind?: string;
              options?: { id: string }[];
            };
          }
        ).storyChoice;
        expect(allocationChoice?.kind).toBe("relief_allocation");
        const residentShelter = allocationChoice?.options?.find(
          (option) => option.id === "albany:relief_resident_shelter",
        );
        if (!residentShelter) throw new Error("expected visible resident-shelter allocation");
        await client.callTool({
          name: "choose_overworld_session_story",
          arguments: {
            session_id: sessionId,
            choice: residentShelter.id,
            compact_context: false,
            compact_result: false,
          },
        });

        const launched = textPayload(
          await client.callTool({
            name: "start_overworld_session_quest",
            arguments: {
              session_id: sessionId,
              quest_id: quest.id,
              approach_id: "albany:wolf_approach_sheltered_stockway",
              seed: 8675309,
              hide_graph: false,
              include_actions: false,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const rpgSessionId = String(launched.rpg_session_id);
        expect(launched).toMatchObject({
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
          rpg_session: {
            overworld_session_id: sessionId,
            rpg_session_id: rpgSessionId,
          },
        });
        const rpgSession = launched.rpg_session as {
          context: RpgCompactContext;
          state_hash: string;
        };
        expect(rpgSession.context.actions).toContain("use_sheltered_stockway_last_mile");
        expect(rpgSession.context.actions?.length).toBeLessThanOrEqual(24);

        const unchanged = textPayload(
          await client.callTool({
            name: "get_observation",
            arguments: {
              session_id: rpgSessionId,
              if_state_hash: rpgSession.state_hash,
            },
          }),
        );
        expect(unchanged).toMatchObject({
          unchanged: true,
          state_hash: rpgSession.state_hash,
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });

        const staleStepResult = await client.callTool({
          name: "step_action",
          arguments: {
            session_id: rpgSessionId,
            action_id: "use_sheltered_stockway_last_mile",
            expected_state_hash: "stale-state-hash",
          },
        });
        expect(staleStepResult.isError).not.toBe(true);
        expect(textPayload(staleStepResult)).toMatchObject({
          ok: false,
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });

        const parentRecovery = textPayload(
          await client.callTool({
            name: "get_overworld_session_context",
            arguments: { session_id: sessionId },
          }),
        );
        expect(parentRecovery).toMatchObject({
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });
        const parentSnapshotBeforeRejectedStart = parentRecovery.snapshot_hash;
        const journeyBeforeRejectedStart = parentRecovery.journey;
        const repeatedQuestStart = await client.callTool({
          name: "start_overworld_session_quest",
          arguments: {
            session_id: sessionId,
            quest_id: quest.id,
            approach_id: "albany:wolf_approach_sheltered_stockway",
          },
        });
        expect(repeatedQuestStart.isError).toBe(true);
        expect(textPayload(repeatedQuestStart)).toMatchObject({
          error: expect.stringMatching(/Finish the active embedded quest/i),
          expected_session_field: "rpg_session_id",
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });
        const parentAfterRejectedStart = textPayload(
          await client.callTool({
            name: "get_overworld_session_context",
            arguments: { session_id: sessionId },
          }),
        );
        expect(parentAfterRejectedStart).toMatchObject({
          snapshot_hash: parentSnapshotBeforeRejectedStart,
          journey: journeyBeforeRejectedStart,
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });
        for (const [name, argumentsValue, expectedField] of [
          ["list_legal_actions", { session_id: null }, "rpg_session_id"],
          ["list_legal_actions", { session_id: 7 }, "rpg_session_id"],
          ["list_legal_actions", { session_id: sessionId }, "rpg_session_id"],
          ["get_overworld_session_context", {}, "overworld_session_id"],
          ["get_overworld_session_context", { rpg_session_id: sessionId }, "overworld_session_id"],
          ["get_overworld_session_context", { session_id: null }, "overworld_session_id"],
          ["get_overworld_session_context", { session_id: 7 }, "overworld_session_id"],
          ["get_overworld_session_context", { session_id: rpgSessionId }, "overworld_session_id"],
          [
            "get_overworld_session_context",
            { session_id: "not-a-live-handle" },
            "overworld_session_id",
          ],
        ] as const) {
          const rejected = await client.callTool({ name, arguments: argumentsValue });
          expect(rejected.isError).toBe(true);
          expect(textPayload(rejected)).toMatchObject({
            ok: false,
            expected_session_field: expectedField,
            overworld_session_id: sessionId,
            rpg_session_id: rpgSessionId,
          });
        }
        const bothRecovered = await client.callTool({ name: "start_overworld", arguments: {} });
        expect(bothRecovered.isError).toBe(true);
        expect(textPayload(bothRecovered)).toMatchObject({
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });

        const enteredByre = textPayload(
          await client.callTool({
            name: "step_action",
            arguments: {
              session_id: rpgSessionId,
              action_id: "use_sheltered_stockway_last_mile",
              expected_state_hash: rpgSession.state_hash,
              include_actions: false,
            },
          }),
        );
        expect(enteredByre.ok).toBe(true);
        expect((enteredByre.context as RpgCompactContext).actions).toContain("talk_houndsman");

        const talked = textPayload(
          await client.callTool({
            name: "step_action",
            arguments: {
              session_id: rpgSessionId,
              action_id: "talk_houndsman",
              expected_state_hash: String(enteredByre.state_hash),
            },
          }),
        );
        expect(talked.ok).toBe(true);
        const talkActions = (talked.context as RpgCompactContext).actions;
        expect(talkActions).toEqual(
          expect.arrayContaining(["ask_wolves", "ask_byre", "ask_leave"]),
        );
        expect(talkActions?.length).toBeLessThanOrEqual(24);

        const currentRead = textPayload(
          await client.callTool({
            name: "get_observation",
            arguments: { session_id: rpgSessionId, include_actions: false },
          }),
        );
        expect((currentRead.context as RpgCompactContext).actions).toEqual(talkActions);

        const labeledMenu = textPayload(
          await client.callTool({
            name: "list_legal_actions",
            arguments: { session_id: rpgSessionId },
          }),
        );
        const labeledActions = labeledMenu.actions as { id: string; command?: string }[];
        expect(
          Object.fromEntries(labeledActions.map((action) => [action.id, action.command])),
        ).toMatchObject({
          ask_wolves: "ask: Ask for Cade's quick spear-hand lesson.",
          ask_byre: "ask: Ask for Cade's guarded spear-fighting plan.",
          ask_leave: "ask: Leave Cade.",
        });
        expect(labeledMenu).toMatchObject({
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });
        const compactMenu = textPayload(
          await client.callTool({
            name: "list_legal_actions",
            arguments: { session_id: rpgSessionId, compact_actions: true },
          }),
        );
        expect(compactMenu.actions).toEqual(
          expect.arrayContaining(["ask_wolves", "ask_byre", "ask_leave"]),
        );

        // The action menu carried by TALK is immediately executable; a player does
        // not need a second read or a guessed/stale menu before choosing a topic.
        const asked = textPayload(
          await client.callTool({
            name: "step_action",
            arguments: {
              session_id: rpgSessionId,
              action_id: "ask_byre",
              expected_state_hash: String(talked.state_hash),
              hide_graph: false,
              compact_observation: false,
            },
          }),
        );
        expect(asked.ok).toBe(true);
        const askedObservation = asked.observation as RpgObservation;
        expect(askedObservation.exits.length).toBeGreaterThan(0);
        expect(askedObservation.exits.every((exit) => exit.to === undefined)).toBe(true);
        expect(askedObservation.available_actions.length).toBeGreaterThan(0);
        expect(
          askedObservation.available_actions.every(
            (action) => typeof action.command === "string" && action.command.length > 0,
          ),
        ).toBe(true);
        expect(asked).toMatchObject({
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });

        const reread = textPayload(
          await client.callTool({
            name: "get_observation",
            arguments: {
              session_id: rpgSessionId,
              hide_graph: false,
              compact_observation: false,
            },
          }),
        );
        const rereadObservation = reread.observation as RpgObservation;
        expect(rereadObservation.exits.length).toBeGreaterThan(0);
        expect(rereadObservation.exits.every((exit) => exit.to === undefined)).toBe(true);
        expect(rereadObservation.available_actions.length).toBeGreaterThan(0);
        expect(
          rereadObservation.available_actions.every(
            (action) => typeof action.command === "string" && action.command.length > 0,
          ),
        ).toBe(true);

        // Bounce over the safe yard gate until a real quest move lands on the
        // fixed checkpoint. Pure mode must suppress that step's menu, then put
        // the exact current quest menu back on the Continue response itself.
        let questTurn = textPayload(
          await client.callTool({
            name: "get_observation",
            arguments: {
              session_id: rpgSessionId,
              compact_observation: true,
              include_actions: false,
            },
          }),
        );
        let questJourney = questTurn.journey as {
          status: string;
          acceptedDecisions: number;
          nextCheckpoint: number | null;
          pendingChoice: unknown;
        };
        while (questJourney.acceptedDecisions < 40) {
          const actions = (questTurn.context as RpgCompactContext).actions ?? [];
          const actionId = actions.includes("ask_leave")
            ? "ask_leave"
            : actions.includes("go_south")
              ? "go_south"
              : actions.includes("go_north")
                ? "go_north"
                : null;
          if (!actionId) throw new Error("expected a safe reversible quest route");
          questTurn = textPayload(
            await client.callTool({
              name: "step_action",
              arguments: {
                session_id: rpgSessionId,
                action_id: actionId,
                expected_state_hash: String(questTurn.state_hash),
                include_actions: false,
              },
            }),
          );
          questJourney = questTurn.journey as typeof questJourney;
        }
        expect(questJourney).toMatchObject({
          status: "awaiting_choice",
          acceptedDecisions: 40,
          nextCheckpoint: 40,
        });
        expect((questTurn.context as RpgCompactContext).actions).toBeUndefined();
        const checkpointStateHash = String(questTurn.state_hash);
        const recoveredParentId = String(questTurn.overworld_session_id);
        expect(recoveredParentId).toBe(sessionId);
        expect(questTurn.rpg_session_id).toBe(rpgSessionId);

        const continued = textPayload(
          await client.callTool({
            name: "choose_overworld_session_journey",
            arguments: {
              session_id: recoveredParentId,
              choice: "continue",
              compact_observation: true,
              include_actions: false,
            },
          }),
        );
        expect(continued.journey).toMatchObject({
          status: "active",
          acceptedDecisions: 40,
          nextCheckpoint: 80,
          pendingChoice: null,
        });
        expect(continued.rpg_session_id).toBe(rpgSessionId);
        expect(continued.overworld_session_id).toBe(sessionId);
        const resumed = continued.rpg_session as {
          session_id: string;
          state_hash: string;
          context: RpgCompactContext;
          overworld_session_id: string;
          rpg_session_id: string;
        };
        expect(resumed).toMatchObject({
          session_id: rpgSessionId,
          state_hash: checkpointStateHash,
          overworld_session_id: sessionId,
          rpg_session_id: rpgSessionId,
        });
        expect(resumed.context.actions?.length).toBeGreaterThan(0);
        expect(continued).not.toHaveProperty("observation");
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("auto-folds non-death and holds a dead child until the end-only journey receipt", async () => {
    const nonDeathDir = mkdtempSync(join(tmpdir(), "mcp-pure-terminal-success-"));
    const deathDir = mkdtempSync(join(tmpdir(), "mcp-pure-terminal-death-"));
    const deathEvidence = join(deathDir, "run.jsonl");
    const preservedDeathEvidence = join(deathDir, "run-preserved.jsonl");
    try {
      await withPureServer(
        join(nonDeathDir, "run.jsonl"),
        async (client) => {
          const launch = await launchPreparedPureWolf(client);
          const final = await playPureQuestActions(client, launch, [
            "use_sheltered_stockway_last_mile",
            "go_north",
            "maneuver_yearling_wolf_set_spear",
            "maneuver_yearling_wolf_drive_set_spear",
            "go_north",
            "attack_flank_wolf",
            "attack_flank_wolf",
            "go_north",
            "attack_grey_leader",
            "attack_grey_leader",
            "go_north",
          ]);
          expect(final.questCompletion).toMatchObject({ endingId: "ending_held" });
          expect(final.context).toMatchObject({
            ended: true,
            ending_id: "ending_held",
            ending: { death: false },
          });
          expect(final.overworld_session_id).toBe(launch.overworldSessionId);
          expect(final).not.toHaveProperty("rpg_session_id");

          const continued = await callPlayerTool(client, "choose_overworld_session_journey", {
            session_id: launch.overworldSessionId,
            choice: "continue",
          });
          expect(continued.overworld_session_id).toBe(launch.overworldSessionId);
          expect(continued).not.toHaveProperty("rpg_session_id");
        },
        0,
      );

      await withPureServer(
        deathEvidence,
        async (client) => {
          const launch = await launchPreparedPureWolf(client);
          const final = await playPureQuestActions(client, launch, [
            "use_sheltered_stockway_last_mile",
            "go_north",
            "maneuver_yearling_wolf_set_spear",
            "maneuver_yearling_wolf_drive_set_spear",
            "go_north",
            "attack_flank_wolf",
            "attack_flank_wolf",
            "attack_flank_wolf",
            "go_north",
            "attack_grey_leader",
            "attack_grey_leader",
          ]);
          expect(final).not.toHaveProperty("questCompletion");
          expect(final.context).toMatchObject({
            ended: true,
            ending_id: "ending_pulled_down",
            ending: { death: true },
          });
          expect(final.overworld_session_id).toBe(launch.overworldSessionId);
          expect(final.rpg_session_id).toBe(launch.rpgSessionId);
          expect(final.journey).toMatchObject({
            status: "awaiting_choice",
            goal: { status: "active" },
            pendingChoice: {
              reasons: ["character_died"],
              checkpoint: null,
              goalVersion: null,
              goalId: null,
              options: [{ id: "end" }],
            },
          });

          const parent = await callPlayerTool(client, "get_overworld_session_context", {
            session_id: launch.overworldSessionId,
          });
          expect(parent.rpg_session_id).toBe(launch.rpgSessionId);

          const continuedCall = await client.callTool({
            name: "choose_overworld_session_journey",
            arguments: { session_id: launch.overworldSessionId, choice: "continue" },
          });
          expect(continuedCall.isError).toBe(true);
          expect(textPayload(continuedCall)).toMatchObject({
            ok: false,
            overworld_session_id: launch.overworldSessionId,
            rpg_session_id: launch.rpgSessionId,
            error: expect.stringMatching(/character died/i),
          });

          // Make the evidence target unwritable after fresh-start evidence has
          // landed. The journey end itself must remain committed and recoverable.
          renameSync(deathEvidence, preservedDeathEvidence);
          mkdirSync(deathEvidence);
          const ended = await callPlayerTool(client, "choose_overworld_session_journey", {
            session_id: launch.overworldSessionId,
            choice: "end",
          });
          expect(ended.overworld_session_id).toBe(launch.overworldSessionId);
          expect(ended).not.toHaveProperty("rpg_session_id");
          expect(ended.journey).toMatchObject({ status: "ended", pendingChoice: null });
          const exitReceipt = (ended.result as { exitReceipt: Record<string, unknown> })
            .exitReceipt;
          expect(exitReceipt).toMatchObject({
            exitReason: "player_ended_at_choice",
            goalStatus: "active",
            exitReasons: ["character_died"],
          });
          expect(ended.run_evidence).toMatchObject({
            recorded: false,
            retryable: true,
            message: expect.stringMatching(/journey ended.*exactly one more call.*end choice/i),
          });

          const blockedAfterCommittedExit = await client.callTool({
            name: "get_overworld_session_context",
            arguments: { session_id: launch.overworldSessionId },
          });
          expect(blockedAfterCommittedExit.isError).toBe(true);
          expect(textPayload(blockedAfterCommittedExit)).toMatchObject({
            ok: false,
            overworld_session_id: launch.overworldSessionId,
            error: expect.stringMatching(/exit receipt is the final run event/i),
          });
          expect(textPayload(blockedAfterCommittedExit)).not.toHaveProperty("rpg_session_id");

          // Repair the target and replay the exact terminal choice. The handler
          // must not mutate twice; it re-emits the cached receipt and persists one
          // journey-exit event.
          rmSync(deathEvidence, { recursive: true, force: true });
          renameSync(preservedDeathEvidence, deathEvidence);
          const retried = await callPlayerTool(client, "choose_overworld_session_journey", {
            session_id: launch.overworldSessionId,
            choice: "end",
          });
          expect(retried).not.toHaveProperty("run_evidence");
          expect(retried).not.toHaveProperty("rpg_session_id");
          expect((retried.result as { exitReceipt: Record<string, unknown> }).exitReceipt).toEqual(
            exitReceipt,
          );

          const replayed = await callPlayerTool(client, "choose_overworld_session_journey", {
            session_id: launch.overworldSessionId,
            choice: "end",
          });
          expect(replayed).not.toHaveProperty("rpg_session_id");
          expect((replayed.result as { exitReceipt: Record<string, unknown> }).exitReceipt).toEqual(
            exitReceipt,
          );
        },
        6,
      );

      const deathEvents = readFileSync(deathEvidence, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(deathEvents).toHaveLength(2);
      expect(deathEvents[1]).toMatchObject({
        event: "journey_exit",
        quest_outcomes: [],
        receipt: {
          goalStatus: "active",
          exitReasons: ["character_died"],
        },
      });
    } finally {
      rmSync(nonDeathDir, { recursive: true, force: true });
      rmSync(deathDir, { recursive: true, force: true });
    }
  }, 120_000);

  it("records the same-session exit receipt and rejects every post-exit call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-pure-exit-"));
    const evidence = join(dir, "run.jsonl");
    try {
      let expectedReceipt: unknown;
      let sessionId = "";
      await withPureServer(evidence, async (client) => {
        const started = textPayload(
          await client.callTool({
            name: "start_overworld",
            arguments: {},
          }),
        );
        sessionId = String(started.session_id);
        type CompactAreaContext = {
          area_routes?: [string, string, number][];
          poi?: [string, string][];
        };
        const areaObservation = (payload: Record<string, unknown>) => {
          const context = payload.context as CompactAreaContext;
          return {
            areaExits: (context.area_routes ?? []).map(([id]) => ({ id })),
            pois: (context.poi ?? []).map(([id]) => ({ id })),
          };
        };
        let observation = areaObservation(started);

        let journey = started.journey as {
          acceptedDecisions: number;
          pendingChoice: unknown;
        };
        const openingPoi = observation.pois[0];
        if (!openingPoi) throw new Error("expected an opening local lead");
        const scouted = textPayload(
          await client.callTool({
            name: "scout_overworld_session_poi",
            arguments: {
              session_id: sessionId,
              poi_id: openingPoi.id,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        journey = scouted.journey as typeof journey;
        observation = areaObservation(scouted);
        while (journey.acceptedDecisions < 40) {
          const route = observation.areaExits[0];
          if (!route) throw new Error("expected a legal local movement");
          const moved = textPayload(
            await client.callTool({
              name: "move_overworld_session_area",
              arguments: {
                session_id: sessionId,
                area_route_id: route.id,
                compact_context: false,
                compact_result: false,
              },
            }),
          );
          journey = moved.journey as typeof journey;
          observation = areaObservation(moved);
        }
        expect(journey.pendingChoice).not.toBeNull();

        const ended = textPayload(
          await client.callTool({
            name: "choose_overworld_session_journey",
            arguments: { session_id: sessionId, choice: "end" },
          }),
        );
        const result = ended.result as { exitReceipt: unknown };
        expectedReceipt = result.exitReceipt;
        expect(expectedReceipt).toMatchObject({ exitReason: "player_ended_at_choice" });

        const afterExit = await client.callTool({
          name: "get_overworld_session_context",
          arguments: { session_id: sessionId },
        });
        expect(afterExit.isError).toBe(true);
        expect((afterExit.content as unknown[])[0]).toMatchObject({
          type: "text",
          text: expect.stringMatching(/exit receipt is the final run event/i),
        });
      });

      const lines = readFileSync(evidence, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({
        schema_version: 2,
        play_mode: "pure",
        event: "fresh_start",
        start_surface: "fresh_overworld",
        session_id: sessionId,
        run_seed: TEST_RUN_SEED,
        build: {
          git_commit: TEST_BUILD_COMMIT,
          tracked_worktree_clean: true,
          world_id: "new_york_overworld",
          world_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      });
      expect(lines[1]).toMatchObject({
        schema_version: 2,
        play_mode: "pure",
        event: "journey_exit",
        start_surface: "fresh_overworld",
        session_id: sessionId,
        run_seed: TEST_RUN_SEED,
        build: lines[0].build,
        quest_outcomes: [],
        receipt: expectedReceipt,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
