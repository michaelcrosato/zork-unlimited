import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { hashState } from "../core/hash.js";
import { loadOverworldManifest } from "../world/source.js";

export interface FleetGitProvenance {
  git_commit: string;
  tracked_worktree_clean: boolean;
}

export interface PureFleetBuild extends FleetGitProvenance {
  tracked_worktree_clean: true;
  world_id: string;
  world_hash: string;
}

interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

const ALLOWED_GIT_SUBCOMMANDS = new Set(["rev-parse", "diff"]);
const ALLOWED_GIT_FLAGS = new Set([
  "--verify",
  "--quiet",
  "--ignore-submodules=untracked",
  "--cached",
  "--",
]);
const ALLOWED_GIT_POSITIONAL = new Set(["HEAD^{commit}"]);

export function validateGitArgs(args: readonly string[]): void {
  if (args.length === 0) {
    throw new Error("pure fleet provenance Git wrapper received empty arguments");
  }
  const subcommand = args[0];
  if (!subcommand || !ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`pure fleet provenance Git wrapper disallowed subcommand: ${subcommand}`);
  }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (!ALLOWED_GIT_FLAGS.has(arg) && !ALLOWED_GIT_POSITIONAL.has(arg)) {
      throw new Error(`pure fleet provenance Git wrapper disallowed argument: ${arg}`);
    }
  }
}

export function runGit(root: string, args: readonly string[]): GitResult {
  validateGitArgs(args);
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(`pure fleet provenance could not run Git: ${result.error.message}`);
  }
  if (result.status === null) {
    throw new Error(
      `pure fleet provenance Git process did not exit normally${result.signal ? ` (${result.signal})` : ""}`,
    );
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Capture the same staged/unstaged tracked-worktree signal as blind-tester/run.sh.
 * Untracked files are deliberately outside this signal, but any Git error fails
 * closed instead of being mistaken for a clean checkout.
 */
export function captureFleetGitProvenance(root: string): FleetGitProvenance {
  const canonicalRoot = resolve(root);
  const head = runGit(canonicalRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (head.status !== 0) {
    throw new Error(
      `pure fleet provenance could not identify HEAD: ${head.stderr.trim() || "git rev-parse failed"}`,
    );
  }
  const gitCommit = head.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(gitCommit)) {
    throw new Error("pure fleet provenance requires a full lowercase 40-character Git commit");
  }

  const unstaged = runGit(canonicalRoot, [
    "diff",
    "--quiet",
    "--ignore-submodules=untracked",
    "--",
  ]);
  const staged = runGit(canonicalRoot, [
    "diff",
    "--cached",
    "--quiet",
    "--ignore-submodules=untracked",
    "--",
  ]);
  if (unstaged.status > 1 || staged.status > 1) {
    const diagnostic = unstaged.status > 1 ? unstaged.stderr : staged.stderr;
    throw new Error(
      `pure fleet provenance could not inspect tracked changes: ${diagnostic.trim() || "git diff failed"}`,
    );
  }

  return {
    git_commit: gitCommit,
    tracked_worktree_clean: unstaged.status === 0 && staged.status === 0,
  };
}

export function requireCleanFleetGitProvenance(root: string): FleetGitProvenance & {
  tracked_worktree_clean: true;
} {
  const provenance = captureFleetGitProvenance(root);
  if (!provenance.tracked_worktree_clean) {
    throw new Error("pure fleet provenance requires a clean tracked worktree");
  }
  return { ...provenance, tracked_worktree_clean: true };
}

/** Capture the one build identity every live pure fleet run must reproduce. */
export function capturePureFleetBuild(root: string): PureFleetBuild {
  const canonicalRoot = resolve(root);
  const provenance = requireCleanFleetGitProvenance(canonicalRoot);
  const world = loadOverworldManifest(canonicalRoot);
  return {
    ...provenance,
    world_id: world.id,
    world_hash: hashState(world),
  };
}
