import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll } from "vitest";

const GIT_REPOSITORY_ENVIRONMENT = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
] as const;

export interface CleanTrackedGitCheckout {
  path: string;
}

/**
 * Materialize the currently tracked working-tree bytes as a real, clean temp
 * checkout. Pure-runner tests execute that checkout's scripts, so production
 * Git discovery remains authoritative and no test-only Git environment reaches
 * the runner.
 */
export function useCleanTrackedGitCheckout(): CleanTrackedGitCheckout {
  const checkout: CleanTrackedGitCheckout = { path: "" };
  let temporaryRoot = "";

  beforeAll(() => {
    const sourceRoot = process.cwd();
    const cleanEnvironment = withoutGitRepositoryEnvironment(process.env);
    const sourceHead = runGit(["rev-parse", "HEAD"], sourceRoot, cleanEnvironment).trim();
    const sourceObjects = runGit(
      ["rev-parse", "--git-path", "objects"],
      sourceRoot,
      cleanEnvironment,
    ).trim();

    temporaryRoot = mkdtempSync(join(tmpdir(), "af-blind-clean-checkout-"));
    const syntheticGitDir = join(temporaryRoot, "git");
    runGit(["init", "--bare", syntheticGitDir], sourceRoot, cleanEnvironment);
    mkdirSync(join(syntheticGitDir, "objects", "info"), { recursive: true });
    writeFileSync(
      join(syntheticGitDir, "objects", "info", "alternates"),
      `${resolve(sourceRoot, sourceObjects).replaceAll("\\", "/")}\n`,
      "utf8",
    );

    const syntheticEnvironment = {
      ...cleanEnvironment,
      GIT_DIR: syntheticGitDir,
      GIT_WORK_TREE: sourceRoot,
      GIT_INDEX_FILE: join(syntheticGitDir, "index"),
    };
    runGit(["read-tree", sourceHead], sourceRoot, syntheticEnvironment);
    runGit(["add", "-u"], sourceRoot, syntheticEnvironment);
    const tree = runGit(["write-tree"], sourceRoot, syntheticEnvironment).trim();
    const commit = runGit(
      [
        "-c",
        "user.name=AdventureForge test",
        "-c",
        "user.email=tests@example.invalid",
        "commit-tree",
        tree,
        "-m",
        "synthetic tracked worktree for blind runner tests",
      ],
      sourceRoot,
      syntheticEnvironment,
    ).trim();
    runGit(["update-ref", "HEAD", commit], sourceRoot, syntheticEnvironment);

    checkout.path = join(temporaryRoot, "checkout");
    runGit(
      ["--git-dir", syntheticGitDir, "worktree", "add", "--detach", checkout.path, commit],
      sourceRoot,
      cleanEnvironment,
    );

    const sourceNodeModules = join(sourceRoot, "node_modules");
    if (existsSync(sourceNodeModules)) {
      symlinkSync(
        sourceNodeModules,
        join(checkout.path, "node_modules"),
        process.platform === "win32" ? "junction" : "dir",
      );
    }
  });

  afterAll(() => {
    if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  });

  return checkout;
}

function withoutGitRepositoryEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleanEnvironment = { ...env };
  for (const key of GIT_REPOSITORY_ENVIRONMENT) delete cleanEnvironment[key];
  return cleanEnvironment;
}

function runGit(args: string[], cwd: string, env: NodeJS.ProcessEnv): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env });
  if (result.status !== 0) {
    throw new Error(
      `Clean Git checkout setup failed: git ${args.join(" ")}\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}
