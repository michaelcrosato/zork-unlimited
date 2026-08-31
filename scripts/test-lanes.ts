import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVitestSuiteProjects } from "./verify-integrity.js";

/**
 * Two vitest lanes over ONE unchanged project set.
 *
 * `vitest.config.ts` still claims every discovered test file — `detectSuiteCoverage`
 * in the verifier proves that, and nothing here may weaken it. What splits is only
 * WHICH named projects a given npm script hands to vitest:
 *
 *   - FAST (`test:fast`) — every ordinary unit/property/regression/acceptance file.
 *     This is the pre-commit lane; `health:fast` is the bar built on it.
 *   - EXHAUSTIVE (`test:exhaustive`) — the whole-state-space census proofs. Each one
 *     BFSes the complete reachable region of every shipped pack, so they are minutes
 *     apiece and run one or two workers wide by design (see the per-project comments
 *     in vitest.config.ts). They run nightly in `deep-audit.yml`.
 *
 * The split is only defensible while it is EXHAUSTIVE, and the dangerous failure is
 * silent: add a sixth project to vitest.config.ts, forget to name it in either script,
 * and it runs in NO lane while both lanes still exit 0 — the same shape of silent skip
 * the suite-coverage guard exists to catch, one level up. `detectLanePartition` is that
 * guard for the lanes, and `tests/unit/test_lanes.test.ts` runs it against the real
 * package.json and vitest.config.ts on every suite run. It reads the ACTUAL script
 * bodies rather than a parallel list, so a lane list and the command that runs cannot
 * drift apart.
 */
export const LANE_SCRIPTS = {
  fast: "test:fast",
  exhaustive: "test:exhaustive",
} as const;

export type LaneName = keyof typeof LANE_SCRIPTS;

export const LANE_NAMES = Object.keys(LANE_SCRIPTS) as LaneName[];

/** Every `--project <name>` (and `--project=<name>`) a script body hands to vitest. */
export function parseLaneProjects(scriptBody: string): string[] {
  const projects: string[] = [];
  const tokens = scriptBody.split(/\s+/).filter((token) => token !== "");
  for (const [index, token] of tokens.entries()) {
    if (token.startsWith("--project=")) {
      projects.push(token.slice("--project=".length));
      continue;
    }
    if (token === "--project") {
      const value = tokens[index + 1];
      if (value !== undefined && !value.startsWith("-")) projects.push(value);
    }
  }
  return projects;
}

export function readPackageScripts(root = process.cwd()): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed))
    throw new Error("package.json has no scripts block.");
  const scripts = (parsed as { scripts: unknown }).scripts;
  if (typeof scripts !== "object" || scripts === null)
    throw new Error("package.json scripts block is not an object.");
  return scripts as Record<string, string>;
}

export function readLaneProjects(root = process.cwd()): Record<LaneName, string[]> {
  const scripts = readPackageScripts(root);
  const lanes = {} as Record<LaneName, string[]>;
  for (const lane of LANE_NAMES) {
    const body = scripts[LANE_SCRIPTS[lane]];
    if (body === undefined)
      throw new Error(`package.json is missing the ${LANE_SCRIPTS[lane]} script.`);
    lanes[lane] = parseLaneProjects(body);
  }
  return lanes;
}

export function readVitestProjectNames(root = process.cwd()): string[] {
  const projects = parseVitestSuiteProjects(
    readFileSync(resolve(root, "vitest.config.ts"), "utf8"),
  );
  if (projects === null) throw new Error("Could not read the vitest project list.");
  return projects.map((project) => project.name);
}

/**
 * The lanes must PARTITION the config's projects: together they run every project, and
 * no project runs in both (which would pay for the same minutes twice). Returns one
 * human-readable problem per violation, empty when the partition holds.
 */
export function detectLanePartition(
  laneProjects: Readonly<Record<LaneName, string[]>>,
  configProjectNames: readonly string[],
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, LaneName[]>();

  for (const lane of LANE_NAMES) {
    const projects = laneProjects[lane];
    if (projects.length === 0) problems.push(`lane ${lane} selects no vitest project at all`);
    for (const project of projects) {
      if (!configProjectNames.includes(project))
        problems.push(
          `lane ${lane} selects project "${project}", which vitest.config.ts does not define — vitest runs nothing for an unknown project name`,
        );
      seen.set(project, [...(seen.get(project) ?? []), lane]);
    }
  }

  for (const project of configProjectNames) {
    const lanes = seen.get(project) ?? [];
    if (lanes.length === 0)
      problems.push(
        `vitest project "${project}" runs in NO lane — it would never execute while both lanes still exit 0; add it to test:fast or test:exhaustive`,
      );
    if (lanes.length > 1)
      problems.push(`vitest project "${project}" runs in more than one lane (${lanes.join(", ")})`);
  }

  return problems;
}

function main(): void {
  const problems = detectLanePartition(readLaneProjects(), readVitestProjectNames());
  if (problems.length > 0) {
    for (const problem of problems) console.error(`  [ERROR] ${problem}`);
    process.exit(1);
  }
  const lanes = readLaneProjects();
  for (const lane of LANE_NAMES) console.log(`${lane}: ${lanes[lane].join(", ")}`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
