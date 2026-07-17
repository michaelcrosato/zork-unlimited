import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PURE_PLAYER_TOOLS, toolAvailableInPlayMode } from "../../src/mcp/server.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const TEST_RUN_SEED = 2731;
const TEST_BUILD_COMMIT = "b".repeat(40);

async function withPureServer<T>(
  evidencePath: string,
  body: (client: Client) => Promise<T>,
  runSeed = TEST_RUN_SEED,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      TSX,
      "src/mcp/server.ts",
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
    cwd: ROOT,
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

async function withFullServer<T>(body: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX, "src/mcp/server.ts", "--play-mode", "full"],
    cwd: ROOT,
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
  const content = result.content as { type: string; text?: string }[];
  const first = content[0];
  if (!first || first.type !== "text") throw new Error("expected text tool result");
  return JSON.parse(first.text ?? "") as Record<string, unknown>;
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
  await callPlayerTool(client, "move_overworld_session_area", {
    ...parent,
    area_route_id: compactAreaRoute(view, "albany_city__transport_hub"),
  });
  await callPlayerTool(client, "choose_overworld_session_story", {
    ...parent,
    choice: "albany:relief_resident_shelter",
  });
  const launched = await callPlayerTool(client, "start_overworld_session_quest", {
    ...parent,
    quest_id: "wolf_winter",
    approach_id: "albany:wolf_approach_sheltered_stockway",
  });
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

describe("MCP pure play mode", () => {
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
          ["list_legal_actions", {}, "rpg_session_id"],
          ["list_legal_actions", { overworld_session_id: rpgSessionId }, "rpg_session_id"],
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
          ask_leave:
            "ask: Leave Cade. Entering the breach without feed, drive, or seals commits hunt-and-hold.",
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

  it("clears terminal child handles after both non-death foldback and death", async () => {
    const nonDeathDir = mkdtempSync(join(tmpdir(), "mcp-pure-terminal-success-"));
    const deathDir = mkdtempSync(join(tmpdir(), "mcp-pure-terminal-death-"));
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
        join(deathDir, "run.jsonl"),
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
          expect(final).not.toHaveProperty("rpg_session_id");

          const parent = await callPlayerTool(client, "get_overworld_session_context", {
            session_id: launch.overworldSessionId,
          });
          expect(parent).not.toHaveProperty("rpg_session_id");
          const moved = await callPlayerTool(client, "move_overworld_session_area", {
            session_id: launch.overworldSessionId,
            area_route_id: compactAreaRoute(parent, "albany_city__market"),
          });
          expect(moved.overworld_session_id).toBe(launch.overworldSessionId);
          expect(moved).not.toHaveProperty("rpg_session_id");
        },
        6,
      );
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
