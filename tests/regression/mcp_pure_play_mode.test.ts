import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PURE_PLAYER_TOOLS, toolAvailableInPlayMode } from "../../src/mcp/server.js";

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
    expect(toolAvailableInPlayMode("follow_overworld_session_goal", "pure")).toBe(true);
    expect(toolAvailableInPlayMode("choose_overworld_session_story", "pure")).toBe(true);
    expect(PURE_PLAYER_TOOLS.has("follow_overworld_session_goal")).toBe(true);
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
        expect(goalPassageTool?.inputSchema.required).toEqual(["session_id"]);
        expect(goalPassageProperties).toHaveProperty("session_id");
        expect(goalPassageProperties).toHaveProperty("expected_snapshot_hash");
        expect(goalPassageProperties).not.toHaveProperty("destination_town_id");
        expect(goalPassageProperties).not.toHaveProperty("road_id");
        expect(goalPassageProperties).not.toHaveProperty("choice");
        expect(JSON.stringify(goalPassageTool)).not.toMatch(
          /targetQuestId|targetTownId|targetAreaId|endingId|wolf_winter|gallowmere|content\/rpg|win_conditions|maneuver_/i,
        );

        const started = await client.callTool({
          name: "start_overworld",
          arguments: { compact_context: true },
        });
        const payload = textPayload(started);
        sessionId = String(payload.session_id);
        expect(sessionId).toMatch(/^o\d+$/);

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
      characters: { id: string }[];
      areaExits: { id: string; destination: { id: string } }[];
    };
    type RpgObservation = {
      exits: { direction: string; to?: string }[];
      available_actions: { id: string; command?: string }[];
    };
    type RpgCompactContext = { actions?: string[] };
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
        const legalActionSchema = listed.tools.find(
          (candidate) => candidate.name === "list_legal_actions",
        )?.inputSchema.properties as Record<string, { description?: string }> | undefined;
        expect(legalActionSchema?.compact_actions?.description).toMatch(
          /true returns bare action ids.*defaults to labeled options/i,
        );

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
        const wolfBeforeSource = (
          registration.result as { discoveredQuests?: { id: string; area: string }[] }
        ).discoveredQuests?.find((quest) => quest.id === "wolf_winter");
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
        expect(
          (sourced.observation as AreaView & { quests?: { id: string }[] }).quests?.map(
            (quest) => quest.id,
          ),
        ).not.toContain("wolf_winter");
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
        const wolfWinter = (
          prepared.observation as AreaView & { quests?: { id: string; area: string }[] }
        ).quests?.find((quest) => quest.id === "wolf_winter");
        if (!wolfWinter) throw new Error("expected selected preparation to reveal Wolf-Winter");
        view = prepared.observation as AreaView;
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
        const quest = wolfWinter;
        view = lead.observation as AreaView;
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
        const rpgSession = launched.rpg_session as {
          context: RpgCompactContext;
          state_hash: string;
        };
        expect(rpgSession.context.actions).toContain("use_sheltered_stockway_last_mile");
        expect(rpgSession.context.actions?.length).toBeLessThanOrEqual(24);

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
          ask_byre: "ask: Ask for Cade's guarded byre plan.",
          ask_leave: "ask: Leave old Cade and hold the byre.",
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

        const continued = textPayload(
          await client.callTool({
            name: "choose_overworld_session_journey",
            arguments: {
              session_id: sessionId,
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
        const resumed = continued.rpg_session as {
          session_id: string;
          state_hash: string;
          context: RpgCompactContext;
        };
        expect(resumed).toMatchObject({
          session_id: rpgSessionId,
          state_hash: checkpointStateHash,
        });
        expect(resumed.context.actions?.length).toBeGreaterThan(0);
        expect(continued).not.toHaveProperty("observation");
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
