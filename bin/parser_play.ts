#!/usr/bin/env -S npx tsx
/**
 * bin/parser_play — play a Stage-2 parser pack from the terminal (§9.3).
 *
 * Usage:
 *   npm run play:parser -- <pack.yaml> [--seed N]
 *   npm run play:parser -- <pack.yaml> --commands "go north; take rope; ..."   # non-interactive
 *   npm run play:parser -- <pack.yaml> --commands "..." --record traces/run.json
 *
 * A pack must pass the validator before it is playable (§0, §10). Humans type
 * controlled commands (look, go north, take rope, use rope on old well, …); the
 * legal-action set is ground truth. `actions` lists what is possible right now.
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { makeStep, actionEquals } from "../src/core/engine.js";
import { evalConditions } from "../src/core/conditions.js";
import type { Action } from "../src/api/types.js";
import { loadParserPackFile } from "../src/parser/pack.js";
import { validateParser } from "../src/validate/parser_validator.js";
import { formatReport } from "../src/validate/report.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../src/parser/runner.js";
import { buildParserObservation, type ParserObservation } from "../src/parser/observation.js";
import { parseCommand } from "../src/parser/command_map.js";
import { recordTrace } from "../src/trace/record.js";
import type { ParserIndex } from "../src/parser/model.js";

type Args = { path: string; seed: number; commands: string[] | null; record: string | null };

function parseArgs(argv: string[]): Args {
  const path = argv[2];
  if (!path || path.startsWith("--")) {
    console.error(
      'Usage: npm run play:parser -- <pack.yaml> [--seed N] [--commands "a; b; c"] [--record file]',
    );
    process.exit(2);
  }
  let seed = 1;
  let commands: string[] | null = null;
  let record: string | null = null;
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") seed = Number(argv[++i]);
    else if (a === "--commands")
      commands = (argv[++i] ?? "")
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "--record") record = argv[++i] ?? null;
  }
  return { path, seed, commands, record };
}

export function render(obs: ParserObservation): string {
  const lines = [`\n=== ${obs.title} ===`, obs.description.trim()];
  if (obs.dialogue) {
    lines.push(`\n${obs.dialogue.npc}: "${obs.dialogue.npc_text}"`);
    lines.push("Topics:");
    for (const a of obs.available_actions) lines.push(`  - ${a.command}`);
    return lines.join("\n");
  }
  if (obs.visible_objects.length)
    lines.push(`You see: ${obs.visible_objects.map((o) => o.name).join(", ")}.`);
  if (obs.npcs_present.length)
    lines.push(`Here: ${obs.npcs_present.map((n) => n.name).join(", ")}.`);
  if (obs.exits.length) lines.push(`Exits: ${obs.exits.map((e) => e.direction).join(", ")}.`);
  // Blocked-exit hints (bug_0201): a way exists here but is currently barred — show
  // its direction and the author's reason, so a human player (like the agent surface)
  // can tell a gated-but-present exit from a non-existent one. How to clear it stays
  // hidden (it is not a selectable command); the structured observation drives this.
  for (const b of obs.blocked_exits) lines.push(`Blocked (${b.direction}): ${b.message}`);
  if (obs.inventory.length) lines.push(`[carrying: ${obs.inventory.join(", ")}]`);
  if (obs.ended) lines.push(`\n*** ${obs.ending_id} *** — THE END`);
  return lines.join("\n");
}

/** A friendly reason a parsed-but-illegal action failed (e.g. a locked exit). */
function illegalReason(
  index: ParserIndex,
  state: import("../src/core/state.js").GameState,
  action: Action,
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const loaded = loadParserPackFile(args.path);
  if (!loaded.ok) {
    console.error("Pack failed schema validation. Run `npm run validate` for details.");
    process.exit(1);
  }
  const report = validateParser(loaded.compiled.pack);
  if (!report.ok) {
    console.error("Pack is not playable — validation errors:\n" + formatReport(report));
    process.exit(1);
  }

  const index = indexParserPack(loaded.compiled.pack);
  const rules = buildParserRules(index);
  const step = makeStep(rules);
  let state = initStateForParserPack(index, args.seed);
  const taken: Action[] = [];

  const interactive = args.commands === null;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  const scripted = args.commands ?? [];

  try {
    while (true) {
      const obs = buildParserObservation(index, state);
      console.log(render(obs));
      if (obs.ended || obs.available_actions.length === 0) break;

      let raw: string;
      if (interactive) {
        raw = await rl!.question("\n> ");
        const low = raw.trim().toLowerCase();
        if (["quit", "q", "exit"].includes(low)) break;
        if (["actions", "help", "?"].includes(low)) {
          console.log("You can:\n" + obs.available_actions.map((a) => `  ${a.command}`).join("\n"));
          continue;
        }
      } else {
        const next = scripted.shift();
        if (next === undefined) break;
        raw = next;
        console.log(`\n> ${raw}`);
      }

      const parsed = parseCommand(index, state, raw);
      if (!parsed.ok) {
        console.log(parsed.reason);
        continue;
      }
      const legal = rules.legalActions(state).some((a) => actionEquals(a, parsed.action));
      if (!legal) {
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

  // In scripted mode the run is an acceptance check: fail loudly if the command
  // list did not actually reach an ending.
  if (!interactive && !state.ended) {
    console.error("\nThe command list did not reach an ending.");
    process.exitCode = 1;
  }

  if (args.record) {
    const trace = recordTrace(rules, initStateForParserPack(index, args.seed), taken, {
      trace_id: "tr_parser_play",
      pack_id: loaded.compiled.pack.meta.id,
      content_hash: loaded.compiled.contentHash,
    });
    writeFileSync(args.record, JSON.stringify(trace, null, 2));
    console.log(`\nTrace written to ${args.record}`);
  }
}

// Run only when invoked directly (not when imported for testing the pure render()),
// mirroring the src/ai-loop.ts entry guard.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
