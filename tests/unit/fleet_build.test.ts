import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashState } from "../../src/core/hash.js";
import {
  captureFleetGitProvenance,
  capturePureFleetBuild,
  requireCleanFleetGitProvenance,
} from "../../src/starting_slice/fleet_build.js";
import { loadOverworldManifest } from "../../src/world/source.js";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function initializeRepository(root: string): string {
  git(root, "init", "--quiet");
  git(root, "config", "core.autocrlf", "false");
  git(root, "config", "user.name", "Fleet Provenance Test");
  git(root, "config", "user.email", "fleet-provenance@example.invalid");
  const trackedPath = join(root, "tracked.txt");
  writeFileSync(trackedPath, "committed\n");
  git(root, "add", "tracked.txt");
  git(root, "commit", "--quiet", "-m", "test fixture");
  return trackedPath;
}

describe("pure fleet Git provenance", () => {
  it("ignores untracked files while rejecting unstaged and staged tracked changes", () => {
    const root = mkdtempSync(join(tmpdir(), "af-fleet-build-"));
    try {
      const trackedPath = initializeRepository(root);
      writeFileSync(join(root, "local-note.txt"), "untracked and intentionally ignored\n");

      const clean = requireCleanFleetGitProvenance(root);
      expect(clean).toEqual({
        git_commit: git(root, "rev-parse", "--verify", "HEAD^{commit}"),
        tracked_worktree_clean: true,
      });

      writeFileSync(trackedPath, "unstaged change\n");
      expect(captureFleetGitProvenance(root).tracked_worktree_clean).toBe(false);
      expect(() => requireCleanFleetGitProvenance(root)).toThrow(/clean tracked worktree/i);

      git(root, "add", "tracked.txt");
      expect(captureFleetGitProvenance(root).tracked_worktree_clean).toBe(false);
      expect(() => requireCleanFleetGitProvenance(root)).toThrow(/clean tracked worktree/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when Git cannot identify a repository", () => {
    const root = mkdtempSync(join(tmpdir(), "af-fleet-build-no-git-"));
    try {
      expect(() => captureFleetGitProvenance(root)).toThrow(/could not identify HEAD/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("capturePureFleetBuild", () => {
  it("captures pure fleet build identity from a clean worktree with valid overworld content", () => {
    const root = mkdtempSync(join(tmpdir(), "af-fleet-build-pure-"));
    try {
      initializeRepository(root);
      cpSync(join(process.cwd(), "content"), join(root, "content"), { recursive: true });
      git(root, "add", "content");
      git(root, "commit", "--quiet", "-m", "add content");

      const build = capturePureFleetBuild(root);
      const expectedCommit = git(root, "rev-parse", "--verify", "HEAD^{commit}");
      const expectedWorld = loadOverworldManifest(root);

      expect(build).toEqual({
        git_commit: expectedCommit,
        tracked_worktree_clean: true,
        world_id: expectedWorld.id,
        world_hash: hashState(expectedWorld),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the tracked worktree is dirty", () => {
    const root = mkdtempSync(join(tmpdir(), "af-fleet-build-pure-dirty-"));
    try {
      const trackedPath = initializeRepository(root);
      cpSync(join(process.cwd(), "content"), join(root, "content"), { recursive: true });
      git(root, "add", "content");
      git(root, "commit", "--quiet", "-m", "add content");

      writeFileSync(trackedPath, "unstaged modification\n");
      expect(() => capturePureFleetBuild(root)).toThrow(/clean tracked worktree/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
