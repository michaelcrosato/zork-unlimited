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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  render,
  renderEncounter,
  renderJourneyGate,
  renderJourneyStatus,
  renderQuestLaunch,
  matchJourneyGateOption,
  resolveQuestLaunchChoice,
} from "../../bin/overworld_play.js";
import { renderTerminalStoryChoiceDetail } from "../../bin/terminal_story_choice.js";
import { compactJourneyStoryChoiceComparison } from "../../src/mcp/journey_projection.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);

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

function outputSnapshotHashes(output: string): string[] {
  return output.match(/^[0-9a-f]{64}$/gm) ?? [];
}

function sessionAtFixedCheckpoint(): OverworldSession {
  const session = new OverworldSession(WORLD);
  while (session.journey().acceptedDecisions < session.journey().baselineDecisions) {
    const view = session.view();
    if (view.pendingRoadEncounter) session.resolveRoadEncounter("press_on");
    else session.travel(view.exits[0]!.id);
  }
  expect(session.journey().pendingChoice?.options.map((option) => option.id)).toEqual([
    "continue",
    "end",
  ]);
  return session;
}

function moveToArea(session: OverworldSession, destinationAreaId: string): void {
  if (session.view().currentArea?.id === destinationAreaId) return;
  const route = session
    .view()
    .areaExits.find((candidate) => candidate.destination.id === destinationAreaId);
  if (!route) throw new Error(`Expected a visible route to ${destinationAreaId}.`);
  session.moveArea(route.id);
}

function travelToTown(session: OverworldSession, destinationId: string): void {
  const road = session.view().exits.find((candidate) => candidate.destination.id === destinationId);
  if (!road) throw new Error(`Expected a visible road to ${destinationId}.`);
  session.travel(road.id);
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  expect(session.view().current.id).toBe(destinationId);
}

function sessionReturnedToAlbanyWithSaratogaJob(completed: boolean): {
  session: OverworldSession;
  jobTitle: string;
} {
  const session = new OverworldSession(WORLD);
  travelToTown(session, "saratoga_springs_city");
  session.scoutPoi("saratoga_springs_city__civic_core__poi");
  const job = session
    .view()
    .jobs.find((candidate) => candidate.id === "saratoga_springs_city__civic_core__job");
  if (!job) throw new Error("Expected Saratoga Springs civic work after scouting.");
  if (completed) session.workLocalJob(job.id);
  travelToTown(session, "albany_city");

  expect(session.view().discoveredJobIds).toContain(job.id);
  expect(session.view().completedJobIds.includes(job.id)).toBe(completed);
  return { session, jobTitle: job.title };
}

function sessionReturnedToAlbanyWithDuplicatePoughkeepsieJobs(): {
  session: OverworldSession;
  jobTitle: string;
  completedJobId: string;
  remoteJobId: string;
} {
  const session = new OverworldSession(WORLD);
  travelToTown(session, "kingston_city");
  travelToTown(session, "poughkeepsie_town");
  session.scoutPoi("poughkeepsie_town__civic_core__poi");
  const completedJobId = "poughkeepsie_town__civic_core__job";
  const completedJob = session.view().jobs.find((candidate) => candidate.id === completedJobId);
  if (!completedJob) throw new Error("Expected Poughkeepsie town civic work after scouting.");
  session.workLocalJob(completedJob.id);

  travelToTown(session, "lagrange_town");
  travelToTown(session, "poughkeepsie_city");
  session.scoutPoi("poughkeepsie_city__civic_core__poi");
  const remoteJobId = "poughkeepsie_city__civic_core__job";
  const remoteJob = session.view().jobs.find((candidate) => candidate.id === remoteJobId);
  if (!remoteJob) throw new Error("Expected Poughkeepsie city civic work after scouting.");

  travelToTown(session, "hyde_park_town");
  travelToTown(session, "albany_city");
  expect(session.view().completedJobIds).toContain(completedJobId);
  expect(session.view().discoveredJobIds).toContain(remoteJobId);
  expect(remoteJob.title).toBe(completedJob.title);
  return { session, jobTitle: completedJob.title, completedJobId, remoteJobId };
}

function sessionAtCompletedWolfGoal(): OverworldSession {
  const session = new OverworldSession(WORLD);
  const opening = session.view();
  session.scoutPoi(opening.pois[0]!.id);
  session.talkToCharacter(opening.characters[0]!.id);
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory("albany:relief_resident_shelter");
  const wolf = session.view().quests.find((candidate) => candidate.id === "wolf_winter");
  if (!wolf) throw new Error("Expected the certified Wolf-Winter lead.");
  session.startQuest(wolf.id, "albany:wolf_approach_sheltered_stockway");
  session.completeQuest(wolf.id, {
    endingId: "ending_held",
    endingTitle: "The Byre Held",
    death: false,
  });
  expect(session.journey().pendingChoice?.reasons).toContain("goal_completed");
  return session;
}

function sessionAtOpeningStation(): OverworldSession {
  const registration = WORLD.opening_registration;
  const oath = WORLD.opening_relief_oath;
  const source = WORLD.opening_lead_source;
  const preparation = WORLD.opening_preparation;
  if (!registration || !oath || !source || !preparation) {
    throw new Error("Albany must retain its opening Station flow.");
  }
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory(registration.profiles[0]!.id);
  session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(source.options[0]!.id);
  moveToArea(session, preparation.area);
  expect(session.view().departureInteractions.map((interaction) => interaction.id)).toContain(
    preparation.id,
  );
  return session;
}

function chooseNorthGoal(session: OverworldSession): void {
  session.chooseJourney("continue");
  expect(session.journey().storyChoice?.id).toBe("albany_dawn_dispatch");
  session.chooseJourneyStory("send_wagon_to_cade");
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

  it("renders a certified lead's exact local anchor route without a scout detour", () => {
    const session = new OverworldSession(WORLD);
    const rowan = session.view().characters[0];
    if (!rowan) throw new Error("Expected Rowan in Albany's opening area.");
    session.talkToCharacter(rowan.id);
    session.chooseJourneyStory("albany:ledger_advocate");
    session.chooseJourneyStory("albany:oath_limited_aid_only");
    session.chooseJourneyStory("albany:source_rowan_civic_docket");

    const wolf = session.view().quests.find((quest) => quest.id === "wolf_winter");
    if (!wolf) throw new Error("Expected the certified Wolf-Winter lead.");
    const route = session.view().areaExits.find((exit) => exit.destination.id === wolf.area);
    if (!route) throw new Error("Expected the certified lead's local anchor route.");

    const terminal = render(session.view());
    expect(terminal).toContain("Local routes:");
    expect(terminal).toContain(route.destination.name);
    expect(terminal).toContain("The Wolf-Winter");
    expect(terminal).not.toMatch(/market.*scout/i);
  });

  it("renders June's optional departure guidance without changing launch state", () => {
    const preparation = WORLD.opening_preparation;
    const ally = WORLD.opening_ally;
    if (!preparation || !ally) throw new Error("Albany must retain its Station ally flow.");
    const session = sessionAtOpeningStation();
    const beforeSnapshot = session.snapshot();
    const beforeDecisions = session.journey().acceptedDecisions;
    const lead = session.view().departureContactLeads[0];
    if (!lead) throw new Error("Expected June's optional departure lead.");

    const unavailable = render(session.view());
    expect(unavailable).toContain("Optional before departure:");
    expect(unavailable).toContain(ally.title);
    expect(unavailable).toContain(lead.guidance);
    expect(unavailable).toContain("Available after choosing a Station preparation.");
    expect(unavailable).not.toContain(`Command: talk ${lead.contactName}`);
    expect(session.snapshot()).toEqual(beforeSnapshot);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
    expect(session.view().questStarts).toContainEqual([
      ally.target_quest,
      WORLD.quests.find((quest) => quest.id === ally.target_quest)!.launch!.options[0]!.id,
    ]);

    session.chooseJourneyStory(preparation.profiles[0]!.id, preparation.id);
    const readySnapshot = session.snapshot();
    const readyDecisions = session.journey().acceptedDecisions;
    const readyLead = session.view().departureContactLeads[0];
    if (!readyLead) throw new Error("Expected June's ready departure lead.");
    const ready = render(session.view());
    expect(ready).toContain(`Command: talk ${readyLead.contactName}`);
    expect(ready).not.toContain("Available after choosing a Station preparation.");
    expect(session.snapshot()).toEqual(readySnapshot);
    expect(session.journey().acceptedDecisions).toBe(readyDecisions);
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
    expect(text).toContain("choose <number|name>");
    expect(text).toContain("choose 1 — Take the ridge");
    expect(text).toContain("Actual cost: 30 min, 1 supply, fatigue +25.");
    expect(text).toContain(
      "Projected arrival: Day 1, 08:30; 5 supplies remaining; fatigue 25; condition tired.",
    );
    expect(text).toContain("Commitment: The cattle will see the descent.");
    expect(text).toContain("Requires 2 supplies; you have 1.");
    expect(text).toContain("Projected time: Day 1, 09:15.");
    expect(text).not.toMatch(/knowledge_|memory_|return_summary|import:/i);

    const options = quest.launch.options;
    expect(resolveQuestLaunchChoice(options, "choose 2")).toMatchObject({
      kind: "resolved",
      option: { id: "test:stockway" },
    });
    expect(resolveQuestLaunchChoice(options, "2")).toMatchObject({
      kind: "resolved",
      option: { id: "test:stockway" },
    });
    expect(resolveQuestLaunchChoice(options, "Take the ridge")).toMatchObject({
      kind: "resolved",
      option: { id: "test:ridge" },
    });
    expect(resolveQuestLaunchChoice(options, "choose test:ridge")).toMatchObject({
      kind: "resolved",
      option: { id: "test:ridge" },
    });
    expect(
      resolveQuestLaunchChoice(
        [{ ...options[0]!, title: "  Take   the high road  " }],
        "choose take the high road",
      ),
    ).toMatchObject({ kind: "resolved", option: { id: "test:ridge" } });
    expect(resolveQuestLaunchChoice(options, "2 garbage")).toMatchObject({
      kind: "unmatched",
    });
    expect(resolveQuestLaunchChoice(options, "Take the")).toMatchObject({ kind: "unmatched" });
    expect(
      resolveQuestLaunchChoice(
        [options[0]!, { ...options[1]!, title: "  Take   the ridge  " }],
        "take the ridge",
      ),
    ).toMatchObject({ kind: "ambiguous" });
  });

  it("stages structured story choices as compact cards with exact inspect/choose commands", () => {
    const manifest = loadOverworldManifest(ROOT);
    const session = new OverworldSession(manifest);
    session.talkToCharacter(session.view().characters[0]!.id);
    const journey = session.journey();
    const story = journey.storyChoice;
    expect(story?.kind).toBe("registration");

    const text = renderJourneyGate(journey);
    expect(text).toContain("! Story choice comparison");
    for (const option of story!.options) {
      expect(text).toContain(option.label);
      expect(text).toContain(`Commitment: ${option.summary!.commitment}`);
      expect(text).toContain(`Field trigger: ${option.summary!.fieldTrigger}`);
      expect(text).toContain(
        `Immediate cost: ${option.summary!.immediateCost ?? "No separate immediate cost stated."}`,
      );
      expect(text).toContain(`Inspect: \`inspect ${option.id}\``);
      expect(text).toContain(`Choose: \`choose ${option.id}\``);
      expect(text).not.toContain(option.consequence);
    }

    const inspected = story!.options[1]!;
    const projected = compactJourneyStoryChoiceComparison(story!, inspected.id).inspectedOption;
    if (!projected) throw new Error("Expected one projected story-choice detail.");
    const detail = renderTerminalStoryChoiceDetail(story!, inspected);
    expect(detail).toContain(projected.consequence);
    expect(detail).toContain(`Choose: \`choose ${inspected.id}\``);
    expect(detail).toContain("Back: `back`");
    for (const sibling of story!.options.filter((option) => option.id !== inspected.id)) {
      expect(detail).not.toContain(sibling.consequence);
    }
  });

  it("labels categorized Station preparation summaries without changing legacy trigger labels", () => {
    const registration = WORLD.opening_registration;
    const oath = WORLD.opening_relief_oath;
    const source = WORLD.opening_lead_source;
    const preparation = WORLD.opening_preparation;
    if (!registration || !oath || !source || !preparation) {
      throw new Error("Albany must retain its opening preparation flow.");
    }
    const session = new OverworldSession(WORLD);
    session.scoutPoi(session.view().pois[0]!.id);
    session.talkToCharacter(registration.contact);
    session.chooseJourneyStory(registration.profiles[0]!.id);
    session.chooseJourneyStory(oath.options[0]!.id);
    session.chooseJourneyStory(source.options[0]!.id);
    moveToArea(session, preparation.area);
    const storyChoice = session.inspectJourneyStory(preparation.id);
    const text = renderJourneyGate({ ...session.journey(), storyChoice });

    for (const option of storyChoice.options) {
      expect(option.summary?.fieldTriggerScope).toBe("category");
      expect(text).toContain(`Purpose: ${option.summary!.commitment}`);
      expect(text).toContain(`Trigger category: ${option.summary!.fieldTrigger}`);
      expect(text).not.toContain(`Commitment: ${option.summary!.commitment}`);
      expect(text).not.toContain(`Field trigger: ${option.summary!.fieldTrigger}`);
    }

    const inspected = storyChoice.options[0]!;
    const projected = compactJourneyStoryChoiceComparison(
      storyChoice,
      inspected.id,
    ).inspectedOption;
    if (!projected?.summary) throw new Error("Expected projected Station detail.");
    const detail = renderTerminalStoryChoiceDetail(storyChoice, inspected);
    expect(detail.split(projected.summary.commitment)).toHaveLength(2);
    expect(detail.split(projected.summary.fieldTrigger)).toHaveLength(2);
    expect(detail.split(projected.summary.immediateCost!)).toHaveLength(2);
    expect(detail).toContain(projected.consequence);
  });

  it("rejects an ambiguous shared-prefix journey label instead of silently taking the first", () => {
    const options = [
      { id: "send_cade", label: "Send the wagon to Cade" },
      { id: "send_albany", label: "Send the wagon to Albany" },
    ];
    expect(matchJourneyGateOption(options, "Send the wagon")).toBeNull();
    expect(matchJourneyGateOption(options, "send the wagon to albany")).toEqual(options[1]);
    expect(matchJourneyGateOption(options, "2")).toEqual(options[1]);
    expect(matchJourneyGateOption(options, "send_albany")).toEqual(options[1]);
  });

  it("renders the authoritative active goal, guidance, and complete passage forecast", () => {
    const session = sessionAtCompletedWolfGoal();
    chooseNorthGoal(session);
    const journey = session.journey();
    const passage = journey.goalPassage;
    expect(passage).not.toBeNull();

    const text = renderJourneyStatus(journey);
    expect(text).toContain(`Goal [${journey.goal.status}]: ${journey.goal.text}`);
    expect(text).toContain(`Guidance: ${journey.goalGuidance}`);
    expect(text).toContain(`Goal passage: ${passage!.label}`);
    expect(text).toContain(`${String(passage!.roadCount)} roads`);
    expect(text).toContain(`${String(passage!.baseMinutes)} road min`);
    expect(text).toContain(`${String(passage!.estimatedMinutes)} min estimated`);
    expect(text).toContain(`Consequence: ${passage!.consequence}`);
    expect(text).toContain(`Stop rule: ${passage!.stopRule}`);
    expect(text).toContain("Action: `follow goal`");
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

  it("holds Rowan's mandatory registration cascade until the player chooses each stage", () => {
    const run = runCli([
      "--commands",
      "talk rowan; choose 1; choose 2; choose Leave on Rowan's Civic Docket; hash",
    ]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Road-Warden Relief Hand");
    expect(run.output).toContain("Negotiate Aid-Only Duty");
    expect(run.output).toContain("Leave on Rowan's Civic Docket");
    expect(run.output).toContain("Chosen: Road-Warden Relief Hand.");
    expect(run.output).toContain("Chosen: Negotiate Aid-Only Duty.");
    expect(run.output).toContain("Chosen: Leave on Rowan's Civic Docket.");
    expect(run.output).toMatch(/^[0-9a-f]{64}$/m);
  });

  it("restates local goal guidance when follow goal has no road passage", () => {
    const run = runCli(["--commands", "talk rowan; choose 1; choose 2; choose 1; follow goal"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain(
      "Guidance: Complete one Albany quest to satisfy this goal. Jobs, events, and sites may reveal leads, but do not finish the goal themselves.",
    );
    expect(run.output).toContain(
      "No road passage is available from here. Follow the visible local guidance above.",
    );
    expect(run.output).not.toContain("There is no current goal passage to follow from here.");
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("blocks ordinary actions at a story gate with an actionable choose command", () => {
    const run = runCli(["--commands", "talk rowan; follow goal"]);

    expect(run.status).toBe(1);
    expect(run.output).toContain("Choose the active journey prompt first");
    expect(run.output).toContain("inspect <id>");
    expect(run.output).toContain("choose <id>");
    expect(run.output).not.toContain("Goal passage stop:");
  });

  it("accepts actions as the same read-only help command in free roam and at a story gate", () => {
    const run = runCli(["--commands", "actions; talk rowan; actions"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output.match(/Commands:/g)?.length ?? 0).toBe(2);
    expect(run.output).toContain("actions · help · quit");
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("keeps journal and travel-log inspection read-only inside one stable comparison", () => {
    const run = runCli(["--commands", "talk rowan; journal; log"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("The Wolf-Winter Civic docket");
    expect(run.output).toContain("No roads travelled yet.");
    expect(run.output.match(/! Story choice comparison/g)?.length ?? 0).toBe(1);
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("keeps one active comparison while look restates only world and goal status", () => {
    const run = runCli(["--commands", "talk rowan; look; quit"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output.match(/! Story choice comparison/g)?.length ?? 0).toBe(1);
    expect(run.output).toContain("--- Journey ---");
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("keeps mandatory inspect, back, cancel, and malformed selectors state-neutral", () => {
    const baseline = new OverworldSession(WORLD);
    const contact = baseline.view().characters[0];
    const registration = WORLD.opening_registration;
    if (!contact || !registration) throw new Error("Expected Albany registration.");
    baseline.talkToCharacter(contact.id);
    const option = registration.profiles[0]!;
    const baselineHash = baseline.snapshotHash();

    const neutral = runCli([
      "--commands",
      `talk ${contact.name}; hash; inspect ${option.id}; back; hash; cancel; hash`,
    ]);
    expect(neutral.status, neutral.output).toBe(0);
    expect(outputSnapshotHashes(neutral.output)).toEqual([
      baselineHash,
      baselineHash,
      baselineHash,
    ]);
    expect(neutral.output).toContain(`! Story choice detail — ${option.title}`);
    expect(neutral.output).toContain("This story choice is mandatory.");
    expect(neutral.output).toContain("Back to the story choice comparison");
    expect(neutral.output.match(/! Story choice comparison/g)?.length ?? 0).toBe(1);

    const malformed = runCli([
      "--commands",
      `talk ${contact.name}; hash; inspect ${option.id} extra; hash`,
    ]);
    expect(malformed.status).toBe(1);
    expect(outputSnapshotHashes(malformed.output)).toEqual([baselineHash, baselineHash]);
    expect(malformed.output).toContain("Inspect an exact option id");
  });

  it("makes choosing after mandatory detail hash-identical to a direct API choice", () => {
    const expected = new OverworldSession(WORLD);
    const contact = expected.view().characters[0];
    const registration = WORLD.opening_registration;
    if (!contact || !registration) throw new Error("Expected Albany registration.");
    expected.talkToCharacter(contact.id);
    const option = registration.profiles[1]!;
    expected.chooseJourneyStory(option.id, registration.id);

    const inspected = runCli([
      "--commands",
      `talk ${contact.name}; inspect ${option.id}; choose ${option.id}; hash`,
    ]);
    expect(inspected.status, inspected.output).toBe(0);
    expect(outputSnapshotHashes(inspected.output)).toEqual([expected.snapshotHash()]);
    expect(inspected.output).toContain(`! Story choice detail — ${option.title}`);
    expect(inspected.output).toContain(`Chosen: ${option.title}.`);
  });

  it("rejects missing and malformed loads inside a mandatory comparison without losing state", () => {
    const baseline = new OverworldSession(WORLD);
    const contact = baseline.view().characters[0];
    if (!contact) throw new Error("Expected Albany registration contact.");
    baseline.talkToCharacter(contact.id);
    const baselineHash = baseline.snapshotHash();
    const missingName = "terminal-choice-missing";
    const malformedName = "terminal-choice-malformed";
    const missingPath = join(ROOT, "saves", `${missingName}.json`);
    const malformedPath = join(ROOT, "saves", `${malformedName}.json`);
    mkdirSync(join(ROOT, "saves"), { recursive: true });
    rmSync(missingPath, { force: true });
    writeFileSync(malformedPath, "{ this is not a journey snapshot");

    try {
      for (const [name, expectedMessage] of [
        [missingName, "ENOENT"],
        [malformedName, "JSON"],
      ] as const) {
        const run = runCli(["--commands", `talk ${contact.name}; hash; load ${name}; hash`]);
        expect(run.status).toBe(1);
        expect(outputSnapshotHashes(run.output)).toEqual([baselineHash, baselineHash]);
        expect(run.output).toContain("Could not continue:");
        expect(run.output).toContain(expectedMessage);
        expect(run.output).toContain("A scripted command was rejected.");
        expect(run.output.match(/! Story choice comparison/g)?.length ?? 0).toBe(2);
        expect(run.output).not.toContain("Restored ");
        expect(run.output).not.toMatch(/\n\s+at\s/);
      }
    } finally {
      rmSync(missingPath, { force: true });
      rmSync(malformedPath, { force: true });
    }
  });

  it("stages optional Station comparison/detail and preserves direct-choice state parity", () => {
    const stationed = sessionAtOpeningStation();
    const preparation = WORLD.opening_preparation;
    if (!preparation) throw new Error("Expected Station preparation.");
    const option = preparation.profiles[0]!;
    const expected = OverworldSession.restore(WORLD, stationed.snapshot());
    expected.chooseJourneyStory(option.id, preparation.id);

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-staged-optional-"));
    const snapshotPath = join(temp, "station.json");
    writeFileSync(snapshotPath, JSON.stringify(stationed.snapshot()));
    try {
      expect(render(stationed.view())).toContain("Optional departure decisions:");
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        `look; inspect ${preparation.id}; inspect ${option.id}; back; choose ${option.id}; hash`,
      ]);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain(`Compare: \`inspect ${preparation.id}\``);
      expect(run.output).toContain(`Inspect: \`inspect ${option.id}\``);
      expect(run.output).toContain(`! Story choice detail — ${option.title}`);
      expect(run.output.match(/! Story choice comparison/g)?.length ?? 0).toBe(1);
      expect(outputSnapshotHashes(run.output)).toEqual([expected.snapshotHash()]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("keeps cancelling an optional Station comparison hash-neutral", () => {
    const stationed = sessionAtOpeningStation();
    const preparation = WORLD.opening_preparation;
    if (!preparation) throw new Error("Expected Station preparation.");
    const baselineHash = stationed.snapshotHash();

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-staged-cancel-"));
    const snapshotPath = join(temp, "station.json");
    writeFileSync(snapshotPath, JSON.stringify(stationed.snapshot()));
    try {
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        `hash; inspect ${preparation.id}; cancel; hash`,
      ]);
      expect(run.status, run.output).toBe(0);
      expect(outputSnapshotHashes(run.output)).toEqual([baselineHash, baselineHash]);
      expect(run.output).toContain("Story comparison closed without changing the journey.");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("labels the discovered Winter Return Docket as future work and explains failed work truthfully", () => {
    const run = runCli([
      "--commands",
      "talk rowan; choose 1; choose 2; choose 1; work winter return",
    ]);

    expect(run.status).toBe(1);
    expect(run.output).toContain(
      "future job (currently unavailable): Rowan's Winter Return Docket",
    );
    expect(run.output).not.toContain("new job: Rowan's Winter Return Docket");
    expect(run.output).toContain("discovered future work but currently unavailable");
    expect(run.output).toContain("conditions are hidden or unmet");
  });

  it("reports a completed discovered job as complete instead of hidden future work", () => {
    const { session, jobTitle } = sessionReturnedToAlbanyWithSaratogaJob(true);
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-completed-job-"));
    const snapshotPath = join(temp, "completed-job.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    try {
      const run = runCli(["--restore", snapshotPath, "--commands", `work ${jobTitle}`]);

      expect(run.status).toBe(1);
      expect(run.output).toContain(`${jobTitle} is already complete.`);
      expect(run.output).not.toContain("future work");
      expect(run.output).not.toContain("hidden or unmet");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("directs discovered work in another town back there instead of calling it future work", () => {
    const { session, jobTitle } = sessionReturnedToAlbanyWithSaratogaJob(false);
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-remote-job-"));
    const snapshotPath = join(temp, "remote-job.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    try {
      const run = runCli(["--restore", snapshotPath, "--commands", `work ${jobTitle}`]);

      expect(run.status).toBe(1);
      expect(run.output).toContain(
        `${jobTitle} is discovered in Saratoga Springs city; travel there before working it.`,
      );
      expect(run.output).not.toContain("future work");
      expect(run.output).not.toContain("hidden or unmet");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects duplicate discovered job titles and lets exact ids disambiguate status", () => {
    const { session, jobTitle, completedJobId, remoteJobId } =
      sessionReturnedToAlbanyWithDuplicatePoughkeepsieJobs();
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-ambiguous-job-"));
    const snapshotPath = join(temp, "ambiguous-job.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    try {
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        `work ${jobTitle}; work ${completedJobId}; work ${remoteJobId}`,
      ]);

      expect(run.status).toBe(1);
      expect(run.output).toContain(
        `More than one discovered job matches "${jobTitle.toLowerCase()}"`,
      );
      expect(run.output).toContain(`${completedJobId} (Poughkeepsie town)`);
      expect(run.output).toContain(`${remoteJobId} (Poughkeepsie city)`);
      expect(run.output).toContain("Use an exact job id.");
      expect(run.output).toContain(`${jobTitle} is already complete.`);
      expect(run.output).toContain(
        `${jobTitle} is discovered in Poughkeepsie city; travel there before working it.`,
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("restores a pending Continue/End gate without auto-picking and keeps safe commands usable", () => {
    const session = sessionAtFixedCheckpoint();
    const pending = session.journey().pendingChoice;

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-gate-"));
    const snapshotPath = join(temp, "pending.json");
    const savedPath = join(ROOT, "saves", "cli-journey-gate-test.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    rmSync(savedPath, { force: true });
    try {
      const blocked = runCli(["--restore", snapshotPath, "--commands", "follow goal"]);
      expect(blocked.status).toBe(1);
      expect(blocked.output).toContain("Choose the active journey prompt first");
      expect(blocked.output).not.toContain("Goal passage stop:");

      const continued = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        "look; help; hash; save cli-journey-gate-test; choose 1",
      ]);
      expect(continued.status, continued.output).toBe(0);
      expect(continued.output).toContain(pending!.message);
      for (const option of pending!.options) {
        expect(continued.output).toContain(option.label);
        expect(continued.output).toContain(option.consequence);
      }
      expect(continued.output).toContain(`Chosen: ${pending!.options[0].label}.`);
      expect(continued.output).toMatch(/^[0-9a-f]{64}$/m);
      expect(existsSync(savedPath)).toBe(true);

      const ended = runCli(["--restore", snapshotPath, "--commands", "choose End this journey"]);
      expect(ended.status, ended.output).toBe(0);
      expect(ended.output).toContain("Chosen: End this journey.");
      expect(ended.output).toContain("Journey ended — this journey is read-only.");

      const quit = runCli(["--restore", snapshotPath, "--commands", "hash; quit"]);
      expect(quit.status, quit.output).toBe(0);
      expect(quit.output).toMatch(/^[0-9a-f]{64}$/m);
    } finally {
      rmSync(savedPath, { force: true });
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("restores an ended journey as a truthful read-only receipt instead of a live town", () => {
    const session = sessionAtFixedCheckpoint();
    const receipt = session.chooseJourney("end").exitReceipt;
    expect(receipt).not.toBeNull();
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-ended-"));
    const snapshotPath = join(temp, "ended.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    try {
      const run = runCli(["--restore", snapshotPath, "--commands", "go 1"]);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("Journey ended — this journey is read-only.");
      expect(run.output).toContain("truthful exit receipt is preserved for review");
      expect(run.output).toContain(receipt!.receiptHash);
      expect(run.output).not.toContain("Resumed in");
      expect(run.output).not.toContain("Roads:");
      expect(run.output).not.toContain("Took ");
      expect(run.output).not.toContain("A scripted command was rejected.");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("keeps the Queensbury objective visible after Wolf choices and follows it to the northbound encounter", () => {
    const completed = sessionAtCompletedWolfGoal();
    const snapshot = completed.snapshot();
    const expected = OverworldSession.restore(WORLD, snapshot);
    chooseNorthGoal(expected);
    const expectedJourney = expected.journey();
    const expectedPassage = expectedJourney.goalPassage;
    if (!expectedPassage || !expectedJourney.goalGuidance) {
      throw new Error("Expected the visible Queensbury passage and guidance.");
    }
    const expectedFollow = expected.followGoalPassage();
    const expectedEncounter = expected.view().pendingRoadEncounter;
    expect(expectedFollow.stopReason).toBe("road_encounter");
    expect(expectedFollow.stoppedAt).toBe("Saratoga Springs city");
    expect(expectedEncounter).not.toBeNull();

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-north-goal-"));
    const snapshotPath = join(temp, "wolf-complete.json");
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    try {
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        "choose continue; choose Send the wagon back to Cade; look; follow goal",
      ]);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("Queensbury town");
      expect(run.output).toContain("Hedrick Cradoc");
      expect(run.output).toContain(expectedJourney.goalGuidance);
      expect(run.output).toContain("Saratoga Springs city");
      expect(run.output).toContain(expectedPassage.label);
      expect(run.output).toContain("Action: `follow goal`");
      expect(run.output).toContain(
        `Goal passage stop: road_encounter at ${expectedFollow.stoppedAt}.`,
      );
      expect(run.output).toContain(expectedEncounter!.event.title);
      expect(run.output).toContain(expectedEncounter!.event.summary);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
