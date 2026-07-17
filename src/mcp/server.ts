/**
 * MCP server (spec §9.4) — exposes the engine as agent tools over stdio.
 *
 * Every tool is a thin adapter over the pure handlers in tools.ts (which are the
 * unit-tested source of truth). The server confines all paths to the project
 * root and treats content/traces as data only — never code or shell (§16).
 *
 * Tool descriptions are the agent-facing contract: each one is a single sentence
 * that says what the tool does and when to use it (blind playtesters have no
 * other manual). The compact positional payloads are documented by the `legend`
 * field on session-creating responses; tests/unit/compact_legend.test.ts guards
 * both halves of that contract via the exported TOOL_REGISTRATIONS registry.
 *
 * Run: `npm run mcp` (or register the project's .mcp.json in an MCP client).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { appendFileSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createToolApi } from "./tools.js";
import { TRANSCRIPT_TURN_LIMIT_DEFAULT } from "./transcript_projection.js";
import { isGeneratedRpgSeed as genSeed } from "../gen/seed.js";
import { formatSpectateEntry } from "./spectate.js";
import { OverworldSessionSnapshotSchema } from "../world/session_snapshot.js";
import {
  FreshStartRunEvidenceV2Schema,
  JourneyExitRunEvidenceV2Schema,
  PureRunBuildSchema,
} from "../blind/run_evidence.js";
import { JourneyExitReceiptSchema } from "../blind/exit_interview.js";

export type McpPlayMode = "full" | "structural" | "pure";

function parsePlayMode(): McpPlayMode {
  const value = argValue("--play-mode") ?? "full";
  if (value === "full" || value === "structural" || value === "pure") return value;
  throw new Error(
    `Invalid --play-mode ${JSON.stringify(value)}; expected "full", "structural", or "pure".`,
  );
}

/**
 * Pure play exposes only choices a human can make through the game UI. Authoring,
 * validation, raw-state, direct-quest, restore, and generated-game tools stay in
 * the default full server used by developers and structural tests.
 */
export const PURE_PLAYER_TOOLS = new Set<string>([
  "start_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "plan_overworld_session_route",
  "travel_overworld_session",
  "follow_overworld_session_goal",
  "resolve_overworld_session_road_encounter",
  "resupply_overworld_session",
  "rest_overworld_session",
  "scout_overworld_session_poi",
  "talk_overworld_session_contact",
  "investigate_overworld_session_event",
  "resolve_overworld_session_event",
  "explore_overworld_session_site",
  "explore_overworld_session_area",
  "move_overworld_session_area",
  "work_overworld_session_job",
  "start_overworld_session_quest",
  "choose_overworld_session_journey",
  "choose_overworld_session_story",
  "get_observation",
  "list_legal_actions",
  "step_action",
]);

export function toolAvailableInPlayMode(name: string, playMode: McpPlayMode): boolean {
  return playMode !== "pure" || PURE_PLAYER_TOOLS.has(name);
}

const PLAY_MODE = parsePlayMode();

const RUN_EVIDENCE_PATH = (() => {
  const requested = process.argv.includes("--run-evidence");
  const value = argValue("--run-evidence");
  if (!requested) return null;
  if (!value || value.startsWith("--")) {
    throw new Error("--run-evidence requires a JSONL path.");
  }
  return resolve(value);
})();

const RUN_SEED: number | null = (() => {
  if (!process.argv.includes("--run-seed")) return null;
  const raw = argValue("--run-seed");
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`--run-seed requires a JavaScript safe integer, got ${JSON.stringify(raw)}.`);
  }
  return value;
})();

const BUILD_COMMIT: string | null = (() => {
  if (!process.argv.includes("--build-commit")) return null;
  const value = argValue("--build-commit");
  if (!value || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error("--build-commit requires the full 40-character lowercase Git commit hash.");
  }
  return value;
})();

const TRACKED_WORKTREE_CLEAN: boolean | null = (() => {
  if (!process.argv.includes("--tracked-worktree-clean")) return null;
  const value = argValue("--tracked-worktree-clean");
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error('--tracked-worktree-clean requires exactly "true" or "false".');
})();

const PURE_RUN_PROVENANCE = (() => {
  if (PLAY_MODE !== "pure" || RUN_EVIDENCE_PATH === null) return null;
  if (RUN_SEED === null) {
    throw new Error("Pure run evidence requires --run-seed.");
  }
  if (BUILD_COMMIT === null) {
    throw new Error("Pure run evidence requires --build-commit.");
  }
  if (TRACKED_WORKTREE_CLEAN === null) {
    throw new Error("Pure run evidence requires --tracked-worktree-clean.");
  }
  return {
    runSeed: RUN_SEED,
    gitCommit: BUILD_COMMIT,
    trackedWorktreeClean: TRACKED_WORKTREE_CLEAN,
  };
})();

const api = createToolApi({
  root: process.cwd(),
  ...(PLAY_MODE === "pure" && RUN_SEED !== null ? { embeddedQuestSeed: RUN_SEED } : {}),
});

type PureRunBuild = z.infer<typeof PureRunBuildSchema>;
type FreshStartRunEvidenceV2 = z.infer<typeof FreshStartRunEvidenceV2Schema>;
type JourneyExitRunEvidenceV2 = z.infer<typeof JourneyExitRunEvidenceV2Schema>;
type PureRunEvidenceV2 = FreshStartRunEvidenceV2 | JourneyExitRunEvidenceV2;

const pureRunState: {
  overworldSessionId: string | null;
  rpgSessionId: string | null;
  journeyExitRecorded: boolean;
  journeyExitResponse: unknown | null;
  journeyExitEvidence: JourneyExitRunEvidenceV2 | null;
  journeyExitRetryable: boolean;
  journeyExitWriteFailures: number;
  freshStartEvidence: FreshStartRunEvidenceV2 | null;
  callInFlight: boolean;
  build: PureRunBuild | null;
} = {
  overworldSessionId: null,
  rpgSessionId: null,
  journeyExitRecorded: false,
  journeyExitResponse: null,
  journeyExitEvidence: null,
  journeyExitRetryable: false,
  journeyExitWriteFailures: 0,
  freshStartEvidence: null,
  callInFlight: false,
  build: null,
};

const PURE_RPG_SESSION_TOOLS = new Set(["get_observation", "list_legal_actions", "step_action"]);
const PURE_OVERWORLD_SESSION_TOOLS = new Set(
  [...PURE_PLAYER_TOOLS].filter(
    (name) => name !== "start_overworld" && !PURE_RPG_SESSION_TOOLS.has(name),
  ),
);
const PURE_OVERWORLD_TOOLS_DURING_RPG = new Set([
  "get_overworld_session",
  "get_overworld_session_context",
  "choose_overworld_session_journey",
  "choose_overworld_session_story",
]);

function validateRunEvidence(event: PureRunEvidenceV2): PureRunEvidenceV2 {
  return event.event === "fresh_start"
    ? FreshStartRunEvidenceV2Schema.parse(event)
    : JourneyExitRunEvidenceV2Schema.parse(event);
}

/**
 * Replace the tiny two-row pure evidence ledger from validated in-memory events.
 * Writing a sibling first prevents a failed write from leaving a partial JSONL row;
 * the unlink fallback is only for Windows, where rename does not replace a file.
 */
function writeRunEvidence(events: readonly PureRunEvidenceV2[]): void {
  if (!RUN_EVIDENCE_PATH) return;
  const validated = events.map(validateRunEvidence);
  mkdirSync(dirname(RUN_EVIDENCE_PATH), { recursive: true });
  const temporaryPath = `${RUN_EVIDENCE_PATH}.tmp`;
  try {
    writeFileSync(temporaryPath, `${validated.map((event) => JSON.stringify(event)).join("\n")}\n`);
    try {
      renameSync(temporaryPath, RUN_EVIDENCE_PATH);
    } catch (renameError) {
      try {
        unlinkSync(RUN_EVIDENCE_PATH);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw renameError;
      }
      renameSync(temporaryPath, RUN_EVIDENCE_PATH);
    }
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup only; never mask the evidence write/replace result.
    }
  }
}

function pureRunSnapshot(sessionId: string) {
  const exported = api.export_overworld_session({ session_id: sessionId });
  if (!exported.ok) throw new Error("Pure run evidence could not export its overworld session.");
  return OverworldSessionSnapshotSchema.parse(exported.snapshot);
}

function pureRunBuild(snapshot: z.infer<typeof OverworldSessionSnapshotSchema>): PureRunBuild {
  if (PURE_RUN_PROVENANCE === null) {
    throw new Error("Pure run evidence provenance was not configured.");
  }
  return PureRunBuildSchema.parse({
    git_commit: PURE_RUN_PROVENANCE.gitCommit,
    tracked_worktree_clean: PURE_RUN_PROVENANCE.trackedWorktreeClean,
    world_id: snapshot.worldId,
    world_hash: snapshot.worldHash,
  });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

type PureSessionField = "overworld_session_id" | "rpg_session_id";

class PureSessionRecoveryError extends Error {
  constructor(
    message: string,
    readonly expectedSessionField: PureSessionField,
  ) {
    super(message);
    this.name = "PureSessionRecoveryError";
  }
}

function pureSessionRecoveryFields(): Record<string, string> {
  return {
    ...(pureRunState.overworldSessionId
      ? { overworld_session_id: pureRunState.overworldSessionId }
      : {}),
    ...(pureRunState.rpgSessionId ? { rpg_session_id: pureRunState.rpgSessionId } : {}),
  };
}

function pureSessionErrorPayload(error: unknown): Record<string, unknown> {
  const resolved = error instanceof Error ? error : new Error(String(error));
  return {
    ok: false,
    error: resolved.message,
    ...(resolved instanceof PureSessionRecoveryError
      ? { expected_session_field: resolved.expectedSessionField }
      : {}),
    ...pureSessionRecoveryFields(),
  };
}

function pureSessionResponsePayload(name: string, value: unknown): unknown {
  if (PLAY_MODE !== "pure") return value;
  const response = objectRecord(value);
  if (!response) return value;
  const { rpg_session_id: _staleResponseChildId, ...responseWithoutChild } = response;
  const parentId =
    name === "start_overworld" && typeof response.session_id === "string"
      ? response.session_id
      : pureRunState.overworldSessionId;
  const childId = pureRunState.rpgSessionId;
  const nestedRpg = objectRecord(response.rpg_session);
  const nestedRpgWithoutChild = nestedRpg
    ? (({ rpg_session_id: _staleNestedChildId, ...rest }) => rest)(nestedRpg)
    : null;
  return {
    ...responseWithoutChild,
    ...(parentId ? { overworld_session_id: parentId } : {}),
    ...(childId ? { rpg_session_id: childId } : {}),
    ...(nestedRpgWithoutChild && parentId
      ? {
          rpg_session: {
            ...nestedRpgWithoutChild,
            overworld_session_id: parentId,
            ...(childId ? { rpg_session_id: childId } : {}),
          },
        }
      : {}),
  };
}

function pureCallPreflight(name: string, args: unknown): void {
  if (PLAY_MODE !== "pure") return;
  const input = objectRecord(args);
  const exactCommittedEndReplay =
    pureRunState.journeyExitResponse !== null &&
    name === "choose_overworld_session_journey" &&
    input?.session_id === pureRunState.overworldSessionId &&
    input.choice === "end" &&
    (pureRunState.journeyExitRecorded || pureRunState.journeyExitRetryable);
  if (pureRunState.journeyExitResponse !== null && !exactCommittedEndReplay) {
    throw new Error("This pure-play journey has ended; the exit receipt is the final run event.");
  }
  if (exactCommittedEndReplay) return;
  if (pureRunState.journeyExitRecorded) {
    throw new Error("This pure-play journey has ended; the exit receipt is the final run event.");
  }
  if (name === "start_overworld") {
    if (pureRunState.overworldSessionId !== null) {
      throw new PureSessionRecoveryError(
        "Pure play already has exactly one fresh overworld session; continue it with the recovered overworld_session_id.",
        "overworld_session_id",
      );
    }
    return;
  }
  if (pureRunState.overworldSessionId === null) {
    throw new Error("Pure play must begin with start_overworld.");
  }
  const sessionId = input?.session_id;
  if (PURE_OVERWORLD_SESSION_TOOLS.has(name) && sessionId !== pureRunState.overworldSessionId) {
    throw new PureSessionRecoveryError(
      "This overworld tool requires the parent overworld_session_id, not an RPG child handle.",
      "overworld_session_id",
    );
  }
  if (
    pureRunState.rpgSessionId !== null &&
    PURE_OVERWORLD_SESSION_TOOLS.has(name) &&
    !PURE_OVERWORLD_TOOLS_DURING_RPG.has(name)
  ) {
    throw new PureSessionRecoveryError(
      "Finish the active embedded quest with its rpg_session_id before taking another overworld action.",
      "rpg_session_id",
    );
  }
  if (PURE_RPG_SESSION_TOOLS.has(name)) {
    if (pureRunState.rpgSessionId === null) {
      throw new PureSessionRecoveryError(
        "No embedded RPG quest is active; enter a visible overworld quest before using RPG tools.",
        "rpg_session_id",
      );
    }
    if (sessionId !== pureRunState.rpgSessionId) {
      throw new PureSessionRecoveryError(
        "This RPG tool requires the active child rpg_session_id, not the parent overworld_session_id.",
        "rpg_session_id",
      );
    }
    const rpgSession = api.sessions.get(sessionId);
    if (rpgSession.overworldSessionId !== pureRunState.overworldSessionId) {
      throw new PureSessionRecoveryError(
        "The RPG child is not bound to this pure run's parent overworld session.",
        "rpg_session_id",
      );
    }
  }
}

function pureJourneyExitEvidenceFailure(
  response: Record<string, unknown>,
  detail: string,
  retryable: boolean,
): unknown {
  pureRunState.journeyExitRetryable = retryable;
  process.stderr.write(`Pure journey-exit evidence finalization failed: ${detail}\n`);
  return {
    ...response,
    run_evidence: {
      recorded: false,
      retryable,
      message: retryable
        ? "The journey ended and its exit receipt is final, but server evidence was not recorded; make exactly one more call with the same parent session and End choice to retry evidence recording."
        : "The journey ended and its exit receipt is final, but server evidence could not be recorded; do not retry or make another gameplay call.",
    },
  };
}

function persistPureJourneyExitEvidence(response: Record<string, unknown>): unknown {
  if (RUN_EVIDENCE_PATH === null) {
    pureRunState.journeyExitRecorded = true;
    pureRunState.journeyExitRetryable = false;
    return pureRunState.journeyExitResponse;
  }
  if (pureRunState.freshStartEvidence === null || pureRunState.journeyExitEvidence === null) {
    return pureJourneyExitEvidenceFailure(
      response,
      "validated fresh-start or journey-exit evidence is unavailable",
      false,
    );
  }
  try {
    writeRunEvidence([pureRunState.freshStartEvidence, pureRunState.journeyExitEvidence]);
    pureRunState.journeyExitRecorded = true;
    pureRunState.journeyExitRetryable = false;
    return pureRunState.journeyExitResponse;
  } catch (error) {
    pureRunState.journeyExitWriteFailures += 1;
    const retryable = pureRunState.journeyExitWriteFailures === 1;
    const detail = error instanceof Error ? error.message : String(error);
    return pureJourneyExitEvidenceFailure(response, detail, retryable);
  }
}

function pureCallEvidence(name: string, value: unknown): unknown {
  if (PLAY_MODE !== "pure") return value;
  const response = objectRecord(value);
  if (!response) return value;
  if (name === "start_overworld") {
    const sessionId = response.session_id;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      throw new Error("Fresh overworld start returned no session id.");
    }
    pureRunState.overworldSessionId = sessionId;
    if (RUN_EVIDENCE_PATH !== null) {
      const snapshot = pureRunSnapshot(sessionId);
      const build = pureRunBuild(snapshot);
      pureRunState.build = build;
      const freshStartEvidence = FreshStartRunEvidenceV2Schema.parse({
        schema_version: 2,
        play_mode: "pure",
        event: "fresh_start",
        start_surface: "fresh_overworld",
        session_id: sessionId,
        run_seed: PURE_RUN_PROVENANCE!.runSeed,
        build,
      });
      pureRunState.freshStartEvidence = freshStartEvidence;
      writeRunEvidence([freshStartEvidence]);
    }
    return value;
  }
  const receipt =
    name === "choose_overworld_session_journey"
      ? (response.exitReceipt ?? objectRecord(response.result)?.exitReceipt)
      : undefined;
  const receiptRecord = objectRecord(receipt);
  if (receiptRecord && pureRunState.journeyExitRecorded) {
    pureRunState.rpgSessionId = null;
    return pureRunState.journeyExitResponse ?? value;
  }
  if (name === "start_overworld_session_quest" && response.ok === true) {
    const rpgSessionId = response.rpg_session_id;
    if (typeof rpgSessionId !== "string" || rpgSessionId.length === 0) {
      throw new Error("Embedded quest start returned no RPG session id.");
    }
    pureRunState.rpgSessionId = rpgSessionId;
  } else if (
    name === "choose_overworld_session_journey" &&
    typeof response.rpg_session_id === "string"
  ) {
    pureRunState.rpgSessionId = response.rpg_session_id;
  } else if (
    name === "step_action" &&
    response.ok === true &&
    response.questCompletion !== undefined
  ) {
    pureRunState.rpgSessionId = null;
  }
  if (name !== "choose_overworld_session_journey" || pureRunState.journeyExitRecorded) return value;
  if (!receiptRecord) return value;

  // The game mutation has already committed by the time the raw receipt reaches
  // this boundary. Retain that terminal response and release any embedded child
  // before fallible validation/export/file IO so a recorder failure cannot
  // strand the run between an ended journey and an active child handle.
  pureRunState.journeyExitResponse ??= value;
  pureRunState.rpgSessionId = null;
  if (pureRunState.journeyExitEvidence !== null) {
    return persistPureJourneyExitEvidence(response);
  }
  let verifiedReceipt: z.infer<typeof JourneyExitReceiptSchema>;
  try {
    verifiedReceipt = JourneyExitReceiptSchema.parse(receipt);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return pureJourneyExitEvidenceFailure(response, detail, false);
  }
  if (RUN_EVIDENCE_PATH !== null) {
    try {
      const snapshot = pureRunSnapshot(pureRunState.overworldSessionId!);
      const build = pureRunBuild(snapshot);
      if (pureRunState.build === null || !isDeepStrictEqual(build, pureRunState.build)) {
        throw new Error("Pure run world/build provenance changed between start and journey exit.");
      }
      pureRunState.journeyExitEvidence = JourneyExitRunEvidenceV2Schema.parse({
        schema_version: 2,
        play_mode: "pure",
        event: "journey_exit",
        start_surface: "fresh_overworld",
        session_id: pureRunState.overworldSessionId!,
        run_seed: PURE_RUN_PROVENANCE!.runSeed,
        build,
        quest_outcomes: snapshot.questOutcomes,
        receipt: verifiedReceipt,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return pureJourneyExitEvidenceFailure(response, detail, false);
    }
  }
  return persistPureJourneyExitEvidence(response);
}

function pureCommittedJourneyExitResponse(name: string, args: unknown): unknown | null {
  if (PLAY_MODE !== "pure" || pureRunState.journeyExitResponse === null) return null;
  const input = objectRecord(args);
  return name === "choose_overworld_session_journey" &&
    input?.session_id === pureRunState.overworldSessionId &&
    input.choice === "end" &&
    (pureRunState.journeyExitRecorded || pureRunState.journeyExitRetryable)
    ? pureRunState.journeyExitResponse
    : null;
}

// ── Spectate mode ─────────────────────────────────────────────────────────────
// A human-facing live feed of every tool call (plus an optional pacing delay
// before each response returns) so a person can watch an LLM playthrough in
// real time and verify what is happening — `npm run spectate` tails the feed
// from another terminal. Configure via CLI args (`npm run mcp -- --spectate
// [path] --spectate-delay-ms N` — args survive every MCP client) or env
// (AF_SPECTATE=1|<path>, AF_SPECTATE_DELAY_MS=N). Entirely inert when unset:
// no files are touched and no delay is added, so importing this module (tests)
// and normal blind/loop runs are unaffected. The feed goes to a FILE — stdout
// is the JSON-RPC transport and must stay clean.
const SPECTATE_DEFAULT_LOG = "ai-runs/spectate.log";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SPECTATE_LOG: string | null = (() => {
  const fromArg = process.argv.includes("--spectate")
    ? (argValue("--spectate") ?? "")
    : (process.env.AF_SPECTATE ?? "");
  if (!fromArg && !process.argv.includes("--spectate") && !process.env.AF_SPECTATE) return null;
  const isPath = fromArg !== "" && fromArg !== "1" && !fromArg.startsWith("--");
  return resolve(isPath ? fromArg : SPECTATE_DEFAULT_LOG);
})();

const SPECTATE_DELAY_MS: number = Math.max(
  0,
  Number(argValue("--spectate-delay-ms") ?? process.env.AF_SPECTATE_DELAY_MS ?? 0) || 0,
);

/** On startup (direct run only): banner into the feed + a stderr pointer. */
function announceSpectate(): void {
  if (!SPECTATE_LOG) return;
  try {
    mkdirSync(dirname(SPECTATE_LOG), { recursive: true });
    appendFileSync(
      SPECTATE_LOG,
      `\n═══ adventureforge spectate — session started ${new Date().toISOString()}${SPECTATE_DELAY_MS > 0 ? ` (delay ${SPECTATE_DELAY_MS}ms)` : ""} ═══\n`,
    );
  } catch {
    // best-effort
  }
  process.stderr.write(
    `spectate feed → ${SPECTATE_LOG}${SPECTATE_DELAY_MS > 0 ? ` (delay ${SPECTATE_DELAY_MS}ms per tool response)` : ""} — watch with: npm run spectate\n`,
  );
}

/** Append one human-readable play-by-play entry per tool call. Best-effort. */
function spectateRecord(name: string, args: unknown, result: CallToolResult): void {
  if (!SPECTATE_LOG) return;
  const first = result.content?.[0];
  const body = first && first.type === "text" ? first.text : "";
  const entry = formatSpectateEntry(name, args, body, result.isError === true, new Date());
  try {
    mkdirSync(dirname(SPECTATE_LOG), { recursive: true });
    appendFileSync(SPECTATE_LOG, entry);
  } catch {
    // Spectating is best-effort; a feed write failure must not fail the tool call.
  }
}

function ok(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function wrap<A>(name: string, handler: (args: A) => unknown) {
  return async (args: A): Promise<CallToolResult> => {
    let result: CallToolResult;
    let ownsPureCall = false;
    try {
      if (PLAY_MODE === "pure") {
        if (pureRunState.callInFlight) {
          throw new Error(
            "Another pure-play tool call is still in progress; wait for its response before retrying.",
          );
        }
        pureRunState.callInFlight = true;
        ownsPureCall = true;
      }
      pureCallPreflight(name, args);
      const committedExit = pureCommittedJourneyExitResponse(name, args);
      const rawValue = committedExit ?? (await handler(args)); // await is a no-op for sync handlers
      const evidencedValue = pureCallEvidence(name, rawValue);
      const value = pureSessionResponsePayload(name, evidencedValue);
      result = ok(value);
    } catch (e) {
      result =
        PLAY_MODE === "pure"
          ? {
              content: [{ type: "text", text: JSON.stringify(pureSessionErrorPayload(e)) }],
              isError: true,
            }
          : {
              content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
              isError: true,
            };
    } finally {
      if (ownsPureCall) pureRunState.callInFlight = false;
    }
    spectateRecord(name, args, result);
    if (SPECTATE_DELAY_MS > 0) await new Promise((r) => setTimeout(r, SPECTATE_DELAY_MS));
    return result;
  };
}

const server = new McpServer({ name: "adventureforge", version: "0.1.0" });

/** MCP behavioral hints (see the spec's tool annotations). */
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolRegistration = {
  name: string;
  description: string;
  annotations: ToolAnnotations;
};

/** Every registered tool, exported so tests can hold descriptions + annotations to a floor. */
export const TOOL_REGISTRATIONS: ToolRegistration[] = [];

/**
 * Tools that neither mutate session/engine state nor have side effects — pure reads,
 * previews, serializers, and deterministic mint/validate/replay analyses. Everything
 * else creates or advances a session (a session-store mutation), so it is left as the
 * mutating default. This engine is closed and deterministic, so EVERY tool is
 * non-destructive and non-open-world (no external entities); read-only tools are also
 * idempotent (same args ⇒ same result).
 */
export const READ_ONLY_TOOLS = new Set<string>([
  "list_overworld",
  "get_overworld_session",
  "get_overworld_session_context",
  "export_overworld_session",
  "plan_overworld_session_route",
  "get_observation",
  "list_legal_actions",
  "get_state",
  "get_transcript",
  "save_game",
  "validate_quest",
  "load_quest",
  "generate_rpg_pack",
  "replay_trace",
  "inspect_trace",
  "adapt_story",
  "apply_content_patch",
]);

function tool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  handler: (args: never) => unknown,
): void {
  if (!toolAvailableInPlayMode(name, PLAY_MODE)) return;
  const readOnly = READ_ONLY_TOOLS.has(name);
  const annotations: ToolAnnotations = {
    // Deterministic, closed engine: no external entities, and nothing is destroyed
    // (sessions are in-memory; saves/snapshots are returned strings).
    openWorldHint: false,
    destructiveHint: false,
    ...(readOnly ? { readOnlyHint: true, idempotentHint: true } : {}),
  };
  TOOL_REGISTRATIONS.push({ name, description, annotations });
  server.registerTool(
    name,
    { description, inputSchema, annotations },
    wrap(name, handler) as never,
  );
}

const WORLD_QUEST_SOURCE = {
  world_quest_id: z.string().describe("Shipped quest id (from the overworld quest registry)."),
};
const G = z.number().int().refine(genSeed);
const B = (d: string) => z.boolean().optional().describe(d);
const SESSION_HANDLE = (description: string) =>
  (PLAY_MODE === "pure" ? z.coerce.string().optional() : z.string()).describe(description);
const OVERWORLD_SESSION = {
  session_id: SESSION_HANDLE("Parent handle: overworld_session_id; never rpg_session_id."),
};
const RPG_SESSION = {
  session_id: SESSION_HANDLE("Child handle: rpg_session_id; never overworld_session_id."),
};
const HIDE_GRAPH = {
  hide_graph: B("Omit the world graph from observations."),
};
const PLAYER_HIDE_GRAPH = PLAY_MODE === "pure" ? {} : HIDE_GRAPH;
const EMBEDDED_QUEST_SEED =
  PLAY_MODE === "pure"
    ? {}
    : {
        seed: z.number().int().safe().optional().describe("Runtime seed."),
      };
const COMPACT_ACTIONS = {
  compact_actions: B("Bare action ids instead of labeled options."),
};
const COMPACT_EVENTS = {
  compact_events: B("Events as tagged tuples per the session legend."),
  include_event_version: B("Echo the event schema version."),
};
const COMPACT_OBSERVATION = {
  compact_observation: B("False swaps the compact context for the verbose observation."),
  include_actions: B("Legal action ids in context; enforced for active pure compact responses."),
  include_context_version: B("Echo the context schema version."),
};
const IF_STATE_HASH = {
  if_state_hash: z.string().optional().describe("Reply unchanged:true if this state hash holds."),
};
const IF_TRANSCRIPT_HASH = {
  if_transcript_hash: z
    .string()
    .optional()
    .describe("Reply unchanged:true if this transcript hash holds."),
};
const EXPECTED_STATE_HASH = {
  expected_state_hash: z.string().optional().describe("Reject if the state hash went stale."),
};
tool(
  "list_overworld",
  "Summarize the overworld: town, road, and content counts plus the start town; design notes are opt-in.",
  {
    include_design_notes: z.boolean().optional().describe("Include sources and design rules."),
  },
  (a) => api.list_overworld(a),
);

function defaultCompactRpg(args: unknown): never {
  const input: Record<string, unknown> =
    typeof args === "object" && args !== null ? { ...(args as Record<string, unknown>) } : {};
  if (PLAY_MODE === "pure") {
    delete input.hide_graph;
    delete input.seed;
  }
  const response = {
    hide_graph: true,
    compact_actions: true,
    compact_events: true,
    compact_observation: true,
    ...input,
  };
  if (PLAY_MODE !== "pure") return response as never;
  return {
    ...response,
    hide_graph: true,
    ...(input.compact_observation === false
      ? { compact_actions: input.compact_actions ?? false }
      : { include_actions: true }),
  } as never;
}

function defaultCompactActions(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return { compact_actions: PLAY_MODE === "pure" ? false : true, ...input } as never;
}

function defaultCompactOverworld(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return {
    compact_context: true,
    compact_result: true,
    ...input,
    ...(PLAY_MODE === "pure"
      ? {
          compact_context: true,
          compact_result: true,
          include_ids: false,
          include_route_options: false,
        }
      : {}),
  } as never;
}

function defaultCompactOverworldAndRpg(args: unknown): never {
  const input: Record<string, unknown> =
    typeof args === "object" && args !== null ? { ...(args as Record<string, unknown>) } : {};
  if (PLAY_MODE === "pure") {
    delete input.hide_graph;
    delete input.seed;
  }
  const response = {
    compact_context: true,
    compact_result: true,
    hide_graph: true,
    compact_actions: true,
    compact_observation: true,
    ...input,
  };
  if (PLAY_MODE !== "pure") return response as never;
  return {
    ...response,
    hide_graph: true,
    compact_context: true,
    compact_result: true,
    include_ids: false,
    include_route_options: false,
    ...(input.compact_observation === false
      ? { compact_actions: input.compact_actions ?? false }
      : { include_actions: true }),
  } as never;
}

function defaultCompactTranscript(args: unknown): never {
  const input = typeof args === "object" && args !== null ? args : {};
  return {
    summary_only: true,
    compact_events: true,
    compact_summary: true,
    turn_limit: TRANSCRIPT_TURN_LIMIT_DEFAULT,
    ...input,
  } as never;
}

type McpStateArgs = {
  session_id: string;
  include_state?: boolean;
  compact_state?: boolean;
  if_state_hash?: string;
};

function compactMcpState(args: McpStateArgs): unknown {
  return api.get_state(args);
}

type McpOverworldReadArgs = {
  session_id: string;
  include_observation?: boolean;
  if_snapshot_hash?: string;
  include_ids?: boolean;
  include_route_options?: boolean;
};

function compactMcpOverworldSession(args: McpOverworldReadArgs): unknown {
  return PLAY_MODE !== "pure" && args.include_observation === true
    ? api.get_overworld_session(args)
    : api.get_overworld_session_context(args);
}

const EXPECTED_SNAPSHOT_HASH = {
  expected_snapshot_hash: z.string().optional().describe("Reject if the snapshot hash is stale."),
};
const IF_SNAPSHOT_HASH = {
  if_snapshot_hash: z
    .string()
    .optional()
    .describe("Reply unchanged:true if this snapshot hash holds."),
};
const ROUTES = {
  include_route_options: B("Include multi-leg route_options in the context."),
};
const IDS = {
  include_ids: B("Include discovered/completed id lists in the context."),
};
const W = {
  include_world_name: B("Include the world name in the context."),
};
const S = {
  include_session_id: B("Echo the session id."),
};
const OVERWORLD_READ_DETAILS = PLAY_MODE === "pure" ? {} : { ...S, ...W, ...IDS, ...ROUTES };
const COMPACT_OVERWORLD_CONTEXT =
  PLAY_MODE === "pure"
    ? {}
    : {
        compact_context: B("False swaps the compact context for the verbose observation."),
        ...W,
        ...IDS,
        ...ROUTES,
      };
const COMPACT_OVERWORLD_RESULT =
  PLAY_MODE === "pure"
    ? {}
    : {
        compact_result: B("False returns the verbose action result."),
      };
const OVERWORLD_ACTION_CONTEXT = {
  ...EXPECTED_SNAPSHOT_HASH,
  ...COMPACT_OVERWORLD_CONTEXT,
  ...COMPACT_OVERWORLD_RESULT,
};

tool(
  "start_overworld",
  "Start a fresh overworld game; returns its one-time tutorial, current journey goal, session_id, snapshot_hash, and compact legend.",
  {
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.start_overworld(defaultCompactOverworld(a)),
);
tool(
  "get_overworld_session",
  PLAY_MODE === "pure"
    ? "Re-read the bounded compact context of the current overworld session without acting."
    : "Re-read an overworld session without acting; include_observation swaps the compact context for the verbose view.",
  {
    ...OVERWORLD_SESSION,
    ...IF_SNAPSHOT_HASH,
    ...(PLAY_MODE === "pure"
      ? {}
      : {
          include_observation: z.boolean().optional().describe("Return the verbose observation."),
        }),
    ...OVERWORLD_READ_DETAILS,
  },
  (a) => compactMcpOverworldSession(a),
);
tool(
  "get_overworld_session_context",
  "Re-read only the compact context of an overworld session, with if_snapshot_hash change detection.",
  {
    ...OVERWORLD_SESSION,
    ...IF_SNAPSHOT_HASH,
    ...OVERWORLD_READ_DETAILS,
  },
  (a) => api.get_overworld_session_context(a),
);
tool(
  "export_overworld_session",
  "Export a resumable overworld snapshot; pass it to restore_overworld_session to continue the run later.",
  {
    ...OVERWORLD_SESSION,
    ...EXPECTED_SNAPSHOT_HASH,
    ...IF_SNAPSHOT_HASH,
  },
  (a) => api.export_overworld_session(a),
);
tool(
  "restore_overworld_session",
  "Continue an exported overworld snapshot as a new session without replaying the fresh-game tutorial; repeats the compact-context legend.",
  {
    snapshot: z.record(z.unknown()).describe("Snapshot from export_overworld_session."),
    ...COMPACT_OVERWORLD_CONTEXT,
  },
  (a) => api.restore_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "travel_overworld_session",
  "Travel one road to an adjacent town, spending minutes and supplies and gaining fatigue; may trigger a road encounter.",
  {
    ...OVERWORLD_SESSION,
    destination_town_id: z.string().optional().describe("Adjacent destination town."),
    road_id: z.string().optional().describe("Adjacent road to walk instead."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.travel_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "follow_overworld_session_goal",
  "Follow the current goal passage until the game stops at its objective, a road choice, or a resource boundary.",
  {
    ...OVERWORLD_SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.follow_overworld_session_goal(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_road_encounter",
  "Choose a strategy for the pending road encounter; travel stays blocked until it is resolved.",
  {
    ...OVERWORLD_SESSION,
    strategy: z
      .enum(["cautious_scout", "assist_travelers", "press_on"])
      .describe("Option from pending_road.options."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_road_encounter(defaultCompactOverworld(a)),
);
tool(
  "resupply_overworld_session",
  "Buy supplies back up to the cap at the current town, spending time.",
  {
    ...OVERWORLD_SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resupply_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "rest_overworld_session",
  "Rest at the current town to lower fatigue, spending time.",
  {
    ...OVERWORLD_SESSION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.rest_overworld_session(defaultCompactOverworld(a)),
);
tool(
  "plan_overworld_session_route",
  "Preview the best route to a town — minutes, supplies, fatigue — without moving.",
  {
    ...OVERWORLD_SESSION,
    destination_town_id: z.string().describe("Destination town id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.plan_overworld_session_route(defaultCompactOverworld(a)),
);
tool(
  "scout_overworld_session_poi",
  "Scout a point of interest in the current area; can reveal hidden areas, jobs, sites, or quests.",
  {
    ...OVERWORLD_SESSION,
    poi_id: z.string().describe("POI id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.scout_overworld_session_poi(defaultCompactOverworld(a)),
);
tool(
  "talk_overworld_session_contact",
  "Talk to a local contact; can reveal leads, jobs, quests, or renown.",
  {
    ...OVERWORLD_SESSION,
    character_id: z.string().describe("Contact id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.talk_overworld_session_contact(defaultCompactOverworld(a)),
);
tool(
  "investigate_overworld_session_event",
  "Investigate a local event to uncover details before resolving it.",
  {
    ...OVERWORLD_SESSION,
    event_id: z.string().describe("Event id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.investigate_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "resolve_overworld_session_event",
  "Resolve an investigated local event, spending time and earning renown.",
  {
    ...OVERWORLD_SESSION,
    event_id: z.string().describe("Event id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.resolve_overworld_session_event(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_site",
  "Explore a discovered exploration site for renown and journal finds.",
  {
    ...OVERWORLD_SESSION,
    site_id: z.string().describe("Site id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_site(defaultCompactOverworld(a)),
);
tool(
  "explore_overworld_session_area",
  "Survey the current local area to reveal its points of interest, contacts, events, and exits.",
  {
    ...OVERWORLD_SESSION,
    area_id: z.string().describe("Area id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.explore_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "move_overworld_session_area",
  "Walk an area route to another local area inside the current town.",
  {
    ...OVERWORLD_SESSION,
    area_route_id: z.string().describe("Route id from area_routes."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.move_overworld_session_area(defaultCompactOverworld(a)),
);
tool(
  "work_overworld_session_job",
  "Work a discovered local job, spending time to earn renown.",
  {
    ...OVERWORLD_SESSION,
    job_id: z.string().describe("Job id."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.work_overworld_session_job(defaultCompactOverworld(a)),
);
tool(
  "start_overworld_session_quest",
  "Start a discovered quest as an embedded RPG session; play via step_action, and non-death endings fold back automatically.",
  {
    ...OVERWORLD_SESSION,
    quest_id: z.string().describe("Quest id."),
    approach_id: z
      .string()
      .optional()
      .describe("Required launch approach id when the quest advertises launch options."),
    ...EMBEDDED_QUEST_SEED,
    ...PLAYER_HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.start_overworld_session_quest(defaultCompactOverworldAndRpg(a)),
);
tool(
  "complete_overworld_session_quest",
  "Fold back an ended child only when its ending response still exposes rpg_session_id; non-death endings fold automatically.",
  {
    ...OVERWORLD_SESSION,
    rpg_session_id: SESSION_HANDLE(
      "Ended child RPG handle from rpg_session_id; distinct from parent overworld session_id.",
    ),
    expected_rpg_state_hash: z.string().optional().describe("Reject stale RPG state."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.complete_overworld_session_quest(defaultCompactOverworld(a)),
);
tool(
  "choose_overworld_session_journey",
  "Choose continue or end at a shown journey pause.",
  {
    ...OVERWORLD_SESSION,
    choice: z.enum(["continue", "end"]).describe("Choice from journey.pendingChoice.options."),
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.choose_overworld_session_journey(defaultCompactOverworldAndRpg(a)),
);
tool(
  "choose_overworld_session_story",
  "Choose a presented story, registration, lead, preparation, or field-team option.",
  {
    ...OVERWORLD_SESSION,
    choice: z.string().describe("Choice id from journey.storyChoice.options."),
    ...OVERWORLD_ACTION_CONTEXT,
  },
  (a) => api.choose_overworld_session_story(defaultCompactOverworld(a)),
);
tool(
  "validate_quest",
  "Validate one shipped RPG quest by id and return its validation report.",
  WORLD_QUEST_SOURCE,
  (a) => api.validate_quest(a),
);
tool(
  "load_quest",
  "Compile a shipped RPG quest and return its metadata, content hash, and validation report.",
  WORLD_QUEST_SOURCE,
  (a) => api.load_quest(a),
);

tool(
  "generate_rpg_pack",
  "Mint and validate a deterministic RPG pack from a seed, writing nothing; play it via new_game's generate_rpg_seed.",
  {
    seed: G.describe("Generation seed."),
  },
  (a) => api.generate_rpg_pack(a),
);

tool(
  "new_game",
  "Start an RPG session on the default or a generated pack; returns session_id, state_hash, and a compact context with its legend.",
  {
    generate_rpg_seed: G.optional().describe("Seed from generate_rpg_pack."),
    seed: z.number().int().safe().optional().describe("Runtime seed."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.new_game(defaultCompactRpg(a)),
);
tool(
  "start_world_quest",
  "Start an RPG session for a shipped quest by id — a dev/QA entry point into the RPG runtime; players reach quests in-world via the overworld. Returns session_id, state_hash, and a compact context with its legend.",
  {
    world_quest_id: z.string().describe("Shipped quest id (from the overworld quest registry)."),
    seed: z.number().int().safe().optional().describe("Runtime seed."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.start_world_quest(defaultCompactRpg(a)),
);

tool(
  "get_observation",
  "Re-read the current RPG context without acting; embedded quests also return the parent journey.",
  {
    ...RPG_SESSION,
    ...PLAYER_HIDE_GRAPH,
    ...IF_STATE_HASH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.get_observation(defaultCompactRpg(a)),
);
tool(
  "list_legal_actions",
  "List legal RPG actions and authored unavailable choices with reasons.",
  {
    ...RPG_SESSION,
    ...IF_STATE_HASH,
    compact_actions: z
      .boolean()
      .optional()
      .describe(
        PLAY_MODE === "pure"
          ? "True returns bare action ids; defaults to labeled options."
          : "False returns labeled options.",
      ),
  },
  (a) => api.list_legal_actions(defaultCompactActions(a)),
);

tool(
  "step_action",
  "Apply a legal RPG action or select an unavailable id for its authored reason.",
  {
    ...RPG_SESSION,
    action_id: z.string().describe("Id from legal or unavailable action rows."),
    ...EXPECTED_STATE_HASH,
    ...PLAYER_HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_EVENTS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.step_action(defaultCompactRpg(a)),
);
tool(
  "get_state",
  "Read the RPG session's state hash for change detection; raw or compact state is opt-in.",
  {
    ...RPG_SESSION,
    ...IF_STATE_HASH,
    include_state: z.boolean().optional().describe("Include the raw state object."),
    compact_state: z.boolean().optional().describe("Include a compact state summary."),
  },
  (a) => compactMcpState(a),
);
tool(
  "get_transcript",
  "Summarize an RPG session's play history; per-turn rows and events are opt-in.",
  {
    ...RPG_SESSION,
    ...S,
    include_source: z.boolean().optional(),
    ...IF_TRANSCRIPT_HASH,
    summary_only: z.boolean().optional().describe("False adds per-turn rows."),
    compact_summary: z.boolean().optional().describe("False keeps verbose summary labels."),
    compact_turns: z.boolean().optional().describe("Turn rows as tuples."),
    turn_limit: z.number().int().min(0).optional().describe("Max turn rows."),
    ...COMPACT_EVENTS,
  },
  (a) => api.get_transcript(defaultCompactTranscript(a)),
);
tool(
  "save_game",
  "Serialize the RPG session to a save string for load_game; hash guards reject stale saves.",
  {
    ...RPG_SESSION,
    ...EXPECTED_STATE_HASH,
    ...IF_STATE_HASH,
    include_source: z.boolean().optional().describe("Echo source id."),
    include_content_hash: z.boolean().optional().describe("Echo content hash."),
  },
  (a) => api.save_game(a),
);
tool(
  "load_game",
  "Restore an RPG session from a save string; returns a new session_id and a compact context with its legend.",
  {
    world_quest_id: z.string().optional().describe("World quest id."),
    generate_rpg_seed: G.optional().describe("Seed for generated-pack saves."),
    save: z.string().describe("Save string from save_game."),
    ...HIDE_GRAPH,
    ...COMPACT_ACTIONS,
    ...COMPACT_OBSERVATION,
  },
  (a) => api.load_game(defaultCompactRpg(a)),
);

tool(
  "replay_trace",
  "Replay a recorded action trace through the engine and verify the final state hash.",
  {
    trace_path: z.string().describe("Trace path."),
    world_quest_id: z.string().optional().describe("World quest id."),
  },
  (a) => api.replay_trace(a),
);

tool(
  "adapt_story",
  "Author and validate a new RPG pack from a story premise; returns the authoring report.",
  {
    premise: z.string().describe("Story premise."),
    include_pack: z.boolean().optional().describe("Echo the authored pack."),
  },
  (a) => api.adapt_story(a),
);

tool(
  "inspect_trace",
  "Inspect a recorded trace with per-step summaries, hash checks, and bug diagnosis.",
  {
    trace_path: z.string().describe("Trace path."),
    world_quest_id: z.string().optional().describe("World quest id."),
    compact_summary: z.boolean().optional().describe("Step summaries as tuple rows."),
  },
  (a) => api.inspect_trace(a),
);

tool(
  "apply_content_patch",
  "Apply a validated op-based content patch to a shipped quest and return proof; writes nothing.",
  {
    ...WORLD_QUEST_SOURCE,
    include_pack: z.boolean().optional().describe("Echo the patched pack."),
    proposal: z
      .object({
        layer: z.enum([
          "content",
          "engine_rule",
          "validator",
          "test",
          "hint_text",
          "quest_structure",
        ]),
        summary: z.string(),
        ops: z.array(z.record(z.string(), z.unknown())).describe("Validated patch ops."),
      })
      .describe("Op-based patch proposal."),
  },
  (a) => api.apply_content_patch(a as never),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only — stdout is the MCP transport.
  process.stderr.write("adventureforge MCP server ready on stdio\n");
  announceSpectate();
}

// Connect the stdio transport only when this module is the process entrypoint
// (`npm run mcp` / `tsx src/mcp/server.ts`). Importing it — e.g. from
// tests/unit/compact_legend.test.ts to read TOOL_REGISTRATIONS — must not
// hijack stdin/stdout.
const entryPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
const isDirectRun =
  entryPath !== "" && entryPath.toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) {
  main().catch((e) => {
    process.stderr.write(`Fatal: ${(e as Error).message}\n`);
    process.exit(1);
  });
}
