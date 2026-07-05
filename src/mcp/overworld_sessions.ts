import type { OverworldCompactView } from "../world/compact_view.js";
import type { OverworldManifest } from "../world/overworld.js";
import { OverworldSession, type OverworldSessionSnapshot } from "../world/session.js";
import type { OverworldView } from "../world/session_view.js";

export const OVERWORLD_SNAPSHOT_HASH_MISMATCH_REASON =
  "Snapshot hash mismatch; refresh the current overworld context.";

type OverworldMcpSnapshotGuardOptions = {
  expected_snapshot_hash?: string;
};

export type OverworldMcpResponseOptions = OverworldMcpSnapshotGuardOptions & {
  compact_context?: boolean;
  compact_result?: boolean;
};

export type OverworldMcpViewField<Args extends OverworldMcpResponseOptions> = Args extends {
  compact_context: true;
}
  ? { context: OverworldCompactView }
  : { observation: OverworldView };

export type OverworldMcpStartResponse<Args extends OverworldMcpResponseOptions> = {
  session_id: string;
  snapshot_hash: string;
} & OverworldMcpViewField<Args>;

export type OverworldMcpRestoreResponse<Args extends OverworldMcpResponseOptions> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
} & OverworldMcpViewField<Args>;

type OverworldMcpSessionPayload<Key extends string, Value> = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
} & { [P in Key]: Value };

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
};

export type OverworldMcpReadArgs = {
  session_id: string;
  if_snapshot_hash?: string;
};

export type OverworldMcpFullReadPayload = {
  session_id: string;
  snapshot_hash: string;
  observation: OverworldView;
};

export type OverworldMcpContextPayload = {
  ok: true;
  session_id: string;
  snapshot_hash: string;
  context: OverworldCompactView;
};

export type OverworldMcpReadResponse<Args extends OverworldMcpReadArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldMcpFullReadPayload | OverworldMcpReadUnchanged
  : OverworldMcpFullReadPayload;

export type OverworldMcpContextResponse<Args extends OverworldMcpReadArgs> = Args extends {
  if_snapshot_hash: string;
}
  ? OverworldMcpContextPayload | OverworldMcpReadUnchanged
  : OverworldMcpContextPayload;

export type OverworldMcpRejectedSessionPayload = {
  ok: false;
  snapshot_hash: string;
  rejection_reason: string;
};

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
};

export const OVERWORLD_MCP_SESSION_STORE_LIMIT = 64;

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

export function overworldReadUnchanged(snapshotHash: string): OverworldMcpReadUnchanged {
  return {
    snapshot_hash: snapshotHash,
    unchanged: true,
  };
}

export function overworldSnapshotHashRejection(
  snapshotHash: string,
): OverworldMcpRejectedSessionPayload {
  return {
    ok: false,
    snapshot_hash: snapshotHash,
    rejection_reason: OVERWORLD_SNAPSHOT_HASH_MISMATCH_REASON,
  };
}

export function isOverworldMcpRejectedSessionPayload(
  value: OverworldMcpGuardedSession,
): value is OverworldMcpRejectedSessionPayload {
  return "ok" in value && value.ok === false;
}

export class OverworldMcpSessionStore {
  private counter = 0n;
  private readonly sessions = new Map<string, OverworldSession>();

  constructor(
    private readonly loadManifest: () => OverworldManifest,
    private readonly maxSessions = OVERWORLD_MCP_SESSION_STORE_LIMIT,
  ) {
    assertOverworldSessionStoreLimit(maxSessions);
  }

  create(): OverworldMcpSessionEntry {
    const session = new OverworldSession(this.loadManifest());
    const session_id = `oworld_${++this.counter}`;
    rememberOverworldSessionEntry(this.sessions, session_id, session, this.maxSessions);
    return { session_id, session };
  }

  restore(snapshot: unknown): OverworldMcpSessionEntry {
    const session = OverworldSession.restore(this.loadManifest(), snapshot);
    const session_id = `oworld_${++this.counter}`;
    rememberOverworldSessionEntry(this.sessions, session_id, session, this.maxSessions);
    return { session_id, session };
  }

  get(sessionId: string): OverworldSession {
    const session = refreshOverworldSessionEntry(this.sessions, sessionId);
    if (!session) throw new Error(`Unknown overworld session "${sessionId}".`);
    return session;
  }

  snapshotHash(session: OverworldSession): string {
    return session.snapshotHash();
  }

  guardedSession<Args extends OverworldMcpSnapshotGuardOptions>(
    args: Args,
    sessionId: string,
  ): OverworldMcpGuardedSession {
    const session = this.get(sessionId);
    const snapshotHash = this.snapshotHash(session);
    if (args.expected_snapshot_hash !== undefined && args.expected_snapshot_hash !== snapshotHash) {
      return overworldSnapshotHashRejection(snapshotHash);
    }
    return { session_id: sessionId, session };
  }

  viewField<Args extends OverworldMcpResponseOptions>(
    args: Args,
    session: OverworldSession,
  ): OverworldMcpViewField<Args> {
    if (args.compact_context === true) {
      return { context: session.compactView() } as OverworldMcpViewField<Args>;
    }
    return { observation: session.view() } as OverworldMcpViewField<Args>;
  }

  startResponse<Args extends OverworldMcpResponseOptions>(
    args: Args,
  ): OverworldMcpStartResponse<Args> {
    const created = this.create();
    return {
      session_id: created.session_id,
      snapshot_hash: this.snapshotHash(created.session),
      ...this.viewField(args, created.session),
    } as OverworldMcpStartResponse<Args>;
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
      ...this.viewField(args, restored.session),
    } as OverworldMcpRestoreResponse<Args>;
  }

  read<Args extends OverworldMcpReadArgs>(args: Args): OverworldMcpReadResponse<Args> {
    const session = this.get(args.session_id);
    const snapshotHash = this.snapshotHash(session);
    if (args.if_snapshot_hash !== undefined && args.if_snapshot_hash === snapshotHash) {
      return overworldReadUnchanged(snapshotHash) as OverworldMcpReadResponse<Args>;
    }
    return {
      session_id: args.session_id,
      snapshot_hash: snapshotHash,
      observation: session.view(),
    } as OverworldMcpReadResponse<Args>;
  }

  readContext<Args extends OverworldMcpReadArgs>(args: Args): OverworldMcpContextResponse<Args> {
    const session = this.get(args.session_id);
    const snapshotHash = this.snapshotHash(session);
    if (args.if_snapshot_hash !== undefined && args.if_snapshot_hash === snapshotHash) {
      return overworldReadUnchanged(snapshotHash) as OverworldMcpContextResponse<Args>;
    }
    return {
      ok: true,
      session_id: args.session_id,
      snapshot_hash: snapshotHash,
      context: session.compactView(),
    } as OverworldMcpContextResponse<Args>;
  }

  exportSnapshot<Args extends OverworldMcpExportArgs>(
    args: Args,
  ): OverworldMcpExportResponse<Args> {
    const guarded = this.guardedSession(args, args.session_id);
    if (isOverworldMcpRejectedSessionPayload(guarded)) {
      return guarded as OverworldMcpExportResponse<Args>;
    }
    const { session } = guarded;
    const snapshotHash = this.snapshotHash(session);
    if (args.if_snapshot_hash !== undefined && args.if_snapshot_hash === snapshotHash) {
      return overworldReadUnchanged(snapshotHash) as OverworldMcpExportResponse<Args>;
    }
    return {
      ok: true,
      session_id: args.session_id,
      snapshot_hash: snapshotHash,
      snapshot: session.snapshot(),
    } as OverworldMcpExportResponse<Args>;
  }

  run<Key extends string, Value, Args extends OverworldMcpResponseOptions, CompactValue = Value>(
    args: Args,
    sessionId: string,
    key: Key,
    action: (session: OverworldSession) => Value,
    compactValue?: (value: Value) => CompactValue,
  ): OverworldMcpSessionResponse<Key, Value, Args, CompactValue> {
    const guarded = this.guardedSession(args, sessionId);
    if (isOverworldMcpRejectedSessionPayload(guarded)) {
      return guarded as OverworldMcpSessionResponse<Key, Value, Args, CompactValue>;
    }
    const { session } = guarded;
    const value = action(session);
    const responseValue =
      args.compact_result === true && compactValue ? compactValue(value) : value;
    return {
      ok: true,
      session_id: sessionId,
      snapshot_hash: this.snapshotHash(session),
      [key]: responseValue,
      ...this.viewField(args, session),
    } as unknown as OverworldMcpSessionResponse<Key, Value, Args, CompactValue>;
  }
}
