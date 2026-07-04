import type { OverworldCompactView } from "../world/compact_view.js";
import type { OverworldManifest } from "../world/overworld.js";
import { OverworldSession, type OverworldView } from "../world/session.js";

export const OVERWORLD_SNAPSHOT_HASH_MISMATCH_REASON =
  "Snapshot hash mismatch; refresh the current overworld context.";

export type OverworldMcpResponseOptions = {
  compact_context?: boolean;
  compact_result?: boolean;
  expected_snapshot_hash?: string;
};

export type OverworldMcpViewField<Args extends OverworldMcpResponseOptions> = Args extends {
  compact_context: true;
}
  ? { context: OverworldCompactView }
  : { observation: OverworldView };

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

export type OverworldMcpRejectedSessionPayload = {
  ok: false;
  snapshot_hash: string;
  rejection_reason: string;
};

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

export class OverworldMcpSessionStore {
  private counter = 0;
  private readonly sessions = new Map<string, OverworldSession>();

  constructor(private readonly loadManifest: () => OverworldManifest) {}

  create(): OverworldMcpSessionEntry {
    const session = new OverworldSession(this.loadManifest());
    const session_id = `oworld_${++this.counter}`;
    this.sessions.set(session_id, session);
    return { session_id, session };
  }

  restore(snapshot: unknown): OverworldMcpSessionEntry {
    const session = OverworldSession.restore(this.loadManifest(), snapshot);
    const session_id = `oworld_${++this.counter}`;
    this.sessions.set(session_id, session);
    return { session_id, session };
  }

  get(sessionId: string): OverworldSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown overworld session "${sessionId}".`);
    return session;
  }

  snapshotHash(session: OverworldSession): string {
    return session.snapshotHash();
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

  run<Key extends string, Value, Args extends OverworldMcpResponseOptions, CompactValue = Value>(
    args: Args,
    sessionId: string,
    key: Key,
    action: (session: OverworldSession) => Value,
    compactValue?: (value: Value) => CompactValue,
  ): OverworldMcpSessionResponse<Key, Value, Args, CompactValue> {
    const session = this.get(sessionId);
    const currentSnapshotHash = this.snapshotHash(session);
    if (
      args.expected_snapshot_hash !== undefined &&
      args.expected_snapshot_hash !== currentSnapshotHash
    ) {
      return overworldSnapshotHashRejection(currentSnapshotHash) as OverworldMcpSessionResponse<
        Key,
        Value,
        Args,
        CompactValue
      >;
    }
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
