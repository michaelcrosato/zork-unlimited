#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateRecords } from "./aggregate.mjs";
import { projectBuildHash, PROJECT_ROOT } from "./build-hash.mjs";
import { runPlaytests } from "./playtest.mjs";

function runCommand(command, { input, quiet = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, {
      cwd: PROJECT_ROOT,
      shell: true,
      env: process.env,
      stdio: ["pipe", quiet ? "pipe" : "inherit", quiet ? "pipe" : "inherit"],
    });
    let stderr = "";
    if (quiet) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-8000);
      });
    }
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Command failed (code=${code}, signal=${signal}): ${command}\n${stderr}`));
    });
    child.stdin.end(input ?? "");
  });
}

function coderPrompt(task) {
  return [
    "You are the coding agent for Lean Adventure Loop.",
    "Make one small change that addresses the task below.",
    "Do not add MCP tools. Keep game_start + game_step and one response per turn.",
    "Do not read or edit artifacts/runs, artifacts/summary.json, or NEXT_TASK.md.",
    "Use the data-driven engine. Add or update a focused test.",
    "Run npm test before you finish. Exit nonzero if the result is not green.",
    "",
    task.trim(),
    "",
  ].join("\n");
}

export async function runCycle({
  runs = 4,
  player = process.env.PLAYTEST_AGENT_CMD ? "agent" : "mix",
  concurrency = 4,
  seedBase = 1,
  coderCommand = process.env.AI_CODER_CMD,
} = {}) {
  process.stdout.write("[gate] npm test\n");
  await runCommand("npm test");

  process.stdout.write(`[playtest] player=${player} runs=${runs}\n`);
  const wave = await runPlaytests({
    runs,
    player,
    concurrency,
    seedBase,
    aggregate: false,
  });
  const summary = await aggregateRecords({ build: wave.build });

  if (!summary.top) {
    process.stdout.write("[stop] no promoted finding; collect more evidence\n");
    return { status: "no-finding", summary };
  }
  if (!coderCommand) {
    process.stdout.write("[stop] NEXT_TASK.md is ready; set AI_CODER_CMD to apply it\n");
    return { status: "task-ready", summary };
  }

  const task = await readFile(resolve(PROJECT_ROOT, "NEXT_TASK.md"), "utf8");
  process.stdout.write(`[code] ${summary.top.key}\n`);
  await runCommand(coderCommand, { input: coderPrompt(task) });
  const changedBuild = await projectBuildHash();
  if (changedBuild === wave.build) {
    throw new Error("Coding agent exited successfully but made no game-build change.");
  }

  process.stdout.write("[gate] npm test\n");
  await runCommand("npm test");
  process.stdout.write("[gate] scripted MCP playthrough\n");
  const smoke = await runPlaytests({
    runs: 1,
    player: "scripted",
    concurrency: 1,
    seedBase,
    aggregate: true,
  });
  if (smoke.records[0]?.outcome !== "beacon") {
    throw new Error("Post-change scripted playthrough did not reach the beacon ending.");
  }
  return { status: "changed", summary, smoke: smoke.summary };
}

function parseCli(argv) {
  const options = { cycles: 1 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--cycles") options.cycles = Number(argv[++index]);
    else if (flag === "--runs") options.runs = Number(argv[++index]);
    else if (flag === "--player") options.player = argv[++index];
    else if (flag === "--concurrency") options.concurrency = Number(argv[++index]);
    else if (flag === "--seed") options.seedBase = Number(argv[++index]);
    else if (flag === "--coder-cmd") options.coderCommand = argv[++index];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isSafeInteger(options.cycles) || options.cycles < 1) {
    throw new Error("cycles must be a positive integer.");
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const options = parseCli(process.argv.slice(2));
  (async () => {
    const results = [];
    for (let cycle = 0; cycle < options.cycles; cycle += 1) {
      process.stdout.write(`\n=== cycle ${cycle + 1}/${options.cycles} ===\n`);
      results.push(await runCycle({ ...options, seedBase: (options.seedBase ?? 1) + cycle * 1000 }));
      if (results.at(-1).status !== "changed") break;
    }
    process.stdout.write(`${JSON.stringify({ cycles: results.length, status: results.at(-1)?.status })}\n`);
  })().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
