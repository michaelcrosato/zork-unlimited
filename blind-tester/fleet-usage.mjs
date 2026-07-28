/**
 * Pure, fail-closed usage accounting for blind fleet attempts.
 *
 * The caller is responsible for authenticating a primary envelope before
 * handing its bytes to this module. These helpers deliberately do not inspect
 * paths, hashes, or process state: they reduce already-selected artifact bytes
 * into one stable record shape. That keeps the policy usable by both the fleet
 * runner and its independent certifier.
 */
import { createHash } from "node:crypto";
import { parseJsonRejectingDuplicateKeys } from "./strict-json.mjs";

export const FLEET_USAGE_RECORD_SOURCES = Object.freeze([
  "primary_envelope",
  "terminal_turn_completed",
  "unrecoverable",
  "skipped_resume",
]);

function unrecoverableRecord() {
  return {
    source: "unrecoverable",
    input_tokens: null,
    cached_input_tokens: null,
    output_tokens: null,
    reasoning_output_tokens: null,
  };
}

/** A resumed run did not launch a provider, so its contribution is explicitly zero. */
export function skippedResumeUsageRecord() {
  return {
    source: "skipped_resume",
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };
}

function isNonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value, expectedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
}

/**
 * Convert a provider usage object into the public accounting shape. Codex
 * emits cache field names that differ between normalized primary envelopes and
 * raw terminal events. The primary form requires every count; raw terminal
 * events may omit reasoning_output_tokens, which is semantically zero.
 */
export function usageRecordFromUsageObject(
  usage,
  source,
  { cachedInputKey, requireReasoningOutputTokens = false } = {},
) {
  if (
    !FLEET_USAGE_RECORD_SOURCES.includes(source) ||
    source === "unrecoverable" ||
    source === "skipped_resume" ||
    usage === null ||
    typeof usage !== "object" ||
    Array.isArray(usage)
  ) {
    return unrecoverableRecord();
  }

  const expectedCachedInputKey =
    cachedInputKey ??
    (source === "primary_envelope"
      ? "cache_read_input_tokens"
      : source === "terminal_turn_completed"
        ? "cached_input_tokens"
        : null);
  if (expectedCachedInputKey === null) return unrecoverableRecord();
  const cachedInputTokens = usage[expectedCachedInputKey];
  const reasoningOutputTokens = usage.reasoning_output_tokens;
  if (
    !isNonnegativeSafeInteger(usage.input_tokens) ||
    !isNonnegativeSafeInteger(cachedInputTokens) ||
    !isNonnegativeSafeInteger(usage.output_tokens) ||
    (requireReasoningOutputTokens && !isNonnegativeSafeInteger(reasoningOutputTokens)) ||
    (reasoningOutputTokens !== undefined && !isNonnegativeSafeInteger(reasoningOutputTokens)) ||
    cachedInputTokens > usage.input_tokens
  ) {
    return unrecoverableRecord();
  }

  return {
    source,
    input_tokens: usage.input_tokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: usage.output_tokens,
    reasoning_output_tokens: reasoningOutputTokens ?? 0,
  };
}

function parseStrictJson(text, label) {
  return typeof text === "string" ? parseJsonRejectingDuplicateKeys(text, label) : null;
}

/**
 * Reduce a verified attempt's already-authenticated primary envelope. Nothing
 * else (including its provider event stream) can supply usage for a verified
 * attempt.
 */
export function usageRecordFromVerifiedPrimaryEnvelope(primaryEnvelopeText) {
  const parsed = parseStrictJson(primaryEnvelopeText, "primary envelope");
  if (!parsed?.ok) return unrecoverableRecord();
  const envelope = parsed.value;
  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope) ||
    envelope.type !== "result" ||
    envelope.subtype !== "success" ||
    envelope.provider !== "codex" ||
    envelope.is_error !== false ||
    envelope.terminal_reason !== "completed" ||
    !Number.isSafeInteger(envelope.num_turns) ||
    envelope.num_turns <= 0 ||
    typeof envelope.result !== "string" ||
    typeof envelope.session_id !== "string" ||
    typeof envelope.requested_model !== "string" ||
    !hasExactKeys(envelope.usage, [
      "cache_read_input_tokens",
      "input_tokens",
      "output_tokens",
      "reasoning_output_tokens",
    ]) ||
    !hasExactKeys(envelope.modelUsage, [envelope.requested_model])
  ) {
    return unrecoverableRecord();
  }
  const record = usageRecordFromUsageObject(envelope.usage, "primary_envelope", {
    cachedInputKey: "cache_read_input_tokens",
    requireReasoningOutputTokens: true,
  });
  if (record.source === "unrecoverable") return record;

  const modelUsage = envelope.modelUsage[envelope.requested_model];
  if (
    !hasExactKeys(modelUsage, [
      "cacheReadInputTokens",
      "inputTokens",
      "outputTokens",
      "reasoningOutputTokens",
    ]) ||
    modelUsage.inputTokens !== record.input_tokens ||
    modelUsage.cacheReadInputTokens !== record.cached_input_tokens ||
    modelUsage.outputTokens !== record.output_tokens ||
    modelUsage.reasoningOutputTokens !== record.reasoning_output_tokens
  ) {
    return unrecoverableRecord();
  }
  return record;
}

function usageRecordFromTerminalTurnCompleted(providerEventsText) {
  if (typeof providerEventsText !== "string") return unrecoverableRecord();
  const lines = providerEventsText.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return unrecoverableRecord();

  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseJsonRejectingDuplicateKeys(
      lines[index],
      `provider events line ${index + 1}`,
    );
    if (
      !parsed.ok ||
      parsed.value === null ||
      typeof parsed.value !== "object" ||
      Array.isArray(parsed.value)
    ) {
      return unrecoverableRecord();
    }
    rows.push(parsed.value);
  }

  const terminal = rows.at(-1);
  if (terminal.type !== "turn.completed") return unrecoverableRecord();
  return usageRecordFromUsageObject(terminal.usage, "terminal_turn_completed", {
    cachedInputKey: "cached_input_tokens",
  });
}

/**
 * Reduce a failed attempt. If a primary envelope was archived, it is the only
 * permitted source—even if malformed. The raw event stream is a fallback only
 * when no primary envelope exists at all, and only its terminal turn.completed
 * row may carry usage.
 */
export function usageRecordFromFailedAttempt({
  archivedPrimaryEnvelopeText = null,
  providerEventsText = null,
} = {}) {
  if (archivedPrimaryEnvelopeText !== null && archivedPrimaryEnvelopeText !== undefined) {
    return usageRecordFromVerifiedPrimaryEnvelope(archivedPrimaryEnvelopeText);
  }
  return usageRecordFromTerminalTurnCompleted(providerEventsText);
}

function isExactUsageRecord(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return false;
  const keys = Object.keys(record).sort();
  const expectedKeys = [
    "cached_input_tokens",
    "input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "source",
  ];
  if (
    keys.length !== expectedKeys.length ||
    !keys.every((key, index) => key === expectedKeys[index])
  ) {
    return false;
  }
  if (!FLEET_USAGE_RECORD_SOURCES.includes(record.source)) return false;
  const values = [
    record.input_tokens,
    record.cached_input_tokens,
    record.output_tokens,
    record.reasoning_output_tokens,
  ];
  if (record.source === "unrecoverable") return values.every((value) => value === null);
  if (!values.every(isNonnegativeSafeInteger)) return false;
  if (record.cached_input_tokens > record.input_tokens) return false;
  return record.source !== "skipped_resume" || values.every((value) => value === 0);
}

function addSafeUsageTotal(total, increment, field) {
  const next = total + increment;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`fleet usage ${field} exceeds the safe integer range`);
  }
  return next;
}

const SEMVER_RE =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
const CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION = 2;

/**
 * Project a validated runner client record into the non-sensitive fleet
 * summary contract. Authority tokens, executable paths, and test-only state
 * never leave this function.
 */
export function projectCodexClientForFleetSummary(client) {
  if (
    client === null ||
    typeof client !== "object" ||
    Array.isArray(client) ||
    client.schema_version !== CODEX_CLIENT_AUTHORITY_SCHEMA_VERSION ||
    !["direct", "official_npm_shim"].includes(client.launcher_kind) ||
    typeof client.selected_binary !== "string" ||
    client.selected_binary.length === 0 ||
    typeof client.executable_binary !== "string" ||
    client.executable_binary.length === 0 ||
    typeof client.authority_token !== "string" ||
    client.authority_token.length === 0 ||
    !/^[a-f0-9]{64}$/u.test(client.authority_sha256) ||
    createHash("sha256").update(client.authority_token, "utf8").digest("hex") !==
      client.authority_sha256 ||
    typeof client.cli_version !== "string" ||
    !SEMVER_RE.test(client.cli_version) ||
    typeof client.test_script !== "boolean" ||
    client.test_script
  ) {
    throw new Error("fleet client does not match the safe Codex authority contract");
  }
  return {
    schema_version: client.schema_version,
    launcher_kind: client.launcher_kind,
    authority_sha256: client.authority_sha256,
    cli_version: client.cli_version,
  };
}

/**
 * Sum only observed provider usage. Unrecoverable attempts are counted rather
 * than converted to zero, so a partial provider failure cannot look free.
 */
export function summarizeFleetUsage(records) {
  if (!Array.isArray(records) || !records.every(isExactUsageRecord)) {
    throw new Error("fleet usage records must use the exact accounting schema");
  }
  const summary = {
    attempt_count: records.length,
    launched_attempt_count: 0,
    measured_attempt_count: 0,
    skipped_resume_count: 0,
    unrecoverable_attempt_count: 0,
    complete: true,
    observed_input_tokens: 0,
    observed_cached_input_tokens: 0,
    observed_uncached_input_tokens: 0,
    observed_output_tokens: 0,
    observed_reasoning_output_tokens: 0,
    useful_tokens: 0,
  };
  for (const record of records) {
    if (record.source === "skipped_resume") {
      summary.skipped_resume_count += 1;
      continue;
    }
    summary.launched_attempt_count += 1;
    if (record.source === "unrecoverable") {
      summary.unrecoverable_attempt_count += 1;
      summary.complete = false;
      continue;
    }
    summary.measured_attempt_count += 1;
    const uncachedInputTokens = record.input_tokens - record.cached_input_tokens;
    summary.observed_input_tokens = addSafeUsageTotal(
      summary.observed_input_tokens,
      record.input_tokens,
      "observed_input_tokens",
    );
    summary.observed_cached_input_tokens = addSafeUsageTotal(
      summary.observed_cached_input_tokens,
      record.cached_input_tokens,
      "observed_cached_input_tokens",
    );
    summary.observed_uncached_input_tokens = addSafeUsageTotal(
      summary.observed_uncached_input_tokens,
      uncachedInputTokens,
      "observed_uncached_input_tokens",
    );
    summary.observed_output_tokens = addSafeUsageTotal(
      summary.observed_output_tokens,
      record.output_tokens,
      "observed_output_tokens",
    );
    summary.observed_reasoning_output_tokens = addSafeUsageTotal(
      summary.observed_reasoning_output_tokens,
      record.reasoning_output_tokens,
      "observed_reasoning_output_tokens",
    );
    summary.useful_tokens = addSafeUsageTotal(
      summary.useful_tokens,
      uncachedInputTokens + record.output_tokens,
      "useful_tokens",
    );
  }
  return summary;
}
