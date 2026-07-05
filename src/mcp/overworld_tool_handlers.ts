import {
  compactOverworldQuestRef,
  compactRouteOption,
  compactTravelLogEntry,
  type OverworldCompactQuestRef,
  type OverworldCompactRouteOption,
  type OverworldCompactTravelLogEntry,
} from "../world/compact_view.js";
import type { OverworldManifest, OverworldNode } from "../world/overworld.js";
import {
  type OverworldActionResult,
  type OverworldAreaTravelResult,
  type OverworldQuestCompletionResult,
  type OverworldQuestView,
  type OverworldRoadEncounterResult,
  type OverworldRoadEncounterStrategy,
  type OverworldServiceResult,
  type OverworldSessionRoutePlan,
  type TravelLogEntry,
} from "../world/session.js";
import {
  compactOverworldActionResult,
  compactOverworldAreaTravelResult,
  compactOverworldQuestCompletionResult,
  compactOverworldRoadEncounterResult,
  compactOverworldServiceResult,
  type OverworldCompactActionResult,
  type OverworldCompactAreaTravelResult,
  type OverworldCompactQuestCompletionResult,
  type OverworldCompactRoadEncounterResult,
  type OverworldCompactServiceResult,
} from "./compact_overworld_result.js";
import {
  isOverworldMcpRejectedSessionPayload,
  type OverworldMcpContextResponse,
  type OverworldMcpExportArgs,
  type OverworldMcpExportResponse,
  type OverworldMcpReadArgs,
  type OverworldMcpReadResponse,
  type OverworldMcpRejectedSessionPayload,
  type OverworldMcpResponseOptions,
  type OverworldMcpRestoreResponse,
  type OverworldMcpSessionResponse,
  type OverworldMcpSessionStore,
  type OverworldMcpStartResponse,
  type OverworldMcpViewField,
} from "./overworld_sessions.js";
import {
  overworldQuestCompletionFromRpgSession,
  startOverworldQuestThroughRpg,
} from "./overworld_quest_bridge.js";
import type {
  RpgStartWorldQuestToolArgs,
  RpgWorldQuestStartPayload,
} from "./rpg_session_lifecycle.js";
import type { RpgSessionPayload } from "./rpg_session_runtime.js";
import type { RpgViewOptions } from "./rpg_view_projection.js";
import type { SessionStore } from "./sessions.js";

type OverworldResponseOptions = OverworldMcpResponseOptions;

type OverworldListOptions = {
  include_design_notes?: boolean;
};

type OverworldViewField<Args extends OverworldResponseOptions> = OverworldMcpViewField<Args>;

type OverworldResultValue<
  Args extends OverworldResponseOptions,
  Value,
  CompactValue,
> = Args extends { compact_result: true } ? CompactValue : Value;

type OverworldRejectedSessionPayload = OverworldMcpRejectedSessionPayload;

type OverworldGuardedRejection<Args extends OverworldResponseOptions> = Args extends {
  expected_snapshot_hash: string;
}
  ? OverworldRejectedSessionPayload
  : never;

type OverworldStartResponse<Args extends OverworldResponseOptions> =
  OverworldMcpStartResponse<Args>;

type OverworldRestoreResponse<Args extends OverworldResponseOptions> =
  OverworldMcpRestoreResponse<Args>;

type OverworldExportResponse<Args extends OverworldMcpExportArgs> =
  OverworldMcpExportResponse<Args>;

type OverworldListSummary = {
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
};

type OverworldDesignNotes = {
  sources: OverworldManifest["sources"];
  design_rules: string[];
};

type OverworldListResponse<Args extends OverworldListOptions> = OverworldListSummary &
  (Args extends { include_design_notes: true } ? OverworldDesignNotes : Record<string, never>);

type OverworldQuestStartResponse<Args extends OverworldResponseOptions & RpgViewOptions> =
  | ({
      ok: true;
      session_id: string;
      snapshot_hash: string;
      quest: OverworldResultValue<Args, OverworldQuestView, OverworldCompactQuestRef>;
      rpg_session_id: string;
      rpg_session: RpgSessionPayload<Args>;
    } & OverworldViewField<Args>)
  | OverworldGuardedRejection<Args>;

type OverworldSessionResponse<
  Key extends string,
  Value,
  Args extends OverworldResponseOptions,
  CompactValue = Value,
> = OverworldMcpSessionResponse<Key, Value, Args, CompactValue>;

export type OverworldToolHandlerDeps = {
  sessions: SessionStore;
  overworldSessions: OverworldMcpSessionStore;
  loadOverworldManifest: () => OverworldManifest;
  startWorldQuest: <Args extends RpgStartWorldQuestToolArgs>(
    args: Args,
  ) => RpgWorldQuestStartPayload<Args>;
};

export function createOverworldToolHandlers(deps: OverworldToolHandlerDeps) {
  const { sessions, overworldSessions } = deps;

  return {
    list_overworld<Args extends OverworldListOptions = Record<string, never>>(
      args?: Args,
    ): OverworldListResponse<Args> {
      const world = deps.loadOverworldManifest();
      const start = world.nodes.find((node) => node.id === world.start);
      if (!start) throw new Error(`Overworld start node "${world.start}" is missing.`);
      const summary: OverworldListSummary = {
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
      };
      if (args?.include_design_notes === true) {
        return {
          ...summary,
          sources: world.sources,
          design_rules: world.design_rules,
        } as unknown as OverworldListResponse<Args>;
      }
      return summary as OverworldListResponse<Args>;
    },

    start_overworld<Args extends OverworldResponseOptions = Record<string, never>>(
      args?: Args,
    ): OverworldStartResponse<Args> {
      const responseOptions = (args ?? {}) as Args;
      return overworldSessions.startResponse(responseOptions);
    },

    get_overworld_session<Args extends OverworldMcpReadArgs>(
      args: Args,
    ): OverworldMcpReadResponse<Args> {
      return overworldSessions.read(args);
    },

    get_overworld_session_context<Args extends OverworldMcpReadArgs>(
      args: Args,
    ): OverworldMcpContextResponse<Args> {
      return overworldSessions.readContext(args);
    },

    export_overworld_session<Args extends OverworldMcpExportArgs>(
      args: Args,
    ): OverworldExportResponse<Args> {
      return overworldSessions.exportSnapshot(args);
    },

    restore_overworld_session<Args extends { snapshot: unknown } & OverworldResponseOptions>(
      args: Args,
    ): OverworldRestoreResponse<Args> {
      return overworldSessions.restoreResponse(args, args.snapshot);
    },

    plan_overworld_session_route<
      Args extends {
        session_id: string;
        destination_town_id: string;
      } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "route",
      OverworldSessionRoutePlan,
      Args,
      OverworldCompactRouteOption
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "route",
        (session) => session.planRoute(args.destination_town_id),
        compactRouteOption,
      );
    },

    travel_overworld_session<
      Args extends { session_id: string; road_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<"travel", TravelLogEntry, Args, OverworldCompactTravelLogEntry> {
      return overworldSessions.run(
        args,
        args.session_id,
        "travel",
        (session) => session.travel(args.road_id),
        compactTravelLogEntry,
      );
    },

    resolve_overworld_session_road_encounter<
      Args extends {
        session_id: string;
        strategy: OverworldRoadEncounterStrategy;
      } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldRoadEncounterResult,
      Args,
      OverworldCompactRoadEncounterResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.resolveRoadEncounter(args.strategy),
        compactOverworldRoadEncounterResult,
      );
    },

    resupply_overworld_session<Args extends { session_id: string } & OverworldResponseOptions>(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldServiceResult,
      Args,
      OverworldCompactServiceResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.resupplyAtTown(),
        compactOverworldServiceResult,
      );
    },

    rest_overworld_session<Args extends { session_id: string } & OverworldResponseOptions>(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldServiceResult,
      Args,
      OverworldCompactServiceResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.restAtTown(),
        compactOverworldServiceResult,
      );
    },

    scout_overworld_session_poi<
      Args extends { session_id: string; poi_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.scoutPoi(args.poi_id),
        compactOverworldActionResult,
      );
    },

    talk_overworld_session_contact<
      Args extends { session_id: string; character_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.talkToCharacter(args.character_id),
        compactOverworldActionResult,
      );
    },

    investigate_overworld_session_event<
      Args extends { session_id: string; event_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.investigateEvent(args.event_id),
        compactOverworldActionResult,
      );
    },

    resolve_overworld_session_event<
      Args extends { session_id: string; event_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.resolveEvent(args.event_id),
        compactOverworldActionResult,
      );
    },

    explore_overworld_session_site<
      Args extends { session_id: string; site_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.exploreSite(args.site_id),
        compactOverworldActionResult,
      );
    },

    explore_overworld_session_area<
      Args extends { session_id: string; area_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.exploreArea(args.area_id),
        compactOverworldActionResult,
      );
    },

    work_overworld_session_job<
      Args extends { session_id: string; job_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldActionResult,
      Args,
      OverworldCompactActionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.workLocalJob(args.job_id),
        compactOverworldActionResult,
      );
    },

    start_overworld_session_quest<
      Args extends {
        session_id: string;
        quest_id: string;
        seed?: number;
        hide_graph?: boolean;
        compact_actions?: boolean;
        compact_observation?: boolean;
      } & OverworldResponseOptions,
    >(args: Args): OverworldQuestStartResponse<Args> {
      const guarded = overworldSessions.guardedSession(args, args.session_id);
      if (isOverworldMcpRejectedSessionPayload(guarded)) {
        return guarded as OverworldQuestStartResponse<Args>;
      }
      const { session } = guarded;
      const started = startOverworldQuestThroughRpg({
        session,
        overworldSessionId: args.session_id,
        questId: args.quest_id,
        startOptions: args,
        sessions,
        startWorldQuest: deps.startWorldQuest,
      });
      const questResult =
        args.compact_result === true ? compactOverworldQuestRef(started.quest) : started.quest;
      return {
        ok: true,
        session_id: args.session_id,
        snapshot_hash: overworldSessions.snapshotHash(session),
        quest: questResult,
        rpg_session_id: started.rpgSession.session_id,
        rpg_session: started.rpgSession,
        ...overworldSessions.viewField(args, session),
      } as unknown as OverworldQuestStartResponse<Args>;
    },

    complete_overworld_session_quest<
      Args extends { session_id: string; rpg_session_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldQuestCompletionResult,
      Args,
      OverworldCompactQuestCompletionResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => {
          const completion = overworldQuestCompletionFromRpgSession(
            sessions.get(args.rpg_session_id),
            args.session_id,
          );
          return session.completeQuest(completion.questId, completion.outcome);
        },
        compactOverworldQuestCompletionResult,
      );
    },

    move_overworld_session_area<
      Args extends { session_id: string; area_route_id: string } & OverworldResponseOptions,
    >(
      args: Args,
    ): OverworldSessionResponse<
      "result",
      OverworldAreaTravelResult,
      Args,
      OverworldCompactAreaTravelResult
    > {
      return overworldSessions.run(
        args,
        args.session_id,
        "result",
        (session) => session.moveArea(args.area_route_id),
        compactOverworldAreaTravelResult,
      );
    },
  };
}
