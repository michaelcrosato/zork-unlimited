#!/usr/bin/env -S npx tsx
/**
 * Publish the local playtest corpus to GitHub, without ever touching the working tree.
 *
 * The staging store is gitignored on purpose — a playtest cohort writes hundreds of
 * session directories, and a loop whose `git status --porcelain` is never empty cannot
 * take a clean provisional commit. But the corpus still has to leave the machine, both
 * so it survives the machine and so cohorts running on different boxes and different
 * vendors pool into one place. Those two requirements look contradictory and are not:
 * the sessions are published to their OWN branch, by git plumbing, with a temporary
 * index.
 *
 * Nothing here runs `git add`, `git checkout`, or `git commit`. It hashes blobs
 * straight into the object database, builds a tree in a throwaway index file, writes a
 * commit object, and pushes that commit to a remote ref. The real index, HEAD, and the
 * working tree are untouched throughout, so this is safe to run from inside a running
 * dev loop or concurrently with one.
 *
 * The branch is append-only in practice: publishing carries the previous tree forward
 * and adds to it, and no code path here removes a session. A session already present on
 * the branch is skipped rather than rewritten, which makes republishing idempotent and
 * lets an interrupted publish simply be re-run.
 *
 * Usage:
 *   tsx scripts/publish-playtest-sessions.ts [--store <dir>] [--branch <name>]
 *                                            [--remote <name>] [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SESSION_STORE, listPlaytestSessions } from "../src/qa/session_store.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function git(args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function gitQuiet(args: string[], env?: NodeJS.ProcessEnv): string | null {
  try {
    return git(args, env);
  } catch {
    return null;
  }
}

/** Every file under one session directory, repo-relative to the session root. */
function sessionFiles(sessionDir: string): { abs: string; rel: string }[] {
  const out: { abs: string; rel: string }[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push({ abs, rel: relative(sessionDir, abs).split("\\").join("/") });
    }
  };
  walk(sessionDir);
  return out;
}

function main(): void {
  const store = argValue("--store", DEFAULT_SESSION_STORE);
  const branch = argValue("--branch", "playtest-sessions");
  const remote = argValue("--remote", "origin");
  const dryRun = process.argv.includes("--dry-run");

  const { entries, unreadable } = listPlaytestSessions(store);
  for (const bad of unreadable) {
    // Loud, and never fatal. An unreadable directory must not block the healthy
    // sessions beside it from being published, but it must also never pass silently.
    console.error(`! unreadable session, not published: ${bad.dir} — ${bad.reason}`);
  }
  if (entries.length === 0) {
    console.log(`No sessions to publish from ${store}.`);
    return;
  }

  // Resolve the remote branch tip, if it has one. A first publish starts a root commit.
  gitQuiet(["fetch", "--quiet", remote, branch]);
  const parent = gitQuiet(["rev-parse", "--verify", "--quiet", `${remote}/${branch}^{commit}`]);

  const indexDir = mkdtempSync(join(tmpdir(), "af-playtest-publish-"));
  const indexFile = join(indexDir, "index");
  const env = { GIT_INDEX_FILE: indexFile };

  try {
    // Carry the existing corpus forward so the publish is additive, not a replacement.
    if (parent) git(["read-tree", parent], env);

    const existing = new Set(
      parent
        ? git(["ls-tree", "-r", "--name-only", parent], env)
            .split("\n")
            .filter(Boolean)
            .map((path) => path.split("/")[0]!)
        : [],
    );

    let added = 0;
    for (const entry of entries) {
      // basename, not split("/"): entry.dir is built with path.join (session_store.ts),
      // so on Windows it is "D:\af-corpus\20260829__codex__…" with no forward slash at
      // all. split("/").pop() then returned the ENTIRE absolute path as the "directory
      // name", and `update-index --cacheinfo 100644,<blob>,D:\af-corpus\…` is rejected
      // by git with rc=128 on the first session — so publishing the corpus, which is
      // its only off-machine copy, failed outright on every Windows machine.
      const dirName = basename(entry.dir);
      // Content-addressed names mean "already there" implies "byte-identical", so a
      // skip here can never drop a differing session on the floor.
      if (existing.has(dirName)) continue;
      for (const file of sessionFiles(entry.dir)) {
        const blob = git(["hash-object", "-w", "--", file.abs], env);
        git(["update-index", "--add", "--cacheinfo", `100644,${blob},${dirName}/${file.rel}`], env);
      }
      added += 1;
    }

    if (added === 0) {
      console.log(`Nothing new: all ${entries.length} local session(s) are already on ${branch}.`);
      return;
    }

    const tree = git(["write-tree"], env);
    if (parent && tree === git(["rev-parse", `${parent}^{tree}`])) {
      console.log(`Nothing new: tree is unchanged on ${branch}.`);
      return;
    }

    const message = `Publish ${added} playtest session(s)\n\nCorpus total after this commit: ${entries.length} local session(s).\n`;
    if (dryRun) {
      console.log(`[dry-run] would commit ${added} new session(s) to ${remote}/${branch}.`);
      return;
    }

    const commit = git(
      ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message],
      env,
    );
    git(["push", remote, `${commit}:refs/heads/${branch}`]);
    console.log(
      `Published ${added} new session(s) to ${remote}/${branch} (${commit.slice(0, 12)}).`,
    );
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

main();
