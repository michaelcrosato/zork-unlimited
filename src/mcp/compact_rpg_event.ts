import type { GameEvent } from "../core/events.js";
import { compactText } from "./compact_truncation.js";
import { compactMcpTranscriptSceneId, compactMcpTranscriptSummaryValue } from "./action_labels.js";

const COMPACT_NARRATION_CHAR_LIMIT = 500;
const COMPACT_REJECTION_CHAR_LIMIT = 240;
const COMPACT_JOURNAL_CHAR_LIMIT = 320;
const COMPACT_DIAGNOSTIC_CHAR_LIMIT = 240;

export type RpgCompactEvent =
  | readonly ["r", reason: string]
  | readonly ["n", text: string]
  | readonly [
      "s",
      effect: string,
      key: string | null,
      value?: unknown,
      extra?: unknown,
      diagnostic?: string,
    ]
  | readonly ["u", from: string, to: string]
  | readonly ["o", id: string]
  | readonly ["m", from: string, to: string]
  | readonly ["t", item: string]
  | readonly ["d", item: string]
  | readonly ["q", npc: string, node: string]
  | readonly ["e", endingId: string];

export const RPG_COMPACT_EVENT_VERSION = 5 as const;

type RpgStateChangeEvent = Extract<GameEvent, { type: "state_change" }>;

function field(event: GameEvent, key: string): unknown {
  return (event as unknown as Record<string, unknown>)[key];
}

function stringField(event: GameEvent, key: string): string {
  const value = field(event, key);
  return typeof value === "string" ? value : "";
}

function diagnosticField(event: GameEvent): string | undefined {
  const diagnostic = field(event, "diagnostic");
  return typeof diagnostic === "string"
    ? compactText(diagnostic, COMPACT_DIAGNOSTIC_CHAR_LIMIT)
    : undefined;
}

function compactValue(value: unknown): unknown {
  return typeof value === "string" ? compactMcpTranscriptSummaryValue(value) : value;
}

function compactFallbackKey(event: GameEvent): string | null {
  const key =
    stringField(event, "flag") ||
    stringField(event, "name") ||
    stringField(event, "id") ||
    stringField(event, "item") ||
    stringField(event, "text") ||
    stringField(event, "quest");
  return key ? compactMcpTranscriptSummaryValue(key) : null;
}

function withDiagnostic(event: GameEvent, compact: readonly unknown[]): RpgCompactEvent {
  const diagnostic = diagnosticField(event);
  return (diagnostic ? [...compact, diagnostic] : compact) as unknown as RpgCompactEvent;
}

function compactStateChangeEvent(event: RpgStateChangeEvent): RpgCompactEvent {
  switch (event.effect) {
    case "set_flag":
      return withDiagnostic(event, [
        "s",
        "f",
        compactMcpTranscriptSummaryValue(stringField(event, "flag")),
      ]);
    case "clear_flag":
      return withDiagnostic(event, [
        "s",
        "x",
        compactMcpTranscriptSummaryValue(stringField(event, "flag")),
      ]);
    case "set_var":
      return withDiagnostic(event, [
        "s",
        "v",
        compactMcpTranscriptSummaryValue(stringField(event, "name")),
        compactValue(field(event, "value")),
      ]);
    case "inc_var":
      return withDiagnostic(event, [
        "s",
        "+",
        compactMcpTranscriptSummaryValue(stringField(event, "name")),
        compactValue(field(event, "delta")),
        compactValue(field(event, "value")),
      ]);
    case "dec_var":
      return withDiagnostic(event, [
        "s",
        "-",
        compactMcpTranscriptSummaryValue(stringField(event, "name")),
        compactValue(field(event, "delta")),
        compactValue(field(event, "value")),
      ]);
    case "add_journal":
      return withDiagnostic(event, [
        "s",
        "j",
        compactText(stringField(event, "text"), COMPACT_JOURNAL_CHAR_LIMIT),
      ]);
    case "set_object_locked":
      return withDiagnostic(event, [
        "s",
        "l",
        compactMcpTranscriptSummaryValue(stringField(event, "id")),
        compactValue(field(event, "locked")),
      ]);
    case "place_object":
      return withDiagnostic(event, [
        "s",
        "p",
        compactMcpTranscriptSummaryValue(stringField(event, "id")),
        compactMcpTranscriptSceneId(stringField(event, "room")),
      ]);
    case "set_quest_stage":
      return withDiagnostic(event, [
        "s",
        "q",
        compactMcpTranscriptSummaryValue(stringField(event, "quest")),
        compactMcpTranscriptSummaryValue(stringField(event, "stage")),
      ]);
    default: {
      const key = compactFallbackKey(event);
      const value = compactValue(
        field(event, "value") ??
          field(event, "delta") ??
          field(event, "to") ??
          field(event, "amount") ??
          field(event, "locked") ??
          field(event, "room") ??
          field(event, "stage"),
      );
      return value !== undefined
        ? withDiagnostic(event, ["s", compactMcpTranscriptSummaryValue(event.effect), key, value])
        : withDiagnostic(event, ["s", compactMcpTranscriptSummaryValue(event.effect), key]);
    }
  }
}

export function compactPlayerEvent(event: GameEvent): RpgCompactEvent {
  switch (event.type) {
    case "rejected":
      return ["r", compactText(event.reason, COMPACT_REJECTION_CHAR_LIMIT)];
    case "narration":
      return ["n", compactText(event.text, COMPACT_NARRATION_CHAR_LIMIT)];
    case "state_change":
      return compactStateChangeEvent(event);
    case "unlock_exit":
      return ["u", compactMcpTranscriptSceneId(event.from), compactMcpTranscriptSceneId(event.to)];
    case "open_object":
      return ["o", compactMcpTranscriptSummaryValue(event.id)];
    case "move":
      return ["m", compactMcpTranscriptSceneId(event.from), compactMcpTranscriptSceneId(event.to)];
    case "take":
      return ["t", compactMcpTranscriptSummaryValue(event.item)];
    case "drop":
      return ["d", compactMcpTranscriptSummaryValue(event.item)];
    case "dialogue":
      return [
        "q",
        compactMcpTranscriptSummaryValue(event.npc),
        compactMcpTranscriptSummaryValue(event.node),
      ];
    case "ending":
      return ["e", compactMcpTranscriptSummaryValue(event.endingId)];
  }
}
