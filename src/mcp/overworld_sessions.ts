import { randomUUID } from "node:crypto";

import {
  OVERWORLD_COMPACT_LEGEND,
  type OverworldCompactLegendKey,
  type OverworldCompactLegendPatch,
  type OverworldCompactView,
} from "../world/compact_view.js";
import type { OverworldManifest } from "../world/overworld.js";
import { freshGameTutorial, type FreshGameTutorial } from "../world/fresh_game_tutorial.js";
import { OverworldSession, type OverworldSessionSnapshot } from "../world/session.js";
import type { OverworldView } from "../world/session_view.js";
import type { JourneyDecisionClassification } from "../world/journey_contract.js";
import { excludedJourneyDecision } from "../world/journey_decision.js";
import {
  OVERWORLD_COMPACT_RESULT_LEGEND,
  type OverworldCompactResultLegendKey,
} from "./compact_overworld_result.js";
import { compactJourneyPresentation } from "./journey_projection.js";

export type OverworldMcpJourney = ReturnType<OverworldSession["journey"]>;

export type OverworldMcpLegendKey = OverworldCompactLegendKey | OverworldCompactResultLegendKey;
export type OverworldMcpLegendPatch = Partial<Record<OverworldMcpLegendKey, string>>;

const OVERWORLD_MCP_COMPACT_LEGEND = {
  ...OVERWORLD_COMPACT_LEGEND,
  ...OVERWORLD_COMPACT_RESULT_LEGEND,
} as const satisfies Record<OverworldMcpLegendKey, string>;

export type OverworldMcpJourneyField = {
  journey: OverworldMcpJourney;
};

export const OVERWORLD_SNAPSHOT_HASH_MISMATCH_REASON =
  "Snapshot hash mismatch; refresh the current overworld context.";
export const OVERWORLD_PUBLIC_SNAPSHOT_HASH_LENGTH = 24;

type OverworldMcpSnapshotGuardOptions = {
  expected_snapshot_hash?: string;
};

export type OverworldMcpResponseOptions = OverworldMcpSnapshotGuardOptions & {
  compact_context?: boolean;
  compact_result?: boolean;
  include_ids?: boolean;
  include_route_options?: boolean;
  include_world_name?: boolean;
};

export type OverworldMcpCompactContext = Omit<
  OverworldCompactView,
  | "world"
  | "ids"
  | "ids_truncated"
  | "route_options"
  | "route_options_truncated"
  | "route_paths_truncated"
> &
  Partial<
    Pick<
      OverworldCompactView,
      | "world"
      | "ids"
      | "ids_truncated"
      | "route_options"
      | "route_options_truncated"
      | "route_paths_truncated"
    >
  >;

export type OverworldMcpViewField<Args extends OverworldMcpResponseOptions> = Args extends {
  compact_context: true;
}
  ? {
      context: OverworldMcpCompactContext;
      /** Definitions first used by this compact response; merge by key into legend. */
      legend_delta?: OverworldMcpLegendPatch;
    }
  : {
      observation: OverworldView;
      /** Definitions first used by a compact result beside this full observation. */
      legend_delta?: OverworldMcpLegendPatch;
    };

export type OverworldMcpStartResponse<Args extends OverworldMcpResponseOptions> = {
  session_id: string;
  snapshot_hash: string;
  /** One-time orientation for this genuinely fresh game. */
  tutorial: FreshGameTutorial;
  /** Definitions for every compact field present in this initial response. */
  legend?: OverworldCompactLegendPatch;
} & OverworldMcpJourneyField &
  OverworldMcpViewField<Args>;

export type OverworldMcpRestoreResponse<Args extends OverworldMcpResponseOptions> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  /** Definitions for every compact field present in this restored response. */
  legend?: OverworldCompactLegendPatch;
} & OverworldMcpJourneyField &
  OverworldMcpViewField<Args>;

type OverworldMcpSessionPayload<Key extends string, Value> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  journeyDecision?: JourneyDecisionClassification;
} & OverworldMcpJourneyField & { [P in Key]: Value };

type OverworldMcpGuardedRejection<Args extends OverworldMcpResponseOptions> = Args extends {
  expected_snapshot_hash: string;
}
  ? OverworldMcpRejectedSessionPayload
  : never;

type OverworldMcpResultValue<
  Args extends OverworldMcpResponseOptions,
  Value,
  CompactValue,
> = Args extends { compact_result: true } ? CompactValue : Value;

export type OverworldMcpSessionResponse<
  Key extends string,
  Value,
  Args extends OverworldMcpResponseOptions,
  CompactValue = Value,
> =
  | (OverworldMcpSessionPayload<Key, OverworldMcpResultValue<Args, Value, CompactValue>> &
      OverworldMcpViewField<Args>)
  | OverworldMcpGuardedRejection<Args>;

export type OverworldMcpSessionEntry = {
  session_id: string;
  session: OverworldSession;
};

export type OverworldMcpReadUnchanged = {
  snapshot_hash: string;
  unchanged: true;
} & OverworldMcpJourneyField;

export type OverworldMcpReadArgs = {
  session_id: string;
  if_snapshot_hash?: string;
  include_observation?: boolean;
  include_ids?: boolean;
  include_route_options?: boolean;
  include_world_name?: boolean;
  include_session_id?: boolean;
};

export type OverworldMcpFullReadPayload = {
  session_id: string;
  snapshot_hash: string;
  observation: OverworldView;
} & OverworldMcpJourneyField;

type OverworldMcpReadSessionIdField<Args extends Pick<OverworldMcpReadArgs, "include_session_id">> =
  Args extends {
    include_session_id: true;
  }
    ? { session_id: string }
    : Record<string, never>;

export type OverworldMcpContextPayload<
  Args extends Pick<OverworldMcpReadArgs, "include_session_id"> = Record<string, never>,
> = {
  ok: true;
  snapshot_hash: string;
  context: OverworldMcpCompactContext;
  /** Definitions first used by this compact response; merge by key into legend. */
  legend_delta?: OverworldMcpLegendPatch;
} & OverworldMcpJourneyField &
  OverworldMcpReadSessionIdField<Args>;

type OverworldMcpReadPayload<Args extends OverworldMcpReadArgs> = Args extends {
  include_observation: true;
}
  ? OverworldMcpFullReadPayload
  : OverworldMcpContextPayload<Args>;

export type OverworldMcpReadResponse<Args extends OverworldMcpReadArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldMcpReadPayload<Args> | OverworldMcpReadUnchanged
  : OverworldMcpReadPayload<Args>;

export type OverworldMcpContextResponse<Args extends OverworldMcpReadArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldMcpContextPayload<Args> | OverworldMcpReadUnchanged
  : OverworldMcpContextPayload<Args>;

export type OverworldMcpRejectedSessionPayload = {
  ok: false;
  snapshot_hash: string;
  rejection_reason: string;
  journeyDecision: JourneyDecisionClassification;
} & OverworldMcpJourneyField;

export type OverworldMcpGuardedSession =
  | OverworldMcpSessionEntry
  | OverworldMcpRejectedSessionPayload;

export type OverworldMcpExportArgs = {
  session_id: string;
  expected_snapshot_hash?: string;
  if_snapshot_hash?: string;
};

export type OverworldMcpExportSuccess = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  snapshot: OverworldSessionSnapshot;
} & OverworldMcpJourneyField;

export const OVERWORLD_MCP_SESSION_STORE_LIMIT = 64;

function journeyDecisionFrom(value: unknown): JourneyDecisionClassification | undefined {
  if (value === null || typeof value !== "object" || !("journeyDecision" in value)) {
    return undefined;
  }
  return (value as { journeyDecision: JourneyDecisionClassification }).journeyDecision;
}

function assertOverworldSessionStoreLimit(maxSessions: number): number {
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new Error("Overworld MCP session store limit must be a positive integer.");
  }
  return maxSessions;
}

function refreshOverworldSessionEntry<Key, Entry>(
  sessions: Map<Key, Entry>,
  key: Key,
): Entry | undefined {
  const session = sessions.get(key);
  if (session === undefined) return undefined;
  sessions.delete(key);
  sessions.set(key, session);
  return session;
}

function rememberOverworldSessionEntry<Key, Entry>(
  sessions: Map<Key, Entry>,
  key: Key,
  entry: Entry,
  maxEntries: number,
): void {
  sessions.delete(key);
  sessions.set(key, entry);
  while (sessions.size > maxEntries) {
    const oldest = sessions.keys().next();
    if (oldest.done) break;
    sessions.delete(oldest.value);
  }
}

function projectOverworldCompactContext(
  context: OverworldCompactView,
  args: Pick<
    OverworldMcpResponseOptions,
    "include_ids" | "include_route_options" | "include_world_name"
  >,
): OverworldMcpCompactContext {
  if (
    args.include_ids === true &&
    args.include_route_options === true &&
    args.include_world_name === true
  ) {
    return context;
  }
  const {
    world: _world,
    ids: _ids,
    ids_truncated: _idsTruncated,
    route_options: _routeOptions,
    route_options_truncated: _routeOptionsTruncated,
    route_paths_truncated: _routePathsTruncated,
    ...loopContext
  } = context;
  return {
    ...loopContext,
    ...(args.include_world_name === true ? { world: context.world } : {}),
    ...(args.include_ids === true ? { ids: context.ids } : {}),
    ...(args.include_ids === true && context.ids_truncated
      ? { ids_truncated: context.ids_truncated }
      : {}),
    ...(args.include_route_options === true ? { route_options: context.route_options } : {}),
    ...(args.include_route_options === true && context.route_options_truncated
      ? { route_options_truncated: context.route_options_truncated }
      : {}),
    ...(args.include_route_options === true && context.route_paths_truncated
      ? { route_paths_truncated: context.route_paths_truncated }
      : {}),
  };
}

function overworldCompactReadPayload<Args extends OverworldMcpReadArgs>(
  args: Args,
  snapshotHash: string,
  context: OverworldMcpCompactContext,
  journey: OverworldMcpJourney,
  legendDelta?: OverworldMcpLegendPatch,
): OverworldMcpContextPayload<Args> {
  return {
    ok: true,
    ...(args.include_session_id === true ? { session_id: args.session_id } : {}),
    snapshot_hash: publicOverworldSnapshotHash(snapshotHash),
    journey,
    ...(legendDelta ? { legend_delta: legendDelta } : {}),
    context,
  } as OverworldMcpContextPayload<Args>;
}

type OverworldMcpExportRejected<Args extends OverworldMcpExportArgs> = Args extends {
  expected_snapshot_hash: string;
}
  ? OverworldMcpRejectedSessionPayload
  : never;

type OverworldMcpExportUnchanged<Args extends OverworldMcpExportArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldMcpReadUnchanged
  : never;

export type OverworldMcpExportResponse<Args extends OverworldMcpExportArgs> =
  | OverworldMcpExportSuccess
  | OverworldMcpExportRejected<Args>
  | OverworldMcpExportUnchanged<Args>;

export function publicOverworldSnapshotHash(snapshotHash: string): string {
  return snapshotHash.slice(0, OVERWORLD_PUBLIC_SNAPSHOT_HASH_LENGTH);
}

export function overworldSnapshotHashMatches(expectedSnapshotHash: string, snapshotHash: string) {
  return (
    expectedSnapshotHash === snapshotHash ||
    expectedSnapshotHash === publicOverworldSnapshotHash(snapshotHash)
  );
}

export function overworldReadUnchanged(
  snapshotHash: string,
  journey: OverworldMcpJourney,
  compactContext = false,
): OverworldMcpReadUnchanged {
  return {
    snapshot_hash: publicOverworldSnapshotHash(snapshotHash),
    unchanged: true,
    journey: compactContext ? compactJourneyPresentation(journey) : journey,
  };
}

export function overworldSnapshotHashRejection(
  snapshotHash: string,
  journey: OverworldMcpJourney,
  compactContext = false,
): OverworldMcpRejectedSessionPayload {
  return {
    ok: false,
    snapshot_hash: publicOverworldSnapshotHash(snapshotHash),
    rejection_reason: OVERWORLD_SNAPSHOT_HASH_MISMATCH_REASON,
    journeyDecision: excludedJourneyDecision("rejected"),
    journey: compactContext ? compactJourneyPresentation(journey) : journey,
  };
}

export function isOverworldMcpRejectedSessionPayload(
  value: OverworldMcpGuardedSession,
): value is OverworldMcpRejectedSessionPayload {
  return "ok" in value && value.ok === false;
}

export class OverworldMcpSessionStore {
  private readonly sessions = new Map<string, OverworldSession>();
  /**
   * Transport-only disclosure state. It is deliberately absent from deterministic
   * game snapshots and hashes, and WeakMap lifetime follows session eviction.
   */
  private readonly disclosedLegendKeys = new WeakMap<
    OverworldSession,
    Set<OverworldMcpLegendKey>
  >();

  constructor(
    private readonly loadManifest: () => OverworldManifest,
    private readonly maxSessions = OVERWORLD_MCP_SESSION_STORE_LIMIT,
  ) {
    assertOverworldSessionStoreLimit(maxSessions);
  }

  create(): OverworldMcpSessionEntry {
    const session = new OverworldSession(this.loadManifest());
    // Each live fleet member owns a separate MCP process, so a process-local
    // counter would give every independently authenticated run the same `o1`
    // handle. Keep the handle outside deterministic game state while making it
    // globally unique enough to prove that cohort rows came from distinct game
    // sessions.
    const session_id = `o-${randomUUID()}`;
    rememberOverworldSessionEntry(this.sessions, session_id, session, this.maxSessions);
    return { session_id, session };
  }

  restore(snapshot: unknown): OverworldMcpSessionEntry {
    const session = OverworldSession.restore(this.loadManifest(), snapshot);
    const session_id = `o-${randomUUID()}`;
    rememberOverworldSessionEntry(this.sessions, session_id, session, this.maxSessions);
    return { session_id, session };
  }

  get(sessionId: string): OverworldSession {
    const session = refreshOverworldSessionEntry(this.sessions, sessionId);
    if (!session) throw new Error(`Unknown overworld session "${sessionId}".`);
    return session;
  }

  private fullSnapshotHash(session: OverworldSession): string {
    return session.snapshotHash();
  }

  snapshotHash(session: OverworldSession): string {
    return publicOverworldSnapshotHash(this.fullSnapshotHash(session));
  }

  private takeLegendPatch(
    session: OverworldSession,
    context: OverworldMcpCompactContext | undefined,
    additionalKeys: readonly OverworldMcpLegendKey[] = [],
  ): OverworldMcpLegendPatch | undefined {
    const requiredKeys = [...Object.keys(context ?? {}), ...additionalKeys];
    for (const key of requiredKeys) {
      if (!(key in OVERWORLD_MCP_COMPACT_LEGEND)) {
        throw new Error(`Compact overworld field "${key}" has no legend definition.`);
      }
    }
    let disclosed = this.disclosedLegendKeys.get(session);
    if (!disclosed) {
      disclosed = new Set<OverworldMcpLegendKey>();
      this.disclosedLegendKeys.set(session, disclosed);
    }
    const required = new Set<string>(requiredKeys);
    const entries = (Object.keys(OVERWORLD_MCP_COMPACT_LEGEND) as OverworldMcpLegendKey[])
      .filter((key) => required.has(key) && !disclosed.has(key))
      .map((key) => [key, OVERWORLD_MCP_COMPACT_LEGEND[key]] as const);
    if (entries.length === 0) return undefined;
    for (const [key] of entries) disclosed.add(key);
    return Object.fromEntries(entries) as OverworldMcpLegendPatch;
  }

  private compactContextField(
    args: Pick<
      OverworldMcpResponseOptions,
      "include_ids" | "include_route_options" | "include_world_name"
    >,
    session: OverworldSession,
    field: "legend" | "legend_delta",
    additionalKeys: readonly OverworldMcpLegendKey[] = [],
  ): {
    context: OverworldMcpCompactContext;
    legend?: OverworldMcpLegendPatch;
    legend_delta?: OverworldMcpLegendPatch;
  } {
    const context = projectOverworldCompactContext(session.compactView(), args);
    const patch = this.takeLegendPatch(session, context, additionalKeys);
    return patch ? { [field]: patch, context } : { context };
  }

  guardedSession<
    Args extends OverworldMcpSnapshotGuardOptions &
      Pick<OverworldMcpResponseOptions, "compact_context">,
  >(args: Args, sessionId: string): OverworldMcpGuardedSession {
    const session = this.get(sessionId);
    const snapshotHash = this.fullSnapshotHash(session);
    if (
      args.expected_snapshot_hash !== undefined &&
      !overworldSnapshotHashMatches(args.expected_snapshot_hash, snapshotHash)
    ) {
      return overworldSnapshotHashRejection(
        snapshotHash,
        session.journey(),
        args.compact_context === true,
      );
    }
    return { session_id: sessionId, session };
  }

  viewField<Args extends OverworldMcpResponseOptions>(
    args: Args,
    session: OverworldSession,
    additionalLegendKeys: readonly OverworldMcpLegendKey[] = [],
  ): OverworldMcpViewField<Args> {
    if (args.compact_context === true) {
      return this.compactContextField(
        args,
        session,
        "legend_delta",
        additionalLegendKeys,
      ) as OverworldMcpViewField<Args>;
    }
    const patch =
      args.compact_result === true && additionalLegendKeys.length > 0
        ? this.takeLegendPatch(session, undefined, additionalLegendKeys)
        : undefined;
    return {
      ...(patch ? { legend_delta: patch } : {}),
      observation: session.view(),
    } as OverworldMcpViewField<Args>;
  }

  resultViewFields<Args extends OverworldMcpResponseOptions>(
    args: Args,
    session: OverworldSession,
    additionalLegendKeys: readonly OverworldMcpLegendKey[] = [],
  ): {
    beforeResult: { legend_delta?: OverworldMcpLegendPatch };
    afterResult:
      | { context: OverworldMcpCompactContext }
      | {
          observation: OverworldView;
        };
  } {
    const view = this.viewField(args, session, additionalLegendKeys);
    return {
      beforeResult:
        "legend_delta" in view && view.legend_delta ? { legend_delta: view.legend_delta } : {},
      afterResult:
        "context" in view ? { context: view.context } : { observation: view.observation },
    };
  }

  startResponse<Args extends OverworldMcpResponseOptions>(
    args: Args,
  ): OverworldMcpStartResponse<Args> {
    const created = this.create();
    return {
      session_id: created.session_id,
      snapshot_hash: this.snapshotHash(created.session),
      tutorial: freshGameTutorial(),
      journey:
        args.compact_context === true
          ? compactJourneyPresentation(created.session.journey())
          : created.session.journey(),
      ...(args.compact_context === true
        ? this.compactContextField(args, created.session, "legend")
        : this.viewField(args, created.session)),
    } as unknown as OverworldMcpStartResponse<Args>;
  }

  restoreResponse<Args extends OverworldMcpResponseOptions>(
    args: Args,
    snapshot: unknown,
  ): OverworldMcpRestoreResponse<Args> {
    const restored = this.restore(snapshot);
    return {
      ok: true,
      session_id: restored.session_id,
      snapshot_hash: this.snapshotHash(restored.session),
      journey:
        args.compact_context === true
          ? compactJourneyPresentation(restored.session.journey())
          : restored.session.journey(),
      ...(args.compact_context === true
        ? this.compactContextField(args, restored.session, "legend")
        : this.viewField(args, restored.session)),
    } as unknown as OverworldMcpRestoreResponse<Args>;
  }

  read<Args extends OverworldMcpReadArgs>(args: Args): OverworldMcpReadResponse<Args> {
    const session = this.get(args.session_id);
    const snapshotHash = this.fullSnapshotHash(session);
    if (
      args.if_snapshot_hash !== undefined &&
      overworldSnapshotHashMatches(args.if_snapshot_hash, snapshotHash)
    ) {
      return overworldReadUnchanged(
        snapshotHash,
        session.journey(),
        args.include_observation !== true,
      ) as OverworldMcpReadResponse<Args>;
    }
    if (args.include_observation !== true) {
      const compact = this.compactContextField(args, session, "legend_delta");
      return overworldCompactReadPayload(
        args,
        snapshotHash,
        compact.context,
        compactJourneyPresentation(session.journey()),
        compact.legend_delta,
      ) as OverworldMcpReadResponse<Args>;
    }
    return {
      session_id: args.session_id,
      snapshot_hash: publicOverworldSnapshotHash(snapshotHash),
      journey: session.journey(),
      observation: session.view(),
    } as OverworldMcpReadResponse<Args>;
  }

  readContext<Args extends OverworldMcpReadArgs>(args: Args): OverworldMcpContextResponse<Args> {
    const session = this.get(args.session_id);
    const snapshotHash = this.fullSnapshotHash(session);
    if (
      args.if_snapshot_hash !== undefined &&
      overworldSnapshotHashMatches(args.if_snapshot_hash, snapshotHash)
    ) {
      return overworldReadUnchanged(
        snapshotHash,
        session.journey(),
        true,
      ) as OverworldMcpContextResponse<Args>;
    }
    const compact = this.compactContextField(args, session, "legend_delta");
    return overworldCompactReadPayload(
      args,
      snapshotHash,
      compact.context,
      compactJourneyPresentation(session.journey()),
      compact.legend_delta,
    ) as OverworldMcpContextResponse<Args>;
  }

  exportSnapshot<Args extends OverworldMcpExportArgs>(
    args: Args,
  ): OverworldMcpExportResponse<Args> {
    const guarded = this.guardedSession(args, args.session_id);
    if (isOverworldMcpRejectedSessionPayload(guarded)) {
      return guarded as OverworldMcpExportResponse<Args>;
    }
    const { session } = guarded;
    const snapshotHash = this.fullSnapshotHash(session);
    if (
      args.if_snapshot_hash !== undefined &&
      overworldSnapshotHashMatches(args.if_snapshot_hash, snapshotHash)
    ) {
      return overworldReadUnchanged(
        snapshotHash,
        session.journey(),
      ) as OverworldMcpExportResponse<Args>;
    }
    return {
      ok: true,
      session_id: args.session_id,
      snapshot_hash: publicOverworldSnapshotHash(snapshotHash),
      journey: session.journey(),
      snapshot: session.snapshot(),
    } as OverworldMcpExportResponse<Args>;
  }

  run<Key extends string, Value, Args extends OverworldMcpResponseOptions, CompactValue = Value>(
    args: Args,
    sessionId: string,
    key: Key,
    action: (session: OverworldSession) => Value,
    compactValue?: (value: Value) => CompactValue,
    compactResultLegendKeys:
      | readonly OverworldMcpLegendKey[]
      | ((value: CompactValue) => readonly OverworldMcpLegendKey[]) = [],
  ): OverworldMcpSessionResponse<Key, Value, Args, CompactValue> {
    const guarded = this.guardedSession(args, sessionId);
    if (isOverworldMcpRejectedSessionPayload(guarded)) {
      return guarded as OverworldMcpSessionResponse<Key, Value, Args, CompactValue>;
    }
    const { session } = guarded;
    const value = action(session);
    const journeyDecision = journeyDecisionFrom(value);
    const responseValue =
      args.compact_result === true && compactValue ? compactValue(value) : value;
    const resultLegendKeys =
      args.compact_result === true && compactValue
        ? typeof compactResultLegendKeys === "function"
          ? compactResultLegendKeys(responseValue as CompactValue)
          : compactResultLegendKeys
        : [];
    const view = this.resultViewFields(args, session, resultLegendKeys);
    return {
      ok: true,
      session_id: sessionId,
      snapshot_hash: this.snapshotHash(session),
      journey:
        args.compact_context === true
          ? compactJourneyPresentation(session.journey())
          : session.journey(),
      ...(journeyDecision ? { journeyDecision } : {}),
      ...view.beforeResult,
      [key]: responseValue,
      ...view.afterResult,
    } as unknown as OverworldMcpSessionResponse<Key, Value, Args, CompactValue>;
  }
}
