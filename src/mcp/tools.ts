/**
 * MCP tool handlers as PURE functions (spec §9.4).
 *
 * Each handler is a thin wrapper over engine/validator/runner code we already
 * built — the engine stays the source of truth. These are unit-tested directly,
 * without a live MCP client (a §9.4 rule); server.ts only adapts them to stdio.
 *
 * The tools are MULTI-MODE (roadmap Milestone 1): one session abstraction plays
 * CYOA, parser, and RPG packs. Mode is detected from the pack structure
 * (`detectMode`, never a field in content, §16) and every play/validate/playtest
 * tool dispatches on it. CYOA behavior is kept byte-identical (its playtest path
 * is unchanged). Content and traces are data only — no handler runs shell or
 * code (§16).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import { makeStep, type Rules } from "../core/engine.js";
import type { Action } from "../api/types.js";
import type { GameState } from "../core/state.js";

import { compilePack, loadPackFile, type CompiledPack } from "../cyoa/pack.js";
import { generateCyoaPack } from "../gen/cyoa_generator.js";
import type { CyoaPack } from "../cyoa/schema.js";
import { indexPack, buildRules, initStateForPack } from "../cyoa/runner.js";
import { buildObservation } from "../cyoa/observation.js";
import { validateCyoa } from "../validate/cyoa_validator.js";

import { compileParserPack, loadParserPackFile } from "../parser/pack.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../parser/runner.js";
import { buildParserObservation } from "../parser/observation.js";
import { validateParser } from "../validate/parser_validator.js";

import { compileRpgPack } from "../rpg/pack.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../rpg/runner.js";
import { buildRpgObservation } from "../rpg/observation.js";
import { validateRpg } from "../validate/rpg_validator.js";

import {
  makeReport,
  formatReport,
  type Finding,
  type ValidationReport,
} from "../validate/report.js";
import { save, load } from "../persist/save_load.js";
import { replayTrace } from "../trace/replay.js";
import type { Trace } from "../trace/record.js";
import { safeResolve } from "./paths.js";
import { SessionStore, type Session } from "./sessions.js";
import {
  detectMode,
  type PackMode,
  type AnyCompiledPack,
  type AnyIndex,
  type AnyObservation,
} from "./types.js";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { resolveProvider } from "../../agents/llm/providers.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runAdapter } from "../../agents/authoring/adapter.js";
import { diagnose } from "../../agents/debugger.js";
import {
  applyContentPatch,
  ContentPatchProposalSchema,
  type ContentPatchProposal,
} from "../../agents/fixer.js";

export type ToolApi = ReturnType<typeof createToolApi>;
type PlaytestStrategy = "random" | "coverage";

type LoadResult =
  | { ok: true; mode: PackMode; compiled: AnyCompiledPack; report: ValidationReport }
  | { ok: false; report: ValidationReport };

const INVESTIGATIVE = /inspect|search|read|ask|show|examine|talk|look|use|attack|open|take/i;

// ── Mode-aware dispatch (the §3 Layer-2/3 boundary stays per-mode) ──────────────
// `mode` and `index` are always created together (startSession), so narrowing the
// AnyIndex union by `mode` in these switches is sound — a localized, documented
// cast rather than a structural guess.

function indexFor(mode: PackMode, pack: AnyCompiledPack["pack"]): AnyIndex {
  if (mode === "cyoa") return indexPack(pack as Parameters<typeof indexPack>[0]);
  if (mode === "parser") return indexParserPack(pack as Parameters<typeof indexParserPack>[0]);
  return indexRpgPack(pack as Parameters<typeof indexRpgPack>[0]);
}

function rulesFor(mode: PackMode, index: AnyIndex): Rules {
  if (mode === "cyoa") return buildRules(index as Parameters<typeof buildRules>[0]);
  if (mode === "parser") return buildParserRules(index as Parameters<typeof buildParserRules>[0]);
  return buildRpgRules(index as Parameters<typeof buildRpgRules>[0]);
}

function initStateFor(mode: PackMode, index: AnyIndex, seed: number): GameState {
  if (mode === "cyoa")
    return initStateForPack(index as Parameters<typeof initStateForPack>[0], seed);
  if (mode === "parser")
    return initStateForParserPack(index as Parameters<typeof initStateForParserPack>[0], seed);
  return initStateForRpgPack(index as Parameters<typeof initStateForRpgPack>[0], seed);
}

function buildObsFor(
  mode: PackMode,
  index: AnyIndex,
  state: GameState,
  opts: { hideGraph?: boolean } = {},
): AnyObservation {
  if (mode === "cyoa")
    return buildObservation(index as Parameters<typeof buildObservation>[0], state, opts);
  if (mode === "parser")
    return buildParserObservation(
      index as Parameters<typeof buildParserObservation>[0],
      state,
      opts,
    );
  return buildRpgObservation(index as Parameters<typeof buildRpgObservation>[0], state, opts);
}

/** The current location id, normalized across modes (scene id ⟷ room id). */
function obsLocation(obs: AnyObservation): string {
  return obs.mode === "cyoa" ? obs.scene_id : obs.room;
}

/** The human label for an action id in this observation (choice text ⟷ command). */
function obsActionText(obs: AnyObservation, id: string): string | null {
  if (obs.mode === "cyoa") return obs.available_actions.find((a) => a.id === id)?.text ?? null;
  return obs.available_actions.find((a) => a.id === id)?.command ?? null;
}

/**
 * Map an action id (from the observation's legal set) to a structured Action.
 * CYOA always yields a CHOOSE (an unknown id is rejected by the engine, preserving
 * the "illegal action, no state change" path); parser/RPG look up the action
 * object the legal-action generator already attached.
 */
function actionForId(obs: AnyObservation, id: string): Action | null {
  if (obs.mode === "cyoa") return { type: "CHOOSE", choiceId: id };
  return obs.available_actions.find((a) => a.id === id)?.action ?? null;
}

function schemaFindings(
  packPath: string,
  error: { issues: { message: string; path: (string | number)[] }[] },
): Finding[] {
  return error.issues.map((i) => ({
    severity: "error" as const,
    code: "SCHEMA",
    message: `${i.message} (${i.path.join(".") || "<root>"})`,
    where: [i.path.join(".") || "<root>"],
  }));
}

export function createToolApi(opts: { root: string }) {
  const root = opts.root;
  const sessions = new SessionStore();

  /** Read a pack, detect its mode, compile + validate with the right loader. */
  function loadAndReport(packPath: string): LoadResult {
    const abs = safeResolve(root, packPath);
    const source = readFileSync(abs, "utf8");
    const mode = detectMode(parseYaml(source) as unknown);
    const compileRes =
      mode === "cyoa"
        ? compilePack(source)
        : mode === "parser"
          ? compileParserPack(source)
          : compileRpgPack(source);
    if (!compileRes.ok)
      return {
        ok: false,
        report: makeReport(packPath, schemaFindings(packPath, compileRes.error)),
      };
    const pack = compileRes.compiled.pack;
    const report =
      mode === "cyoa"
        ? validateCyoa(pack as never)
        : mode === "parser"
          ? validateParser(pack as never)
          : validateRpg(pack as never);
    return { ok: true, mode, compiled: compileRes.compiled, report };
  }

  /** Compile + validate, refusing to play an invalid pack (§0, §10). */
  function requirePlayable(packPath: string): { mode: PackMode; compiled: AnyCompiledPack } {
    const lr = loadAndReport(packPath);
    if (!lr.ok || !lr.report.ok) {
      throw new Error(`Pack is not playable:\n${formatReport(lr.ok ? lr.report : lr.report)}`);
    }
    return { mode: lr.mode, compiled: lr.compiled };
  }

  /**
   * Mint a fresh CYOA pack from a seed and refuse to play it unless it clears the SAME
   * validator the curated packs clear (the generate_pack/new_game seam — the MCP slice of
   * "evolve the eval distribution", docs/CURRENT_PLAN.md). The pack is compiled IN-MEMORY:
   * the generator already returns a `CyoaPackSchema.parse`d pack, so `{ pack, contentHash:
   * hashState(pack) }` is byte-identical to what `compilePack` produces from the same pack's
   * YAML — no file is written (the server stays read-only/least-privilege, §16), and the
   * generated pack never lands under content/ to pollute the hand-authored showcase set.
   */
  function requireGeneratedPlayable(seed: number): {
    mode: PackMode;
    compiled: AnyCompiledPack;
  } {
    const pack = generateCyoaPack(seed); // mints + schema self-check (throws on malformed emission)
    const report = validateCyoa(pack);
    if (!report.ok) {
      throw new Error(`Generated pack (seed ${seed}) is not playable:\n${formatReport(report)}`);
    }
    return { mode: "cyoa", compiled: { pack, contentHash: hashState(pack) } };
  }

  function startSession(
    mode: PackMode,
    compiled: AnyCompiledPack,
    state?: GameState,
    opts: { hideGraph?: boolean } = {},
  ): Session {
    const index = indexFor(mode, compiled.pack);
    const st = state ?? initStateFor(mode, index, 1);
    const session = sessions.create({
      packId: compiled.pack.meta.id,
      contentHash: compiled.contentHash,
      mode,
      index,
      rules: rulesFor(mode, index),
      state: st,
      transcript: [],
      ...(opts.hideGraph ? { hideGraph: true } : {}),
    });
    const obs = buildObsFor(mode, index, st);
    session.transcript.push({
      step: st.step,
      scene_id: obsLocation(obs),
      title: obs.title,
      action_id: null,
      action_text: null,
      events: [],
      result_scene_id: obsLocation(obs),
      ended: obs.ended,
      ending_id: obs.ending_id,
    });
    return session;
  }

  const obsOf = (s: Session): AnyObservation =>
    buildObsFor(s.mode, s.index, s.state, { hideGraph: s.hideGraph ?? false });

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

  // ── Playtest: CYOA path is unchanged (byte-identical); parser/RPG added ───────

  /** Mean actions per ended run, rounded to 1 decimal (0 when no run ended). */
  function meanTurns(total: number, ended: number): number {
    return ended > 0 ? Math.round((total / ended) * 10) / 10 : 0;
  }

  function summarizePlaytest(args: {
    pack_path: string;
    runs?: number;
    strategy?: PlaytestStrategy;
    max_steps?: number;
    hide_graph?: boolean;
  }) {
    const { mode, compiled } = requirePlayable(args.pack_path);
    if (mode === "cyoa") return summarizeCyoa(compiled as CompiledPack, args);
    return summarizeParserLike(mode, compiled, args);
  }

  function summarizeCyoa(
    compiled: CompiledPack,
    args: { runs?: number; strategy?: PlaytestStrategy; max_steps?: number; hide_graph?: boolean },
  ) {
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
    const suspiciousPathSamples: {
      run: number;
      status: string;
      path: string[];
      ending_id: string | null;
    }[] = [];
    let ended = 0;
    let unfinished = 0;
    // Sum of actions taken on runs that REACHED an ending — the numerator of the
    // mean_turns_to_end efficiency axis (ULTRAPLAN §Week.4). Each action pushes one
    // entry onto `path` past the initial scene, so an ended run's action count is
    // `path.length - 1`. CYOA has no room graph, so its turns-to-end is graph-agnostic.
    let turnsToEndTotal = 0;

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
          strategy === "random"
            ? rng % obs.available_actions.length
            : coverageChoiceIndex(
                obs.available_actions,
                scene?.choices ?? [],
                globalVisited,
                localVisited,
              );
        const actionId = obs.available_actions[choiceIndex]?.id ?? obs.available_actions[0]!.id;
        const result = step(state, { type: "CHOOSE", choiceId: actionId });
        state = result.state;
        path.push(state.current);
        localVisited.add(state.current);
      }
      for (const scene of localVisited) globalVisited.add(scene);
      if (state.ended) {
        ended++;
        turnsToEndTotal += path.length - 1;
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
      mode: "cyoa" as const,
      strategy,
      runs,
      ended,
      unfinished,
      // Mean actions to reach an ending, over ENDED runs only (0 when none ended).
      // A 1-decimal efficiency axis: shorter paths to an ending mean a more direct
      // route (ULTRAPLAN §Week.4). Deterministic — same seeds, same mean.
      mean_turns_to_end: meanTurns(turnsToEndTotal, ended),
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
    const investigative = actions.findIndex((action) =>
      /inspect|search|read|ask|show|examine|talk/i.test(action.text),
    );
    return investigative >= 0 ? investigative : 0;
  }

  /**
   * Playtest a parser or RPG pack. Coverage uses the room graph: prefer a MOVE
   * whose destination room is unvisited (the observation exposes exits with
   * targets), else an investigative command, else the first action. Visited
   * tracking is over rooms (state.current), endings over the pack's endings list.
   */
  function summarizeParserLike(
    mode: PackMode,
    compiled: AnyCompiledPack,
    args: { runs?: number; strategy?: PlaytestStrategy; max_steps?: number; hide_graph?: boolean },
  ) {
    const index = indexFor(mode, compiled.pack);
    const rules = rulesFor(mode, index);
    const step = makeStep(rules);
    const runs = args.runs ?? 100;
    const maxSteps = args.max_steps ?? 80;
    const strategy = args.strategy ?? "coverage";
    const pack = compiled.pack as { rooms: { id: string }[]; endings: { id: string }[] };
    const allRooms = pack.rooms.map((r) => r.id);
    const roomSet = new Set(allRooms);
    const endingsDeclared = pack.endings.map((e) => e.id).sort();
    const globalVisited = new Set<string>();
    const endingDistribution: Record<string, number> = {};
    const suspiciousPathSamples: {
      run: number;
      status: string;
      path: string[];
      ending_id: string | null;
    }[] = [];
    let ended = 0;
    let unfinished = 0;
    // Sum of actions over ended runs — the mean_turns_to_end numerator (see the CYOA
    // twin). On parser/RPG this axis PAIRS WITH hide_graph: a graph-blind bot wanders
    // before it stumbles onto a win room, so hiding the graph tends to lengthen the
    // route to an ending — a second spatial-difficulty signal beside scene coverage.
    let turnsToEndTotal = 0;

    for (let run = 0; run < runs; run++) {
      let state = initStateFor(mode, index, run + 1);
      let rng = (run + 1) * 2654435761;
      const path = [state.current];
      const localVisited = new Set<string>([state.current]);
      let status = "max_steps";

      for (let turn = 0; turn < maxSteps; turn++) {
        if (state.ended) {
          status = "ended";
          break;
        }
        const obs = buildObsFor(mode, index, state, { hideGraph: args.hide_graph ?? false });
        const actions = obs.mode === "cyoa" ? [] : obs.available_actions; // narrowing; parser/rpg only here
        if (actions.length === 0) {
          status = "stuck";
          break;
        }
        rng = (rng * 1664525 + 1013904223) >>> 0;
        const exits = obs.mode === "cyoa" ? [] : obs.exits;
        const pick =
          strategy === "random"
            ? rng % actions.length
            : coverageActionIndex(actions, exits, globalVisited, localVisited);
        const chosen = actions[pick] ?? actions[0]!;
        const result = step(state, chosen.action);
        state = result.state;
        path.push(state.current);
        localVisited.add(state.current);
      }
      for (const room of localVisited) globalVisited.add(room);
      if (state.ended) {
        ended++;
        turnsToEndTotal += path.length - 1;
        const ending = state.endingId ?? "(unknown)";
        endingDistribution[ending] = (endingDistribution[ending] ?? 0) + 1;
      } else {
        unfinished++;
        if (suspiciousPathSamples.length < 5)
          suspiciousPathSamples.push({ run: run + 1, status, path, ending_id: state.endingId });
      }
    }

    const visited = [...globalVisited].filter((r) => roomSet.has(r)).sort();
    return {
      pack_id: compiled.pack.meta.id,
      mode,
      strategy,
      runs,
      ended,
      unfinished,
      // Mean actions to reach an ending over ended runs (0 when none ended); pairs
      // with hide_graph as a second spatial signal (see the loop comment above).
      mean_turns_to_end: meanTurns(turnsToEndTotal, ended),
      endings_declared: endingsDeclared,
      ending_distribution: endingDistribution,
      visited_scenes: visited,
      unvisited_scenes: allRooms.filter((r) => !visited.includes(r)).sort(),
      suspicious_path_samples: suspiciousPathSamples,
    };
  }

  function coverageActionIndex(
    actions: { id: string; command: string; action: Action }[],
    // `to` is present when the bot built the observation WITHOUT hideGraph (the
    // default + the graph cells); under the benchmark's hide_graph cell `to` is
    // undefined, so the prefer-unvisited branch falls through to blind navigation
    // (investigative, else first) — the deterministic floor for spatial reasoning.
    exits: { direction: string; to?: string }[],
    globalVisited: Set<string>,
    localVisited: Set<string>,
  ): number {
    const exitTo = new Map(exits.map((e) => [e.direction, e.to]));
    // Prefer a move into an unvisited room.
    const toUnseen = actions.findIndex((a) => {
      if (a.action.type !== "MOVE") return false;
      const to = exitTo.get(a.action.direction);
      return to !== undefined && !globalVisited.has(to) && !localVisited.has(to);
    });
    if (toUnseen >= 0) return toUnseen;
    const investigative = actions.findIndex((a) => INVESTIGATIVE.test(a.command));
    return investigative >= 0 ? investigative : 0;
  }

  return {
    sessions,

    validate_pack(args: { pack_path: string }): { ok: boolean; report: ValidationReport } {
      const lr = loadAndReport(args.pack_path);
      return { ok: lr.report.ok, report: lr.report };
    },

    list_stories(): {
      stories: {
        path: string;
        id: string;
        title: string;
        mode: PackMode | null;
        playable: boolean;
      }[];
      main_story: string | null;
    } {
      const dirs: [string, PackMode][] = [
        [join(root, "content", "cyoa", "pack"), "cyoa"],
        [join(root, "content", "parser", "pack"), "parser"],
        [join(root, "content", "rpg", "pack"), "rpg"],
      ];
      const stories = dirs
        .flatMap(([dir]) => listYamlFiles(dir))
        .map((path) => {
          const lr = loadAndReport(path);
          return {
            path,
            id: lr.ok ? lr.compiled.pack.meta.id : path,
            title: lr.ok ? lr.compiled.pack.meta.title : path,
            mode: lr.ok ? lr.mode : null,
            playable: lr.ok && lr.report.ok,
          };
        });
      // Keep watchtower the default main story for the existing AFK loop.
      const main =
        stories.find((s) => s.path.endsWith("watchtower_road.yaml")) ?? stories[0] ?? null;
      return { stories, main_story: main?.path ?? null };
    },

    validate_story(args: { story_path: string }): { ok: boolean; report: ValidationReport } {
      return this.validate_pack({ pack_path: args.story_path });
    },

    load_pack(args: { pack_path: string }): {
      ok: boolean;
      mode?: PackMode;
      meta?: AnyCompiledPack["pack"]["meta"];
      content_hash?: string;
      report: ValidationReport;
    } {
      const lr = loadAndReport(args.pack_path);
      if (!lr.ok) return { ok: false, report: lr.report };
      return {
        ok: lr.report.ok,
        mode: lr.mode,
        meta: lr.compiled.pack.meta,
        content_hash: lr.compiled.contentHash,
        report: lr.report,
      };
    },

    /**
     * Mint a fresh CYOA pack from a seed and validate it against the SAME `validateCyoa`
     * gate the curated packs clear (the first deferred slice of "evolve the eval
     * distribution", docs/CURRENT_PLAN.md / bug_0156 → bug_0157). This exposes the
     * generator (src/gen/cyoa_generator.ts) through the MCP surface: a never-authored,
     * never-seen pack whose structure the verifier must hold on. Pure + deterministic
     * (same seed ⇒ identical pack) and read-only — nothing is written to disk. To PLAY
     * the minted pack, pass the same value to `new_game`'s `generate_seed`.
     */
    generate_pack(args: { seed: number }): {
      ok: boolean;
      mode: PackMode;
      pack_id: string;
      content_hash: string;
      seed: number;
      meta: CyoaPack["meta"];
      scene_count: number;
      ending_count: number;
      report: ValidationReport;
    } {
      const pack = generateCyoaPack(args.seed);
      const report = validateCyoa(pack);
      return {
        ok: report.ok,
        mode: "cyoa",
        pack_id: pack.meta.id,
        content_hash: hashState(pack),
        seed: args.seed,
        meta: pack.meta,
        scene_count: pack.scenes.length,
        ending_count: pack.endings.length,
        report,
      };
    },

    new_game(args: {
      pack_path?: string;
      generate_seed?: number;
      seed?: number;
      hide_graph?: boolean;
    }) {
      // Either load a pack from disk OR mint a fresh one in-memory from `generate_seed`
      // (the eval-distribution path — a never-authored pack, held to the same playable
      // bar). `generate_seed` selects the generated pack's THEME/structure; `seed` still
      // seeds runtime state, so the two are independent.
      const { mode, compiled } =
        args.generate_seed !== undefined
          ? requireGeneratedPlayable(args.generate_seed)
          : requirePlayable(
              args.pack_path ??
                ((): never => {
                  throw new Error("new_game requires either pack_path or generate_seed.");
                })(),
            );
      const session = startSession(mode, compiled, undefined, {
        ...(args.hide_graph ? { hideGraph: true } : {}),
      });
      if (args.seed !== undefined && args.seed !== 1) {
        // Re-seed: rebuild the initial state at the requested seed.
        session.state = initStateFor(mode, session.index, args.seed);
      }
      return {
        session_id: session.id,
        mode,
        observation: obsOf(session),
        state_hash: hashState(session.state),
      };
    },

    start_game(args: { story_path: string; seed?: number; hide_graph?: boolean }) {
      return this.new_game({
        pack_path: args.story_path,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.hide_graph ? { hide_graph: true } : {}),
      });
    },

    get_observation(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { observation: obsOf(s), state_hash: hashState(s.state) };
    },

    get_scene(args: { session_id: string }) {
      return this.get_observation(args);
    },

    list_legal_actions(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      return { actions: obsOf(s).available_actions };
    },

    step_action(args: { session_id: string; action_id: string }) {
      const s = sessions.get(args.session_id);
      const before = obsOf(s);
      const beforeStep = s.state.step;
      const actionText = obsActionText(before, args.action_id);
      const action = actionForId(before, args.action_id);
      if (action === null) {
        // Parser/RPG: an id not in the legal set never reaches the engine.
        return {
          ok: false,
          rejection_reason: "That action is not available right now.",
          events: [
            { type: "rejected" as const, reason: "That action is not available right now." },
          ],
          observation: before,
          state_hash: hashState(s.state),
        };
      }
      const result = makeStep(s.rules)(s.state, action);
      sessions.update(s.id, result.state);
      const after = obsOf(s);
      s.transcript.push({
        step: beforeStep,
        scene_id: obsLocation(before),
        title: before.title,
        action_id: args.action_id,
        action_text: actionText,
        events: result.events,
        result_scene_id: obsLocation(after),
        ended: after.ended,
        ending_id: after.ending_id,
      });
      return {
        ok: result.ok,
        rejection_reason: result.rejectionReason ?? null,
        events: result.events,
        observation: after,
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
        mode: s.mode,
        turns: s.transcript,
        summary: {
          steps: s.transcript.filter((t) => t.action_id !== null).length,
          scenes: [...new Set(s.transcript.flatMap((t) => [t.scene_id, t.result_scene_id]))].sort(),
          ended: s.state.ended,
          ending_id: s.state.endingId,
          inventory: [...s.state.inventory],
          flags: Object.keys(s.state.flags)
            .filter((f) => s.state.flags[f] === true && !f.startsWith("__"))
            .sort(),
          journal: [...s.state.journal],
        },
      };
    },

    run_playtest(args: {
      story_path: string;
      runs?: number;
      strategy?: PlaytestStrategy;
      max_steps?: number;
      hide_graph?: boolean;
    }) {
      return summarizePlaytest({
        pack_path: args.story_path,
        ...(args.runs !== undefined ? { runs: args.runs } : {}),
        ...(args.strategy !== undefined ? { strategy: args.strategy } : {}),
        ...(args.max_steps !== undefined ? { max_steps: args.max_steps } : {}),
        ...(args.hide_graph !== undefined ? { hide_graph: args.hide_graph } : {}),
      });
    },

    save_game(args: { session_id: string }) {
      const s = sessions.get(args.session_id);
      // The save records the pack mode so load can refuse a mode mismatch (§8.7).
      return {
        save: save(s.state, s.packId, s.contentHash, s.mode),
        pack_id: s.packId,
        content_hash: s.contentHash,
        mode: s.mode,
      };
    },

    load_game(args: { pack_path: string; save: string }) {
      const { mode, compiled } = requirePlayable(args.pack_path);
      // Content-hash check is enforced by load() against the loaded pack (§8.7);
      // mode is verified too, so a save can't be loaded against a different mode.
      const bundle = load(args.save, compiled.contentHash, mode);
      const session = startSession(mode, compiled, bundle.state);
      return {
        session_id: session.id,
        mode,
        observation: obsOf(session),
        state_hash: hashState(session.state),
      };
    },

    async adapt_story(args: { premise: string }) {
      // Author a CYOA pack from a premise via the writer → adapter → validator
      // loop (§12.1–3). Uses a REAL frontier model when a provider key is present
      // (ANTHROPIC/OPENAI/GOOGLE, or AF_LLM_PROVIDER), falling back to the
      // deterministic MockAuthorProvider when none is set — so CI and key-less runs
      // stay green and offline while a keyed run exercises the genuine §1 author.
      // Mirrors bin/author.ts. Returns the story, the green/red pack, the validation
      // report, and the per-beat classification (§11). Never writes files.
      const provider = resolveProvider({ mock: new MockAuthorProvider() });
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
      const { mode, compiled } = requirePlayable(args.pack_path);
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace was recorded against content ${trace.content_hash}, but the pack is ${compiled.contentHash}.`,
        };
      }
      const rules = rulesFor(mode, indexFor(mode, compiled.pack));
      // Replay asserts the recorded final hash, and — for a Trace-v2 trace that
      // also carries `per_step_hashes` — localizes the FIRST divergent action via
      // `divergedAtStep` (returned straight through). A v1 trace (final hash only)
      // surfaces ok/final/expected as before.
      return replayTrace(trace, rules);
    },

    inspect_trace(args: { trace_path: string; pack_path: string }) {
      // Summarize a recorded trace and surface suspected bugs (§9.4). Replays the
      // actions through the engine for a per-step location/event summary, asserts
      // the recorded final hash, localizes the first divergent step when the trace
      // carries a Trace-v2 per-step baseline (§8.8), and runs the debugger's
      // classifier (§12.5).
      const traceAbs = safeResolve(root, args.trace_path);
      const trace = JSON.parse(readFileSync(traceAbs, "utf8")) as Trace;
      const { mode, compiled } = requirePlayable(args.pack_path);
      if (trace.content_hash !== compiled.contentHash) {
        return {
          ok: false,
          message: `Trace content ${trace.content_hash} ≠ pack ${compiled.contentHash}.`,
        };
      }
      const rules = rulesFor(mode, indexFor(mode, compiled.pack));
      const step = makeStep(rules);
      let state = trace.initial_state;
      const steps: {
        i: number;
        action: Action;
        ok: boolean;
        location: string;
        ended: boolean;
        ending_id: string | null;
      }[] = [];
      trace.actions.forEach((action, i) => {
        const r = step(state, action);
        state = r.state;
        steps.push({
          i,
          action,
          ok: r.ok,
          location: state.current,
          ended: state.ended,
          ending_id: state.endingId,
        });
      });
      const replay = replayTrace(trace, rules);
      const d = diagnose(rules, trace.initial_state, trace.actions);
      return {
        ok: true,
        mode,
        pack_id: trace.pack_id,
        content_hash: trace.content_hash,
        seed: trace.seed,
        steps: trace.actions.length,
        hash_ok: replay.ok,
        final_hash: replay.finalHash,
        expected_final_hash: replay.expectedFinalHash ?? null,
        // The first action whose post-state diverged from the trace's Trace-v2
        // per-step baseline (index into step_summary / actions), or null when the
        // trace is faithful or carries no per-step baseline (v1). This catches a
        // mid-trace divergence that a self-correcting final hash would miss.
        diverged_at_step: replay.divergedAtStep ?? null,
        diagnosis: d,
        step_summary: steps,
      };
    },

    apply_content_patch(args: { pack_path: string; proposal: ContentPatchProposal }) {
      // Apply a structured patch with deterministic code and return the modified
      // pack + validation report (§9.4, §12.5). The model never writes files: a
      // patch is data, validated before it can be played (§16). The fixer supports
      // cyoa | parser only — RPG packs are intentionally out of the auto-fix path
      // until the fixer is extended (roadmap), so a proposal.mode is never 'rpg'.
      const proposal = ContentPatchProposalSchema.parse(args.proposal);
      const abs = safeResolve(root, args.pack_path);
      const loaded = proposal.mode === "cyoa" ? loadPackFile(abs) : loadParserPackFile(abs);
      if (!loaded.ok) {
        return {
          ok: false,
          report: makeReport(args.pack_path, [
            {
              severity: "error" as const,
              code: "SCHEMA",
              message: "pack failed to compile",
              where: [args.pack_path],
            },
          ]),
        };
      }
      const result = applyContentPatch(loaded.compiled.pack, proposal);
      return result.ok
        ? { ok: true, applied: result.applied, report: result.report, pack: result.pack }
        : { ok: false, report: result.report };
    },
  };
}
