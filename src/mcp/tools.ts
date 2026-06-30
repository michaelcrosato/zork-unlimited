/**
 * MCP tool handlers as PURE functions (spec §9.4).
 *
 * Each handler is a thin wrapper over engine/validator/runner code we already
 * built — the engine stays the source of truth. These are unit-tested directly,
 * without a live MCP client (a §9.4 rule); server.ts only adapts them to stdio.
 *
 * The public story catalog is RPG-only. Explicit legacy pack loading still routes
 * through the older shape dispatch while CYOA/parser content is being migrated,
 * but blind/AFK discovery now steers agents to RPG packs. Content and traces are
 * data only — no handler runs shell or code (§16).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { hashState } from "../core/hash.js";
import { makeStep, type Rules } from "../core/engine.js";
import type { Action } from "../api/types.js";
import type { GameState } from "../core/state.js";
import type { GameEvent } from "../core/events.js";

import { compilePack, loadPackFile } from "../cyoa/pack.js";
import { generateCyoaPack } from "../gen/cyoa_generator.js";
import type { CyoaPack } from "../cyoa/schema.js";
import { indexPack, buildRules, initStateForPack, type CyoaIndex } from "../cyoa/runner.js";
import type { ParserIndex } from "../parser/model.js";
import { buildObservation } from "../cyoa/observation.js";
import { validateCyoa } from "../validate/cyoa_validator.js";

import { compileParserPack, loadParserPackFile } from "../parser/pack.js";
import { generateParserPack } from "../gen/parser_generator.js";
import type { ParserPack } from "../parser/schema.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../parser/runner.js";
import { buildParserObservation } from "../parser/observation.js";
import { validateParser } from "../validate/parser_validator.js";

import { compileRpgPack } from "../rpg/pack.js";
import { generateRpgPack } from "../gen/rpg_generator.js";
import type { RpgPack } from "../rpg/schema.js";
import { indexRpgPack, buildRpgRules, initStateForRpgPack } from "../rpg/runner.js";
import { buildRpgObservation } from "../rpg/observation.js";
import { validateRpg } from "../validate/rpg_validator.js";

import {
  makeReport,
  formatReport,
  type Finding,
  type ValidationReport,
} from "../validate/report.js";
import { save, load, SaveIntegrityError, assertWellFormedState } from "../persist/save_load.js";
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
import type { WorldBinding, WorldManifest } from "../world/schema.js";
import {
  CANONICAL_HUB_CITY,
  CANONICAL_WORLD_ID,
  CANONICAL_WORLD_NAME,
  WorldManifestSchema,
} from "../world/schema.js";
import { worldQuestNodeForPack, worldRouteForPack, type WorldRouteStep } from "../world/graph.js";
import {
  assertOverworldIntegrity,
  overworldAreasAt,
  overworldCharactersAt,
  overworldEdgesFrom,
  overworldEventsAt,
  overworldExplorationSitesNear,
  overworldJobsAt,
  overworldPoisAt,
  overworldQuestsAt,
  overworldRoadEventFor,
  parseOverworldManifest,
  type OverworldArea,
  type OverworldAreaEdge,
  type OverworldEdge,
  type OverworldCharacter,
  type OverworldExplorationSite,
  type OverworldLocalJob,
  type OverworldLocalEvent,
  type OverworldManifest,
  type OverworldNode,
  type OverworldPoi,
  type OverworldQuest,
  type OverworldRoadEvent,
} from "../world/overworld.js";
import {
  OverworldSession,
  type OverworldActionResult,
  type OverworldAreaTravelResult,
  type OverworldRoadEncounterResult,
  type OverworldRoadEncounterStrategy,
  type OverworldSessionSnapshot,
  type OverworldSessionRoutePlan,
  type OverworldServiceResult,
  type OverworldView,
  type TravelLogEntry,
} from "../world/session.js";
import { MockAuthorProvider } from "../../agents/authoring/mock_author.js";
import { resolveProvider } from "../../agents/llm/providers.js";
import { loadEngineContract, runWriter } from "../../agents/authoring/writer.js";
import { runAdapter, runParserAdapter, runRpgAdapter } from "../../agents/authoring/adapter.js";
import { diagnose } from "../../agents/debugger.js";
import {
  applyContentPatch,
  ContentPatchProposalSchema,
  type ContentPatchProposal,
} from "../../agents/fixer.js";

export type ToolApi = ReturnType<typeof createToolApi>;

type LoadResult =
  | { ok: true; mode: PackMode; compiled: AnyCompiledPack; report: ValidationReport }
  | { ok: false; report: ValidationReport };

type StoryEntry = {
  path: string;
  id: string;
  title: string;
  mode: PackMode | null;
  playable: boolean;
  world: WorldBinding | null;
};

const MAIN_RPG_STORY = "content/rpg/pack/breaking_weir.yaml";

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
  opts: { hideGraph?: boolean; includeWorldIntro?: boolean } = {},
): AnyObservation {
  const obsOpts = { includeWorldIntro: true, ...opts };
  if (mode === "cyoa")
    return buildObservation(index as Parameters<typeof buildObservation>[0], state, obsOpts);
  if (mode === "parser")
    return buildParserObservation(
      index as Parameters<typeof buildParserObservation>[0],
      state,
      obsOpts,
    );
  return buildRpgObservation(index as Parameters<typeof buildRpgObservation>[0], state, obsOpts);
}

/**
 * Referential-integrity gate for a LOADED state (§16 "integrity at load") — the
 * pack-aware complement to save_load.ts's `GameStateSchema` (bug_0181). That
 * schema guards WHETHER a loaded state is well-formed and finite, but `load()`
 * holds only the content hash, not the pack, so it cannot tell whether the
 * state's symbols actually EXIST. A forged-but-finite save (valid structure,
 * correct hash) can set `current` to a phantom location — the engine would then
 * render the whole game from a room/scene that does not exist — or `endingId` to
 * a fabricated ending. This runs at `startSession`, the one chokepoint that has
 * BOTH the loaded state and the index, and REJECTS such a save (throws
 * `SaveIntegrityError`); it never coerces. It is the SoundnessBench
 * REJECTION-DIRECTION oracle (cf. bug_0181) carried from finiteness to reference.
 *
 * CYOA terminals are reached by goto+end_game (cyoa/runner.ts), so a legitimately
 * ENDED CYOA save carries `current`/`endingId` = a terminal id that is NOT a
 * scene; the valid sets fold in `terminalIds` so those real saves still load.
 * Parser/RPG keep the player in a room at end_game, so their `current` is always
 * a room id and their `endingId` a declared ending.
 *
 * `inventory` is the third rendered referential field (bug_0184): a phantom item
 * id surfaces verbatim in the observation and in the `INVENTORY` narration ("You
 * are carrying: <phantom>"), so an un-gated forged save shows the player a symbol
 * the pack never declares — the same "render a nonexistent symbol" hole bug_0183
 * closed for `current`. The valid item set is PROVABLY COMPLETE, so gating it can
 * never false-reject a legitimate save: an item can only enter inventory via a
 * parser/RPG `TAKE` (which only succeeds for a DECLARED object, legal_actions.ts)
 * or an `add_item` effect — so `declared objects ∪ every add_item target in the
 * pack` is exactly the set a real playthrough could ever hold. CYOA has no object
 * namespace, so its legitimate items are the add_item targets alone.
 */
function collectAddItemTargets(node: unknown, acc: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const el of node) collectAddItemTargets(el, acc);
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "add_item" && typeof v === "string") acc.add(v);
      collectAddItemTargets(v, acc);
    }
  }
  return acc;
}

function assertLoadedStateRefs(mode: PackMode, index: AnyIndex, state: GameState): void {
  let locations: Set<string>;
  let endings: Set<string>;
  const items = collectAddItemTargets(index.pack, new Set<string>());
  if (mode === "cyoa") {
    const ix = index as CyoaIndex;
    locations = new Set<string>([...ix.scenes.keys(), ...ix.terminalIds]);
    endings = ix.terminalIds;
  } else {
    const ix = index as ParserIndex;
    locations = new Set<string>(ix.rooms.keys());
    endings = new Set<string>(ix.pack.endings.map((e) => e.id));
    for (const id of ix.objects.keys()) items.add(id);
  }
  if (!locations.has(state.current)) {
    throw new SaveIntegrityError(
      `Save references unknown ${mode === "cyoa" ? "scene" : "room"} "${state.current}".`,
    );
  }
  if (state.endingId !== null && !endings.has(state.endingId)) {
    throw new SaveIntegrityError(`Save references unknown ending "${state.endingId}".`);
  }
  for (const id of state.inventory) {
    if (!items.has(id)) {
      throw new SaveIntegrityError(`Save references unknown item "${id}".`);
    }
  }
}

/** The current location id, normalized across modes (scene id ⟷ room id). */
function obsLocation(obs: AnyObservation): string {
  return obs.mode === "cyoa" ? obs.scene_id : obs.room;
}

/**
 * Strip internal-bookkeeping `state_change` events from the player-facing event
 * stream (bug_0260, a blind-playtest finding). Some engine effects write `__`-
 * prefixed vars/flags that exist only to drive mechanics, never to be read by the
 * player: the per-enemy HP tracker `__enemy_hp_<id>` (rpg/schema enemyHpVar, set
 * each combat round) and the dialogue-progress flag `__dlg_<npc>` (parser/model).
 * observation.ts ALREADY hides these from `state.flags`/`state.vars` (and
 * get_transcript's summary.flags filters them too), but the raw `events` array
 * returned by step_action — and recorded in the transcript get_transcript shows —
 * still surfaced them as `set_var`/`set_flag` state_change events, leaking
 * `__enemy_hp_barrow_wight` / `__dlg_reaver_shade` into a source-blind player's
 * view (sunken_barrow seed 13 §4, ai-runs/2026-06-04T23-46-24-371Z/playtest.md).
 * The legible combat/dialogue NARRATION events ("You strike … it has N HP left")
 * are not `__`-prefixed and are untouched, so the player loses no information.
 * This filters DISPLAY ONLY: the engine's effects, the stored GameState, and the
 * state_hash are unchanged (determinism/save integrity §8.5/§8.7 hold), and the
 * engine-level `result.events` stays complete for tests, traces, and debugging.
 */
function playerVisibleEvents(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => {
    if (e.type !== "state_change") return true;
    const sc = e as { flag?: unknown; name?: unknown };
    const key = typeof sc.flag === "string" ? sc.flag : typeof sc.name === "string" ? sc.name : "";
    return !key.startsWith("__");
  });
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
  let overworldCounter = 0;
  const overworldSessions = new Map<string, OverworldSession>();

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

  /**
   * The RPG twin of `requireGeneratedPlayable` (the MODE-WIDENING slice of the generator
   * program — bug_0159 built the RPG minting core, this exposes it through the same seam).
   * Mints a fresh RPG pack from a seed and refuses to play it unless it clears the SAME
   * `validateRpg` gate the curated RPG packs clear — so the COMBAT-winnability and
   * SCORE-economy proofs (the richest verifier surfaces in the suite) face a moving target,
   * not just the two frozen hand-authored packs. The generator already returns an
   * `RpgPackSchema.parse`d pack, so `{ pack, contentHash: hashState(pack) }` is byte-identical
   * to what `compileRpgPack` produces from the same pack's YAML — no file is written (the
   * server stays read-only/least-privilege, §16), and the minted pack never lands under
   * content/rpg/pack to pollute the hand-authored showcase set.
   */
  function requireGeneratedRpgPlayable(seed: number): {
    mode: PackMode;
    compiled: AnyCompiledPack;
  } {
    const pack = generateRpgPack(seed); // mints + schema self-check (throws on malformed emission)
    const report = validateRpg(pack);
    if (!report.ok) {
      throw new Error(
        `Generated RPG pack (seed ${seed}) is not playable:\n${formatReport(report)}`,
      );
    }
    return { mode: "rpg", compiled: { pack, contentHash: hashState(pack) } };
  }

  /**
   * The PARSER twin of `requireGeneratedPlayable`/`requireGeneratedRpgPlayable` — the third and
   * final mode of the generator program (the assessor already mints from `generateParserPack`,
   * src/afk/assessor.ts:843; this closes the MCP authoring asymmetry so all three generators are
   * reachable through the same agent-facing seam). Mints a fresh parser pack from a seed and
   * refuses to play it unless it clears the SAME `validateParser` gate the curated parser packs
   * clear — so the parser verifier surfaces (depth-2 obtainability / soft-lock, the moral
   * same-key fork) face a moving target, not just the frozen hand-authored parser packs. The
   * generator already returns a `ParserPackSchema.parse`d pack, so `{ pack, contentHash:
   * hashState(pack) }` is byte-identical to what `compileParserPack` produces from the same pack's
   * YAML — no file is written (the server stays read-only/least-privilege, §16), and the minted
   * pack never lands under content/parser/pack to pollute the hand-authored showcase set.
   */
  function requireGeneratedParserPlayable(seed: number): {
    mode: PackMode;
    compiled: AnyCompiledPack;
  } {
    const pack = generateParserPack(seed); // mints + schema self-check (throws on malformed emission)
    const report = validateParser(pack);
    if (!report.ok) {
      throw new Error(
        `Generated parser pack (seed ${seed}) is not playable:\n${formatReport(report)}`,
      );
    }
    return { mode: "parser", compiled: { pack, contentHash: hashState(pack) } };
  }

  function startSession(
    mode: PackMode,
    compiled: AnyCompiledPack,
    state?: GameState,
    opts: { hideGraph?: boolean } = {},
  ): Session {
    const index = indexFor(mode, compiled.pack);
    const st = state ?? initStateFor(mode, index, 1);
    // §16 integrity at load: a PROVIDED state is untrusted (it came off a save
    // file via load_game), so its `current`/`endingId` must name symbols that
    // exist in THIS pack before it is handed to the engine. A freshly-built init
    // state (state === undefined) is trusted and skipped. Rejects, never coerces.
    if (state !== undefined) assertLoadedStateRefs(mode, index, st);
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

  function discoverStoryEntries(): StoryEntry[] {
    return listYamlFiles(join(root, "content", "rpg", "pack")).map((path) => {
      const lr = loadAndReport(path);
      return {
        path,
        id: lr.ok ? lr.compiled.pack.meta.id : path,
        title: lr.ok ? lr.compiled.pack.meta.title : path,
        mode: lr.ok ? lr.mode : null,
        playable: lr.ok && lr.report.ok,
        world: lr.ok ? (lr.compiled.pack.meta.world ?? null) : null,
      };
    });
  }

  function loadWorldManifest(): WorldManifest {
    try {
      const raw = parseYaml(
        readFileSync(join(root, "content", "world", "charter_marches.yaml"), "utf8"),
      );
      return WorldManifestSchema.parse(raw);
    } catch {
      return {
        id: CANONICAL_WORLD_ID,
        name: CANONICAL_WORLD_NAME,
        hub: CANONICAL_HUB_CITY,
        graph: {
          hub: "charterhaven",
          nodes: [
            {
              id: "charterhaven",
              name: CANONICAL_HUB_CITY,
              kind: "hub",
            },
          ],
          edges: [],
        },
      };
    }
  }

  function loadOverworldManifest(): OverworldManifest {
    const raw = JSON.parse(
      readFileSync(join(root, "content", "world", "new_york_overworld.json"), "utf8"),
    );
    const world = parseOverworldManifest(raw);
    assertOverworldIntegrity(world);
    return world;
  }

  function createOverworldSession(): { session_id: string; session: OverworldSession } {
    const session = new OverworldSession(loadOverworldManifest());
    const sessionId = `oworld_${++overworldCounter}`;
    overworldSessions.set(sessionId, session);
    return { session_id: sessionId, session };
  }

  function restoreOverworldSession(snapshot: unknown): {
    session_id: string;
    session: OverworldSession;
  } {
    const session = OverworldSession.restore(loadOverworldManifest(), snapshot);
    const sessionId = `oworld_${++overworldCounter}`;
    overworldSessions.set(sessionId, session);
    return { session_id: sessionId, session };
  }

  function getOverworldSession(sessionId: string): OverworldSession {
    const session = overworldSessions.get(sessionId);
    if (!session) throw new Error(`Unknown overworld session "${sessionId}".`);
    return session;
  }

  return {
    sessions,

    validate_pack(args: { pack_path: string }): { ok: boolean; report: ValidationReport } {
      const lr = loadAndReport(args.pack_path);
      return { ok: lr.report.ok, report: lr.report };
    },

    list_stories(): {
      stories: StoryEntry[];
      main_story: string | null;
    } {
      const stories = discoverStoryEntries();
      // Keep blind/AFK agents on the richest currently shipped RPG pack by default.
      const main =
        stories.find((s) => s.path === MAIN_RPG_STORY && s.playable) ??
        stories.find((s) => s.playable) ??
        stories[0] ??
        null;
      return { stories, main_story: main?.path ?? null };
    },

    list_world(): {
      world: WorldManifest;
      hub: string;
      graph: WorldManifest["graph"];
      quest_count: number;
      quests: {
        path: string;
        id: string;
        title: string;
        mode: PackMode | null;
        playable: boolean;
        district: string;
        quest: string;
        role: string;
        connection: string;
        graph_node: string | null;
        path_from_hub: WorldRouteStep[];
      }[];
    } {
      const world = loadWorldManifest();
      const quests = discoverStoryEntries()
        .filter((s) => s.world?.id === world.id)
        .map((s) => {
          const node = worldQuestNodeForPack(world, s.path);
          return {
            path: s.path,
            id: s.id,
            title: s.title,
            mode: s.mode,
            playable: s.playable,
            district: s.world?.district ?? "",
            quest: s.world?.quest ?? "",
            role: s.world?.role ?? "",
            connection: s.world?.connection ?? "",
            graph_node: node?.id ?? null,
            path_from_hub: node ? (worldRouteForPack(world, s.path) ?? []) : [],
          };
        });
      return { world, hub: world.hub, graph: world.graph, quest_count: quests.length, quests };
    },

    world_path(args: { quest_path: string }): {
      world: Pick<WorldManifest, "id" | "name" | "hub">;
      quest_path: string;
      graph_node: string | null;
      path_from_hub: WorldRouteStep[];
    } {
      const world = loadWorldManifest();
      const node = worldQuestNodeForPack(world, args.quest_path);
      return {
        world: { id: world.id, name: world.name, hub: world.hub },
        quest_path: args.quest_path,
        graph_node: node?.id ?? null,
        path_from_hub: node ? (worldRouteForPack(world, args.quest_path) ?? []) : [],
      };
    },

    list_overworld(): {
      world: Pick<OverworldManifest, "id" | "name" | "start" | "premise">;
      town_count: number;
      road_count: number;
      region_count: number;
      regional_arc_count: number;
      area_count: number;
      area_route_count: number;
      character_count: number;
      local_event_count: number;
      local_job_count: number;
      road_event_count: number;
      exploration_site_count: number;
      quest_count: number;
      start: OverworldNode;
      sources: OverworldManifest["sources"];
      design_rules: string[];
    } {
      const world = loadOverworldManifest();
      const start = world.nodes.find((node) => node.id === world.start);
      if (!start) throw new Error(`Overworld start node "${world.start}" is missing.`);
      return {
        world: {
          id: world.id,
          name: world.name,
          start: world.start,
          premise: world.premise,
        },
        town_count: world.nodes.length,
        road_count: world.edges.length,
        region_count: world.regions.length,
        regional_arc_count: world.regional_arcs.length,
        area_count: world.areas.length,
        area_route_count: world.area_edges.length,
        character_count: world.characters.length,
        local_event_count: world.local_events.length,
        local_job_count: world.local_jobs.length,
        road_event_count: world.road_events.length,
        exploration_site_count: world.exploration_sites.length,
        quest_count: world.quests.length,
        start,
        sources: world.sources,
        design_rules: world.design_rules,
      };
    },

    start_overworld(): {
      session_id: string;
      observation: OverworldView;
    } {
      const created = createOverworldSession();
      return {
        session_id: created.session_id,
        observation: created.session.view(),
      };
    },

    get_overworld_session(args: { session_id: string }): {
      session_id: string;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      return {
        session_id: args.session_id,
        observation: session.view(),
      };
    },

    export_overworld_session(args: { session_id: string }): {
      ok: true;
      session_id: string;
      snapshot: OverworldSessionSnapshot;
    } {
      const session = getOverworldSession(args.session_id);
      return {
        ok: true,
        session_id: args.session_id,
        snapshot: session.snapshot(),
      };
    },

    restore_overworld_session(args: { snapshot: unknown }): {
      ok: true;
      session_id: string;
      observation: OverworldView;
    } {
      const restored = restoreOverworldSession(args.snapshot);
      return {
        ok: true,
        session_id: restored.session_id,
        observation: restored.session.view(),
      };
    },

    plan_overworld_session_route(args: { session_id: string; destination_town_id: string }): {
      ok: true;
      session_id: string;
      route: OverworldSessionRoutePlan;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      return {
        ok: true,
        session_id: args.session_id,
        route: session.planRoute(args.destination_town_id),
        observation: session.view(),
      };
    },

    travel_overworld_session(args: { session_id: string; road_id: string }): {
      ok: true;
      session_id: string;
      travel: TravelLogEntry;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const travel = session.travel(args.road_id);
      return {
        ok: true,
        session_id: args.session_id,
        travel,
        observation: session.view(),
      };
    },

    resolve_overworld_session_road_encounter(args: {
      session_id: string;
      strategy: OverworldRoadEncounterStrategy;
    }): {
      ok: true;
      session_id: string;
      result: OverworldRoadEncounterResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.resolveRoadEncounter(args.strategy);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    resupply_overworld_session(args: { session_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldServiceResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.resupplyAtTown();
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    rest_overworld_session(args: { session_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldServiceResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.restAtTown();
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    scout_overworld_session_poi(args: { session_id: string; poi_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.scoutPoi(args.poi_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    talk_overworld_session_contact(args: { session_id: string; character_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.talkToCharacter(args.character_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    investigate_overworld_session_event(args: { session_id: string; event_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.investigateEvent(args.event_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    resolve_overworld_session_event(args: { session_id: string; event_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.resolveEvent(args.event_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    explore_overworld_session_site(args: { session_id: string; site_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.exploreSite(args.site_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    explore_overworld_session_area(args: { session_id: string; area_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.exploreArea(args.area_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    work_overworld_session_job(args: { session_id: string; job_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldActionResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.workLocalJob(args.job_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    start_overworld_session_quest(args: { session_id: string; quest_id: string }): {
      ok: true;
      session_id: string;
      quest: OverworldQuest;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const quest = session.startQuest(args.quest_id);
      return {
        ok: true,
        session_id: args.session_id,
        quest,
        observation: session.view(),
      };
    },

    move_overworld_session_area(args: { session_id: string; area_route_id: string }): {
      ok: true;
      session_id: string;
      result: OverworldAreaTravelResult;
      observation: OverworldView;
    } {
      const session = getOverworldSession(args.session_id);
      const result = session.moveArea(args.area_route_id);
      return {
        ok: true,
        session_id: args.session_id,
        result,
        observation: session.view(),
      };
    },

    look_overworld(args: { town_id?: string }): {
      world: Pick<OverworldManifest, "id" | "name">;
      current: OverworldNode;
      exits: (OverworldEdge & { destination: OverworldNode })[];
      areas: OverworldArea[];
      local_area_routes: OverworldAreaEdge[];
      points_of_interest: OverworldPoi[];
      characters: OverworldCharacter[];
      local_events: OverworldLocalEvent[];
      local_jobs: OverworldLocalJob[];
      nearby_sites: OverworldExplorationSite[];
      local_quests: OverworldQuest[];
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      return {
        world: { id: world.id, name: world.name },
        current,
        exits: overworldEdgesFrom(world, townId),
        areas: overworldAreasAt(world, townId),
        local_area_routes: world.area_edges
          .filter((edge) => edge.home === townId)
          .sort((a, b) => a.travel_minutes - b.travel_minutes || a.route.localeCompare(b.route)),
        points_of_interest: overworldPoisAt(world, townId),
        characters: overworldCharactersAt(world, townId),
        local_events: overworldEventsAt(world, townId),
        local_jobs: overworldJobsAt(world, townId),
        nearby_sites: overworldExplorationSitesNear(world, townId),
        local_quests: overworldQuestsAt(world, townId),
      };
    },

    travel_overworld(args: { from_town: string; road_id: string }): {
      ok: true;
      from: OverworldNode;
      to: OverworldNode;
      road: OverworldEdge;
      road_event: OverworldRoadEvent | null;
      arrival: {
        world: Pick<OverworldManifest, "id" | "name">;
        current: OverworldNode;
        exits: (OverworldEdge & { destination: OverworldNode })[];
        areas: OverworldArea[];
        local_area_routes: OverworldAreaEdge[];
        points_of_interest: OverworldPoi[];
        characters: OverworldCharacter[];
        local_events: OverworldLocalEvent[];
        local_jobs: OverworldLocalJob[];
        nearby_sites: OverworldExplorationSite[];
        local_quests: OverworldQuest[];
      };
    } {
      const world = loadOverworldManifest();
      const current = world.nodes.find((node) => node.id === args.from_town);
      if (!current) throw new Error(`Unknown overworld town "${args.from_town}".`);
      const road = overworldEdgesFrom(world, args.from_town).find(
        (edge) => edge.id === args.road_id,
      );
      if (!road)
        throw new Error(`Road "${args.road_id}" is not reachable from "${args.from_town}".`);
      return {
        ok: true,
        from: current,
        to: road.destination,
        road,
        road_event: overworldRoadEventFor(world, road.id),
        arrival: this.look_overworld({ town_id: road.destination.id }),
      };
    },

    explore_overworld_area(args: { town_id?: string; area_id: string }): {
      ok: true;
      current: OverworldNode;
      area: OverworldArea;
      minutes: number;
      journal_entry: {
        kind: "area";
        title: string;
        text: string;
      };
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      const area = overworldAreasAt(world, townId).find(
        (candidate) => candidate.id === args.area_id,
      );
      if (!area) throw new Error(`Area "${args.area_id}" is not in "${townId}".`);
      return {
        ok: true,
        current,
        area,
        minutes: area.travel_minutes,
        journal_entry: {
          kind: "area",
          title: `Explored ${area.name}`,
          text: `${area.summary} ${area.discovery}`,
        },
      };
    },

    work_overworld_job(args: { town_id?: string; job_id: string }): {
      ok: true;
      current: OverworldNode;
      job: OverworldLocalJob;
      minutes: number;
      regional_renown: number;
      journal_entry: {
        kind: "job";
        title: string;
        text: string;
      };
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      const job = overworldJobsAt(world, townId).find((candidate) => candidate.id === args.job_id);
      if (!job) throw new Error(`Local job "${args.job_id}" is not in "${townId}".`);
      return {
        ok: true,
        current,
        job,
        minutes: job.minutes,
        regional_renown: job.difficulty,
        journal_entry: {
          kind: "job",
          title: `Completed ${job.title}`,
          text: `${job.objective} ${job.reward}`,
        },
      };
    },

    scout_overworld_poi(args: { town_id?: string; poi_id: string }): {
      ok: true;
      current: OverworldNode;
      point_of_interest: OverworldPoi;
      minutes: number;
      journal_entry: {
        kind: "poi";
        title: string;
        text: string;
      };
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      const poi = overworldPoisAt(world, townId).find((candidate) => candidate.id === args.poi_id);
      if (!poi) throw new Error(`Point of interest "${args.poi_id}" is not in "${townId}".`);
      return {
        ok: true,
        current,
        point_of_interest: poi,
        minutes: 20,
        journal_entry: {
          kind: "poi",
          title: `Scouted ${poi.title}`,
          text: `${poi.summary} You mark the site as a local lead for ${current.name}.`,
        },
      };
    },

    talk_overworld_contact(args: { town_id?: string; character_id: string }): {
      ok: true;
      current: OverworldNode;
      character: OverworldCharacter;
      minutes: number;
      journal_entry: {
        kind: "contact";
        title: string;
        text: string;
      };
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      const character = overworldCharactersAt(world, townId).find(
        (candidate) => candidate.id === args.character_id,
      );
      if (!character) throw new Error(`Contact "${args.character_id}" is not in "${townId}".`);
      return {
        ok: true,
        current,
        character,
        minutes: 15,
        journal_entry: {
          kind: "contact",
          title: `Talked to ${character.name}`,
          text: `${character.summary} ${character.agenda}`,
        },
      };
    },

    investigate_overworld_event(args: { town_id?: string; event_id: string }): {
      ok: true;
      current: OverworldNode;
      event: OverworldLocalEvent;
      minutes: number;
      journal_entry: {
        kind: "event";
        title: string;
        text: string;
      };
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      const event = overworldEventsAt(world, townId).find(
        (candidate) => candidate.id === args.event_id,
      );
      if (!event) throw new Error(`Event "${args.event_id}" is not active in "${townId}".`);
      return {
        ok: true,
        current,
        event,
        minutes: 20 + event.intensity * 5,
        journal_entry: {
          kind: "event",
          title: `Investigated ${event.title}`,
          text: `${event.summary} The pressure is ${event.pressure}, intensity ${event.intensity}.`,
        },
      };
    },

    validate_story(args: { story_path: string }): { ok: boolean; report: ValidationReport } {
      return this.validate_pack({ pack_path: args.story_path });
    },

    validate_quest(args: { quest_path: string }): { ok: boolean; report: ValidationReport } {
      return this.validate_pack({ pack_path: args.quest_path });
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

    explore_overworld_site(args: { town_id?: string; site_id: string }): {
      ok: true;
      current: OverworldNode;
      site: OverworldExplorationSite;
      minutes: number;
      regional_renown: number;
      journal_entry: {
        kind: "site";
        title: string;
        text: string;
      };
    } {
      const world = loadOverworldManifest();
      const townId = args.town_id ?? world.start;
      const current = world.nodes.find((node) => node.id === townId);
      if (!current) throw new Error(`Unknown overworld town "${townId}".`);
      const site = overworldExplorationSitesNear(world, townId).find(
        (candidate) => candidate.id === args.site_id,
      );
      if (!site) throw new Error(`Exploration site "${args.site_id}" is not near "${townId}".`);
      return {
        ok: true,
        current,
        site,
        minutes: 45 + site.danger * 15,
        regional_renown: site.danger,
        journal_entry: {
          kind: "site",
          title: `Explored ${site.title}`,
          text: `${site.summary} ${site.reward}`,
        },
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

    /**
     * Mint a fresh RPG pack from a seed and validate it against the SAME `validateRpg` gate
     * the curated RPG packs clear (the MODE-WIDENING slice of "evolve the eval distribution",
     * docs/CURRENT_PLAN.md / bug_0159 → this). The RPG twin of `generate_pack`: it exposes the
     * RPG generator (src/gen/rpg_generator.ts) through the MCP surface so a never-authored,
     * never-seen pack exercises the COMBAT-winnability and SCORE-economy proofs — the verifier
     * surfaces the CYOA generator never touches. Pure + deterministic (same seed ⇒ identical
     * pack) and read-only — nothing is written to disk. To PLAY the minted pack, pass the same
     * value to `new_game`'s `generate_rpg_seed`.
     */
    generate_rpg_pack(args: { seed: number }): {
      ok: boolean;
      mode: PackMode;
      pack_id: string;
      content_hash: string;
      seed: number;
      meta: RpgPack["meta"];
      room_count: number;
      enemy_count: number;
      ending_count: number;
      report: ValidationReport;
    } {
      const pack = generateRpgPack(args.seed);
      const report = validateRpg(pack);
      return {
        ok: report.ok,
        mode: "rpg",
        pack_id: pack.meta.id,
        content_hash: hashState(pack),
        seed: args.seed,
        meta: pack.meta,
        room_count: pack.rooms.length,
        enemy_count: pack.enemies.length,
        ending_count: pack.endings.length,
        report,
      };
    },

    /**
     * Mint a fresh PARSER pack from a seed and validate it against the SAME `validateParser` gate
     * the curated parser packs clear (the THIRD mode of "evolve the eval distribution", closing the
     * MCP authoring asymmetry — the assessor already mints parser packs from `generateParserPack`,
     * src/afk/assessor.ts:843, but no MCP tool exposed it). The parser twin of `generate_pack` /
     * `generate_rpg_pack`: it exposes the parser generator (src/gen/parser_generator.ts) through the
     * MCP surface so a never-authored, never-seen pack exercises the parser-only verifier surfaces
     * (depth-2 obtainability / soft-lock, the moral same-key fork) the CYOA and RPG generators never
     * touch. Pure + deterministic (same seed ⇒ identical pack) and read-only — nothing is written to
     * disk. To PLAY the minted pack, pass the same value to `new_game`'s `generate_parser_seed`.
     */
    generate_parser_pack(args: { seed: number }): {
      ok: boolean;
      mode: PackMode;
      pack_id: string;
      content_hash: string;
      seed: number;
      meta: ParserPack["meta"];
      room_count: number;
      object_count: number;
      ending_count: number;
      report: ValidationReport;
    } {
      const pack = generateParserPack(args.seed);
      const report = validateParser(pack);
      return {
        ok: report.ok,
        mode: "parser",
        pack_id: pack.meta.id,
        content_hash: hashState(pack),
        seed: args.seed,
        meta: pack.meta,
        room_count: pack.rooms.length,
        object_count: pack.objects.length,
        ending_count: pack.endings.length,
        report,
      };
    },

    new_game(args: {
      pack_path?: string;
      generate_seed?: number;
      generate_rpg_seed?: number;
      generate_parser_seed?: number;
      seed?: number;
      hide_graph?: boolean;
    }) {
      // Either load a pack from disk OR mint a fresh one in-memory from `generate_seed`
      // (a CYOA pack) / `generate_rpg_seed` (an RPG pack) / `generate_parser_seed` (a parser
      // pack) — the eval-distribution path, a never-authored pack held to the same playable
      // bar. The generate_* seed selects the minted pack's THEME/structure; `seed` still seeds
      // runtime state, so the two are independent.
      const { mode, compiled } =
        args.generate_seed !== undefined
          ? requireGeneratedPlayable(args.generate_seed)
          : args.generate_rpg_seed !== undefined
            ? requireGeneratedRpgPlayable(args.generate_rpg_seed)
            : args.generate_parser_seed !== undefined
              ? requireGeneratedParserPlayable(args.generate_parser_seed)
              : requirePlayable(
                  args.pack_path ??
                    ((): never => {
                      throw new Error(
                        "new_game requires pack_path, generate_seed, generate_rpg_seed, or generate_parser_seed.",
                      );
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

    start_quest(args: { quest_path: string; seed?: number; hide_graph?: boolean }) {
      return this.new_game({
        pack_path: args.quest_path,
        ...(args.seed !== undefined ? { seed: args.seed } : {}),
        ...(args.hide_graph ? { hide_graph: true } : {}),
      });
    },

    get_observation(args: { session_id: string; hide_graph?: boolean }) {
      const s = sessions.get(args.session_id);
      const obs = buildObsFor(s.mode, s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
      return { observation: obs, state_hash: hashState(s.state) };
    },

    get_scene(args: { session_id: string; hide_graph?: boolean }) {
      return this.get_observation(args);
    },

    list_legal_actions(args: { session_id: string; hide_graph?: boolean }) {
      const s = sessions.get(args.session_id);
      const obs = buildObsFor(s.mode, s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
      return { actions: obs.available_actions };
    },

    step_action(args: { session_id: string; action_id: string; hide_graph?: boolean }) {
      const s = sessions.get(args.session_id);
      const before = buildObsFor(s.mode, s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
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
      const after = buildObsFor(s.mode, s.index, s.state, {
        hideGraph: args.hide_graph ?? s.hideGraph ?? false,
      });
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
        events: playerVisibleEvents(result.events),
        observation: after,
        state_hash: hashState(result.state),
      };
    },

    choose_option(args: { session_id: string; option_id: string; hide_graph?: boolean }) {
      return this.step_action({
        session_id: args.session_id,
        action_id: args.option_id,
        ...(args.hide_graph !== undefined && { hide_graph: args.hide_graph }),
      });
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
        // Filter internal-bookkeeping events the same way step_action does, so the
        // transcript a player reads never surfaces `__`-prefixed vars/flags (bug_0260).
        turns: s.transcript.map((t) => ({ ...t, events: playerVisibleEvents(t.events) })),
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

    async adapt_story(args: { premise: string; mode?: PackMode }) {
      // Author a pack from a premise via the writer → adapter → validator loop
      // (§12.1–3). Uses a REAL frontier model when a provider key is present
      // (ANTHROPIC/OPENAI/GOOGLE, or AF_LLM_PROVIDER), falling back to the
      // deterministic MockAuthorProvider when none is set — so CI and key-less runs
      // stay green and offline while a keyed run exercises the genuine §1 author.
      // Mirrors bin/author.ts. Returns the story, the green/red pack, the validation
      // report, and the per-beat classification (§11). Never writes files.
      //
      // `mode` routes the SAME writer story through the matching adapter so all three
      // engine modes are authorable from MCP, closing the authoring-side twin of the
      // generate_* generation symmetry (bug_0192): cyoa (default) → runAdapter behind
      // validateCyoa; parser → runParserAdapter behind validateParser; rpg →
      // runRpgAdapter behind the richest validateRpg. The story is mode-agnostic — each
      // adapter re-adapts the same beats into its own pack type against its own validator.
      const mode: PackMode = args.mode ?? "cyoa";
      const provider = resolveProvider({ mock: new MockAuthorProvider() });
      const contract = loadEngineContract();
      const story = await runWriter(provider, { premise: args.premise, contract });
      const result =
        mode === "parser"
          ? await runParserAdapter(provider, { story, contract })
          : mode === "rpg"
            ? await runRpgAdapter(provider, { story, contract })
            : await runAdapter(provider, { story, contract });
      return {
        ok: result.ok,
        mode,
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
      // §16 integrity at load: trace.initial_state came off an UNTRUSTED file (the
      // content-hash check above guards WHICH pack, not WHETHER the state is well-
      // formed). Gate it the same way a loaded save is gated, BEFORE any engine call.
      assertWellFormedState(trace.initial_state);
      assertLoadedStateRefs(mode, indexFor(mode, compiled.pack), trace.initial_state);
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
      // §16 integrity at load: same untrusted-file gate as replay_trace — the state
      // is fed RAW into the per-step loop (let state = trace.initial_state) and into
      // diagnose() below, so it must be well-formed + referentially sound first.
      assertWellFormedState(trace.initial_state);
      assertLoadedStateRefs(mode, indexFor(mode, compiled.pack), trace.initial_state);
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
