/**
 * `npm run qa:triage` — the command that turns the playtest corpus into the dev loop's
 * inbox, exercised as the loop actually runs it: a real process, real directories, real
 * git history.
 *
 * Everything the triage functions do is unit-tested elsewhere by handing them evidence
 * directly. What only shows up here is what the CLI supplies AROUND those functions —
 * the recency spine it reads from git, and the bucket directory it rewrites in place.
 * Both of those had a silent failure that no in-process test could see.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { sealPlaytestSession, type PlaytestSessionBody } from "../../src/qa/session_record.js";
import { sha256Hex, writePlaytestSession } from "../../src/qa/session_store.js";
import { QaTicketSchema } from "../../src/qa/ticket.js";

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

/** Commits of this checkout, newest first — the same spine `bin/triage.ts` reads. */
function commits(): string[] {
  return execFileSync("git", ["log", "--format=%H"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

function session(build: string, index: number): PlaytestSessionBody {
  return {
    schema_version: 1,
    recorded_at: `2026-08-28T12:0${index}:00.000Z`,
    game_session_id: `o-${index}`,
    run_seed: 500 + index,
    build: {
      git_commit: build,
      tracked_worktree_clean: true,
      world_id: "new_york_overworld",
      world_hash: "b".repeat(64),
    },
    provider: {
      id: "codex",
      vendor: "openai",
      family: "gpt",
      isolation: "runner_enforced",
      transport_contract: "game-direct-mcp-v1",
    },
    model: { id: "gpt-5.3-codex-spark", tier: "volume", settings: {} },
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

function corpus(build: string): string {
  const store = temp("af-triage-store-");
  writePlaytestSession(store, sealPlaytestSession(session(build, 0)), TRANSCRIPT);
  return store;
}

function triage(store: string, tickets: string): { out: string; code: number | null } {
  const result = spawnSync(
    process.execPath,
    [TSX, "bin/triage.ts", "--store", store, "--tickets", tickets, "--queue", temp("af-triage-q-")],
    { cwd: ROOT, encoding: "utf8", timeout: 180_000 },
  );
  return { out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`, code: result.status };
}

function onlyTicket(dir: string): unknown {
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  expect(files).toHaveLength(1);
  return QaTicketSchema.parse(JSON.parse(readFileSync(join(dir, files[0]!), "utf8")));
}

describe("qa:triage on disk", () => {
  // AGENTS.md tells agents to rely on this: "triage ages findings out after
  // STALE_AFTER_BUILDS; do not hand-wave past either." Aging fails OPEN for a build the
  // checkout does not recognise, which is right for a build that was never published —
  // but the CLI used to hand triage only `git log -n200` of a repository long past 1,500
  // commits, so every session played on an older build was permanently exempt from the
  // rule. Those are exactly the findings most likely to be fixed already.
  //
  // Needs real history, which is why it runs against the checkout rather than a fixture;
  // CI checks out at fetch-depth 0 for the test shards.
  it("ages a finding whose build is older than any fixed recency window", () => {
    const history = commits();
    expect(history.length).toBeGreaterThan(300);
    const ancient = history.at(-1)!;

    const tickets = temp("af-triage-t-");
    const { out } = triage(corpus(ancient), tickets);

    expect(out).toMatch(/stale 1/);
    expect(onlyTicket(tickets)).toMatchObject({ status: "stale" });
  });

  it("leaves a finding on the current build alone", () => {
    const tickets = temp("af-triage-t-");
    const { out } = triage(corpus(commits()[0]!), tickets);

    expect(out).toMatch(/stale 0/);
    expect(onlyTicket(tickets)).toMatchObject({ status: "open" });
  });

  // The bucket is rewritten wholesale every run, and a ticket file that stopped parsing
  // is not in the list triage carries forward — so it used to be deleted, taking a
  // maintainer's `wont_fix` and notes with it and reporting nothing at all.
  it("reports a ticket file it cannot parse and leaves it on disk", () => {
    const tickets = temp("af-triage-t-");
    const damaged = join(tickets, `S3-bug-${"f".repeat(16)}.json`);
    writeFileSync(damaged, '{ "schema_version": 1, "ticket_id": "half-writ', "utf8");

    const { out } = triage(corpus(commits()[0]!), tickets);

    expect(existsSync(damaged)).toBe(true);
    expect(readFileSync(damaged, "utf8")).toContain("half-writ");
    expect(out).toContain("unreadable ticket");
  });
});
