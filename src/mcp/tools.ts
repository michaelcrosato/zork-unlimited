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
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runAdapter } from "../../agents/authoring/adapter.js";
import { diagnose } from "../../agents/debugger.js";
import { applyContentPatch, ContentPatchProposalSchema, type ContentPatchProposal } from "../../agents/fixer.js";
import { loadParserPackFile } from "../parser/pack.js";

export type ToolApi = ReturnType<typeof createToolApi>;
type PlaytestStrategy = "random" | "coverage";

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
      transcript: [],
    });
    const obs = buildObservation(session.index, session.state);
    session.transcript.push({
      step: session.state.step,
      scene_id: obs.scene_id,
      title: obs.title,
      action_id: null,
      action_text: null,
      events: [],
      result_scene_id: obs.scene_id,
      ended: obs.ended,
      ending_id: obs.ending_id,
    });
    return session;
  }

  function listYamlFiles(dir: string): string[] {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(ya?ml)$/i.test(entry.name))
        .map((entry) => relative(root, join(dir, entry.name)).replaceAll("\\", "/"))
        .sort();
    } catch {
      return [];
    }
  }

  function summarizePlaytest(args: { pack_path: string; runs?: number; strategy?: PlaytestStrategy; max_steps?: number }) {
    const compiled = requirePlayable(args.pack_path);
    const index = indexPack(compiled.pack);
    const step = makeStep(buildRules(index));
    const runs = args.runs ?? 100;
    const maxSteps = args.max_steps ?? 80;
    const strategy = args.strategy ?? "coverage";
    const allScenes = compiled.pack.scenes.map((s) => s.id);
    const sceneSet = new Set(allScenes);
    const endingsDeclared = [
      ...compiled.pack.endings.map((e) => e.id),
      ...compiled.pack.scenes.filter((s) => s.is_ending).map((s) => s.id),
    ].sort();
    const globalVisited = new Set<string>();
    const endingDistribution: Record<string, number> = {};
    const suspiciousPathSamples: { run: number; status: string; path: string[]; ending_id: string | null }[] = [];
    let ended = 0;
    let unfinished = 0;

    for (let run = 0; run < runs; run++) {
      let state = initStateForPack(index, run + 1);
      let rng = (run + 1) * 2654435761;
      const path = [state.current];
      const localVisited = new Set<string>([state.current]);
      let status = "max_steps";

      for (let turn = 0; turn < maxSteps; turn++) {
        if (state.ended) {
          status = "ended";
          break;
        }
        const obs = buildObservation(index, state);
        if (obs.available_actions.length === 0) {
          status = "stuck";
          break;
        }
        rng = (rng * 1664525 + 1013904223) >>> 0;
        const scene = index.scenes.get(state.current);
        const choiceIndex =
          strategy === "random" ? rng % obs.available_actions.length : coverageChoiceIndex(obs.available_actions, scene?.choices ?? [], globalVisited, localVisited);
        const actionId = obs.available_actions[choiceIndex]?.id ?? obs.available_actions[0]!.id;
        const result = step(state, { type: "CHOOSE", choiceId: actionId });
        state = result.state;
        path.push(state.current);
        localVisited.add(state.current);
      }
      for (const scene of localVisited) globalVisited.add(scene);
      if (state.ended) {
        ended++;
        const ending = state.endingId ?? "(unknown)";
        endingDistribution[ending] = (endingDistribution[ending] ?? 0) + 1;
      } else {
        unfinished++;
        if (suspiciousPathSamples.length < 5) {
          suspiciousPathSamples.push({ run: run + 1, status, path, ending_id: state.endingId });
        }
      }
    }

    const visitedScenes = [...globalVisited].filter((s) => sceneSet.has(s)).sort();
    return {
      pack_id: compiled.pack.meta.id,
      strategy,
      runs,
      ended,
      unfinished,
      endings_declared: endingsDeclared,
      ending_distribution: endingDistribution,
      visited_scenes: visitedScenes,
      unvisited_scenes: allScenes.filter((s) => !visitedScenes.includes(s)).sort(),
      suspicious_path_samples: suspiciousPathSamples,
    };
  }

  function coverageChoiceIndex(
    actions: { id: string; text: string }[],
    choices: { id: string; next: string }[],
    globalVisited: Set<string>,
    localVisited: Set<string>,
  ): number {
    const byId = new Map(choices.map((choice) => [choice.id, choice]));
    const unseen = actions.findIndex((action) => {
      const next = byId.get(action.id)?.next;
      return next !== undefined && !globalVisited.has(next) && !localVisited.has(next);
    });
    if (unseen >= 0) return unseen;
    const investigative = actions.findIndex((action) => /inspect|search|read|ask|show|examine|talk/i.test(action.text));
    return investigative >= 0 ? investigative : 0;
  }

  return {
    sessions,

    validate_pack(args: { pack_path: string }): { ok: boolean; report: ValidationReport } {
      const lr = loadAndReport(args.pack_path);
      return { ok: lr.report.ok, report: lr.report };
    },

    list_stories(): { stories: { path: string; id: string; title: string; playable: boolean }[]; main_story: string | null } {
      const paths = listYamlFiles(join(root, "content", "cyoa", "pack"));
      const stories = paths.map((path) => {
        const lr = loadAndReport(path);
        return {
          path,
          id: lr.ok ? lr.compiled.pack.meta.id : path,
          title: lr.ok ? lr.compiled.pack.meta.title : path,
          playable: lr.ok && lr.report.ok,
        };
      });
      const main = stories.find((s) => s.path.endsWith("watchtower_road.yaml")) ?? stories[0] ?? null;
      return { stories, main_story: main?.path ?? null };
    },

    validate_story(args: { story_path: string }): { ok: boolean; report: ValidationReport } {
      return this.validate_pack({ pack_path: args.story_path });
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

    start_game(args: { story_path: string; seed?: number }) {
      return this.new_game({ pack_path: args.story_path, ...(args.seed !== undefined ? { seed: args.seed } : {}) });
    },

    get_observation(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { observation: buildObservation(s.index, s.state), state_hash: hashState(s.state) };
    },

    get_scene(args: { session_id: string }) {
      return this.get_observation(args);
    },

    list_legal_actions(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { actions: buildObservation(s.index, s.state).available_actions };
    },

    step_action(args: { session_id: string; action_id: string }) {
      const s = sessions.get(args.session_id);
      const before = buildObservation(s.index, s.state);
      const beforeStep = s.state.step;
      const choice = before.available_actions.find((a) => a.id === args.action_id);
      // CYOA: an action_id is a choice id (§9.1). The legal-action set is ground truth.
      const action: Action = { type: "CHOOSE", choiceId: args.action_id };
      const result = makeStep(s.rules)(s.state, action);
      sessions.update(s.id, result.state);
      const after = buildObservation(s.index, result.state);
      s.transcript.push({
        step: beforeStep,
        scene_id: before.scene_id,
        title: before.title,
        action_id: args.action_id,
        action_text: choice?.text ?? null,
        events: result.events,
        result_scene_id: after.scene_id,
        ended: after.ended,
        ending_id: after.ending_id,
      });
      return {
        ok: result.ok,
        rejection_reason: result.rejectionReason ?? null,
        events: result.events,
        observation: buildObservation(s.index, result.state),
        state_hash: hashState(result.state),
      };
    },

    choose_option(args: { session_id: string; option_id: string }) {
      return this.step_action({ session_id: args.session_id, action_id: args.option_id });
    },

    get_state(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { state: s.state, state_hash: hashState(s.state) };
    },

    get_transcript(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return {
        session_id: s.id,
        pack_id: s.packId,
        turns: s.transcript,
        summary: {
          steps: s.transcript.filter((t) => t.action_id !== null).length,
          scenes: [...new Set(s.transcript.flatMap((t) => [t.scene_id, t.result_scene_id]))].sort(),
          ended: s.state.ended,
          ending_id: s.state.endingId,
          inventory: [...s.state.inventory],
          flags: Object.keys(s.state.flags).filter((f) => s.state.flags[f] === true && !f.startsWith("__")).sort(),
          journal: [...s.state.journal],
        },
      };
    },

    run_playtest(args: { story_path: string; runs?: number; strategy?: PlaytestStrategy; max_steps?: number }) {
      return summarizePlaytest({
        pack_path: args.story_path,
        ...(args.runs !== undefined ? { runs: args.runs } : {}),
        ...(args.strategy !== undefined ? { strategy: args.strategy } : {}),
        ...(args.max_steps !== undefined ? { max_steps: args.max_steps } : {}),
      });
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

    async adapt_story(args: { premise: string }) {
      // Author a CYOA pack from a premise via the writer → adapter → validator
      // loop (§12.1–3). Deterministic MockAuthorProvider default — no keys, no
      // network. Returns the story, the green/red pack, the validation report, and
      // the per-beat classification (§11). Never writes files (the caller decides).
      const provider = new MockAuthorProvider();
      const contract = loadEngineContract();
      const story = await runWriter(provider, { premise: args.premise, contract });
      const result = await runAdapter(provider, { story, contract });
      return {
        ok: result.ok,
        rounds: result.rounds,
        story: { title: story.title, beats: story.beats.map((b) => b.id) },
        classifications: result.classifications,
        pack: result.ok ? result.pack : undefined,
        report: result.report,
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

    inspect_trace(args: { trace_path: string; pack_path: string }) {
      // Summarize a recorded trace and surface suspected bugs (§9.4). Replays the
      // actions through the engine for a per-step location/event summary, asserts
      // the recorded final hash, and runs the debugger's classifier (§12.5).
      const traceAbs = safeResolve(root, args.trace_path);
      const trace = JSON.parse(readFileSync(traceAbs, "utf8")) as Trace;
      const compiled = requirePlayable(args.pack_path);
      if (trace.content_hash !== compiled.contentHash) {
        return { ok: false, message: `Trace content ${trace.content_hash} ≠ pack ${compiled.contentHash}.` };
      }
      const index = indexPack(compiled.pack);
      const rules = buildRules(index);
      const step = makeStep(rules);
      let state = trace.initial_state;
      const steps: { i: number; action: Action; ok: boolean; location: string; ended: boolean; ending_id: string | null }[] = [];
      trace.actions.forEach((action, i) => {
        const r = step(state, action);
        state = r.state;
        steps.push({ i, action, ok: r.ok, location: state.current, ended: state.ended, ending_id: state.endingId });
      });
      const replay = replayTrace(trace, rules);
      // CYOA endings carry no death flag, so any reached ending is a win.
      const d = diagnose(rules, trace.initial_state, trace.actions);
      return {
        ok: true,
        pack_id: trace.pack_id,
        content_hash: trace.content_hash,
        seed: trace.seed,
        steps: trace.actions.length,
        hash_ok: replay.ok,
        final_hash: replay.finalHash,
        expected_final_hash: replay.expectedFinalHash ?? null,
        diagnosis: d,
        step_summary: steps,
      };
    },

    apply_content_patch(args: { pack_path: string; proposal: ContentPatchProposal }) {
      // Apply a structured patch with deterministic code and return the modified
      // pack + validation report (§9.4, §12.5). The model never writes files: a
      // patch is data, validated before it can be played (§16). The caller decides
      // whether to persist the returned pack.
      const proposal = ContentPatchProposalSchema.parse(args.proposal);
      const abs = safeResolve(root, args.pack_path);
      const loaded = proposal.mode === "cyoa" ? loadPackFile(abs) : loadParserPackFile(abs);
      if (!loaded.ok) {
        return { ok: false, report: makeReport(args.pack_path, [{ severity: "error" as const, code: "SCHEMA", message: "pack failed to compile", where: [args.pack_path] }]) };
      }
      const result = applyContentPatch(loaded.compiled.pack, proposal);
      return result.ok
        ? { ok: true, applied: result.applied, report: result.report, pack: result.pack }
        : { ok: false, report: result.report };
    },
  };
}
