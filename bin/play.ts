#!/usr/bin/env -S npx tsx
/**
 * bin/play — play a CYOA pack from the terminal (§9.3).
 *
 * Usage:
 *   npm run play -- <pack.yaml> [--seed N]
 *   npm run play -- <pack.yaml> --choices go_east,inspect_ground,...   # non-interactive
 *   npm run play -- <pack.yaml> --choices ... --record traces/run.json # save a trace
 *
 * A pack must pass the validator before it is playable (§0, §10). Choices may be
 * given by their id or by 1-based position in the current menu.
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { makeStep } from "../src/core/engine.js";
import type { Action } from "../src/api/types.js";
import { loadPackFile } from "../src/cyoa/pack.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { formatReport } from "../src/validate/report.js";
import { indexPack, buildRules, initStateForPack } from "../src/cyoa/runner.js";
import { buildObservation, type CyoaObservation } from "../src/cyoa/observation.js";
import { recordTrace } from "../src/trace/record.js";

type Args = { path: string; seed: number; choices: string[] | null; record: string | null };

function parseArgs(argv: string[]): Args {
  const path = argv[2];
  if (!path || path.startsWith("--")) {
    console.error("Usage: npm run play -- <pack.yaml> [--seed N] [--choices a,b] [--record file]");
    process.exit(2);
  }
  let seed = 1;
  let choices: string[] | null = null;
  let record: string | null = null;
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") seed = Number(argv[++i]);
    else if (a === "--choices") choices = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--record") record = argv[++i] ?? null;
  }
  return { path, seed, choices, record };
}

function renderObservation(obs: CyoaObservation): string {
  const lines = [`\n=== ${obs.title} ===`, obs.text.trim()];
  if (obs.state.inventory.length) lines.push(`\n[inventory: ${obs.state.inventory.join(", ")}]`);
  if (obs.ended) {
    lines.push(`\n*** THE END — ${obs.ending_id} ***`);
  } else {
    lines.push("");
    obs.available_actions.forEach((c, i) => lines.push(`  ${i + 1}. ${c.text}  (${c.id})`));
  }
  return lines.join("\n");
}

/** Map a raw input (id or 1-based index) to a choice id, or null if invalid. */
function resolveChoice(input: string, obs: CyoaObservation): string | null {
  const trimmed = input.trim();
  const byId = obs.available_actions.find((c) => c.id === trimmed);
  if (byId) return byId.id;
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 1 && n <= obs.available_actions.length) {
    return obs.available_actions[n - 1]?.id ?? null;
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const result = loadPackFile(args.path);
  if (!result.ok) {
    console.error("Pack failed schema validation. Run `npm run validate` for details.");
    process.exit(1);
  }
  const report = validateCyoa(result.compiled.pack);
  if (!report.ok) {
    console.error("Pack is not playable — validation errors:\n" + formatReport(report));
    process.exit(1);
  }

  const index = indexPack(result.compiled.pack);
  const rules = buildRules(index);
  const step = makeStep(rules);
  let state = initStateForPack(index, args.seed);
  const taken: Action[] = [];

  const interactive = args.choices === null;
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : null;
  let scripted = args.choices ?? [];

  try {
    while (true) {
      const obs = buildObservation(index, state);
      console.log(renderObservation(obs));
      if (obs.ended || obs.available_actions.length === 0) break;

      let raw: string;
      if (interactive) {
        raw = await rl!.question("\n> ");
        if (["quit", "q", "exit"].includes(raw.trim().toLowerCase())) break;
      } else {
        const nextInput = scripted.shift();
        if (nextInput === undefined) break;
        raw = nextInput;
        console.log(`\n> ${raw}`);
      }

      const choiceId = resolveChoice(raw, obs);
      if (!choiceId) {
        console.log("I don't understand that. Pick a listed number or choice id.");
        continue;
      }
      const action: Action = { type: "CHOOSE", choiceId };
      const r = step(state, action);
      if (!r.ok) {
        console.log(`(${r.rejectionReason})`);
        continue;
      }
      taken.push(action);
      state = r.state;
    }
  } finally {
    rl?.close();
  }

  if (args.record) {
    const trace = recordTrace(rules, initStateForPack(index, args.seed), taken, {
      trace_id: "tr_play",
      pack_id: result.compiled.pack.meta.id,
      content_hash: result.compiled.contentHash,
    });
    writeFileSync(args.record, JSON.stringify(trace, null, 2));
    console.log(`\nTrace written to ${args.record}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
