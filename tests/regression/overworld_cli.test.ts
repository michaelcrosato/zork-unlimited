/**
 * bin/overworld_play — the terminal overworld player stays at parity with the
 * web UI and MCP server: it drives the same OverworldSession (no reimplemented
 * rules), surfaces an authored road choice when a travel leg raises one while
 * leaving ambient route reports nonblocking, speaks world quest
 * ids only (never pack paths), and defines scripted success as "every command
 * accepted" (the overworld has no terminal ending, so rpg_play's reached-an-ending
 * predicate does not apply).
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { render, renderEncounter, renderQuestLaunch } from "../../bin/overworld_play.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const ROOT = process.cwd();

function runCli(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "bin/overworld_play.ts", ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

describe("overworld_play render (pure, same session the UI/MCP drive)", () => {
  it("renders the fresh-session status from OverworldSession.view()", () => {
    const manifest = loadOverworldManifest(ROOT);
    const session = new OverworldSession(manifest);
    const view = session.view();
    const text = render(view);
    expect(text).toContain(view.current.name);
    expect(text).toContain(`Supplies ${view.supplies}/${view.maxSupplies}`);
    expect(text).toContain("Roads:");
    expect(text).not.toMatch(/\.ya?ml/i); // public surface: no pack paths
  });

  it("renders an authored pending road encounter with its strategy commands", () => {
    const manifest = loadOverworldManifest(ROOT);
    const session = new OverworldSession(manifest);
    const choiceEdges = new Set(
      manifest.road_events
        .filter((event) => event.requires_choice === true && event.active_goal_ids === undefined)
        .map((event) => event.edge),
    );
    const firstRoad = session.view().exits.find((exit) => choiceEdges.has(exit.id));
    expect(firstRoad).toBeDefined();
    session.travel(firstRoad!.id);
    const pending = session.view().pendingRoadEncounter;
    expect(pending).not.toBeNull();
    const text = renderEncounter(pending!);
    expect(text).toContain("Road encounter");
    for (const option of pending!.options) expect(text).toContain(option.label);
    const compact = session.compactView().pending_road;
    expect(compact).toMatchObject({
      edge: pending!.edgeId,
      route: pending!.route,
      where: [pending!.from, pending!.to, pending!.arrivedAt],
      event: [pending!.event.id, pending!.event.risk, pending!.event.title, pending!.event.summary],
    });
    expect(compact?.options).toEqual(
      pending!.options.map((option) => [
        option.strategy,
        option.label,
        option.minutes,
        option.suppliesCost,
        option.fatigueGained,
        option.renownGained,
      ]),
    );
    for (const option of pending!.options) expect(option.outcome).toBeUndefined();
    expect(pending!.event.responses).toBeUndefined();
    // The three strategy command words the CLI accepts while wedged.
    expect(text).toMatch(/assist|scout|press/);
  });

  it("is deterministic: the same action order yields the same snapshot hash", () => {
    const manifest = loadOverworldManifest(ROOT);
    const play = (): string => {
      const session = new OverworldSession(manifest);
      session.travel(session.view().exits[0]!.id);
      session.resolveRoadEncounter("press_on");
      return session.snapshotHash();
    };
    expect(play()).toBe(play());
  });

  it("renders launch costs, projections, consequences, and blocked reasons without hidden ids", () => {
    const quest = {
      id: "test_hill_dispatch",
      title: "The Hill Dispatch",
      home: "albany_city",
      area: "albany_city__transport_hub",
      discovery: "Two roads leave the Station Quarter.",
      visibility: "local_notice_board",
      launch: {
        id: "test:hill_dispatch",
        prompt: "Which last-mile road do you commit to?",
        options: [
          {
            id: "test:ridge",
            title: "Take the ridge",
            summary: "Fast and exposed.",
            preview: "The crosswind will be visible.",
            consequence: "The cattle will see the descent.",
            terms: { minutes: 30, supplies: 1, fatigue: 25 },
            projection: {
              available: true,
              minutesAfter: 510,
              suppliesAfter: 5,
              fatigueAfter: 25,
              travelConditionAfter: "tired",
            },
          },
          {
            id: "test:stockway",
            title: "Take the stockway",
            summary: "Quiet but provision-heavy.",
            preview: "The herd will remain calm.",
            consequence: "The crosswind will be concealed.",
            terms: { minutes: 75, supplies: 2, fatigue: 10 },
            projection: {
              available: false,
              minutesAfter: 555,
              suppliesAfter: null,
              fatigueAfter: null,
              travelConditionAfter: null,
              blockedReason: "Requires 2 supplies; you have 1.",
            },
          },
        ],
      },
    } satisfies OverworldQuestView;

    const text = renderQuestLaunch(quest);
    expect(text).toContain("Which last-mile road do you commit to?");
    expect(text).toContain("Actual cost: 30 min, 1 supply, fatigue +25.");
    expect(text).toContain(
      "Projected arrival: Day 1, 08:30; 5 supplies remaining; fatigue 25; condition tired.",
    );
    expect(text).toContain("Commitment: The cattle will see the descent.");
    expect(text).toContain("Requires 2 supplies; you have 1.");
    expect(text).toContain("Projected time: Day 1, 09:15.");
    expect(text).not.toMatch(/knowledge_|memory_|return_summary|import:/i);
  });
});

describe("overworld_play CLI (scripted mode)", () => {
  it("plays a scripted leg: travel, resolve the encounter, rest — exit 0, no pack paths", () => {
    const run = runCli(["--commands", "look; go 1; press; journal; hash"]);
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Road encounter");
    expect(run.output).toMatch(/Took .* — \d+ min/);
    expect(run.output).toMatch(/^[0-9a-f]{64}$/m); // snapshot hash line
    expect(run.output).not.toMatch(/content[\\/]rpg|\.ya?ml/i);
  });

  it("prints the immediate road scene after an accepted travel decision", () => {
    const manifest = loadOverworldManifest(ROOT);
    const expectedSession = new OverworldSession(manifest);
    const expectedTravel = expectedSession.travel(expectedSession.view().exits[0]!.id);
    expect(expectedTravel.roadEvent).not.toBeNull();

    const run = runCli(["--commands", "go 1"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain(expectedTravel.roadEvent!.title);
    expect(run.output).toContain(expectedTravel.roadEvent!.summary);
  });

  it("exits 1 when a scripted command is rejected", () => {
    const run = runCli(["--commands", "definitely-not-a-command"]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("A scripted command was rejected.");
  });

  it("rejects positional arguments (no pack-path or selector surface)", () => {
    const run = runCli(["breaking_weir"]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("overworld takes no positional arguments");
  });
});
