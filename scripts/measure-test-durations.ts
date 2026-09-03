import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { LANE_NAMES, type LaneName } from "./test-lanes.js";

/**
 * Runs one suite lane under `scripts/test-duration-reporter.ts` and leaves a JSON Lines
 * record of what every file in it cost.
 *
 * A driver rather than an npm script with an inline `VAR=value` prefix, because that
 * prefix is not portable: `cmd.exe` treats it as a command name, so the Windows lane
 * would fail on the script itself rather than on anything it tests.
 *
 * The lanes are measured SEPARATELY on purpose. `vitest.config.ts` runs the census
 * proofs one or two workers wide while the standard project gets up to eight, so a
 * single combined run would price both cohorts under a concurrency neither of them
 * actually receives.
 */

export const LANE_PROJECT_FLAGS: Readonly<Record<LaneName, string[]>> = {
  fast: ["--project", "standard"],
  exhaustive: [
    "--project",
    "exhaustive-rpg",
    "--project",
    "variant-liveness-proof",
    "--project",
    "ending-render-proof",
    "--project",
    "metamorphic-observation",
  ],
};

export function defaultOutputPath(lane: LaneName): string {
  return `ai-runs/test-durations-${lane}.jsonl`;
}

const USAGE = `Usage: tsx scripts/measure-test-durations.ts [--lane ${LANE_NAMES.join("|")}] [--out <path>]`;

export function parseMeasureArguments(args: readonly string[]): { lane: LaneName; out: string } {
  let lane: LaneName = "fast";
  let out: string | undefined;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined || (flag !== "--lane" && flag !== "--out")) throw new Error(USAGE);
    if (flag === "--out") {
      out = value;
      continue;
    }
    if (!(LANE_NAMES as string[]).includes(value)) {
      throw new Error(`Expected one of ${LANE_NAMES.join(", ")} after --lane, received ${value}.`);
    }
    lane = value as LaneName;
  }
  return { lane, out: out ?? defaultOutputPath(lane) };
}

export function vitestArgumentsFor(lane: LaneName): string[] {
  return [
    "vitest",
    "run",
    ...(LANE_PROJECT_FLAGS[lane] ?? []),
    "--reporter=./scripts/test-duration-reporter.ts",
    "--reporter=dot",
  ];
}

function main(): void {
  const { lane, out } = parseMeasureArguments(process.argv.slice(2));
  console.error(`Measuring the ${lane} lane into ${out} …`);
  const result = spawnSync("npm", ["exec", "--", ...vitestArgumentsFor(lane)], {
    stdio: "inherit",
    env: { ...process.env, TEST_DURATION_OUT: out },
    shell: process.platform === "win32",
  });
  // A red suite still leaves a complete record for every file that finished, and the
  // durations of a failing run are exactly what a "why is CI slow" question needs, so
  // the measurement is reported either way — but the exit status is not laundered.
  console.error(`Wrote ${out}. Analyse it with: npm run test:census -- ${out}`);
  process.exit(result.status ?? 1);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
