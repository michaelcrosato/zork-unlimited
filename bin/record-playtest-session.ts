#!/usr/bin/env -S npx tsx
/**
 * Turn one finished `blind-tester/run.sh` run into a session record.
 *
 * This is the connector that makes the automated playtest loop actually feed the dev
 * loop. `run.sh` publishes the artifacts it always has — a report, a provider envelope,
 * run evidence, and a verified sidecar — but those are per-run files in a reports
 * directory, not a corpus. Triage reads a CORPUS. Without this step a QA loop can run
 * forty players, produce forty reports, and promote nothing, because the store it
 * triages is empty.
 *
 * Two rules it holds to:
 *
 * 1. NOTHING IS THROWN AWAY. A run that timed out, crashed, or produced an unparseable
 *    interview still gets a record, with an outcome that says so. A player who gave up
 *    is evidence; silently dropping those runs is how a corpus becomes a
 *    survivorship-biased advertisement for itself.
 *
 * 2. IT NEVER OVERSTATES PROVENANCE. Isolation comes from the provider registry, not
 *    from a flag, so only a provider the runner actually owns the process of is stamped
 *    `runner_enforced`. The recorder cannot be talked into labelling a run as proven.
 *
 * Usage (called by playtest-loop.sh; also fine by hand):
 *   npm run playtest:record -- --out <run.sh --out prefix> \
 *     --provider codex --model gpt-5.3-codex-spark --persona default [--store <dir>]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hashState } from "../src/core/hash.js";
import { JourneyExitReceiptSchema } from "../src/blind/exit_interview.js";
import { verifyBlindReportText } from "../src/blind/report_verifier.js";
import { parseBlindRunSidecar } from "../src/blind/run_evidence.js";
import {
  findCatalogModel,
  findPlaytestProvider,
  parsePlaytestCatalog,
  playtestProviderIds,
} from "../src/blind/providers.js";
import { parseOverworldManifest } from "../src/world/overworld.js";
import {
  splitExitInterview,
  sealPlaytestSession,
  type PlaytestOutcome,
  type PlaytestSessionBody,
} from "../src/qa/session_record.js";
import { DEFAULT_SESSION_STORE, sha256Hex, writePlaytestSession } from "../src/qa/session_store.js";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const WORLD_PATH = join(REPO_ROOT, "content/world/new_york_overworld.json");
const PERSONA_DIR = join(REPO_ROOT, "blind-tester/personas");

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function required(flag: string): string {
  const value = arg(flag);
  if (value === null) throw new Error(`${flag} is required`);
  return value;
}

function readIfPresent(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Tool calls the player made, counted off the run-evidence stream when it exists. */
function countTurns(evidence: string | null): number {
  if (!evidence) return 0;
  return evidence.split("\n").filter((line) => line.trim().length > 0).length;
}

function main(): void {
  const outPrefix = required("--out");
  const providerId = required("--provider");
  const provider = findPlaytestProvider(providerId);
  if (!provider) {
    throw new Error(
      `unknown provider "${providerId}"; registered: ${playtestProviderIds().join(", ")}`,
    );
  }

  const catalog = parsePlaytestCatalog(
    provider,
    JSON.parse(readFileSync(join(REPO_ROOT, provider.catalogPath), "utf8")),
  );
  const model = findCatalogModel(catalog, required("--model"));

  const personaId = arg("--persona") ?? "default";
  const personaText = readFileSync(join(PERSONA_DIR, `${personaId}.md`), "utf8");

  const reportText = readIfPresent(`${outPrefix}.md`);
  const sidecarText = readIfPresent(`${outPrefix}.run.json`);
  const evidenceText = readIfPresent(`${outPrefix}.evidence.jsonl`);

  // The sidecar is the run's server-authored spine: it carries the exact seed, the
  // build that was played, and the game session id. Without it we know a run happened
  // but not precisely what it played, so the record says exactly that rather than
  // guessing from the surrounding files.
  const parsedSidecar = sidecarText ? parseBlindRunSidecar(JSON.parse(sidecarText)) : null;
  // Only the V2 pure sidecar carries the seed and the build. A V1 or structural sidecar
  // is still a real artifact, but it cannot tell us WHICH build was played — so the
  // record falls back to the checkout below and does not pretend otherwise.
  const pureSidecar =
    parsedSidecar?.ok === true &&
    parsedSidecar.sidecar.play_mode === "pure" &&
    "build" in parsedSidecar.sidecar
      ? parsedSidecar.sidecar
      : null;

  let interview: PlaytestSessionBody["exit_interview"] = null;
  let receipt: PlaytestSessionBody["journey_receipt"] = null;
  let failureNote: string | null = null;

  if (reportText) {
    const verified = verifyBlindReportText(reportText);
    if (verified.ok) {
      const split = splitExitInterview(verified.interview);
      interview = split.interview;
      receipt = split.receipt;
    } else {
      failureNote = `report did not verify: ${verified.reason}`;
    }
  } else {
    failureNote = `no report was published at ${outPrefix}.md`;
  }

  // Prefer the sidecar's receipt: it is server-authored and survives a report whose
  // fenced block was mangled by the client.
  if (!receipt && pureSidecar && "receipt" in pureSidecar) {
    receipt = JourneyExitReceiptSchema.parse(pureSidecar.receipt);
  }

  const explicit = arg("--outcome");
  const outcome: PlaytestOutcome = explicit
    ? (explicit as PlaytestOutcome)
    : interview && receipt
      ? "completed"
      : interview
        ? "abandoned"
        : reportText
          ? "malformed_report"
          : "failed";

  if (outcome !== "completed" && failureNote === null) {
    failureNote =
      arg("--failure-note") ??
      (receipt === null
        ? "the game never confirmed a journey exit for this run"
        : `session recorded with outcome "${outcome}"`);
  }

  const world = parseOverworldManifest(JSON.parse(readFileSync(WORLD_PATH, "utf8")));
  const build = pureSidecar?.build ?? {
    git_commit: git(["rev-parse", "HEAD"]) || "0".repeat(40),
    tracked_worktree_clean: git(["status", "--porcelain"]).length === 0,
    world_id: world.id,
    world_hash: hashState(world),
  };

  const transcript = evidenceText ?? reportText ?? "";
  const body: PlaytestSessionBody = {
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    game_session_id: pureSidecar?.session_id ?? arg("--game-session-id") ?? `unknown-${outPrefix}`,
    run_seed: pureSidecar?.run_seed ?? Number.parseInt(arg("--seed") ?? "0", 10),
    build,
    provider: {
      id: provider.id,
      vendor: provider.vendor,
      family: provider.family,
      isolation: provider.isolation,
      transport_contract: provider.transportContract,
    },
    model: { id: model.id, tier: model.tier, settings: model.settings },
    persona: {
      id: personaId,
      title: arg("--persona-title") ?? personaId,
      source_sha256: sha256Hex(personaText),
    },
    outcome,
    log: {
      turns: countTurns(evidenceText),
      accepted_decisions: receipt?.acceptedDecisions ?? null,
      transcript_filename: "transcript.jsonl",
      transcript_sha256: sha256Hex(transcript),
      transcript_bytes: Buffer.byteLength(transcript, "utf8"),
    },
    exit_interview: interview,
    journey_receipt: receipt,
    failure_note: failureNote,
  };

  const record = sealPlaytestSession(body);
  const store = arg("--store") ?? process.env.PLAYTEST_STORE ?? DEFAULT_SESSION_STORE;
  const dir = writePlaytestSession(store, record, transcript);
  console.log(
    `recorded ${record.outcome} ${provider.id}/${model.id} (${model.tier}) → ${dir.split("/").pop()}`,
  );
}

main();
