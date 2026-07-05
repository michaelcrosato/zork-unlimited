import { hashState } from "../core/hash.js";
import type { GameEvent } from "../core/events.js";
import { SessionStore, type Session, type TranscriptSummary } from "./sessions.js";
import {
  compactPlayerEvent,
  RPG_COMPACT_EVENT_VERSION,
  type RpgCompactEvent,
} from "./compact_rpg_event.js";
import {
  compactHead,
  compactRecent,
  compactTrailingOmissionCounts,
  omittedCount,
} from "./compact_truncation.js";

export type RpgEventOptions = {
  compact_events?: boolean;
};

export type RpgStepEvents<Args extends RpgEventOptions> = Args extends { compact_events: true }
  ? RpgCompactEvent[]
  : ReturnType<typeof playerVisibleEvents>;

export type RpgStepEventVersion<Args extends RpgEventOptions> = Args extends {
  compact_events: true;
}
  ? { event_v: typeof RPG_COMPACT_EVENT_VERSION }
  : Record<string, never>;

export type TranscriptArgs = {
  session_id: string;
  summary_only?: boolean;
  compact_turns?: boolean;
  compact_events?: boolean;
  compact_summary?: boolean;
  if_transcript_hash?: string;
  turn_limit?: number;
};

type TranscriptFullTurn = Session["transcript"][number];
type TranscriptCompactEventTurn = Omit<TranscriptFullTurn, "events"> & {
  events: RpgCompactEvent[];
};
type TranscriptCompactTurn = readonly [
  step: number,
  scene_id: string,
  action_id: string | null,
  result_scene_id: string,
];
type TranscriptCompactMore = readonly [
  scenes: number,
  inventory?: number,
  flags?: number,
  journal?: number,
];
type TranscriptCompactSummary = Omit<
  TranscriptSummary,
  "ending_id" | "inventory" | "flags" | "journal"
> & {
  ending_id?: string;
  inventory?: string[];
  flags?: string[];
  journal?: string[];
  more?: TranscriptCompactMore;
};
type TranscriptSummaryFor<Args extends TranscriptArgs> = Args extends { compact_summary: true }
  ? TranscriptCompactSummary
  : TranscriptSummary;
type TranscriptPayloadBase<Args extends TranscriptArgs> = {
  session_id: string;
  state_hash: string;
  transcript_hash: string;
  summary: TranscriptSummaryFor<Args>;
  turns_omitted?: number;
  world_quest_id?: string;
  generated_rpg_seed?: number;
};
type TranscriptTurnFor<Args extends TranscriptArgs> = Args extends { compact_turns: true }
  ? TranscriptCompactTurn
  : Args extends { compact_events: true }
    ? TranscriptCompactEventTurn
    : TranscriptFullTurn;
type TranscriptEventVersion<Args extends TranscriptArgs> = Args extends { summary_only: true }
  ? Record<string, never>
  : Args extends { compact_turns: true }
    ? Record<string, never>
    : Args extends { compact_events: true }
      ? { event_v: typeof RPG_COMPACT_EVENT_VERSION }
      : Record<string, never>;
export type TranscriptPayload<Args extends TranscriptArgs> = TranscriptPayloadBase<Args> &
  TranscriptEventVersion<Args> &
  (Args extends { summary_only: true }
    ? Record<string, never>
    : { turns: TranscriptTurnFor<Args>[] });
export type TranscriptUnchanged = {
  state_hash: string;
  transcript_hash: string;
  unchanged: true;
};
export type TranscriptResponse<Args extends TranscriptArgs> = Args extends {
  if_transcript_hash: string;
}
  ? TranscriptPayload<Args> | TranscriptUnchanged
  : TranscriptPayload<Args>;

const TRANSCRIPT_PROJECTION_COMPACT_TURNS = "compact-turns:v1";
const TRANSCRIPT_PROJECTION_VISIBLE_EVENTS = "visible-events:v1";
const TRANSCRIPT_PROJECTION_COMPACT_EVENTS = `compact-events:v${RPG_COMPACT_EVENT_VERSION}`;
const TRANSCRIPT_SUMMARY_PROJECTION_COMPACT = "compact-summary:v1";
const TRANSCRIPT_SUMMARY_LIST_LIMIT = 16;
const TRANSCRIPT_SUMMARY_JOURNAL_LIMIT = 5;
export const TRANSCRIPT_TURN_LIMIT_DEFAULT = 64;

export function transcriptUnchanged(
  stateHash: string,
  transcriptHash: string,
): TranscriptUnchanged {
  return {
    state_hash: stateHash,
    transcript_hash: transcriptHash,
    unchanged: true,
  };
}

export function hashTranscript(session: Session, stateHash: string): string {
  return hashState({
    state_hash: stateHash,
    transcript_log_hash: session.transcriptLogHash,
  });
}

function compactTranscriptSummary(summary: TranscriptSummary): TranscriptCompactSummary {
  const scenes = compactHead(summary.scenes, TRANSCRIPT_SUMMARY_LIST_LIMIT);
  const inventory = compactHead(summary.inventory, TRANSCRIPT_SUMMARY_LIST_LIMIT);
  const flags = compactHead(summary.flags, TRANSCRIPT_SUMMARY_LIST_LIMIT);
  const journal = compactRecent(summary.journal, TRANSCRIPT_SUMMARY_JOURNAL_LIMIT);
  const omittedScenes = omittedCount(summary.scenes, scenes);
  const omittedInventory = omittedCount(summary.inventory, inventory);
  const omittedFlags = omittedCount(summary.flags, flags);
  const omittedJournal = omittedCount(summary.journal, journal);
  const more = compactTrailingOmissionCounts([
    omittedScenes ?? 0,
    omittedInventory ?? 0,
    omittedFlags ?? 0,
    omittedJournal ?? 0,
  ]) as TranscriptCompactMore | undefined;
  const {
    ending_id: endingId,
    inventory: _fullInventory,
    flags: _fullFlags,
    journal: _fullJournal,
    ...baseSummary
  } = summary;
  return {
    ...baseSummary,
    ...(endingId ? { ending_id: endingId } : {}),
    scenes,
    ...(inventory.length > 0 ? { inventory } : {}),
    ...(flags.length > 0 ? { flags } : {}),
    ...(journal.length > 0 ? { journal } : {}),
    ...(more ? { more } : {}),
  };
}

export function transcriptSummaryFor<Args extends TranscriptArgs>(
  sessions: SessionStore,
  session: Session,
  args: Args,
  summary: TranscriptSummary,
): TranscriptSummaryFor<Args> {
  return (
    args.compact_summary
      ? sessions.transcriptSummaryProjection(
          session.id,
          TRANSCRIPT_SUMMARY_PROJECTION_COMPACT,
          () => compactTranscriptSummary(summary),
        )
      : summary
  ) as TranscriptSummaryFor<Args>;
}

function transcriptTurnLimit(args: Pick<TranscriptArgs, "turn_limit">, total: number): number {
  if (args.turn_limit === undefined) return total;
  if (!Number.isInteger(args.turn_limit) || args.turn_limit < 0) {
    throw new Error(`Transcript turn_limit must be a non-negative integer.`);
  }
  return Math.min(args.turn_limit, total);
}

function transcriptTurnWindow<Args extends TranscriptArgs>(
  session: Session,
  args: Args,
): { turns: Session["transcript"]; omitted: number; keySuffix: string } {
  const total = session.transcriptStats.turns;
  const retainedOffset = total - session.transcript.length;
  const limit = transcriptTurnLimit(args, total);
  const firstRequested = total - limit;
  const firstReturned = Math.max(retainedOffset, firstRequested);
  const omitted = firstReturned;
  const retainedStart = firstReturned - retainedOffset;
  return {
    turns: retainedStart > 0 ? session.transcript.slice(retainedStart) : session.transcript,
    omitted,
    keySuffix:
      args.turn_limit === undefined
        ? `all:from:${firstReturned}:of:${total}`
        : `last:${limit}:from:${firstReturned}:of:${total}`,
  };
}

export function transcriptTurnsOmitted<Args extends TranscriptArgs>(
  session: Session,
  args: Args,
): number {
  return transcriptTurnWindow(session, args).omitted;
}

/**
 * Strip internal-bookkeeping `state_change` events from the player-facing event
 * stream. The engine state and state hashes keep the full event/effect history;
 * MCP player surfaces never show `__`-prefixed mechanics keys.
 */
export function playerVisibleEvents(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => {
    if (e.type !== "state_change") return true;
    const sc = e as { flag?: unknown; name?: unknown };
    const key = typeof sc.flag === "string" ? sc.flag : typeof sc.name === "string" ? sc.name : "";
    return !key.startsWith("__");
  });
}

export function transcriptTurnsFor<Args extends TranscriptArgs>(
  sessions: SessionStore,
  session: Session,
  args: Args,
): TranscriptTurnFor<Args>[] {
  const window = transcriptTurnWindow(session, args);
  if (args.compact_turns) {
    return sessions.transcriptProjection(
      session.id,
      `${TRANSCRIPT_PROJECTION_COMPACT_TURNS}:${window.keySuffix}`,
      () => window.turns.map((t) => [t.step, t.scene_id, t.action_id, t.result_scene_id] as const),
    ) as TranscriptTurnFor<Args>[];
  }

  if (args.compact_events === true) {
    return sessions.transcriptProjection(
      session.id,
      `${TRANSCRIPT_PROJECTION_COMPACT_EVENTS}:${window.keySuffix}`,
      () =>
        window.turns.map((t) => ({
          ...t,
          events: playerVisibleEvents(t.events).map(compactPlayerEvent),
        })),
    ) as TranscriptTurnFor<Args>[];
  }

  return sessions.transcriptProjection(
    session.id,
    `${TRANSCRIPT_PROJECTION_VISIBLE_EVENTS}:${window.keySuffix}`,
    () =>
      window.turns.map((t) => ({
        ...t,
        events: playerVisibleEvents(t.events),
      })),
  ) as TranscriptTurnFor<Args>[];
}

export function rpgStepEvents<Args extends RpgEventOptions>(
  events: GameEvent[],
  args: Args,
): RpgStepEvents<Args> {
  const visible = playerVisibleEvents(events);
  return (
    args.compact_events === true ? visible.map(compactPlayerEvent) : visible
  ) as RpgStepEvents<Args>;
}

export function rpgStepEventVersion<Args extends RpgEventOptions>(
  args: Args,
): RpgStepEventVersion<Args> {
  return (
    args.compact_events === true ? { event_v: RPG_COMPACT_EVENT_VERSION } : {}
  ) as RpgStepEventVersion<Args>;
}

export function transcriptEventVersion<Args extends TranscriptArgs>(
  args: Args,
): TranscriptEventVersion<Args> {
  return (
    args.compact_events === true && args.summary_only !== true && args.compact_turns !== true
      ? { event_v: RPG_COMPACT_EVENT_VERSION }
      : {}
  ) as TranscriptEventVersion<Args>;
}
