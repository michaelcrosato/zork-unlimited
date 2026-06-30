#!/usr/bin/env -S npx tsx
/**
 * bin/rpg_play — play a Stage-4 (Hero's-Quest) RPG pack from the terminal.
 *
 * Usage:
 *   npm run play -- <pack.yaml> [--seed N]
 *   npm run play -- <pack.yaml> --commands "down; take iron bar; north; attack wight; ..."
 *
 * Reuses the Stage-2 controlled command parser and adds an `attack <enemy>` verb.
 * A pack must pass the RPG validator before it is playable (§0, §10). The
 * legal-action set (parser actions + ATTACK) is ground truth; combat and skill
 * checks are seeded, so a recorded run replays exactly (§8.5).
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { makeStep, actionEquals } from "../src/core/engine.js";
import { evalConditions } from "../src/core/conditions.js";
import type { Action } from "../src/api/types.js";
import { loadRpgPackFile } from "../src/rpg/pack.js";
import { validateRpg } from "../src/validate/rpg_validator.js";
import { formatReport } from "../src/validate/report.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../src/rpg/runner.js";
import { buildRpgObservation, type RpgObservation } from "../src/rpg/observation.js";
import { parseCommand } from "../src/parser/command_map.js";
import { recordTrace } from "../src/trace/record.js";

export function render(obs: RpgObservation): string {
  const lines = [`\n=== ${obs.title} ===`, obs.description.trim()];
  lines.push(`[HP ${obs.stats.hp}  ATK ${obs.stats.attack}  DEF ${obs.stats.defense}]`);
  if (obs.enemies_present.length)
    lines.push(`Foes: ${obs.enemies_present.map((e) => `${e.name} (HP ${e.hp})`).join(", ")}.`);
  if (obs.visible_objects.length)
    lines.push(`You see: ${obs.visible_objects.map((o) => o.name).join(", ")}.`);
  if (obs.exits.length) lines.push(`Exits: ${obs.exits.map((e) => e.direction).join(", ")}.`);
  // Blocked-exit hints (bug_0201) — see bin/parser_play.ts; RpgObservation inherits the
  // field, so the human RPG surface gets the same "a barred way exists here, because X" cue.
  for (const b of obs.blocked_exits) lines.push(`Blocked (${b.direction}): ${b.message}`);
  if (obs.inventory.length) lines.push(`[carrying: ${obs.inventory.join(", ")}]`);
  if (obs.ended) lines.push(`\n*** ${obs.ending_id} *** — THE END`);
  return lines.join("\n");
}

/**
 * A friendly reason a parsed-but-illegal action failed — parity with bin/parser_play.ts
 * (bug_0206 follow-on): an attempted MOVE onto a barred-but-present exit surfaces the
 * author's `locked_msg` (the same string the structured `blocked_exits` hint carries),
 * not a flat "You can't do that right now." It never reveals HOW to clear the exit (that
 * stays a hidden, not-yet-legal command). RpgIndex extends ParserIndex, so `.rooms` and
 * each exit's `conditions`/`locked_msg` are the same shape the parser bin reads.
 */
export function illegalReason(
  index: ReturnType<typeof indexRpgPack>,
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

/** Resolve a raw command: `attack <foe>` against enemies here, else the parser. */
function resolve(
  index: ReturnType<typeof indexRpgPack>,
  state: import("../src/core/state.js").GameState,
  raw: string,
): { ok: true; action: Action } | { ok: false; reason: string } {
  const text = raw.trim().toLowerCase();
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

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    console.error(
      'Usage: npm run play -- <pack.yaml> [--seed N] [--commands "a; b"] [--record file]',
    );
    process.exit(2);
  }
  let seed = 1;
  let commands: string[] | null = null;
  let record: string | null = null;
  for (let i = 3; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--seed") seed = Number(process.argv[++i]);
    else if (a === "--commands")
      commands = (process.argv[++i] ?? "")
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "--record") record = process.argv[++i] ?? null;
  }

  const loaded = loadRpgPackFile(path);
  if (!loaded.ok) {
    console.error("Pack failed schema validation. Run `npm run validate` for details.");
    process.exit(1);
  }
  const report = validateRpg(loaded.compiled.pack);
  if (!report.ok) {
    console.error("Pack is not playable — validation errors:\n" + formatReport(report));
    process.exit(1);
  }

  const index = indexRpgPack(loaded.compiled.pack);
  const rules = buildRpgRules(index);
  const step = makeStep(rules);
  let state = initStateForRpgPack(index, seed);
  const taken: Action[] = [];

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
          console.log("You can:\n" + obs.available_actions.map((a) => `  ${a.command}`).join("\n"));
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
      pack_id: loaded.compiled.pack.meta.id,
      content_hash: loaded.compiled.contentHash,
    });
    writeFileSync(record, JSON.stringify(trace, null, 2));
    console.log(`\nTrace written to ${record}`);
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
