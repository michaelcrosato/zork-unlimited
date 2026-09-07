#!/usr/bin/env -S npx tsx
/**
 * Which post-change bar ONE dev-loop cycle has to clear, read off that cycle's own diff.
 *
 * `npm run ship` already makes this call for a landing (scripts/ship.ts): the census
 * proofs import only `CENSUS_PROOF_SOURCE_SCOPES` (scripts/test-lanes.ts), so a change
 * confined outside them cannot move a census verdict and `health:fast` is sufficient
 * evidence; a change that touches one gets the full `health` because there the proofs
 * ARE the ground truth. `loop.sh` used to run the full bar unconditionally, and the
 * exhaustive census proofs are the large majority of a cycle's wall clock — so a docs
 * or tooling cycle spent most of an hour re-proving packs it never touched. This is the
 * same decision, from the same list, for the loop.
 *
 * The cycle's diff is BOTH halves: what the cycle committed on top of its start ref
 * (the provisional implementation commit) and whatever is still in the working tree
 * (the rotated ledger, and anything else uncommitted at gate time).
 *
 * It fails SAFE in one direction only. Any doubt — an unreadable ref, a git failure, a
 * path this file cannot classify — must end as the FULL bar, because being wrong the
 * other way lands an engine or content regression that only a nightly census proof
 * would catch. main() therefore exits nonzero rather than guessing, and `loop.sh`
 * treats every nonzero exit and every unexpected word on stdout as "run the full bar".
 *
 *   npm run --silent loop:bar -- --against <cycle-start-ref>   # prints "fast" or "full"
 */
import { execFileSync } from "node:child_process";
import { parsePorcelainPaths } from "./ship.js";
import { barForChangedFiles } from "./test-lanes.js";

export interface CycleBarOptions {
  against: string;
}

export function parseCycleBarArguments(args: readonly string[]): CycleBarOptions {
  const against = args[args.indexOf("--against") + 1];
  if (!args.includes("--against") || against === undefined || against.startsWith("--"))
    throw new Error("Usage: npm run --silent loop:bar -- --against <cycle-start-ref>");
  return { against };
}

/**
 * The union of both halves of a cycle's diff, classified by the same helper `ship` uses.
 *
 * `--no-renames` on the committed half, and `parsePorcelainPaths` on the working half,
 * for one shared reason: a rename must be weighed as the delete AND the add, so moving
 * a file OUT of census reach still escalates to the full bar.
 */
export function classifyCycleBar(porcelainZ: string, committedDiff: string): "fast" | "full" {
  const working = parsePorcelainPaths(porcelainZ);
  const committed = committedDiff.split("\n").filter((line) => line.trim() !== "");
  return barForChangedFiles([...new Set([...working, ...committed])]);
}

function main(): void {
  const { against } = parseCycleBarArguments(process.argv.slice(2));
  const porcelainZ = execFileSync("git", ["status", "--porcelain=v1", "-z"], {
    encoding: "utf8",
  });
  const committedDiff = execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", `${against}..HEAD`],
    { encoding: "utf8" },
  );
  process.stdout.write(`${classifyCycleBar(porcelainZ, committedDiff)}\n`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("cycle-bar.ts")) {
  main();
}
