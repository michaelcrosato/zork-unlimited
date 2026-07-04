import type { GameEvent } from "../core/events.js";
import { compactText } from "./compact_truncation.js";

const COMPACT_NARRATION_CHAR_LIMIT = 500;
const COMPACT_REJECTION_CHAR_LIMIT = 240;
const COMPACT_JOURNAL_CHAR_LIMIT = 320;
const COMPACT_DIAGNOSTIC_CHAR_LIMIT = 240;
const COMPACT_STATE_VALUE_CHAR_LIMIT = 320;

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

export const RPG_COMPACT_EVENT_VERSION = 4 as const;

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
  return typeof value === "string" ? compactText(value, COMPACT_STATE_VALUE_CHAR_LIMIT) : value;
}

function compactFallbackKey(event: GameEvent): string | null {
  return (
    stringField(event, "flag") ||
    stringField(event, "name") ||
    stringField(event, "id") ||
    stringField(event, "item") ||
    compactText(stringField(event, "text"), COMPACT_STATE_VALUE_CHAR_LIMIT) ||
    stringField(event, "quest") ||
    null
  );
}

function withDiagnostic(event: GameEvent, compact: readonly unknown[]): RpgCompactEvent {
  const diagnostic = diagnosticField(event);
  return (diagnostic ? [...compact, diagnostic] : compact) as unknown as RpgCompactEvent;
}

function compactStateChangeEvent(event: RpgStateChangeEvent): RpgCompactEvent {
  switch (event.effect) {
    case "set_flag":
      return withDiagnostic(event, ["s", "f", stringField(event, "flag")]);
    case "clear_flag":
      return withDiagnostic(event, ["s", "x", stringField(event, "flag")]);
    case "set_var":
      return withDiagnostic(event, [
        "s",
        "v",
        stringField(event, "name"),
        compactValue(field(event, "value")),
      ]);
    case "inc_var":
      return withDiagnostic(event, [
        "s",
        "+",
        stringField(event, "name"),
        compactValue(field(event, "delta")),
        compactValue(field(event, "value")),
      ]);
    case "dec_var":
      return withDiagnostic(event, [
        "s",
        "-",
        stringField(event, "name"),
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
        stringField(event, "id"),
        compactValue(field(event, "locked")),
      ]);
    case "place_object":
      return withDiagnostic(event, [
        "s",
        "p",
        stringField(event, "id"),
        stringField(event, "room"),
      ]);
    case "set_quest_stage":
      return withDiagnostic(event, [
        "s",
        "q",
        stringField(event, "quest"),
        stringField(event, "stage"),
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
        ? withDiagnostic(event, ["s", event.effect, key, value])
        : withDiagnostic(event, ["s", event.effect, key]);
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
      return ["u", event.from, event.to];
    case "open_object":
      return ["o", event.id];
    case "move":
      return ["m", event.from, event.to];
    case "take":
      return ["t", event.item];
    case "drop":
      return ["d", event.item];
    case "dialogue":
      return ["q", event.npc, event.node];
    case "ending":
      return ["e", event.endingId];
  }
}
