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
  renderDepartureRecap,
  renderDepartureRecapTerms,
  renderEncounter,
  renderJourneyGate,
  renderJourneyStatus,
  renderQuestLaunch,
  routeLabelWithDestination,
  renderStationDispatchBoard,
  matchJourneyGateOption,
  resolveQuestLaunchChoice,
} from "../../bin/overworld_play.js";
import { renderTerminalStoryChoiceDetail } from "../../bin/terminal_story_choice.js";
import { compactJourneyStoryChoiceComparison } from "../../src/mcp/journey_projection.js";
import { EMBEDDED_QUEST_CONTINUITY_EXPLANATION } from "../../src/rpg/embedded_quest_character_continuity.js";
import { OverworldSession } from "../../src/world/session.js";
import type { OverworldQuestView } from "../../src/world/session_local_discovery.js";
import { OVERWORLD_CONTENT_HASH_MISMATCH_WARNING } from "../../src/world/session_snapshot_restore.js";
import { loadOverworldManifest } from "../../src/world/source.js";
import { revealCurrentJourneyStoryOptions } from "./support/journey_story.js";

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
  revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
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
  revealCurrentJourneyStoryOptions(session, oath.id);
  session.chooseJourneyStory(oath.options[0]!.id);
  session.chooseJourneyStory(source.options[0]!.id);
  moveToArea(session, preparation.area);
  expect(session.view().departureInteractions.map((interaction) => interaction.id)).toContain(
    preparation.id,
  );
  return session;
}

function sessionWithResolvedStationChoices(): OverworldSession {
  const preparation = WORLD.opening_preparation;
  const allocation = WORLD.opening_relief_allocation;
  if (!preparation || !allocation) {
    throw new Error("Albany must retain both optional Station decisions.");
  }
  const session = sessionAtOpeningStation();
  session.chooseJourneyStory(preparation.profiles[0]!.id, preparation.id);
  session.chooseJourneyStory(allocation.options[0]!.id, allocation.id);
  return session;
}

function chooseNorthGoal(session: OverworldSession): void {
  session.chooseJourney("continue");
  expect(session.journey().storyChoice?.id).toBe("albany_dawn_dispatch");
  session.chooseJourneyStory("send_wagon_to_cade");
}

describe("overworld_play render (pure, same session the UI/MCP drive)", () => {
  it("does not repeat a destination already present in an authored route label", () => {
    expect(
      routeLabelWithDestination(
        "Albany Market Streets to Albany Station Quarter",
        "Albany Station Quarter",
      ),
    ).toBe("Albany Market Streets to Albany Station Quarter");
    expect(routeLabelWithDestination("cobbled incline", "Station Quarter")).toBe(
      "cobbled incline to Station Quarter",
    );
  });

  it("renders the fresh-session status from OverworldSession.view()", () => {
    const manifest = loadOverworldManifest(ROOT);
    const session = new OverworldSession(manifest);
    const view = session.view();
    const text = render(view);
    expect(text).toContain(view.current.name);
    expect(text).toContain(`Supplies ${view.supplies}/${view.maxSupplies}`);
    expect(text).toContain("Roads:");
    expect(text).toContain("Roads:\n  Travel with `go <road number>` (for example, `go 1`).");
    expect(text).not.toMatch(/\.ya?ml/i); // public surface: no pack paths
  });

  it("omits the road heading and command hint when there are no exits", () => {
    const session = new OverworldSession(WORLD);
    const text = render({ ...session.view(), exits: [] });
    expect(text).not.toContain("Roads:");
    expect(text).not.toContain("Travel with `go <road number>` (for example, `go 1`).");
  });

  it("renders a certified lead's exact local anchor route without a scout detour", () => {
    const session = new OverworldSession(WORLD);
    const rowan = session.view().characters[0];
    if (!rowan) throw new Error("Expected Rowan in Albany's opening area.");
    session.talkToCharacter(rowan.id);
    session.chooseJourneyStory("albany:ledger_advocate");
    revealCurrentJourneyStoryOptions(session, WORLD.opening_relief_oath!.id);
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

  it("inlines each live Station support command and removes it as that row closes", () => {
    const preparation = WORLD.opening_preparation;
    const allocation = WORLD.opening_relief_allocation;
    const ally = WORLD.opening_ally;
    if (!preparation || !allocation || !ally) {
      throw new Error("Albany must retain its Station support flow.");
    }
    const session = sessionAtOpeningStation();
    const beforeSnapshot = session.snapshot();
    const beforeDecisions = session.journey().acceptedDecisions;
    const initialBoard = session.view().stationDispatchBoard;
    const initialFieldTeam = initialBoard?.support.find((support) => support.slot === "field_team");
    if (initialFieldTeam?.action?.kind !== "talk") {
      throw new Error("Expected the Station board's field-team talk handle.");
    }

    const readyBeforePreparation = render(session.view());
    expect(readyBeforePreparation).toContain("The Wolf-Winter field briefing:");
    expect(readyBeforePreparation).toContain("Depart now:");
    expect(readyBeforePreparation).toContain("Optional support (`review support` for details):");
    expect(readyBeforePreparation).toContain(
      `Optionally choose one field kit for a specific danger at Cade's farm. \`inspect ${preparation.id}\``,
    );
    expect(readyBeforePreparation).toContain(
      `Optionally assign Albany's last wagon to one of three needs. The other two go without it. \`inspect ${allocation.id}\``,
    );
    expect(readyBeforePreparation).toContain(
      `Optionally ask June to manage cattle safety, or travel alone. \`talk ${initialFieldTeam.action.contactName}\``,
    );
    expect(readyBeforePreparation.indexOf("Depart now:")).toBeLessThan(
      readyBeforePreparation.indexOf("Optional support (`review support`"),
    );
    expect(readyBeforePreparation).not.toContain("One field kit: Field kit:");
    expect(readyBeforePreparation).not.toContain("relief wagon: Relief wagon:");
    expect(readyBeforePreparation).not.toContain("Second rider: Second rider:");
    const expandedBeforePreparation = renderStationDispatchBoard(session.view()).join("\n");
    expect(expandedBeforePreparation).toContain(
      "Optional support — field kit, relief wagon, or second rider:",
    );
    expect(expandedBeforePreparation).toContain("June Pike, second rider");
    expect(expandedBeforePreparation).toContain(
      `Talk to ${initialFieldTeam.action.contactName}: \`talk ${initialFieldTeam.action.contactName}\``,
    );
    expect(session.snapshot()).toEqual(beforeSnapshot);
    expect(session.journey().acceptedDecisions).toBe(beforeDecisions);
    expect(session.view().questStarts).toContainEqual([
      ally.target_quest,
      WORLD.quests.find((quest) => quest.id === ally.target_quest)!.launch!.options[0]!.id,
    ]);

    session.chooseJourneyStory(preparation.profiles[0]!.id, preparation.id);
    const readySnapshot = session.snapshot();
    const readyDecisions = session.journey().acceptedDecisions;
    const readyBoard = session.view().stationDispatchBoard;
    const readyFieldTeam = readyBoard?.support.find((support) => support.slot === "field_team");
    if (readyFieldTeam?.action?.kind !== "talk") {
      throw new Error("Expected the ready Station board talk handle.");
    }
    const ready = render(session.view());
    expect(ready).not.toContain(`\`inspect ${preparation.id}\``);
    expect(ready).toContain(`\`inspect ${allocation.id}\``);
    expect(ready).toContain(`\`talk ${readyFieldTeam.action.contactName}\``);
    const preparedBoard = renderStationDispatchBoard(session.view()).join("\n");
    expect(preparedBoard).toContain("Optional support — relief wagon or second rider:");
    expect(preparedBoard).not.toContain("One field kit —");
    expect(preparedBoard).toContain(
      `Talk to ${readyFieldTeam.action.contactName}: \`talk ${readyFieldTeam.action.contactName}\``,
    );
    expect(session.view().stationDispatchBoard?.guidance).toBe(
      "You can leave now. Set: background, Wolf-Winter promise, report, and field kit. Optional: one relief wagon or second rider. They affect support, costs, or later results, not your field plan.",
    );
    expect(session.snapshot()).toEqual(readySnapshot);
    expect(session.journey().acceptedDecisions).toBe(readyDecisions);

    session.chooseJourneyStory(allocation.options[0]!.id, allocation.id);
    const allocated = render(session.view());
    expect(allocated).not.toContain(`\`inspect ${preparation.id}\``);
    expect(allocated).not.toContain(`\`inspect ${allocation.id}\``);
    expect(allocated).toContain(`\`talk ${readyFieldTeam.action.contactName}\``);

    session.talkToCharacter(ally.contact);
    session.chooseJourneyStory(ally.options[0]!.id);
    const allied = render(session.view());
    expect(allied).not.toContain(`\`inspect ${preparation.id}\``);
    expect(allied).not.toContain(`\`inspect ${allocation.id}\``);
    expect(allied).not.toContain(`\`talk ${readyFieldTeam.action.contactName}\``);
    expect(allied).not.toContain("Optional support (`review support`");
    expect(allied).toContain("Current plan: `review dispatch`.");
    expect(renderStationDispatchBoard(session.view())).toEqual([
      "No optional support remains.",
      "  Review your current plan: `review dispatch`.",
    ]);
    expect(session.view().stationDispatchBoard?.guidance).toBe(
      "You can leave now. Set: background, Wolf-Winter promise, report, field kit, relief wagon, and riding choice. No optional support remains.",
    );
  });

  it("keeps the bounded dispatch recall behind the launch-first Station summary", () => {
    const session = sessionAtOpeningStation();
    const recap = session.view().departureRecap;
    if (!recap) throw new Error("Expected authenticated Station recall.");
    const bounded = renderDepartureRecap(recap).join("\n");
    const terms = renderDepartureRecapTerms(recap).join("\n");
    const rendered = render(session.view());

    expect(rendered).toContain("Depart now:");
    expect(rendered).toContain("Optional support (`review support` for details):");
    expect(rendered).toContain("Current plan: `review dispatch`.");
    expect(rendered).not.toContain(bounded);
    expect(bounded).toContain(`${recap.questTitle} departure plan:`);
    expect(bounded).toContain("Review all choices and costs: `review dispatch`.");
    for (const entry of recap.entries) {
      if (!entry.activeFieldTerm) continue;
      expect(bounded).not.toContain(entry.activeFieldTerm);
      expect(terms).toContain(`Effect: ${entry.activeFieldTerm}`);
    }
    expect(bounded).not.toContain("Roads:");
    expect(bounded).not.toContain("Supplies ");
    expect(bounded).not.toContain("Local routes:");
    expect(bounded).not.toContain("Contacts:");
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
    expect(text).toContain(EMBEDDED_QUEST_CONTINUITY_EXPLANATION);
    expect(text.indexOf(EMBEDDED_QUEST_CONTINUITY_EXPLANATION)).toBeLessThan(
      text.indexOf("choose 1 — Take the ridge"),
    );
    expect(text).toContain("choose <number|name>");
    expect(text).toContain("choose 1 — Take the ridge");
    expect(text).toContain("Cost: 30 min, 1 supply, fatigue +25.");
    expect(text).toContain("Arrival: Day 1, 08:30; 5 supplies left; fatigue 25; condition tired.");
    expect(text).toContain("If chosen: The cattle will see the descent.");
    expect(text).toContain("Requires 2 supplies; you have 1.");
    expect(text).toContain("Arrival time: Day 1, 09:15.");
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
    expect(text).toContain("! Compare choices");
    for (const option of story!.options) {
      expect(text).toContain(option.label);
      expect(option.summary).toMatchObject({
        commitment: expect.stringMatching(/^Permanent background — /u),
        highlights: [expect.objectContaining({ label: "Starts with" })],
      });
      expect(option.summary).not.toHaveProperty("fieldTrigger");
      expect(option.summary).not.toHaveProperty("fieldTriggerScope");
      expect(text).toContain(`Background: ${option.summary!.commitment}`);
      for (const highlight of option.summary!.highlights ?? []) {
        expect(text).toContain(`${highlight.label}: ${highlight.value}`);
      }
      expect(text).toContain(`Cost: ${option.summary!.immediateCost}`);
      expect(text).toContain(`Return obligation: ${option.summary!.tradeoff}`);
      expect(JSON.stringify(option.summary)).not.toMatch(/\b(?:DEF|import|fieldTrigger)\b/i);
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

  it("renders the dawn dispatch as a locked preview while Continue and End remain the only commands", () => {
    const session = sessionAtCompletedWolfGoal();
    const journey = session.journey();
    const preview = journey.pendingChoice?.continuationPreview;
    if (!preview) throw new Error("Expected locked Albany dawn dispatch preview.");

    const text = renderJourneyGate(journey);
    expect(text).toContain("If you continue, this choice comes next:");
    expect(text).toContain("You cannot choose these yet. Choose Continue or End first.");
    for (const option of preview.options) {
      expect(text).toContain(`[locked] ${option.label}`);
      expect(text).toContain(option.consequence);
      expect(text).not.toContain(`choose ${option.id}`);
    }
    expect(journey.pendingChoice?.options.map((option) => option.id)).toEqual(["continue", "end"]);
  });

  it("labels Station preparation summaries as roleplay-first receipts", () => {
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
    revealCurrentJourneyStoryOptions(session, oath.id);
    session.chooseJourneyStory(oath.options[0]!.id);
    session.chooseJourneyStory(source.options[0]!.id);
    moveToArea(session, preparation.area);
    const storyChoice = session.inspectJourneyStory(preparation.id);
    const text = renderJourneyGate({ ...session.journey(), storyChoice });

    for (const option of storyChoice.options) {
      expect(option.summary).not.toHaveProperty("fieldTrigger");
      expect(option.summary).not.toHaveProperty("fieldTriggerScope");
      expect(text).toContain(`Field kit: ${option.summary!.commitment}`);
      expect(text).not.toContain(`Check fit: ${option.summary!.checkFit}`);
      expect(text).toContain(`Check skill: ${option.summary!.checkFit}`);
      expect(text.split(option.summary!.checkFit!)).toHaveLength(2);
      expect(text).toContain(`Cost: ${option.summary!.immediateCost}`);
      expect(text).toContain(`Give up: ${option.summary!.tradeoff}`);
      expect(text).not.toContain(`Purpose: ${option.summary!.commitment}`);
      expect(text).not.toContain(`Commitment: ${option.summary!.commitment}`);
      expect(text).not.toContain("Trigger category:");
      expect(text).not.toContain("Field trigger:");
    }

    const inspected = storyChoice.options[0]!;
    const projected = compactJourneyStoryChoiceComparison(
      storyChoice,
      inspected.id,
    ).inspectedOption;
    if (!inspected.summary) throw new Error("Expected structured Station detail.");
    const detail = renderTerminalStoryChoiceDetail(storyChoice, inspected);
    expect(detail).toContain(`Field kit: ${inspected.summary.commitment}`);
    expect(detail).not.toContain("Promise / priority:");
    expect(detail.split(inspected.summary.commitment)).toHaveLength(2);
    expect(detail).not.toContain(inspected.summary.checkFit!);
    expect(detail.split(inspected.summary.immediateCost)).toHaveLength(2);
    expect(detail.split(inspected.summary.tradeoff)).toHaveLength(2);
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
    expect(text).toContain(`Route to goal: ${passage!.label}`);
    expect(text).toContain(`Route: ${String(passage!.roadCount)} roads`);
    expect(text).toContain(`${String(passage!.baseMinutes)} min without delays`);
    expect(text).toContain(`${String(passage!.estimatedMinutes)} min estimated`);
    expect(text).toContain(`Result: ${passage!.consequence}`);
    expect(text).toContain(`Stops when: ${passage!.stopRule}`);
    expect(text).toContain("Travel: `follow goal`");
  });
});

describe("overworld_play CLI (scripted mode)", () => {
  it("prints content-revision warnings for startup restore and in-session load", () => {
    const snapshot = new OverworldSession(WORLD).snapshot();
    snapshot.worldHash = "0".repeat(64);
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-content-warning-"));
    const snapshotPath = join(temp, "content-revision.json");
    const saveName = "d10-content-revision-warning";
    const loadPath = join(ROOT, "saves", `${saveName}.json`);
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    mkdirSync(join(ROOT, "saves"), { recursive: true });
    writeFileSync(loadPath, JSON.stringify(snapshot));
    try {
      const restored = runCli(["--restore", snapshotPath, "--commands", "quit"]);
      expect(restored.status, restored.output).toBe(0);
      expect(restored.output).toContain(`Warning: ${OVERWORLD_CONTENT_HASH_MISMATCH_WARNING}`);

      const loaded = runCli(["--commands", `load ${saveName}; quit`]);
      expect(loaded.status, loaded.output).toBe(0);
      expect(loaded.output).toContain(`Warning: ${OVERWORLD_CONTENT_HASH_MISMATCH_WARNING}`);
      expect(loaded.output).toContain(`Restored ${join("saves", `${saveName}.json`)}.`);
    } finally {
      rmSync(temp, { recursive: true, force: true });
      rmSync(loadPath, { force: true });
    }
  });

  it("uses an executable start command and read-only support review for the promoted Station launch preview", () => {
    const stationed = sessionAtOpeningStation();
    const baselineHash = stationed.snapshotHash();
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-launch-first-"));
    const snapshotPath = join(temp, "station.json");
    writeFileSync(snapshotPath, JSON.stringify(stationed.snapshot()));
    try {
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        "look; review support; review dispatch; start The Wolf-Winter; cancel; hash",
      ]);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("Depart now:");
      expect(run.output).toContain("Start with `start The Wolf-Winter`, then choose a route.");
      expect(run.output).toContain("The Wolf-Winter choices, costs, and effects:");
      expect(run.output).toContain("Optional support (`review support` for details):");
      expect(run.output).toContain("June Pike, second rider");
      expect(run.output).toContain("Talk to June Pike: `talk June Pike`");
      expect(run.output).toContain(
        `Effect: ${stationed.view().departureRecap!.entries[0]!.activeFieldTerm!}`,
      );
      expect(run.output.indexOf("Depart now:")).toBeLessThan(
        run.output.indexOf("Optional support — field kit, relief wagon, or second rider:"),
      );
      expect(run.output).toContain("Current plan: `review dispatch`.");
      expect(run.output).not.toContain("The Wolf-Winter departure plan:");
      expect(run.output).not.toContain("A scripted command was rejected.");
      expect(outputSnapshotHashes(run.output)).toEqual([baselineHash]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

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
      "talk rowan; choose albany:road_warden; customize; choose albany:oath_limited_aid_only; choose Use Rowan's Public Report; hash",
    ]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Road Warden");
    expect(run.output).toContain("Accept Aid-Only Terms");
    expect(run.output).toContain("Use Rowan's Public Report");
    expect(run.output).toContain("Chosen: Road Warden.");
    expect(run.output).toContain("Chosen: Accept Aid-Only Terms.");
    expect(run.output).toContain("Chosen: Use Rowan's Public Report.");
    expect(run.output).toMatch(/^[0-9a-f]{64}$/m);
  });

  it("keeps the default Civic briefing compact while its matched shortcut stays inspectable and actionable", () => {
    const run = runCli([
      "--commands",
      "talk rowan; choose albany:road_warden; inspect albany:doctrine_road_warden_aid_route; choose albany:doctrine_road_warden_aid_route; hash",
    ]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Choose one permanent background");
    expect(run.output).toContain("Background: Permanent background —");
    expect(run.output).toContain("Starts with: Fieldcraft 4; weatherproof field kit");
    expect(run.output).toContain("Return obligation: Return Hayden's winter packet");
    expect(run.output).not.toMatch(/\b[12]\/3\b/);
    expect(run.output).not.toContain("Civic order:");
    expect(run.output).toContain(
      "! Choice details — Ready-made setup — Aid-Only + Hayden's report",
    );
    expect(run.output).toContain("Choose: `choose albany:doctrine_road_warden_aid_route`");
    expect(run.output).toContain("Chosen: Ready-made setup — Aid-Only + Hayden's report.");
    expect(run.output).toContain(
      "Quick setup chosen. Background: Road Warden. Wolf-Winter promise: Accept Aid-Only Terms. Report: Use Hayden's Frost Report. You can still choose a field kit, relief wagon, second rider, and route.",
    );
    expect(run.output).not.toContain("Registered role —");
    expect(run.output).not.toContain("Packet commitments: duty");
    expect(run.output).not.toContain("Optional preparation, relief allocation");
    expect(run.output).not.toContain("field-team commitment");
    expect(run.output).toMatch(/^[0-9a-f]{64}$/m);
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("restates local goal guidance when follow goal has no road passage", () => {
    const run = runCli([
      "--commands",
      "talk rowan; choose albany:road_warden; customize; choose albany:oath_limited_aid_only; choose albany:source_rowan_civic_docket; follow goal",
    ]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain(
      "Guidance: Complete Wolf-Winter. Jobs, events, and sites can help you find it, but they do not complete this goal. Wolf-Winter ends the opening chapter. Choose End to stop there, or Continue to carry its results into the optional Gallowmere chapter.",
    );
    expect(run.output).toContain(
      "You cannot travel toward this goal from here. Follow the local goal guidance above.",
    );
    expect(run.output).not.toContain("There is no current goal passage to follow from here.");
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("blocks ordinary actions at a story gate with an actionable choose command", () => {
    const run = runCli(["--commands", "talk rowan; follow goal"]);

    expect(run.status).toBe(1);
    expect(run.output).toContain("Use an `inspect <id>` or `choose <id>` command shown above.");
    expect(run.output).toContain("inspect <id>");
    expect(run.output).toContain("choose <id>");
    expect(run.output).not.toContain("Goal passage stop:");
  });

  it("accepts actions as the same read-only help command in free roam and at a story gate", () => {
    const run = runCli(["--commands", "actions; talk rowan; actions"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output.match(/Commands:/g)?.length ?? 0).toBe(2);
    expect(run.output).toContain("actions | help | quit");
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("keeps journal and travel-log inspection read-only inside one stable comparison", () => {
    const run = runCli(["--commands", "talk rowan; journal; log"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Rowan Quill is Albany's records clerk");
    expect(run.output).not.toMatch(/\b1\/3\b/);
    expect(run.output).not.toContain("Civic order:");
    expect(run.output).toContain("No roads travelled yet.");
    expect(run.output.match(/! Compare choices/g)?.length ?? 0).toBe(1);
    expect(run.output).not.toContain("A scripted command was rejected.");
  });

  it("keeps one active comparison while look restates only world and goal status", () => {
    const run = runCli(["--commands", "talk rowan; look; quit"]);

    expect(run.status, run.output).toBe(0);
    expect(run.output.match(/! Compare choices/g)?.length ?? 0).toBe(1);
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
    expect(neutral.output).toContain(`! Choice details — ${option.title}`);
    expect(neutral.output).toContain("You must choose.");
    expect(neutral.output).toContain("Back to the choice list.");
    expect(neutral.output.match(/! Compare choices/g)?.length ?? 0).toBe(1);

    const malformed = runCli([
      "--commands",
      `talk ${contact.name}; hash; inspect ${option.id} extra; hash`,
    ]);
    expect(malformed.status).toBe(1);
    expect(outputSnapshotHashes(malformed.output)).toEqual([baselineHash, baselineHash]);
    expect(malformed.output).toContain(
      "Inspect an option using its number, exact id, or full label shown above.",
    );
  });

  it("makes choosing after mandatory detail hash-identical to a direct API choice", () => {
    const expected = new OverworldSession(WORLD);
    const contact = expected.view().characters[0];
    const registration = WORLD.opening_registration;
    if (!contact || !registration) throw new Error("Expected Albany registration.");
    expected.talkToCharacter(contact.id);
    const option = registration.profiles[1]!;
    const expectedResult = expected.chooseJourneyStory(option.id, registration.id);

    const inspected = runCli([
      "--commands",
      `talk ${contact.name}; inspect ${option.id}; choose ${option.id}; hash`,
    ]);
    expect(inspected.status, inspected.output).toBe(0);
    expect(outputSnapshotHashes(inspected.output)).toEqual([expected.snapshotHash()]);
    expect(inspected.output).toContain(`! Choice details — ${option.title}`);
    expect(inspected.output).toContain(`Chosen: ${option.title}.`);
    const acceptedStart = inspected.output.indexOf(`Chosen: ${option.title}.`);
    const acceptedEnd = inspected.output.indexOf("\n--- Journey ---", acceptedStart);
    const acceptedOutput = inspected.output.slice(acceptedStart, acceptedEnd);
    expect(acceptedOutput).toContain(expectedResult.displaySummary!);
    expect(acceptedOutput).not.toContain(`Consequence: ${expectedResult.consequence}`);
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
        expect(run.output.match(/! Compare choices/g)?.length ?? 0).toBe(2);
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
    const preparationAction = stationed
      .view()
      .stationDispatchBoard?.support.find((support) => support.slot === "preparation")?.action;
    if (preparationAction?.kind !== "inspect") {
      throw new Error("Expected Station preparation inspect action.");
    }
    const option = preparation.profiles[0]!;
    const expected = OverworldSession.restore(WORLD, stationed.snapshot());
    expected.chooseJourneyStory(option.id, preparation.id);

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-staged-optional-"));
    const snapshotPath = join(temp, "station.json");
    writeFileSync(snapshotPath, JSON.stringify(stationed.snapshot()));
    try {
      expect(render(stationed.view())).toContain("The Wolf-Winter field briefing:");
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        `look; review support; inspect ${preparation.id}; inspect ${option.id}; back; choose ${option.id}; hash`,
      ]);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain(
        `Inspect field kit: \`inspect ${preparationAction.storyChoiceId}\``,
      );
      expect(run.output).toContain(`Inspect: \`inspect ${option.id}\``);
      expect(run.output).toContain(`! Choice details — ${option.title}`);
      expect(run.output.match(/! Compare choices/g)?.length ?? 0).toBe(1);
      expect(outputSnapshotHashes(run.output)).toEqual([expected.snapshotHash()]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("drives structured Station decisions into June's cattle-first commitment", () => {
    const stationed = sessionAtOpeningStation();
    const preparation = WORLD.opening_preparation;
    const allocation = WORLD.opening_relief_allocation;
    const ally = WORLD.opening_ally;
    if (!preparation || !allocation || !ally) {
      throw new Error("Expected Albany's complete Station departure flow.");
    }
    const fieldTeamAction = stationed
      .view()
      .stationDispatchBoard?.support.find((support) => support.slot === "field_team")?.action;
    if (fieldTeamAction?.kind !== "talk") {
      throw new Error("Expected Station field-team talk action.");
    }
    const preparationOption = preparation.profiles.find(
      (option) => option.id === "albany:prep_works_fortification",
    );
    const allocationOption = allocation.options.find(
      (option) => option.id === "albany:relief_resident_shelter",
    );
    const allyOption = ally.options.find((option) => option.id === "albany:ally_june_cattle_first");
    if (!preparationOption || !allocationOption || !allyOption) {
      throw new Error("Expected the authored Station and June comparison options.");
    }

    const expected = OverworldSession.restore(WORLD, stationed.snapshot());
    expected.chooseJourneyStory(preparationOption.id, preparation.id);
    expected.chooseJourneyStory(allocationOption.id, allocation.id);
    expected.talkToCharacter(ally.contact);
    const presentedAllyOption = expected
      .journey()
      .storyChoice?.options.find((option) => option.id === allyOption.id);
    if (!presentedAllyOption) throw new Error("Expected June's presented cattle-first option.");
    const expectedAllyResult = expected.chooseJourneyStory(allyOption.id, ally.id);
    const expectedSnapshot = expected.snapshot();
    expect(expectedSnapshot.character.companions).toContain(ally.ally_npc_id);
    expect(expectedSnapshot.character.promises).toContainEqual({
      promiseId: "albany:promise_june_cattle_first",
      recipientId: ally.ally_npc_id,
      status: "active",
    });

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-june-departure-"));
    const snapshotPath = join(temp, "station.json");
    writeFileSync(snapshotPath, JSON.stringify(stationed.snapshot()));
    try {
      const commands = [
        "look",
        "review support",
        `inspect ${preparation.id}`,
        "review dispatch",
        `inspect ${preparationOption.id}`,
        "back",
        `choose ${preparationOption.id}`,
        `inspect ${allocation.id}`,
        `inspect ${allocationOption.id}`,
        "back",
        `choose ${allocationOption.id}`,
        "look",
        "talk June Pike",
        `choose ${allyOption.id}`,
        "hash",
      ].join("; ");
      const run = runCli(["--restore", snapshotPath, "--commands", commands]);

      expect(run.status, run.output).toBe(0);
      expect(run.output).not.toContain("A scripted command was rejected.");
      expect(run.output.match(/! Compare choices/g)?.length ?? 0).toBe(3);
      for (const storyChoiceId of [preparation.id, allocation.id]) {
        const commandIndex = run.output.indexOf(`> inspect ${storyChoiceId}`);
        expect(
          commandIndex,
          `missing scripted inspection for ${storyChoiceId}`,
        ).toBeGreaterThanOrEqual(0);
        const comparisonIndex = run.output.indexOf("! Compare choices", commandIndex);
        expect(comparisonIndex, `missing comparison after ${storyChoiceId}`).toBeGreaterThan(
          commandIndex,
        );
        const adjacentRecall = run.output.slice(commandIndex, comparisonIndex);
        expect(adjacentRecall).toContain("The Wolf-Winter departure plan:");
        expect(adjacentRecall).not.toContain("The Wolf-Winter choices, costs, and effects:");
      }
      expect(run.output.match(/The Wolf-Winter choices, costs, and effects:/g) ?? []).toHaveLength(
        1,
      );
      for (const option of [preparationOption, allocationOption]) {
        expect(run.output).toContain(`! Choice details — ${option.title}`);
      }
      expect(run.output.match(/Back to the choice list\./g)?.length ?? 0).toBe(2);
      for (const briefing of [
        "You can leave Albany Station now or choose one field kit. The relief wagon and June are separate choices.",
        "You can leave Albany Station now or assign the relief wagon. The field kit and June are separate choices.",
        "You can leave Albany Station alone or ask June Pike to join. The field kit and relief wagon are separate choices.",
      ]) {
        expect(run.output).toContain(briefing);
      }
      expect(run.output).not.toContain("final required departure-board choice");
      expect(run.output).toContain("The Wolf-Winter field briefing:");
      expect(run.output).toContain(
        `Talk to ${fieldTeamAction.contactName}: \`talk ${fieldTeamAction.contactName}\``,
      );
      const junePromptStart = run.output.lastIndexOf("\n! Compare choices\n");
      expect(junePromptStart).toBeGreaterThan(-1);
      const juneFlowOutput = run.output.slice(junePromptStart);
      expect(juneFlowOutput).toContain(`Inspect: \`inspect ${allyOption.id}\``);
      expect(juneFlowOutput).toContain("leave Albany Station alone or ask June Pike to join");
      expect(run.output).toContain(`Chosen: ${allyOption.title}.`);
      const chosenStart = run.output.indexOf(`Chosen: ${allyOption.title}.`);
      const chosenEnd = run.output.indexOf("\n--- Journey ---", chosenStart);
      const chosenOutput = run.output.slice(chosenStart, chosenEnd);
      expect(chosenOutput).toContain(expectedAllyResult.displaySummary!);
      expect(chosenOutput).not.toContain(`Consequence: ${presentedAllyOption.consequence}`);
      expect(chosenOutput).not.toMatch(/\b(?:DRIVE|FORTIFY|Overrun|pressure|HP|DEF|import)\b/iu);
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
      expect(run.output).toContain("Closed without making a choice.");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("classifies only exact current Station resolutions read-only", () => {
    const preparation = WORLD.opening_preparation;
    const allocation = WORLD.opening_relief_allocation;
    const registration = WORLD.opening_registration;
    if (!preparation || !allocation || !registration) {
      throw new Error("Expected Albany's authored opening chain.");
    }

    const current = sessionAtOpeningStation();
    const unresolvedHash = current.snapshotHash();
    for (const id of [
      preparation.id,
      allocation.id,
      registration.id,
      preparation.profiles[0]!.id,
      "albany:not_an_authored_story_choice",
    ]) {
      expect(current.isDepartureStoryChoiceResolved(id), id).toBe(false);
    }
    expect(current.snapshotHash()).toBe(unresolvedHash);

    current.chooseJourneyStory(preparation.profiles[0]!.id, preparation.id);
    const preparedHash = current.snapshotHash();
    expect(current.isDepartureStoryChoiceResolved(preparation.id)).toBe(true);
    expect(current.isDepartureStoryChoiceResolved(allocation.id)).toBe(false);
    expect(current.snapshotHash()).toBe(preparedHash);

    current.chooseJourneyStory(allocation.options[0]!.id, allocation.id);

    const beforeHash = current.snapshotHash();
    expect(current.isDepartureStoryChoiceResolved(preparation.id)).toBe(true);
    expect(current.isDepartureStoryChoiceResolved(allocation.id)).toBe(true);
    expect(current.isDepartureStoryChoiceResolved(registration.id)).toBe(false);
    expect(current.isDepartureStoryChoiceResolved(preparation.profiles[0]!.id)).toBe(false);
    expect(current.isDepartureStoryChoiceResolved("albany:not_an_authored_story_choice")).toBe(
      false,
    );
    expect(current.snapshotHash()).toBe(beforeHash);
  });

  it("reports both current optional Station resolutions without changing their snapshot", () => {
    const preparation = WORLD.opening_preparation;
    const allocation = WORLD.opening_relief_allocation;
    if (!preparation || !allocation) {
      throw new Error("Expected Albany's optional Station decisions.");
    }
    const session = sessionWithResolvedStationChoices();
    const baselineHash = session.snapshotHash();
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-resolved-story-"));
    const snapshotPath = join(temp, "resolved.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    try {
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        `hash; inspect ${preparation.id}; hash; inspect ${allocation.id}; hash`,
      ]);

      expect(run.status, run.output).toBe(1);
      expect(outputSnapshotHashes(run.output)).toEqual([baselineHash, baselineHash, baselineHash]);
      for (const id of [preparation.id, allocation.id]) {
        expect(run.output).toContain(
          `You already made the optional choice "${id}". Use \`look\` to see what remains.`,
        );
      }
      expect(run.output).not.toContain("No optional choice matches");
      expect(run.output.match(/A scripted command was rejected\./g) ?? []).toHaveLength(1);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("keeps unresolved-away, mandatory, option, and unknown inspect ids generic and neutral", () => {
    const preparation = WORLD.opening_preparation;
    const registration = WORLD.opening_registration;
    if (!preparation || !registration) {
      throw new Error("Expected Albany's authored preparation and registration.");
    }
    const session = sessionAtOpeningStation();
    moveToArea(session, registration.area);
    expect(session.view().departureInteractions).toEqual([]);
    const baselineHash = session.snapshotHash();
    const controls = [
      preparation.id,
      registration.id,
      preparation.profiles[0]!.id,
      "albany:not_an_authored_story_choice",
    ];
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-unresolved-story-"));
    const snapshotPath = join(temp, "unresolved-away.json");
    writeFileSync(snapshotPath, JSON.stringify(session.snapshot()));
    try {
      const commands = ["hash", ...controls.flatMap((id) => [`inspect ${id}`, "hash"])].join("; ");
      const run = runCli(["--restore", snapshotPath, "--commands", commands]);

      expect(run.status, run.output).toBe(1);
      expect(outputSnapshotHashes(run.output)).toEqual(
        Array(controls.length + 1).fill(baselineHash),
      );
      for (const id of controls) {
        expect(run.output).toContain(
          `No optional choice matches "${id}". Use an \`inspect <id>\` command shown by \`look\`.`,
        );
      }
      expect(run.output).not.toContain("has already been resolved");
      expect(run.output.match(/A scripted command was rejected\./g) ?? []).toHaveLength(1);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("labels the discovered Winter Return Docket as future work and explains failed work truthfully", () => {
    const run = runCli([
      "--commands",
      "talk rowan; choose albany:road_warden; customize; choose albany:oath_limited_aid_only; choose albany:source_rowan_civic_docket; work winter return",
    ]);

    expect(run.status).toBe(1);
    expect(run.output).toContain("Rowan's Winter Return Docket is known but not available yet.");
    expect(run.output).not.toContain("new job: Rowan's Winter Return Docket");
    expect(run.output).toContain("Continue the journey and check again later.");
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

  // Four independent CLI subprocesses preserve the fresh-restore counterfactual.
  // Loaded GitHub shards repeatedly exceed the global 60 s timeout; assertions stay exact.
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
      expect(blocked.output).toContain("Answer the current choice with `choose <number|label>`.");
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

      const ended = runCli(["--restore", snapshotPath, "--commands", "choose End here"]);
      expect(ended.status, ended.output).toBe(0);
      expect(ended.output).toContain("Chosen: End here.");
      expect(ended.output).toContain("! Journey ended. This record is read-only.");

      const quit = runCli(["--restore", snapshotPath, "--commands", "hash; quit"]);
      expect(quit.status, quit.output).toBe(0);
      expect(quit.output).toMatch(/^[0-9a-f]{64}$/m);
    } finally {
      rmSync(savedPath, { force: true });
      rmSync(temp, { recursive: true, force: true });
    }
  }, 120_000);

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
      expect(run.output).toContain("! Journey ended. This record is read-only.");
      expect(run.output).toContain("The exit record is saved for review.");
      expect(run.output).toContain(receipt!.receiptHash);
      expect(run.output).not.toContain("Resumed in");
      expect(run.output).not.toContain("Roads:");
      expect(run.output).not.toContain("Took ");
      expect(run.output).not.toContain("A scripted command was rejected.");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("follows the Queensbury objective through its encounter to the actionable market anchor", () => {
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
    expected.resolveRoadEncounter("press_on");
    const expectedArrival = expected.followGoalPassage();
    expect(expectedArrival.stopReason).toBe("objective");
    expect(expectedArrival.stoppedAt).toBe("Queensbury town");
    expect(expected.view().areaExits.map((exit) => exit.destination.id)).toContain(
      "queensbury_town__market",
    );
    expect(expected.view().quests.map((quest) => quest.id)).toContain("gallowmere");

    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-north-goal-"));
    const snapshotPath = join(temp, "wolf-complete.json");
    writeFileSync(snapshotPath, JSON.stringify(snapshot));
    try {
      const run = runCli([
        "--restore",
        snapshotPath,
        "--commands",
        "choose continue; choose Send the wagon back to Cade; look; follow goal; press; follow goal; enter Queensbury Market Streets",
      ]);
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("Queensbury town");
      expect(run.output).toContain("Hedrick Cradoc");
      expect(run.output).toContain(expectedJourney.goalGuidance);
      expect(run.output).toContain("Saratoga Springs city");
      expect(run.output).toContain(expectedPassage.label);
      expect(run.output).toContain("Travel: `follow goal`");
      expect(run.output).toContain(
        `Stopped at ${expectedFollow.stoppedAt}. A road encounter needs your response.`,
      );
      expect(run.output).toContain(expectedEncounter!.event.title);
      expect(run.output).toContain(expectedEncounter!.event.summary);
      expect(run.output).toContain(
        `Stopped at ${expectedArrival.stoppedAt}. Reached the goal town.`,
      );
      expect(run.output).toContain("Walked");
      expect(run.output).toContain("to Queensbury Market Streets");
      expect(run.output).not.toContain('No local route matches "queensbury market streets"');
      expect(run.output).not.toContain("A scripted command was rejected.");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
