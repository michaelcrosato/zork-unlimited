import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PURE_PLAYER_TOOLS, toolAvailableInPlayMode } from "../../src/mcp/server.js";
import {
  ALBANY_DAWN_DISPATCH_CHOICE_IDS,
  TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
} from "../../src/world/journey_campaign.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

async function withPureServer<T>(
  evidencePath: string,
  body: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [TSX, "src/mcp/server.ts", "--play-mode", "pure", "--run-evidence", evidencePath],
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

function textPayload(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = result.content as { type: string; text?: string }[];
  const first = content[0];
  if (!first || first.type !== "text") throw new Error("expected text tool result");
  return JSON.parse(first.text ?? "") as Record<string, unknown>;
}

describe("MCP pure play mode", () => {
  it("keeps structural QA on the full tool surface", () => {
    expect(toolAvailableInPlayMode("start_world_quest", "structural")).toBe(true);
    expect(toolAvailableInPlayMode("start_world_quest", "full")).toBe(true);
    expect(toolAvailableInPlayMode("start_world_quest", "pure")).toBe(false);
    expect(toolAvailableInPlayMode("plan_overworld_session_route", "pure")).toBe(true);
    expect(toolAvailableInPlayMode("choose_overworld_session_story", "pure")).toBe(true);
    expect(PURE_PLAYER_TOOLS.has("choose_overworld_session_story")).toBe(true);
  });

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
          ]),
        );

        const storyChoiceTool = listed.tools.find(
          (tool) => tool.name === "choose_overworld_session_story",
        );
        expect(storyChoiceTool).toBeDefined();
        const storyChoiceProperties = storyChoiceTool?.inputSchema.properties as
          | Record<string, { enum?: unknown }>
          | undefined;
        expect(storyChoiceProperties?.choice?.enum).toEqual([
          ...ALBANY_DAWN_DISPATCH_CHOICE_IDS,
          ...TANNERS_FEVER_ACCOUNTABILITY_CHOICE_IDS,
        ]);
        expect(new Set(storyChoiceProperties?.choice?.enum as string[]).size).toBe(4);
        expect(JSON.stringify(storyChoiceTool)).not.toMatch(
          /targetQuestId|endingId|ending_held|wolf_winter|content\/rpg|win_conditions|maneuver_/i,
        );
        expect(JSON.stringify(storyChoiceTool)).not.toMatch(
          /Edric|Godwin|wormwood|public scrutiny|family's trust/i,
        );

        const started = await client.callTool({
          name: "start_overworld",
          arguments: { compact_context: true },
        });
        const payload = textPayload(started);
        sessionId = String(payload.session_id);
        expect(sessionId).toMatch(/^o\d+$/);

        const second = await client.callTool({
          name: "start_overworld",
          arguments: { compact_context: true },
        });
        expect(second.isError).toBe(true);
        expect((second.content as unknown[])[0]).toMatchObject({
          type: "text",
          text: expect.stringMatching(/exactly one fresh overworld start/i),
        });
      });

      const lines = readFileSync(evidence, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(lines).toEqual([
        {
          schema_version: 1,
          play_mode: "pure",
          event: "fresh_start",
          start_surface: "fresh_overworld",
          session_id: sessionId,
        },
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
      areaExits: { id: string; destination: { id: string } }[];
    };
    type RpgObservation = {
      exits: { direction: string; to?: string }[];
      available_actions: { id: string }[];
    };
    try {
      await withPureServer(evidence, async (client) => {
        const listed = await client.listTools();
        for (const name of ["start_overworld_session_quest", "get_observation", "step_action"]) {
          const registered = listed.tools.find((candidate) => candidate.name === name);
          expect(registered).toBeDefined();
          const properties = registered?.inputSchema.properties ?? {};
          expect(properties).not.toHaveProperty("hide_graph");
        }
        const questStartSchema = listed.tools.find(
          (candidate) => candidate.name === "start_overworld_session_quest",
        )?.inputSchema.properties;
        expect(questStartSchema).not.toHaveProperty("seed");

        const started = textPayload(
          await client.callTool({
            name: "start_overworld",
            arguments: { compact_context: false },
          }),
        );
        const sessionId = String(started.session_id);
        let view = started.observation as AreaView;
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
        view = openingScout.observation as AreaView;
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
        view = market.observation as AreaView;
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
        const quest = (lead.result as { discoveredQuests?: { id: string; area: string }[] })
          .discoveredQuests?.[0];
        if (!quest) throw new Error("expected a local Albany lead");
        view = lead.observation as AreaView;
        const questRoute = view.areaExits.find((route) => route.destination.id === quest.area);
        if (!questRoute) throw new Error("expected route to the discovered lead");
        await client.callTool({
          name: "move_overworld_session_area",
          arguments: {
            session_id: sessionId,
            area_route_id: questRoute.id,
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
              seed: 8675309,
              hide_graph: false,
              compact_observation: false,
              compact_context: false,
              compact_result: false,
            },
          }),
        );
        const rpgSessionId = String(launched.rpg_session_id);
        const launchObservation = (launched.rpg_session as { observation: RpgObservation })
          .observation;
        expect(launchObservation.exits.length).toBeGreaterThan(0);
        expect(launchObservation.exits.every((exit) => exit.to === undefined)).toBe(true);

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

        const moveAction = rereadObservation.available_actions.find((action) =>
          action.id.startsWith("go_"),
        );
        if (!moveAction) throw new Error("expected an opening quest move");
        const stepped = textPayload(
          await client.callTool({
            name: "step_action",
            arguments: {
              session_id: rpgSessionId,
              action_id: moveAction.id,
              hide_graph: false,
              compact_observation: false,
            },
          }),
        );
        const steppedObservation = stepped.observation as RpgObservation;
        expect(steppedObservation.exits.every((exit) => exit.to === undefined)).toBe(true);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
            arguments: { compact_context: false },
          }),
        );
        sessionId = String(started.session_id);
        type AreaObservation = {
          areaExits: { id: string; destination: { id: string } }[];
          pois: { id: string }[];
        };
        let observation = started.observation as AreaObservation;

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
        observation = scouted.observation as AreaObservation;
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
          observation = moved.observation as AreaObservation;
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
      expect(lines).toEqual([
        {
          schema_version: 1,
          play_mode: "pure",
          event: "fresh_start",
          start_surface: "fresh_overworld",
          session_id: sessionId,
        },
        {
          schema_version: 1,
          play_mode: "pure",
          event: "journey_exit",
          start_surface: "fresh_overworld",
          session_id: sessionId,
          receipt: expectedReceipt,
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
