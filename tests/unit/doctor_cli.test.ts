/**
 * `npm run doctor` — does this machine's setup actually work, and if nothing is queued,
 * why not?
 *
 * The questions it answers are the ones that went unanswered during a live two-loop
 * exercise: a whole run produced findings and promoted none of them, and no command
 * would say whether that was correct behaviour or a broken pipeline. Both present as an
 * empty queue. These tests pin that it distinguishes them, because a diagnostic that
 * says the same thing in both states is worse than none — it teaches you to ignore it.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { onPath } from "../../bin/doctor.js";
import { sealPlaytestSession, type PlaytestSessionBody } from "../../src/qa/session_record.js";
import { sha256Hex, writePlaytestSession } from "../../src/qa/session_store.js";

const ROOT = process.cwd();
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const TRANSCRIPT = "line one\nline two\n";

const dirs: string[] = [];
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** One session reporting the same defect, from whichever vendor the caller names. */
function session(over: {
  family: string;
  providerId: string;
  vendor: string;
  model: string;
  index: number;
}): PlaytestSessionBody {
  return {
    schema_version: 1,
    recorded_at: `2026-08-28T12:0${over.index}:00.000Z`,
    game_session_id: `o-${over.index}`,
    run_seed: 100 + over.index,
    build: {
      git_commit: "a".repeat(40),
      tracked_worktree_clean: true,
      world_id: "new_york_overworld",
      world_hash: "b".repeat(64),
    },
    provider: {
      id: over.providerId,
      vendor: over.vendor,
      family: over.family,
      isolation: "runner_enforced",
      transport_contract: "game-direct-mcp-v1",
    },
    model: { id: over.model, tier: "volume", settings: {} },
    persona: { id: "default", title: "default", source_sha256: "c".repeat(64) },
    outcome: "abandoned",
    log: {
      turns: 12,
      accepted_decisions: null,
      transcript_filename: "transcript.jsonl",
      transcript_sha256: sha256Hex(TRANSCRIPT),
      transcript_bytes: Buffer.byteLength(TRANSCRIPT, "utf8"),
    },
    exit_interview: {
      clarity: 3,
      enjoyment: 3,
      goal_understood: true,
      got_stuck: false,
      confusions: [],
      bugs: [
        {
          where: "quest wolf_winter, room steading_yard, blocked exit north",
          severity: "S3",
          note: "Blocked reason claims both approaches selected; exactly one was.",
        },
      ],
      best_moment: "the wolf fight",
      worst_moment: "the blocked exit",
      would_replay: true,
      verdict: "Playable, but the blocked-exit copy is wrong and misleads.",
    },
    journey_receipt: null,
    failure_note: "stopped early",
  };
}

function corpusOf(vendors: readonly { family: string; id: string; vendor: string }[]): string {
  const store = temp("af-doc-store-");
  vendors.forEach((v, index) => {
    writePlaytestSession(
      store,
      sealPlaytestSession(
        session({
          family: v.family,
          providerId: v.id,
          vendor: v.vendor,
          model: `${v.family}-model`,
          index,
        }),
      ),
      TRANSCRIPT,
    );
  });
  return store;
}

function run(script: string, args: readonly string[]): string {
  const result = spawnSync(process.execPath, [TSX, script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
  });
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function diagnose(store: string): string {
  const tickets = temp("af-doc-t-");
  const queue = temp("af-doc-q-");
  run("bin/triage.ts", ["--store", store, "--tickets", tickets, "--queue", queue]);
  return run("bin/doctor.ts", ["--store", store, "--tickets", tickets, "--queue", queue]);
}

const CLAUDE = { family: "claude", id: "claude_code", vendor: "anthropic" };
const GEMINI = { family: "gemini", id: "gemini_cli", vendor: "google" };
const GPT = { family: "gpt", id: "codex", vendor: "openai" };

describe("doctor", () => {
  it("names the one vendor that can run live, so a cohort is planned on fact", () => {
    // The docs once claimed no vendor was privileged, alongside an example cohort in
    // which most players could not launch. This is where an operator finds out first.
    const output = run("bin/doctor.ts", ["--store", temp("af-doc-empty-")]);
    expect(output).toContain("runner_enforced");
    expect(output).toMatch(/codex/);
    expect(output).toContain("playtest:ingest");
  });

  it("says a single-family stall is correct, and what would actually change it", () => {
    const output = diagnose(corpusOf([CLAUDE, CLAUDE, CLAUDE]));
    // The distinction that matters: this is the rule working, not a fault.
    expect(output).toContain("That is a real state, not");
    expect(output).toContain("Add a SECOND model family");
    expect(output).toMatch(/families so far: claude/);
  });

  it("reports work waiting once a second family corroborates", () => {
    const output = diagnose(corpusOf([CLAUDE, GEMINI, GPT]));
    expect(output).toContain("The dev loop has work");
    expect(output).not.toContain("Add a SECOND model family");
  });

  it("does not cry clustering-bug on a single session", () => {
    // With one session every ticket has exactly one report by construction, so the
    // non-merging heuristic must stay silent or it teaches you to ignore it.
    const output = diagnose(corpusOf([CLAUDE]));
    expect(output).not.toContain("nothing merged at all");
  });

  it("distinguishes an empty corpus from a stalled one", () => {
    const output = run("bin/doctor.ts", [
      "--store",
      temp("af-doc-empty-"),
      "--tickets",
      temp("af-doc-t-"),
      "--queue",
      temp("af-doc-q-"),
    ]);
    expect(output).toContain("No sessions yet");
    expect(output).not.toContain("Add a SECOND model family");
  });
});

describe("onPath", () => {
  /**
   * This resolved NOTHING on Windows. onPath shelled `command -v <bin>` with
   * `shell: true`, which spawns cmd.exe, where `command` is not a builtin — so the call
   * threw for every binary and the function returned false unconditionally. The one
   * command whose job is to say what an operator can launch reported that they could
   * launch nothing, on the platform where that answer is hardest to check by hand.
   *
   * `node` is the honest probe: this suite is running under it, so it is on PATH by
   * construction on every platform, and the old implementation still said it was not.
   */
  it("finds an executable that is definitely on PATH", () => {
    expect(onPath("node")).toBe(true);
  });

  it("does not invent one that is not", () => {
    expect(onPath("adventureforge-definitely-not-a-real-binary")).toBe(false);
  });

  it("survives a PATH containing empty and quoted entries", () => {
    const original = process.env.PATH;
    try {
      process.env.PATH = `${original ?? ""}${delimiter}${delimiter}"${tmpdir()}"`;
      expect(onPath("node")).toBe(true);
      expect(onPath("adventureforge-definitely-not-a-real-binary")).toBe(false);
    } finally {
      process.env.PATH = original;
    }
  });
});
