#!/usr/bin/env node
/**
 * scripts/lane.mjs — parallel agent lane worktrees (docs/parallel_lanes.md).
 *
 * A "lane" is an isolated git worktree under ../zork-lanes/<name> on branch
 * lane/<name>, branched from origin/main, so 4+ agents (human sessions,
 * headless CLI agents, or subagents of an orchestrating model) can work the
 * repo concurrently without touching each other's trees. Landing is unchanged:
 * short-lived branch → PR → the required `verify` check.
 *
 * node_modules is junction-linked from the primary checkout by default (root
 * and ui/) so lanes skip duplicate installs. The junction is removed before
 * `git worktree remove` (an untracked node_modules would otherwise force
 * --force). If a lane changes dependencies, run `npm install` inside the lane
 * after `lane create <name> --no-link` instead.
 *
 * Commands:
 *   node scripts/lane.mjs create <name> [--from <ref>] [--no-link]
 *   node scripts/lane.mjs list
 *   node scripts/lane.mjs remove <name> [--force]
 *   node scripts/lane.mjs zones
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmdirSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LANES_ROOT = resolve(REPO_ROOT, "..", "zork-lanes");

/** Standing lane zones — keep in sync with docs/parallel_lanes.md. */
export const LANE_ZONES = [
  ["content-a", "content/rpg/quests/ split 1 + their tests and traces"],
  ["content-b", "content/rpg/quests/ split 2 + their tests and traces"],
  ["engine", "src/ (except src/afk, src/feedback), ui/, their tests"],
  ["harness", "blind-tester/, scripts/, src/afk/, src/feedback/, docs"],
];

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", ...opts });
}

function laneName(raw) {
  if (!raw || !/^[a-z0-9][a-z0-9-]*$/.test(raw)) {
    throw new Error("lane name must be lowercase alphanumeric/hyphens, e.g. content-a");
  }
  return raw;
}

function linkNodeModules(lanePath) {
  for (const rel of ["node_modules", join("ui", "node_modules")]) {
    const source = join(REPO_ROOT, rel);
    const target = join(lanePath, rel);
    if (!existsSync(source) || existsSync(target)) continue;
    symlinkSync(source, target, "junction");
    console.log(`  linked ${rel} → primary checkout`);
  }
}

function unlinkNodeModules(lanePath) {
  for (const rel of ["node_modules", join("ui", "node_modules")]) {
    const target = join(lanePath, rel);
    if (!existsSync(target)) continue;
    try {
      // rmdirSync removes a junction/symlink reparse point without following
      // it, and refuses (throws) on a real non-empty directory — so a lane
      // that did its own `npm install` is never silently deleted here.
      rmdirSync(target);
      console.log(`  unlinked ${rel}`);
    } catch {
      console.log(
        `  ${rel} is a real directory (not a junction); leaving it for git worktree remove`,
      );
    }
  }
}

function create(name, args) {
  const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : "origin/main";
  const lanePath = join(LANES_ROOT, name);
  if (existsSync(lanePath)) throw new Error(`lane path already exists: ${lanePath}`);
  console.log(`Fetching origin…`);
  git(["fetch", "origin"], { stdio: "inherit", encoding: undefined });
  console.log(`Creating worktree ${lanePath} on branch lane/${name} from ${from}…`);
  git(["worktree", "add", "-b", `lane/${name}`, lanePath, from], {
    stdio: "inherit",
    encoding: undefined,
  });
  if (!args.includes("--no-link")) linkNodeModules(lanePath);
  console.log(`Lane ready. Work there, commit, then land via PR (required check: verify).`);
}

function list() {
  const out = git(["worktree", "list", "--porcelain"]);
  const entries = out.split("\n\n").filter((e) => e.trim() !== "");
  for (const entry of entries) {
    const path = entry.match(/^worktree (.+)$/m)?.[1] ?? "(unknown)";
    const branch = entry.match(/^branch (.+)$/m)?.[1] ?? "(detached)";
    console.log(`${path}  ${branch.replace("refs/heads/", "")}`);
  }
}

function remove(name, args) {
  const lanePath = join(LANES_ROOT, name);
  if (!existsSync(lanePath)) throw new Error(`no such lane worktree: ${lanePath}`);
  unlinkNodeModules(lanePath);
  const removeArgs = ["worktree", "remove", lanePath];
  if (args.includes("--force")) removeArgs.push("--force");
  git(removeArgs, { stdio: "inherit", encoding: undefined });
  console.log(`Removed lane ${name}. Delete its branch when merged: git branch -d lane/${name}`);
}

function zones() {
  console.log(
    "Standing lanes (single-writer rule for global files — see docs/parallel_lanes.md):\n",
  );
  for (const [name, zone] of LANE_ZONES) console.log(`  ${name.padEnd(10)} ${zone}`);
  console.log(
    "\nGlobal files (one assigned writer at a time): content/world/new_york_overworld.json,\nAI_LOOP_STATE.md, docs/DECISION_LOG.md, traces/bugs/ sequence numbers.",
  );
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "create") create(laneName(args[0]), args.slice(1));
  else if (command === "list") list();
  else if (command === "remove") remove(laneName(args[0]), args.slice(1));
  else if (command === "zones") zones();
  else {
    console.log(
      "usage: node scripts/lane.mjs <create <name> [--from ref] [--no-link] | list | remove <name> [--force] | zones>",
    );
    process.exit(command === undefined || command === "help" ? 0 : 2);
  }
}

// Entry guard so tests can import LANE_ZONES without running the CLI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
