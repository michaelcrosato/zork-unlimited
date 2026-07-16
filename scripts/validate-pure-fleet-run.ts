import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  pureFleetRunArtifactPaths,
  validatePureFleetRunArtifactBytes,
  type PureFleetRunArtifactExpectation,
} from "../src/starting_slice/fleet_run_artifacts.js";

function valueOf(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value === undefined || value.length === 0) throw new Error(`Missing ${flag}`);
  return value;
}

function main(): void {
  const report = resolve(valueOf("--report"));
  const seed = Number(valueOf("--seed"));
  const model = valueOf("--model");
  if (!Number.isSafeInteger(seed)) throw new Error("--seed must be a safe integer");
  if (model !== "haiku" && model !== "sonnet" && model !== "opus") {
    throw new Error("--model must be haiku, sonnet, or opus");
  }
  const expected: PureFleetRunArtifactExpectation = {
    seed,
    model,
    build: {
      git_commit: valueOf("--git-commit"),
      tracked_worktree_clean: true,
      world_id: valueOf("--world-id"),
      world_hash: valueOf("--world-hash"),
    },
  };
  const paths = pureFleetRunArtifactPaths(report);
  const result = validatePureFleetRunArtifactBytes(
    {
      report: readFileSync(paths.report),
      runSidecar: readFileSync(paths.runSidecar),
      runEvidence: readFileSync(paths.runEvidence),
      primaryEnvelope: readFileSync(paths.primaryEnvelope),
      initialReport: existsSync(paths.initialReport) ? readFileSync(paths.initialReport) : null,
      recoveryMetadata: existsSync(paths.recoveryMetadata)
        ? readFileSync(paths.recoveryMetadata)
        : null,
      recoveryEnvelope: existsSync(paths.recoveryEnvelope)
        ? readFileSync(paths.recoveryEnvelope)
        : null,
    },
    expected,
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
