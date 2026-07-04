import type { ObservationOptions, RpgObservation } from "../rpg/observation.js";
import type { RpgActionOption } from "../rpg/legal_actions.js";
import { SessionStore, type Session } from "./sessions.js";
import type { McpActionOption, McpObservation } from "./types.js";
import {
  compactRpgObservation,
  RPG_COMPACT_OBSERVATION_VERSION,
  type RpgCompactObservation,
} from "./compact_rpg_observation.js";

export type RpgViewOptions = {
  compact_actions?: boolean;
  compact_observation?: boolean;
};

export type RpgViewField<Args extends RpgViewOptions> = Args extends {
  compact_observation: true;
}
  ? { context: RpgCompactObservation }
  : { observation: McpObservation };

export type RpgLegalActionsArgs = {
  compact_actions?: boolean;
};

export type RpgLegalActionRows<Args extends RpgLegalActionsArgs> = Args extends {
  compact_actions: true;
}
  ? string[]
  : McpActionOption[];

export type PublicObservationOptions = { compactActions?: boolean };

export type RpgObservationViewOptions = Pick<ObservationOptions, "hideGraph" | "includeWorldIntro">;

const OBSERVATION_PROJECTION_COMPACT = `compact-observation:v${RPG_COMPACT_OBSERVATION_VERSION}`;
const OBSERVATION_PROJECTION_PUBLIC = "public-observation:v1";
const LEGAL_ACTION_ROWS_PROJECTION = "legal-action-rows:v1";

export function publicObservationOptions(args: {
  compact_actions?: boolean;
}): PublicObservationOptions {
  return args.compact_actions ? { compactActions: true } : {};
}

export function publicActions(
  actions: readonly RpgActionOption[],
  opts: PublicObservationOptions = {},
): McpActionOption[] {
  return actions.map((option) => ({
    id: option.id,
    ...(opts.compactActions ? {} : { command: option.command }),
    ...(option.skill_check ? { skill_check: option.skill_check } : {}),
  }));
}

export function publicActionRows<Args extends RpgLegalActionsArgs>(
  actions: readonly RpgActionOption[],
  args: Args,
): RpgLegalActionRows<Args> {
  return (
    args.compact_actions === true
      ? actions.map((option) => option.id)
      : publicActions(actions, publicObservationOptions(args))
  ) as RpgLegalActionRows<Args>;
}

export function legalActionRowsFor<Args extends RpgLegalActionsArgs>(
  sessions: SessionStore,
  session: Session,
  actions: readonly RpgActionOption[],
  args: Args,
): RpgLegalActionRows<Args> {
  return sessions.legalActionProjection(
    session.id,
    `${LEGAL_ACTION_ROWS_PROJECTION}:compact:${args.compact_actions === true ? 1 : 0}`,
    () => publicActionRows(actions, args),
  );
}

export function publicObservation(
  obs: RpgObservation,
  opts: PublicObservationOptions = {},
): McpObservation {
  return {
    ...obs,
    available_actions: publicActions(obs.available_actions, opts),
  };
}

export function observationProjectionSuffix(
  opts: RpgObservationViewOptions,
  extra: string,
): string {
  return `hide:${opts.hideGraph === true ? 1 : 0}:intro:${opts.includeWorldIntro === true ? 1 : 0}:${extra}`;
}

export function rpgViewField<Args extends RpgViewOptions>(
  sessions: SessionStore,
  session: Session,
  obs: RpgObservation,
  args: Args,
  opts: RpgObservationViewOptions = {},
): RpgViewField<Args> {
  if (args.compact_observation === true) {
    return {
      context: sessions.observationProjection(
        session.id,
        `${OBSERVATION_PROJECTION_COMPACT}:${observationProjectionSuffix(opts, "ids")}`,
        () =>
          compactRpgObservation(
            obs,
            obs.available_actions.map((action) => action.id),
          ),
      ),
    } as RpgViewField<Args>;
  }
  return {
    observation: sessions.observationProjection(
      session.id,
      `${OBSERVATION_PROJECTION_PUBLIC}:${observationProjectionSuffix(
        opts,
        `compact-actions:${args.compact_actions === true ? 1 : 0}`,
      )}`,
      () => publicObservation(obs, publicObservationOptions(args)),
    ),
  } as RpgViewField<Args>;
}
