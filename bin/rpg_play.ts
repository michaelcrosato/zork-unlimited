#!/usr/bin/env -S npx tsx
/**
 * bin/rpg_play — play a shipped New York overworld RPG quest from the terminal.
 *
 * Usage:
 *   npm run play                                      # play the default world quest
 *   npm run play -- <world_quest_id> [--seed N]
 *   npm run play -- <world_quest_id> --commands "down; take iron bar; ..."
 *
 * Uses the controlled command grammar, an `attack <enemy>` verb, and exact
 * authored commands for currently-legal one-shot combat maneuvers.
 * The quest's bound pack must pass the RPG validator before it is playable (§0, §10). The
 * legal-action set (base RPG actions + combat actions) is ground truth; combat and skill
 * checks are seeded, so a recorded run replays exactly (§8.5).
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { makeStep, actionEquals } from "../src/core/engine.js";
import { evalConditions } from "../src/core/conditions.js";
import type { RpgAction } from "../src/api/types.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  enumerateRpgBlockedActions,
} from "../src/rpg/runner.js";
import type { RpgActionOption } from "../src/rpg/legal_actions.js";
import { buildRpgObservation, type RpgObservation } from "../src/rpg/observation.js";
import { parseCommand } from "../src/rpg/command_map.js";
import {
  projectRpgPlayerCommands,
  renderRpgPlayerActionHelp,
  renderRpgPlayerCommand,
  resolveRpgPlayerCommand,
} from "../src/rpg/player_command_projection.js";
import { recordTrace } from "../src/trace/record.js";
import { RpgSourceRuntime } from "../src/mcp/rpg_source_runtime.js";

const DEFAULT_WORLD_QUEST_ID = "breaking_weir";
const SOURCE_FLAGS = new Set(["--world-quest-id", "--world_quest_id"]);
const VALUE_FLAGS = new Set([...SOURCE_FLAGS, "--seed", "--commands", "--record"]);

export function render(obs: RpgObservation): string {
  const lines = [`\n=== ${obs.title} ===`, obs.description.trim()];
  lines.push(`[HP ${obs.stats.hp}  ATK ${obs.stats.attack}  DEF ${obs.stats.defense}]`);
  if (obs.enemies_present.length)
    lines.push(`Foes: ${obs.enemies_present.map((e) => `${e.name} (HP ${e.hp})`).join(", ")}.`);
  const people = [...new Set(obs.npcs_present.map((npc) => npc.name.trim()).filter(Boolean))];
  if (!obs.ended && people.length) lines.push(`People here: ${people.join(", ")}.`);
  if (obs.visible_objects.length)
    lines.push(`You see: ${obs.visible_objects.map((o) => o.name).join(", ")}.`);
  if (obs.exits.length) lines.push(`Exits: ${obs.exits.map((e) => e.direction).join(", ")}.`);
  // Blocked-exit hints keep the human RPG surface aligned with structured observations:
  // "a barred way exists here, because X" without revealing the hidden unlock action.
  for (const b of obs.blocked_exits) lines.push(`Blocked (${b.direction}): ${b.message}`);
  for (const action of obs.blocked_actions) {
    lines.push(`Unavailable: ${action.command} — ${action.reason}`);
  }
  if (obs.inventory.length) lines.push(`[carrying: ${obs.inventory.join(", ")}]`);
  if (obs.ended) lines.push(`\n*** ${obs.ending_id} *** — THE END`);
  return lines.join("\n");
}

/**
 * A friendly reason a parsed-but-illegal action failed. An attempted MOVE onto a barred
 * but present exit surfaces the
 * author's `locked_msg` (the same string the structured `blocked_exits` hint carries),
 * not a flat "You can't do that right now." It never reveals HOW to clear the exit (that
 * stays a hidden, not-yet-legal command).
 */
export function illegalReason(
  index: ReturnType<typeof indexRpgPack>,
  state: import("../src/core/state.js").GameState,
  action: RpgAction,
): string {
  if (action.type === "MOVE") {
    const exit = index.rooms
      .get(state.current)
      ?.exits.find((e) => e.direction === action.direction);
    if (exit && !evalConditions(exit.conditions, state))
      return exit.locked_msg ?? "You can't go that way yet.";
  }
  return "You can't do that right now.";
}

/** Resolve a raw command: `attack <foe>` against enemies here, else base RPG commands.
 * Exported so bin/overworld_play.ts's quest handoff drives the identical grammar. */
export function resolve(
  index: ReturnType<typeof indexRpgPack>,
  state: import("../src/core/state.js").GameState,
  raw: string,
): { ok: true; action: RpgAction } | { ok: false; reason: string } {
  const text = raw.trim().toLowerCase();
  const legal = enumerateRpgActions(index, state);
  const projected = resolveRpgPlayerCommand(legal, raw, { index, state });
  if (projected.kind === "resolved") return { ok: true, action: projected.option.action };
  if (projected.kind === "ambiguous") return { ok: false, reason: projected.reason };
  // Authored commands are controlled vocabulary too. Match every exact legal
  // legacy label before unavailable affordances or the generic command grammar.
  // Current terminal labels were already handled by the shared projection. In
  // particular, a blocked USE may deliberately share ordinary vocabulary such
  // as "read" with a different legal action; the legal menu remains ground truth.
  const exactLegal = legal.find((option) => option.command.trim().toLowerCase() === text);
  if (exactLegal) return { ok: true, action: exactLegal.action };
  const blocked = enumerateRpgBlockedActions(index, state).find(
    (option) => option.command.trim().toLowerCase() === text,
  );
  if (blocked) return { ok: false, reason: blocked.reason };
  const m = text.match(/^(attack|fight|kill|hit)\s+(.*)$/);
  if (m) {
    const phrase = m[2]!.replace(/^the\s+/, "");
    const here = index.enemyByRoom.get(state.current) ?? [];
    const enemy = here.find((e) => e.id === phrase || e.name.toLowerCase().includes(phrase));
    return enemy
      ? { ok: true, action: { type: "ATTACK", enemy: enemy.id } }
      : { ok: false, reason: `There's no "${phrase}" to attack here.` };
  }
  return parseCommand(index, state, raw);
}

/** Player-facing terminal label for one legal action, including tactical math. */
export function renderActionOption(option: RpgActionOption): string {
  return renderRpgPlayerCommand(projectRpgPlayerCommands([option])[0]!);
}

/** Render the complete human action menu, including authored unavailable choices. */
export function renderActionHelp(
  index: ReturnType<typeof indexRpgPack>,
  state: import("../src/core/state.js").GameState,
): string {
  return renderRpgPlayerActionHelp(
    enumerateRpgActions(index, state),
    enumerateRpgBlockedActions(index, state),
    { index, state },
  );
}

async function main(): Promise<void> {
  const source = new RpgSourceRuntime(process.cwd()).requireWorldQuestPlayable(playWorldQuestId());
  const seed = Number(arg("--seed") ?? 1);
  const rawCommands = arg("--commands");
  const commands =
    rawCommands === undefined
      ? null
      : rawCommands
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
  const record = arg("--record") ?? null;

  const index = indexRpgPack(source.compiled.pack);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);
  let state = initStateForRpgPack(index, seed);
  const taken: RpgAction[] = [];

  const interactive = commands === null;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const scripted = commands ?? [];

  try {
    while (true) {
      const obs = buildRpgObservation(index, state, { includeWorldIntro: true });
      console.log(render(obs));
      if (obs.ended || obs.available_actions.length === 0) break;

      let raw: string;
      if (interactive) {
        raw = await rl!.question("\n> ");
        const low = raw.trim().toLowerCase();
        if (["quit", "q", "exit"].includes(low)) break;
        if (["actions", "help", "?"].includes(low)) {
          console.log(renderActionHelp(index, state));
          continue;
        }
      } else {
        const next = scripted.shift();
        if (next === undefined) break;
        raw = next;
        console.log(`\n> ${raw}`);
      }

      const parsed = resolve(index, state, raw);
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
      taken.push(parsed.action);
      state = r.state;
    }
  } finally {
    rl?.close();
  }

  if (!interactive && !state.ended) {
    console.error("\nThe command list did not reach an ending.");
    process.exitCode = 1;
  }

  if (record) {
    const trace = recordTrace(rules, initStateForRpgPack(index, seed), taken, {
      trace_id: "tr_rpg_play",
      content_hash: source.compiled.contentHash,
      worldQuestId: source.questId,
    });
    writeFileSync(record, JSON.stringify(trace, null, 2));
    console.log(`\nTrace written to ${record}`);
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function looksLikePackPath(value: string): boolean {
  return /\.ya?ml$/i.test(value) || value.includes("/") || value.includes("\\");
}

function positionalSourceArg(): string | undefined {
  for (let i = 2; i < process.argv.length; i += 1) {
    const value = process.argv[i]!;
    if (VALUE_FLAGS.has(value)) {
      i += 1;
      continue;
    }
    if (value === "--" || value.startsWith("--")) continue;
    return value;
  }
  return undefined;
}

function playWorldQuestId(): string {
  const pack = arg("--pack");
  const worldQuestId = arg("--world-quest-id") ?? arg("--world_quest_id");
  const positional = positionalSourceArg();
  if (pack !== undefined) {
    throw new Error(
      "play starts shipped quests by world quest id only; use --world-quest-id or a positional quest id, not --pack.",
    );
  }
  const sourceCount = [worldQuestId !== undefined, positional !== undefined].filter(Boolean).length;
  if (sourceCount > 1) {
    throw new Error(
      "play accepts exactly one quest source: --world-quest-id or positional quest id.",
    );
  }
  if (worldQuestId !== undefined) return worldQuestId;
  if (positional === undefined) return DEFAULT_WORLD_QUEST_ID;
  if (looksLikePackPath(positional)) {
    throw new Error(
      "play starts shipped quests by world quest id only; run `npm run validate -- <world_quest_id>` to inspect a shipped quest.",
    );
  }
  return positional;
}

// Run only when invoked directly (not when imported for testing the pure render()),
// mirroring the src/ai-loop.ts entry guard.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
