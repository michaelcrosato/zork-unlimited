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
import { render as renderQuest, illegalReason, resolve as resolveRpgCommand } from "./rpg_play.js";
import { loadOverworldManifest } from "../src/world/source.js";
import {
  OverworldSession,
  type OverworldActionResult,
  type OverworldPendingRoadEncounter,
  type OverworldQuestView,
  type OverworldRoadEncounterStrategy,
  type OverworldServiceResult,
  type OverworldView,
  type TravelLogEntry,
} from "../src/world/session.js";

const VALUE_FLAGS = new Set(["--commands", "--seed", "--restore"]);
const SAVE_DIR = "saves";
const DEFAULT_SAVE_NAME = "journey";

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
  help · quit`;

function matchEntity<T extends { id: string }>(
  items: readonly T[],
  raw: string,
  label: (item: T) => string,
): T | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  return (
    items.find((t) => t.id.toLowerCase() === q) ??
    items.find((t) => label(t).toLowerCase() === q) ??
    items.find((t) => label(t).toLowerCase().includes(q)) ??
    items.find((t) => t.id.toLowerCase().includes(q)) ??
    null
  );
}

function printActionResult(result: OverworldActionResult): void {
  if (result.alreadyKnown) {
    console.log(`Reviewed: ${result.entry.title}.`);
    return;
  }
  console.log(`[+${result.minutes} min] ${result.entry.text}`);
  for (const area of result.discoveredAreas ?? []) console.log(`  ↳ new area: ${area.name}`);
  for (const job of result.discoveredJobs ?? []) console.log(`  ↳ new job: ${job.title}`);
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
}

type Reader = { read(prompt: string): Promise<string | null>; scripted: boolean };

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
    console.log(`Resumed in ${session.view().current.name}.`);
  } else {
    session = new OverworldSession(manifest);
    console.log(
      `You begin in ${session.view().current.name}. Roads leave town, but the work is local until you find it.`,
    );
  }
  console.log(render(session.view()));

  const interactive = commands === null;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const scripted = commands ?? [];
  let scriptedFailure = false;
  const reader: Reader = {
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
      if (view.pendingRoadEncounter) console.log(renderEncounter(view.pendingRoadEncounter));
      const raw = await reader.read(`\n[${view.current.name}] > `);
      if (raw === null) break;
      const line = raw.trim();
      if (!line) continue;
      const low = line.toLowerCase();
      if (["quit", "q", "exit"].includes(low)) break;
      if (["help", "?"].includes(low)) {
        console.log(HELP);
        continue;
      }

      const fail = (message: string): void => {
        console.log(message);
        scriptedFailure = true;
      };

      try {
        if (view.pendingRoadEncounter) {
          const strategy = strategyForCommand(low);
          if (strategy) {
            const result = session.resolveRoadEncounter(strategy);
            console.log(result.entry.text);
          } else if (["look", "status", "l"].includes(low)) {
            console.log(render(session.view()));
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
              printActionResult(session.exploreArea(v.currentArea.id));
              break;
            }
            const area = matchEntity(v.areas, rest, (a) => a.name);
            if (area) {
              printActionResult(session.exploreArea(area.id));
              break;
            }
            const site = matchEntity(v.sites, rest, (s) => s.title);
            if (site) {
              printActionResult(session.exploreSite(site.id));
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
            printActionResult(session.scoutPoi(poi.id));
            break;
          }
          case "talk": {
            const target = rest.replace(/^to\s+/, "");
            const character = matchEntity(session.view().characters, target, (c) => c.name);
            if (!character) {
              fail(`No local contact matches "${target}".`);
              break;
            }
            printActionResult(session.talkToCharacter(character.id));
            break;
          }
          case "investigate": {
            const event = matchEntity(session.view().events, rest, (e) => e.title);
            if (!event) {
              fail(`No local event matches "${rest}".`);
              break;
            }
            printActionResult(session.investigateEvent(event.id));
            break;
          }
          case "resolve": {
            const event = matchEntity(session.view().events, rest, (e) => e.title);
            if (!event) {
              fail(`No local event matches "${rest}".`);
              break;
            }
            printActionResult(session.resolveEvent(event.id));
            break;
          }
          case "work": {
            const job = matchEntity(session.view().jobs, rest, (j) => j.title);
            if (!job) {
              fail(`No discovered job matches "${rest}". Scouting and exploring reveal jobs.`);
              break;
            }
            printActionResult(session.workLocalJob(job.id));
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
            const journal = session.view().journal;
            for (const entry of journal.slice(-10))
              console.log(`[${entry.recordedAt}] ${entry.town}: ${entry.title} — ${entry.text}`);
            if (!journal.length) console.log("The journal is empty.");
            break;
          }
          case "log": {
            const log = session.view().log;
            for (const entry of log.slice(0, 10))
              console.log(
                `${entry.from} → ${entry.to} via ${entry.route} — ${entry.minutes} min, supplies ${entry.suppliesAfter}, fatigue ${entry.fatigueAfter}`,
              );
            if (!log.length) console.log("No roads travelled yet.");
            break;
          }
          case "save":
            saveSnapshot(session, rest);
            break;
          case "load": {
            const path = savePath(rest);
            session = OverworldSession.restore(manifest, JSON.parse(readFileSync(path, "utf8")));
            console.log(`Restored ${path}. Resumed in ${session.view().current.name}.`);
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
 * mirroring the MCP quest bridge: preview → boot the quest by world quest id →
 * startQuest → play to an ending → completeQuest (never on death; abandoning
 * leaves the lead started-but-open, as the engine dictates).
 */
async function runQuestSession(
  session: OverworldSession,
  runtime: RpgSourceRuntime,
  questId: string,
  seed: number,
  reader: Reader,
): Promise<"done" | "quit"> {
  const quest = session.previewQuestStart(questId);
  const source = runtime.requireWorldQuestPlayable(quest.id);
  session.startQuest(quest.id);
  console.log(`Started local quest: ${quest.title}. (Type \`abandon\` to set it aside.)`);

  const index = indexRpgPack(source.compiled.pack);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);
  let state = initStateForRpgPack(index, seed);
  let quitting = false;

  while (true) {
    const obs = buildRpgObservation(index, state, { includeWorldIntro: true });
    console.log(renderQuest(obs));
    if (obs.ended || obs.available_actions.length === 0) break;

    const raw = await reader.read(`\n[quest: ${quest.title}] > `);
    if (raw === null) break;
    const low = raw.trim().toLowerCase();
    if (["quit", "q", "exit"].includes(low)) {
      quitting = true;
      break;
    }
    if (["abandon", "leave"].includes(low)) break;
    if (["actions", "help", "?"].includes(low)) {
      console.log("You can:\n" + obs.available_actions.map((a) => `  ${a.command}`).join("\n"));
      continue;
    }
    const parsed = resolveRpgCommand(index, state, raw);
    if (!parsed.ok) {
      console.log(parsed.reason);
      continue;
    }
    if (!rules.legalActions(state).some((a) => actionEquals(a, parsed.action))) {
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
      console.log(result.entry.text);
    } else {
      console.log(
        `That ending does not complete the quest — the lead stays open in your journal, and this journey cannot restart it.`,
      );
    }
  } else if (!quitting) {
    console.log(`You set ${quest.title} aside and return to the road.`);
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
