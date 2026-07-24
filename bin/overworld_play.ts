#!/usr/bin/env -S npx tsx
/**
 * bin/overworld_play — play the New York overworld from the terminal.
 *
 * Usage:
 *   npm run overworld                                   # start a new journey
 *   npm run overworld -- --restore saves/journey.json   # resume a saved journey
 *   npm run overworld -- --commands "look; go albany; press; rest"
 *   npm run overworld -- --seed 7                       # seed for RPG quest handoffs only
 *
 * Drives the same deterministic OverworldSession the web UI and MCP server use:
 * travel (every road leg raises a road encounter that must be resolved — assist /
 * scout / press), rest/resupply, local areas, scouting, contacts, events, jobs,
 * and notice-board quest leads. Starting a discovered quest hands off to the same
 * RPG quest loop as `npm run play`; a non-death ending is completed back into the
 * overworld (journal + renown), mirroring the MCP quest bridge. The overworld has
 * no RNG — determinism comes from action order alone; `--seed` only affects the
 * RPG quest sub-sessions. In `--commands` mode the run succeeds (exit 0) when every
 * scripted command is accepted; any rejected or unparseable command sets exit 1.
 * `save <name>` / `load <name>` snapshot to saves/<name>.json (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { makeStep, actionEquals } from "../src/core/engine.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../src/rpg/runner.js";
import { buildRpgObservation } from "../src/rpg/observation.js";
import { RpgSourceRuntime } from "../src/mcp/rpg_source_runtime.js";
import {
  render as renderQuest,
  renderActionHelp as renderQuestActionHelp,
  illegalReason,
  resolve as resolveRpgCommand,
} from "./rpg_play.js";
import {
  isStructuredTerminalStoryChoice,
  matchTerminalStoryChoiceOption,
  renderTerminalStoryChoiceComparison,
  runTerminalStoryChoiceController,
  type TerminalStoryChoiceAuxiliaryResult,
} from "./terminal_story_choice.js";
import { loadOverworldManifest } from "../src/world/source.js";
import { timeLabel } from "../src/world/session_journal_codec.js";
import type {
  JourneyChoiceOption,
  JourneyExitReceipt,
  JourneyPresentation,
} from "../src/world/journey_contract.js";
import {
  OverworldSession,
  type OverworldActionResult,
  type OverworldJourneyGoalPassageResult,
  type OverworldPendingRoadEncounter,
  type OverworldQuestCompletionResult,
  type OverworldQuestView,
  type OverworldRoadEncounterStrategy,
  type OverworldServiceResult,
  type OverworldView,
  type TravelLogEntry,
} from "../src/world/session.js";
import type { OverworldDepartureInteraction } from "../src/world/session_departure_interactions.js";

const VALUE_FLAGS = new Set(["--commands", "--seed", "--restore"]);
const SAVE_DIR = "saves";
const DEFAULT_SAVE_NAME = "journey";

/** Exact quest foldback copy printed by the terminal after an embedded victory. */
export function renderQuestCompletion(result: OverworldQuestCompletionResult): string {
  return result.entry.text;
}

/** The full status screen (pure; exported for tests). */
export function render(view: OverworldView): string {
  const lines = [
    `\n=== ${view.world} — ${view.current.name} (${view.current.region}) — ${view.timeLabel} ===`,
    view.current.description,
    `Supplies ${view.supplies}/${view.maxSupplies} · Fatigue ${view.fatigue} · Condition: ${view.travelCondition} · Towns ${view.visitedCount}/${view.totalTowns}`,
  ];
  if (view.exits.length) {
    lines.push("Roads:");
    view.exits.forEach((exit, i) => {
      lines.push(
        `  ${i + 1}. ${exit.destination.name} — ${exit.route}, ${exit.distance_mi.toFixed(1)} mi, ${exit.travel_minutes} min`,
      );
    });
  }
  if (view.currentArea) lines.push(`Area: ${view.currentArea.name} — ${view.currentArea.summary}`);
  if (view.areaExits.length)
    lines.push(
      `Local routes: ${view.areaExits.map((e) => `${e.destination.name} (${e.travel_minutes} min)`).join(" · ")}`,
    );
  const more = (n: number): string => (n > 0 ? ` (+${n} undiscovered)` : "");
  if (view.areas.length || view.hiddenAreaCount)
    lines.push(
      `Areas: ${view.areas.map((a) => a.name).join(" · ") || "—"}${more(view.hiddenAreaCount)}`,
    );
  if (view.pois.length) lines.push(`Scoutable: ${view.pois.map((p) => p.title).join(" · ")}`);
  if (view.characters.length)
    lines.push(`Contacts: ${view.characters.map((c) => `${c.name} (${c.role})`).join(" · ")}`);
  if (view.departureInteractions.length) {
    lines.push("Optional departure decisions:");
    for (const interaction of view.departureInteractions) {
      lines.push(`  ${interaction.title}`);
      lines.push(`    Compare: \`inspect ${interaction.id}\``);
    }
  }
  if (view.events.length)
    lines.push(
      `Events: ${view.events
        .map((e) => `${e.title}${view.resolvedEventIds.includes(e.id) ? " [resolved]" : ""}`)
        .join(" · ")}`,
    );
  if (view.jobs.length || view.hiddenJobCount)
    lines.push(
      `Jobs: ${
        view.jobs
          .map((j) => `${j.title}${view.completedJobIds.includes(j.id) ? " [done]" : ""}`)
          .join(" · ") || "—"
      }${more(view.hiddenJobCount)}`,
    );
  if (view.sites.length || view.hiddenSiteCount)
    lines.push(
      `Sites: ${
        view.sites
          .map((s) => `${s.title}${view.exploredSiteIds.includes(s.id) ? " [explored]" : ""}`)
          .join(" · ") || "—"
      }${more(view.hiddenSiteCount)}`,
    );
  if (view.quests.length || view.hiddenQuestCount) {
    lines.push(`Notice board${more(view.hiddenQuestCount)}:`);
    for (const quest of view.quests) lines.push(`  ${questLine(view, quest)}`);
  }
  return lines.join("\n");
}

function questLine(view: OverworldView, quest: OverworldQuestView): string {
  const areaName = view.areas.find((a) => a.id === quest.area)?.name ?? quest.area;
  const status = view.completedQuestIds.includes(quest.id)
    ? " [completed]"
    : view.startedQuestIds.includes(quest.id)
      ? " [started]"
      : view.currentArea?.id === quest.area
        ? ""
        : ` (move to ${areaName} to start)`;
  return `${quest.title} — posted in ${areaName}${status}`;
}

/** Player-facing quest-launch terms shared by interactive and scripted CLI play. */
export function renderQuestLaunch(quest: OverworldQuestView): string {
  if (!quest.launch) return "";
  const lines = [
    `\n${quest.launch.prompt}`,
    "Choose with `choose <number|name>`; a legacy bare number also works.",
  ];
  quest.launch.options.forEach((option, index) => {
    const projection = option.projection;
    const availability =
      projection?.available === false ? ` [blocked: ${projection.blockedReason}]` : "";
    lines.push(
      `  choose ${String(index + 1)} — ${option.title} — ${option.summary}${availability}`,
    );
    lines.push(`     What you expect: ${option.preview}`);
    if (option.tradeoffSummary) {
      lines.push(`     Route tradeoff: ${option.tradeoffSummary}`);
    }
    lines.push(`     Commitment: ${option.consequence}`);
    lines.push(
      `     Actual cost: ${String(option.terms.minutes)} min, ${String(option.terms.supplies)} ${option.terms.supplies === 1 ? "supply" : "supplies"}, fatigue +${String(option.terms.fatigue)}.`,
    );
    if (projection?.available) {
      lines.push(
        `     Projected arrival: ${timeLabel(projection.minutesAfter)}; ${String(projection.suppliesAfter)} ${projection.suppliesAfter === 1 ? "supply" : "supplies"} remaining; fatigue ${String(projection.fatigueAfter)}; condition ${projection.travelConditionAfter}.`,
      );
    } else if (projection) {
      lines.push(`     Projected time: ${timeLabel(projection.minutesAfter)}.`);
    }
  });
  return lines.join("\n");
}

type QuestLaunchOption = NonNullable<OverworldQuestView["launch"]>["options"][number];

export type QuestLaunchChoiceResolution =
  | { kind: "resolved"; option: QuestLaunchOption }
  | { kind: "ambiguous"; reason: string }
  | { kind: "unmatched"; reason: string };

function normalizeQuestLaunchSelector(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve a quest approach without permissive prefix/substring guessing.
 * `choose 2` is canonical, bare `2` remains compatible, and names/ids must be
 * exact. A mixed value such as `2 garbage` is never parsed as option two. */
export function resolveQuestLaunchChoice(
  options: readonly QuestLaunchOption[],
  raw: string,
): QuestLaunchChoiceResolution {
  const normalized = normalizeQuestLaunchSelector(raw);
  const selector = normalized.startsWith("choose ")
    ? normalized.slice("choose ".length).trim()
    : normalized;
  if (!selector) {
    return {
      kind: "unmatched",
      reason: "Choose an approach with `choose <number|name>`, or type `cancel`.",
    };
  }

  if (/^\d+$/.test(selector)) {
    const number = Number(selector);
    const option = Number.isSafeInteger(number) && number >= 1 ? options[number - 1] : undefined;
    return option
      ? { kind: "resolved", option }
      : {
          kind: "unmatched",
          reason: `There is no approach ${selector}. Use an exact command from the launch card.`,
        };
  }

  const matches = options.filter(
    (option) =>
      normalizeQuestLaunchSelector(option.id) === selector ||
      normalizeQuestLaunchSelector(option.title) === selector,
  );
  if (matches.length === 1) return { kind: "resolved", option: matches[0]! };
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      reason: `"${selector}" names more than one approach. Use \`choose <number>\` or an exact id.`,
    };
  }
  return {
    kind: "unmatched",
    reason: `No approach exactly matches "${selector}". Use \`choose <number|name>\`.`,
  };
}

/** The pending road-encounter prompt (pure; exported for tests). */
export function renderEncounter(encounter: OverworldPendingRoadEncounter): string {
  const lines = [
    `\n! Road encounter on ${encounter.route} near ${encounter.to} — ${encounter.event.title} (risk ${encounter.event.risk})`,
    `  ${encounter.event.summary}`,
    "  Choose how to respond:",
  ];
  for (const option of encounter.options) {
    lines.push(
      `    ${commandForStrategy(option.strategy)} — ${option.label}: ${option.minutes} min, supplies -${option.suppliesCost}, fatigue +${option.fatigueGained}${option.renownGained ? `, renown +${option.renownGained}` : ""}`,
    );
  }
  return lines.join("\n");
}

/** The authoritative mandatory journey prompt, shared by fresh and restored CLI sessions. */
export function renderJourneyGate(journey: JourneyPresentation): string {
  const gate = journey.pendingChoice ?? journey.storyChoice;
  if (!gate) return "";
  if (
    journey.storyChoice &&
    gate === journey.storyChoice &&
    isStructuredTerminalStoryChoice(gate)
  ) {
    return renderTerminalStoryChoiceComparison(gate);
  }
  const kind = journey.pendingChoice ? "Journey decision" : "Story choice";
  const lines = [`\n! ${kind}`, `  ${gate.message}`, "  Choose with `choose <number|label>`:"];
  gate.options.forEach((option, index) => {
    lines.push(`    ${String(index + 1)}. ${option.label}`);
    const summary = "summary" in option ? option.summary : undefined;
    if (summary) {
      const usesTriggerCategory = summary.fieldTriggerScope === "category";
      lines.push(`       ${usesTriggerCategory ? "Purpose" : "Commitment"}: ${summary.commitment}`);
      lines.push(
        `       ${usesTriggerCategory ? "Trigger category" : "Field trigger"}: ${summary.fieldTrigger}`,
      );
      if (summary.immediateCost) lines.push(`       Immediate cost: ${summary.immediateCost}`);
    }
    lines.push(`       Consequence: ${option.consequence}`);
  });
  return lines.join("\n");
}

/** The current objective and its engine-owned movement forecast. */
export function renderJourneyStatus(journey: JourneyPresentation): string {
  const lines = ["\n--- Journey ---", `Goal [${journey.goal.status}]: ${journey.goal.text}`];
  if (journey.goalGuidance) lines.push(`Guidance: ${journey.goalGuidance}`);
  const passage = journey.goalPassage;
  if (passage) {
    lines.push(`Goal passage: ${passage.label}`);
    lines.push(
      `  Forecast: ${String(passage.roadCount)} ${passage.roadCount === 1 ? "road" : "roads"}; ${String(passage.baseMinutes)} road min; ${String(passage.estimatedMinutes)} min estimated.`,
    );
    lines.push(
      `  Supplies: ${String(passage.suppliesNeeded)} needed; ${String(passage.supplyDeficit)} short; ${String(passage.suppliesAfter)} left.`,
    );
    lines.push(
      `  Arrival: fatigue ${String(passage.fatigueAfter)}; condition ${passage.travelConditionAfter}.`,
    );
    lines.push(`  Consequence: ${passage.consequence}`);
    lines.push(`  Stop rule: ${passage.stopRule}`);
    lines.push("  Action: `follow goal`");
  }
  return lines.join("\n");
}

/** The truthful terminal surface for an ended, read-only journey. */
export function renderEndedJourney(
  journey: JourneyPresentation,
  receipt: JourneyExitReceipt,
): string {
  if (journey.status !== "ended") {
    throw new Error("Only an ended journey has a terminal receipt surface.");
  }
  return [
    "\n! Journey ended — this journey is read-only.",
    `  Goal: ${journey.goal.text} [${journey.goal.status}]`,
    `  Accepted decisions: ${String(journey.acceptedDecisions)}.`,
    `  Exit receipt: ${receipt.exitReason}; reasons: ${receipt.exitReasons.join(", ")}; receipt ${receipt.receiptHash}.`,
    "  Its truthful exit receipt is preserved for review.",
  ].join("\n");
}

export function matchJourneyGateOption<Option extends { id: string; label: string }>(
  options: readonly Option[],
  raw: string,
): Option | null {
  return matchTerminalStoryChoiceOption(options, raw);
}

function chooseJourneyGate(
  session: OverworldSession,
  raw: string,
): {
  label: string;
  consequence: string;
} {
  const journey = session.journey();
  const pending = journey.pendingChoice;
  const story = pending ? null : journey.storyChoice;
  const gate = pending ?? story;
  if (!gate) throw new Error("There is no mandatory journey choice right now.");
  const option = matchJourneyGateOption<{
    id: string;
    label: string;
    consequence: string;
  }>(gate.options, raw);
  if (!option) {
    throw new Error("Choose one of the numbered options or enter a full option label shown above.");
  }
  if (pending) {
    session.chooseJourney(option.id as JourneyChoiceOption["id"]);
  } else {
    session.chooseJourneyStory(option.id, story!.id);
  }
  return { label: option.label, consequence: option.consequence };
}

function commandForStrategy(strategy: OverworldRoadEncounterStrategy): string {
  return strategy === "assist_travelers"
    ? "assist"
    : strategy === "cautious_scout"
      ? "scout"
      : "press";
}

function strategyForCommand(raw: string): OverworldRoadEncounterStrategy | null {
  const word = raw.trim().toLowerCase();
  if (word.startsWith("assist")) return "assist_travelers";
  if (word.startsWith("scout") || word.startsWith("caut")) return "cautious_scout";
  if (word.startsWith("press")) return "press_on";
  return null;
}

const HELP = `Commands:
  look                     full status of the current town and area
  choose <number|label|id> answer the active journey or story choice
  inspect <id>             compare an optional story choice or expand one structured card
  follow goal              take a road passage, or restate local goal guidance
  go <town|road #>         travel one road leg (multi-leg journeys go leg by leg)
  routes                   estimates for every discovered destination
  assist | scout | press   resolve a pending road encounter
  rest · resupply          town services (needs an inn/healer · market)
  enter <area>             walk a local route to another area of this town
  explore [<area|site>]    explore the current/named area or a discovered site
  scout <poi>              scout a point of interest
  talk <contact>           talk to a local contact
  investigate <event> · resolve <event>
  work <job>               work a discovered local job
  start <quest>            start a discovered quest lead (hands off to quest play)
  journal · log            recent journal entries · travel log
  save [name] · load [name]  snapshot to saves/<name>.json
  hash                     deterministic snapshot hash
  actions · help · quit`;

function matchingEntities<T extends { id: string }>(
  items: readonly T[],
  raw: string,
  label: (item: T) => string,
): T[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const exactIds = items.filter((item) => item.id.toLowerCase() === q);
  if (exactIds.length) return exactIds;
  const exactLabels = items.filter((item) => label(item).toLowerCase() === q);
  if (exactLabels.length) return exactLabels;
  const partialLabels = items.filter((item) => label(item).toLowerCase().includes(q));
  if (partialLabels.length) return partialLabels;
  return items.filter((item) => item.id.toLowerCase().includes(q));
}

function matchEntity<T extends { id: string }>(
  items: readonly T[],
  raw: string,
  label: (item: T) => string,
): T | null {
  return matchingEntities(items, raw, label)[0] ?? null;
}

function printActionResult(result: OverworldActionResult, view: OverworldView): void {
  if (result.alreadyKnown) {
    console.log(`Reviewed: ${result.entry.title}.`);
    return;
  }
  console.log(`[+${result.minutes} min] ${result.entry.text}`);
  for (const area of result.discoveredAreas ?? []) console.log(`  ↳ new area: ${area.name}`);
  const actionableJobIds = new Set([...view.jobs, ...view.rememberedJobs].map((job) => job.id));
  for (const job of result.discoveredJobs ?? []) {
    if (job.authored_scene && !actionableJobIds.has(job.id)) {
      console.log(`  ↳ future job (currently unavailable): ${job.title}`);
    } else {
      console.log(`  ↳ new job: ${job.title}`);
    }
  }
  for (const site of result.discoveredSites ?? []) console.log(`  ↳ new site: ${site.title}`);
  for (const quest of result.discoveredQuests ?? [])
    console.log(`  ↳ new quest lead: ${quest.title}`);
}

function printServiceResult(result: OverworldServiceResult): void {
  console.log(result.changed ? `[+${result.minutes} min] ${result.message}` : result.message);
}

function printTravelEntry(entry: TravelLogEntry): void {
  const delay = entry.delayMinutes > 0 ? ` (+${entry.delayMinutes} min delay)` : "";
  console.log(
    `Took ${entry.route} to ${entry.to} — ${entry.minutes} min${delay}. Supplies ${entry.suppliesAfter}, fatigue ${entry.fatigueAfter}.`,
  );
  if (entry.roadEvent) {
    console.log(`${entry.roadEvent.title} (risk ${entry.roadEvent.risk})`);
    console.log(entry.roadEvent.summary);
  }
}

function printGoalPassageResult(result: OverworldJourneyGoalPassageResult): void {
  console.log(`Followed the current goal toward ${result.destination}:`);
  for (const leg of result.legs) printTravelEntry(leg);
  console.log(`Goal passage stop: ${result.stopReason} at ${result.stoppedAt}.`);
}

function printJournal(view: OverworldView): void {
  for (const entry of view.journal.slice(-10)) {
    console.log(`[${entry.recordedAt}] ${entry.town}: ${entry.title} — ${entry.text}`);
  }
  if (!view.journal.length) console.log("The journal is empty.");
}

function printTravelLog(view: OverworldView): void {
  for (const entry of view.log.slice(0, 10)) {
    console.log(
      `${entry.from} → ${entry.to} via ${entry.route} — ${entry.minutes} min, supplies ${entry.suppliesAfter}, fatigue ${entry.fatigueAfter}`,
    );
  }
  if (!view.log.length) console.log("No roads travelled yet.");
}

export type QuestCommandReader = {
  read(prompt: string): Promise<string | null>;
  scripted: boolean;
};

type TerminalStoryChoiceRunResult = "chosen" | "cancelled" | "closed" | "quit" | "refresh";

async function controlTerminalStoryChoice(args: {
  session: OverworldSession;
  prompt: NonNullable<JourneyPresentation["storyChoice"]>;
  allowComparisonExit: boolean;
  reader: QuestCommandReader;
  reject: (message: string) => void;
  onAuxiliary: (line: string) => Promise<TerminalStoryChoiceAuxiliaryResult>;
}): Promise<TerminalStoryChoiceRunResult> {
  const result = await runTerminalStoryChoiceController({
    prompt: args.prompt,
    reader: args.reader,
    write: (text) => console.log(text),
    reject: args.reject,
    choose: (option) => {
      args.session.chooseJourneyStory(option.id, args.prompt.id);
    },
    allowComparisonExit: args.allowComparisonExit,
    onAuxiliary: args.onAuxiliary,
  });
  if (result.kind === "chosen") {
    console.log(`Chosen: ${result.option.label}.`);
    console.log(`Consequence: ${result.option.consequence}`);
    console.log(renderJourneyStatus(args.session.journey()));
  } else if (result.kind === "cancelled") {
    console.log("Story comparison closed without changing the journey.");
  }
  return result.kind;
}

function departureInteractionByExactId(
  interactions: readonly OverworldDepartureInteraction[],
  raw: string,
): OverworldDepartureInteraction | null {
  const exact = raw.trim().toLowerCase();
  return interactions.find((interaction) => interaction.id.toLowerCase() === exact) ?? null;
}

async function main(): Promise<void> {
  rejectPositionals();
  const seed = Number(arg("--seed") ?? 1);
  const rawCommands = arg("--commands");
  const commands =
    rawCommands === undefined
      ? null
      : rawCommands
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean);

  const manifest = loadOverworldManifest(process.cwd());
  const restorePath = arg("--restore");
  let session: OverworldSession;
  if (restorePath !== undefined) {
    session = OverworldSession.restore(manifest, JSON.parse(readFileSync(restorePath, "utf8")));
    if (session.journey().status !== "ended") {
      console.log(`Resumed in ${session.view().current.name}.`);
    }
  } else {
    session = new OverworldSession(manifest);
    console.log(
      `You begin in ${session.view().current.name}. Roads leave town, but the work is local until you find it.`,
    );
  }
  if (session.journey().status !== "ended") {
    console.log(render(session.view()));
    console.log(renderJourneyStatus(session.journey()));
  }

  const interactive = commands === null;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const scripted = commands ?? [];
  let scriptedFailure = false;
  const reader: QuestCommandReader = {
    scripted: !interactive,
    read: async (prompt: string) => {
      if (interactive) return rl!.question(prompt);
      const next = scripted.shift();
      if (next === undefined) return null;
      console.log(`${prompt}${next}`);
      return next;
    },
  };
  const runtime = new RpgSourceRuntime(process.cwd());

  try {
    running: while (true) {
      const view = session.view();
      const journey = session.journey();
      if (journey.status === "ended") {
        const receipt = session.journeyExitReceipt();
        if (!receipt) throw new Error("An ended journey is missing its truthful exit receipt.");
        console.log(renderEndedJourney(journey, receipt));
        break;
      }
      const fail = (message: string): void => {
        console.log(message);
        scriptedFailure = true;
      };
      const handleStoryChoiceAuxiliary = async (
        line: string,
      ): Promise<TerminalStoryChoiceAuxiliaryResult> => {
        const [rawVerb = ""] = line.trim().split(/\s+/, 1);
        const verb = rawVerb.toLowerCase();
        const rest = line.trim().slice(rawVerb.length).trim();
        if (["actions", "help", "?"].includes(verb) && rest.length === 0) {
          console.log(HELP);
          return "handled";
        }
        if (["look", "status", "l"].includes(verb) && rest.length === 0) {
          console.log(render(session.view()));
          console.log(renderJourneyStatus(session.journey()));
          return "handled";
        }
        if (verb === "hash" && rest.length === 0) {
          console.log(session.snapshotHash());
          return "handled";
        }
        if (verb === "journal" && rest.length === 0) {
          printJournal(session.view());
          return "handled";
        }
        if (verb === "log" && rest.length === 0) {
          printTravelLog(session.view());
          return "handled";
        }
        if (verb === "save") {
          saveSnapshot(session, rest);
          return "handled";
        }
        if (verb === "load") {
          const path = savePath(rest);
          session = OverworldSession.restore(manifest, JSON.parse(readFileSync(path, "utf8")));
          if (session.journey().status !== "ended") {
            console.log(`Restored ${path}. Resumed in ${session.view().current.name}.`);
            console.log(renderJourneyStatus(session.journey()));
          }
          return "refresh";
        }
        return "unhandled";
      };
      if (journey.storyChoice && isStructuredTerminalStoryChoice(journey.storyChoice)) {
        try {
          const outcome = await controlTerminalStoryChoice({
            session,
            prompt: journey.storyChoice,
            reader,
            reject: fail,
            allowComparisonExit: false,
            onAuxiliary: handleStoryChoiceAuxiliary,
          });
          if (outcome === "quit" || outcome === "closed") break;
        } catch (error) {
          fail(`Could not continue: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
      const journeyGate = renderJourneyGate(journey);
      if (journeyGate) console.log(journeyGate);
      else if (view.pendingRoadEncounter) console.log(renderEncounter(view.pendingRoadEncounter));
      const raw = await reader.read(`\n[${view.current.name}] > `);
      if (raw === null) break;
      const line = raw.trim();
      if (!line) continue;
      const low = line.toLowerCase();
      if (["quit", "q", "exit"].includes(low)) break;
      if (["actions", "help", "?"].includes(low)) {
        console.log(HELP);
        continue;
      }

      try {
        if (journey.pendingChoice || journey.storyChoice) {
          const [verb = "", ...restWords] = low.split(/\s+/);
          const rest = restWords.join(" ");
          if (["look", "status", "l"].includes(verb)) {
            console.log(render(session.view()));
            console.log(renderJourneyStatus(session.journey()));
          } else if (verb === "hash") {
            console.log(session.snapshotHash());
          } else if (verb === "journal") {
            printJournal(session.view());
          } else if (verb === "log") {
            printTravelLog(session.view());
          } else if (verb === "save") {
            saveSnapshot(session, line.slice(4).trim());
          } else if (verb === "load") {
            const path = savePath(rest);
            session = OverworldSession.restore(manifest, JSON.parse(readFileSync(path, "utf8")));
            if (session.journey().status !== "ended") {
              console.log(`Restored ${path}. Resumed in ${session.view().current.name}.`);
              console.log(renderJourneyStatus(session.journey()));
            }
          } else if (verb === "choose") {
            const chosen = chooseJourneyGate(session, line.slice(verb.length).trim());
            console.log(`Chosen: ${chosen.label}.`);
            console.log(`Consequence: ${chosen.consequence}`);
            if (session.journey().status === "ended") {
              const receipt = session.journeyExitReceipt();
              if (!receipt)
                throw new Error("An ended journey is missing its truthful exit receipt.");
              console.log(renderEndedJourney(session.journey(), receipt));
              break running;
            }
            console.log(renderJourneyStatus(session.journey()));
          } else {
            fail(
              "Choose the active journey prompt first with `choose <number|label>`; `look`, `help`, `journal`, `log`, `save`, `load`, `hash`, and `quit` remain available.",
            );
          }
          continue;
        }

        if (view.pendingRoadEncounter) {
          const strategy = strategyForCommand(low);
          if (strategy) {
            const result = session.resolveRoadEncounter(strategy);
            console.log(result.entry.text);
          } else if (["look", "status", "l"].includes(low)) {
            console.log(render(session.view()));
            console.log(renderJourneyStatus(session.journey()));
          } else if (low === "hash") {
            console.log(session.snapshotHash());
          } else if (low.startsWith("save")) {
            saveSnapshot(session, line.slice(4).trim());
          } else {
            fail("Resolve the pending road encounter first (assist / scout / press).");
          }
          continue;
        }

        const [verb, ...restWords] = low.split(/\s+/);
        const rest = restWords.join(" ");
        switch (verb) {
          case "look":
          case "status":
          case "l":
            console.log(render(session.view()));
            console.log(renderJourneyStatus(session.journey()));
            break;
          case "roads":
            console.log(render(session.view()));
            break;
          case "routes":
          case "destinations": {
            const options = session.view().routeOptions;
            if (!options.length) {
              console.log("No discovered destinations yet — travel a road to learn the map.");
              break;
            }
            for (const plan of options) {
              const deficit =
                plan.estimate.supplyDeficit > 0 ? ` (${plan.estimate.supplyDeficit} short!)` : "";
              console.log(
                `${plan.destination.name} — ${plan.totalDistanceMi.toFixed(1)} mi, ~${plan.estimate.elapsedMinutes} min over ${plan.steps.length} leg(s), supplies ${plan.estimate.suppliesNeeded}${deficit}, fatigue +${plan.estimate.fatigueGained}`,
              );
            }
            break;
          }
          case "go":
          case "travel": {
            if (!rest) {
              fail("Go where? Try `go <town name>` or `go <road number>` from `look`.");
              break;
            }
            printTravelEntry(travelToward(session, rest));
            break;
          }
          case "follow": {
            if (rest !== "goal") {
              fail("Follow what? Use `follow goal` for the visible current-goal passage.");
              break;
            }
            const journey = session.journey();
            if (!journey.goalPassage) {
              console.log(renderJourneyStatus(journey));
              console.log(
                "No road passage is available from here. Follow the visible local guidance above.",
              );
              break;
            }
            printGoalPassageResult(session.followGoalPassage());
            break;
          }
          case "rest":
            printServiceResult(session.restAtTown());
            break;
          case "resupply":
            printServiceResult(session.resupplyAtTown());
            break;
          case "areas":
            console.log(render(session.view()));
            break;
          case "enter":
          case "move": {
            const exit = matchEntity(session.view().areaExits, rest, (e) => e.destination.name);
            if (!exit) {
              fail(`No local route matches "${rest}". Local routes are listed under \`look\`.`);
              break;
            }
            const result = session.moveArea(exit.id);
            console.log(`Walked ${result.route} to ${result.to.name} — ${result.minutes} min.`);
            break;
          }
          case "explore": {
            const v = session.view();
            if (!rest) {
              if (!v.currentArea) {
                fail("There is no local area here to explore.");
                break;
              }
              printActionResult(session.exploreArea(v.currentArea.id), session.view());
              break;
            }
            const area = matchEntity(v.areas, rest, (a) => a.name);
            if (area) {
              printActionResult(session.exploreArea(area.id), session.view());
              break;
            }
            const site = matchEntity(v.sites, rest, (s) => s.title);
            if (site) {
              printActionResult(session.exploreSite(site.id), session.view());
              break;
            }
            fail(`Nothing discovered here matches "${rest}" to explore.`);
            break;
          }
          case "scout": {
            const poi = matchEntity(session.view().pois, rest, (p) => p.title);
            if (!poi) {
              fail(`Nothing scoutable matches "${rest}".`);
              break;
            }
            printActionResult(session.scoutPoi(poi.id), session.view());
            break;
          }
          case "talk": {
            const target = rest.replace(/^to\s+/, "");
            const character = matchEntity(session.view().characters, target, (c) => c.name);
            if (!character) {
              fail(`No local contact matches "${target}".`);
              break;
            }
            printActionResult(session.talkToCharacter(character.id), session.view());
            break;
          }
          case "inspect": {
            const interaction = departureInteractionByExactId(
              session.view().departureInteractions,
              rest,
            );
            if (!interaction) {
              fail(
                `No optional story choice exactly matches "${rest}". Use the \`inspect <id>\` command shown by \`look\`.`,
              );
              break;
            }
            const prompt = session.inspectJourneyStory(interaction.id);
            if (!isStructuredTerminalStoryChoice(prompt)) {
              fail(`Optional story choice "${interaction.id}" has no structured comparison.`);
              break;
            }
            const outcome = await controlTerminalStoryChoice({
              session,
              prompt,
              reader,
              reject: fail,
              allowComparisonExit: true,
              onAuxiliary: handleStoryChoiceAuxiliary,
            });
            if (outcome === "quit") break running;
            break;
          }
          case "investigate": {
            const event = matchEntity(session.view().events, rest, (e) => e.title);
            if (!event) {
              fail(`No local event matches "${rest}".`);
              break;
            }
            printActionResult(session.investigateEvent(event.id), session.view());
            break;
          }
          case "resolve": {
            const event = matchEntity(session.view().events, rest, (e) => e.title);
            if (!event) {
              fail(`No local event matches "${rest}".`);
              break;
            }
            printActionResult(session.resolveEvent(event.id), session.view());
            break;
          }
          case "work": {
            const current = session.view();
            const job = matchEntity(current.jobs, rest, (j) => j.title);
            if (!job) {
              const elsewhere = matchEntity(current.rememberedJobs, rest, (j) => j.title);
              if (elsewhere) {
                const area = current.areas.find((candidate) => candidate.id === elsewhere.area);
                fail(
                  `${elsewhere.title} is discovered but not available in this area${area ? `; move to ${area.name}` : ""}.`,
                );
                break;
              }
              const unavailableMatches = matchingEntities(
                manifest.local_jobs.filter((candidate) =>
                  current.discoveredJobIds.includes(candidate.id),
                ),
                rest,
                (candidate) => candidate.title,
              );
              if (unavailableMatches.length > 1) {
                const choices = unavailableMatches.map((candidate) => {
                  const town = manifest.nodes.find((node) => node.id === candidate.home);
                  return `${candidate.id} (${town?.name ?? candidate.home})`;
                });
                fail(
                  `More than one discovered job matches "${rest}": ${choices.join("; ")}. Use an exact job id.`,
                );
                break;
              }
              const unavailable = unavailableMatches[0];
              if (unavailable) {
                if (current.completedJobIds.includes(unavailable.id)) {
                  fail(`${unavailable.title} is already complete.`);
                  break;
                }
                if (unavailable.home !== current.current.id) {
                  const town = manifest.nodes.find(
                    (candidate) => candidate.id === unavailable.home,
                  );
                  fail(
                    `${unavailable.title} is discovered in ${town?.name ?? unavailable.home}; travel there before working it.`,
                  );
                  break;
                }
                fail(
                  `${unavailable.title} is discovered future work but currently unavailable; its remaining conditions are hidden or unmet. Continue the journey and check again later.`,
                );
                break;
              }
              fail(`No discovered job matches "${rest}". Scouting and exploring reveal jobs.`);
              break;
            }
            printActionResult(session.workLocalJob(job.id), session.view());
            break;
          }
          case "start": {
            const quest = matchEntity(session.view().quests, rest, (q) => q.title);
            if (!quest) {
              fail(`No discovered quest lead matches "${rest}". Scouting reveals more.`);
              break;
            }
            const outcome = await runQuestSession(session, runtime, quest.id, seed, reader);
            if (outcome === "quit") break running;
            break;
          }
          case "journal": {
            printJournal(session.view());
            break;
          }
          case "log": {
            printTravelLog(session.view());
            break;
          }
          case "save":
            saveSnapshot(session, rest);
            break;
          case "load": {
            const path = savePath(rest);
            session = OverworldSession.restore(manifest, JSON.parse(readFileSync(path, "utf8")));
            if (session.journey().status !== "ended") {
              console.log(`Restored ${path}. Resumed in ${session.view().current.name}.`);
              console.log(renderJourneyStatus(session.journey()));
            }
            break;
          }
          case "hash":
            console.log(session.snapshotHash());
            break;
          default:
            fail(`Unknown command "${verb}". Try \`help\`.`);
        }
      } catch (error) {
        fail(`Could not continue: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    rl?.close();
  }

  if (!interactive && scriptedFailure) {
    console.error("\nA scripted command was rejected.");
    process.exitCode = 1;
  }
}

/**
 * One travel leg toward a target: a road number from `look`, an adjacent town, or
 * a discovered town (first leg of the planned route — road encounters resolve
 * between legs, so multi-leg journeys go leg by leg like the web UI).
 */
function travelToward(session: OverworldSession, target: string): TravelLogEntry {
  const view = session.view();
  const index = Number.parseInt(target, 10);
  if (Number.isInteger(index) && index >= 1 && index <= view.exits.length)
    return session.travel(view.exits[index - 1]!.id);
  // Match on the DESTINATION town (name or id), never the edge id — an edge id
  // contains both endpoint names, so it would match the town you are standing in.
  const direct = matchEntity(
    view.exits.map((e) => ({ id: e.destination.id, name: e.destination.name, edgeId: e.id })),
    target,
    (e) => e.name,
  );
  if (direct) return session.travel(direct.edgeId);
  const town = matchEntity(view.discovered, target, (t) => t.name);
  if (!town)
    throw new Error(`No road or discovered town matches "${target}". Try \`routes\` or \`look\`.`);
  const plan = session.planRoute(town.id);
  const first = plan.steps[0];
  if (!first) throw new Error("You are already there.");
  console.log(`Heading toward ${plan.destination.name} — leg 1 of ${plan.steps.length}.`);
  return session.travel(first.edge.id);
}

/**
 * Hand off to an RPG quest session and close the outcome back into the overworld,
 * mirroring the MCP quest bridge: preview → prepare the launch → boot/import the
 * quest → commit the start → play to an ending → completeQuest (never on death; abandoning
 * leaves the lead started-but-open, as the engine dictates).
 */
export async function runQuestSession(
  session: OverworldSession,
  runtime: RpgSourceRuntime,
  questId: string,
  seed: number,
  reader: QuestCommandReader,
): Promise<"done" | "quit"> {
  const quest = session.previewQuestStart(questId);
  let approachId: string | undefined;
  if (quest.launch) {
    console.log(renderQuestLaunch(quest));
    while (approachId === undefined) {
      const raw = await reader.read(`\n[approach: ${quest.title}] > `);
      if (raw === null) return "done";
      const low = raw.trim().toLowerCase();
      if (["quit", "q", "exit"].includes(low)) return "quit";
      if (["abandon", "leave", "cancel"].includes(low)) return "done";
      if (["actions", "help", "?"].includes(low)) {
        console.log(renderQuestLaunch(quest));
        continue;
      }
      const selection = resolveQuestLaunchChoice(quest.launch.options, raw);
      if (selection.kind !== "resolved") {
        console.log(selection.reason);
        continue;
      }
      const option = selection.option;
      if (option.projection?.available === false) {
        console.log(option.projection.blockedReason ?? "That approach is unavailable.");
        continue;
      }
      approachId = option.id;
    }
  }

  // Prepare the parent transition first, but compile and initialize the embedded RPG
  // before committing it. A bad pack or import therefore cannot spend the approach
  // resources, record its memory, or consume the quest-start decision.
  const plan = session.prepareQuestStart(quest.id, approachId);
  const source = runtime.requireWorldQuestPlayable(plan.quest.id);

  const index = indexRpgPack(source.compiled.pack);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);
  let state =
    source.campaignImports === undefined
      ? initStateForRpgPack(index, seed)
      : initStateForRpgPack(index, seed, {
          character: plan.characterAfter,
          imports: source.campaignImports,
        });
  session.commitQuestStart(plan);
  console.log(
    `Started local quest: ${plan.quest.title}${
      plan.quest.launch?.selected
        ? ` via ${plan.quest.launch.options.find((option) => option.id === plan.quest.launch?.selected?.optionId)?.title ?? plan.quest.launch.selected.optionId}`
        : ""
    }. (Type \`abandon\` to set it aside.)`,
  );
  let quitting = false;

  while (true) {
    const obs = buildRpgObservation(index, state, { includeWorldIntro: true });
    console.log(renderQuest(obs));
    if (obs.ended || obs.available_actions.length === 0) break;

    const raw = await reader.read(`\n[quest: ${plan.quest.title}] > `);
    if (raw === null) break;
    const low = raw.trim().toLowerCase();
    if (["quit", "q", "exit"].includes(low)) {
      quitting = true;
      break;
    }
    // `leave` is a common authored dialogue topic (including Cade's). Only the
    // explicitly documented `abandon` command escapes before legal-command
    // resolution gets a chance to act; an unmatched legacy `leave` falls back
    // to abandoning below.
    if (low === "abandon") break;
    if (["actions", "help", "?"].includes(low)) {
      console.log(renderQuestActionHelp(index, state));
      continue;
    }
    const parsed = resolveRpgCommand(index, state, raw);
    if (!parsed.ok) {
      if (low === "leave") break;
      console.log(parsed.reason);
      continue;
    }
    if (!rules.legalActions(state).some((a) => actionEquals(a, parsed.action))) {
      if (low === "leave") break;
      console.log(illegalReason(index, state, parsed.action));
      continue;
    }
    const r = step(state, parsed.action);
    if (!r.ok) {
      console.log(`(${r.rejectionReason})`);
      continue;
    }
    for (const e of r.events) if (e.type === "narration") console.log(e.text);
    state = r.state;
  }

  if (state.ended && state.endingId) {
    const ending = source.compiled.pack.endings.find((e) => e.id === state.endingId);
    if (ending && !ending.death) {
      const result = session.completeQuest(quest.id, {
        endingId: ending.id,
        endingTitle: ending.title,
        death: ending.death,
      });
      console.log(renderQuestCompletion(result));
    } else {
      console.log(
        `That ending does not complete the quest — the lead stays open in your journal, and this journey cannot restart it.`,
      );
    }
  } else if (!quitting) {
    console.log(`You set ${plan.quest.title} aside and return to the road.`);
  }
  return quitting ? "quit" : "done";
}

function saveSnapshot(session: OverworldSession, name: string): void {
  const path = savePath(name);
  mkdirSync(SAVE_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(session.snapshot(), null, 2));
  console.log(`Saved journey to ${path}.`);
}

function savePath(name: string): string {
  const slug = (name.trim() || DEFAULT_SAVE_NAME).toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return join(SAVE_DIR, `${slug}.json`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function rejectPositionals(): void {
  for (let i = 2; i < process.argv.length; i += 1) {
    const value = process.argv[i]!;
    if (VALUE_FLAGS.has(value)) {
      i += 1;
      continue;
    }
    if (value === "--" || value.startsWith("--")) continue;
    throw new Error(
      `overworld takes no positional arguments (got "${value}"); use --restore <saves/file.json> to resume or --commands "..." to script.`,
    );
  }
}

// Run only when invoked directly (not when imported for testing the pure render()),
// mirroring the bin/rpg_play.ts entry guard.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
