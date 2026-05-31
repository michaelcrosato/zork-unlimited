/**
 * MCP tool handlers as PURE functions (spec §9.4).
 *
 * Each handler is a thin wrapper over engine/validator/runner code we already
 * built — the engine stays the source of truth. These are unit-tested directly,
 * without a live MCP client (a §9.4 rule); server.ts only adapts them to stdio.
 *
 * Stage 1 exposes the CYOA-playable subset: validate/load a pack, start a game,
 * observe, list legal actions, step, save/load, and replay a trace. Content and
 * traces are data only — no handler runs shell or code (§16).
 */
import { readFileSync } from "node:fs";
import { hashState } from "../core/hash.js";
import { makeStep } from "../core/engine.js";
import type { Action } from "../api/types.js";
import { loadPackFile, type CompiledPack } from "../cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../cyoa/runner.js";
import { buildObservation } from "../cyoa/observation.js";
import { validateCyoa } from "../validate/cyoa_validator.js";
import { makeReport, formatReport, type ValidationReport } from "../validate/report.js";
import { save, load } from "../persist/save_load.js";
import { replayTrace } from "../trace/replay.js";
import type { Trace } from "../trace/record.js";
import { safeResolve } from "./paths.js";
import { SessionStore } from "./sessions.js";

export type ToolApi = ReturnType<typeof createToolApi>;

type LoadResult =
  | { ok: true; compiled: CompiledPack; report: ValidationReport }
  | { ok: false; report: ValidationReport };

export function createToolApi(opts: { root: string }) {
  const root = opts.root;
  const sessions = new SessionStore();

  function loadAndReport(packPath: string): LoadResult {
    const abs = safeResolve(root, packPath);
    const result = loadPackFile(abs);
    if (!result.ok) {
      const findings = result.error.issues.map((i) => ({
        severity: "error" as const,
        code: "SCHEMA",
        message: `${i.message} (${i.path.join(".") || "<root>"})`,
        where: [i.path.join(".") || "<root>"],
      }));
      return { ok: false, report: makeReport(packPath, findings) };
    }
    const report = validateCyoa(result.compiled.pack);
    return { ok: true, compiled: result.compiled, report };
  }

  /** Compile + validate, refusing to play an invalid pack (§0, §10). */
  function requirePlayable(packPath: string): CompiledPack {
    const lr = loadAndReport(packPath);
    if (!lr.ok || !lr.report.ok) {
      throw new Error(`Pack is not playable:\n${formatReport(lr.report)}`);
    }
    return lr.compiled;
  }

  function startSession(compiled: CompiledPack, state = initStateForPack(indexPack(compiled.pack), 1)) {
    const index = indexPack(compiled.pack);
    const session = sessions.create({
      packId: compiled.pack.meta.id,
      contentHash: compiled.contentHash,
      index,
      rules: buildRules(index),
      state,
    });
    return session;
  }

  return {
    sessions,

    validate_pack(args: { pack_path: string }): { ok: boolean; report: ValidationReport } {
      const lr = loadAndReport(args.pack_path);
      return { ok: lr.report.ok, report: lr.report };
    },

    load_pack(args: { pack_path: string }): {
      ok: boolean;
      meta?: CompiledPack["pack"]["meta"];
      content_hash?: string;
      report: ValidationReport;
    } {
      const lr = loadAndReport(args.pack_path);
      if (!lr.ok) return { ok: false, report: lr.report };
      return { ok: lr.report.ok, meta: lr.compiled.pack.meta, content_hash: lr.compiled.contentHash, report: lr.report };
    },

    new_game(args: { pack_path: string; seed?: number }) {
      const compiled = requirePlayable(args.pack_path);
      const index = indexPack(compiled.pack);
      const state = initStateForPack(index, args.seed ?? 1);
      const session = startSession(compiled, state);
      return {
        session_id: session.id,
        observation: buildObservation(session.index, session.state),
        state_hash: hashState(session.state),
      };
    },

    get_observation(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { observation: buildObservation(s.index, s.state), state_hash: hashState(s.state) };
    },

    list_legal_actions(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { actions: buildObservation(s.index, s.state).available_actions };
    },

    step_action(args: { session_id: string; action_id: string }) {
      const s = sessions.get(args.session_id);
      // CYOA: an action_id is a choice id (§9.1). The legal-action set is ground truth.
      const action: Action = { type: "CHOOSE", choiceId: args.action_id };
      const result = makeStep(s.rules)(s.state, action);
      sessions.update(s.id, result.state);
      return {
        ok: result.ok,
        rejection_reason: result.rejectionReason ?? null,
        events: result.events,
        observation: buildObservation(s.index, result.state),
        state_hash: hashState(result.state),
      };
    },

    save_game(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { save: save(s.state, s.packId, s.contentHash), pack_id: s.packId, content_hash: s.contentHash };
    },

    load_game(args: { pack_path: string; save: string }) {
      const compiled = requirePlayable(args.pack_path);
      // Content-hash check is enforced by load() against the loaded pack (§8.7).
      const bundle = load(args.save, compiled.contentHash);
      const session = startSession(compiled, bundle.state);
      return {
        session_id: session.id,
        observation: buildObservation(session.index, session.state),
        state_hash: hashState(session.state),
      };
    },

    replay_trace(args: { trace_path: string; pack_path: string }) {
      const traceAbs = safeResolve(root, args.trace_path);
      const trace = JSON.parse(readFileSync(traceAbs, "utf8")) as Trace;
      const compiled = requirePlayable(args.pack_path);
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace was recorded against content ${trace.content_hash}, but the pack is ${compiled.contentHash}.`,
        };
      }
      const index = indexPack(compiled.pack);
      const rules = buildRules(index);
      // A trace stores only the final hash, so we surface ok/final/expected.
      // (Per-step divergence pinpointing needs per-step hashes — a Trace v2 field.)
      return replayTrace(trace, rules);
    },
  };
}
