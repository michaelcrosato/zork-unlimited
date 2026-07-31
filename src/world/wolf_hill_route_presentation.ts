/**
 * Player-facing, pre-commitment projection for the starting slice's hill roads.
 *
 * The route mechanics remain authored in Wolf-Winter. This small presentation
 * adapter keeps the decisive cross-choice result out of the longer launch
 * preview, where compact projections may truncate it, and reflects both
 * already-selected modifiers that change a clean lure: Cade's route-specific
 * fodder allocation and Aid-Only's final-cast suppression.
 */

import { WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES } from "../core/embedded_launch_overlay_receipt.js";
import type { QuestDispatchPresentationWindow } from "./quest_dispatch_window.js";

export const WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT = 360;

const WOLF_HILL_APPROACH_LAUNCH_ID = "albany:wolf_hill_approach";
const EXPOSED_RIDGE_OPTION_ID = "albany:wolf_approach_exposed_ridge";
const SHELTERED_STOCKWAY_OPTION_ID = "albany:wolf_approach_sheltered_stockway";
const CADE_FODDER_KNOWLEDGE_ID = "albany:knowledge_relief_cade_fodder";
const AID_ONLY_KNOWLEDGE_ID = "albany:knowledge_wolf_limited_aid_only";

const ROUTE_SUMMARIES = Object.freeze({
  exposedRidge:
    "Open crest reveals wind (lure DC 10) but visible descent starts alarm 1; a clean lure reaches alarm 4 and scatters two cattle.",
  exposedRidgeWithAidOnly:
    "Open crest reveals wind (lure DC 10) but visible descent starts alarm 1; aid-only suppresses the final clean-cast alarm: alarm 3, whole herd.",
  exposedRidgeWithFodder:
    "Open crest reveals wind (lure DC 10) but visible descent starts alarm 1; Cade fodder suppresses the first clean-cast alarm: alarm 3, whole herd.",
  exposedRidgeWithFodderAndAidOnly:
    "Open crest reveals wind (lure DC 10) but visible descent starts alarm 1; Cade fodder and aid-only suppress two clean-cast alarms: alarm 2, whole herd.",
  shelteredStockway:
    "Hedges keep cattle calm at alarm 0 but hide wind (lure DC 12); a clean lure reaches alarm 3 and keeps the whole herd.",
  shelteredStockwayWithAidOnly:
    "Hedges keep cattle calm at alarm 0 but hide wind (lure DC 12); aid-only suppresses the final clean-cast alarm: alarm 2, whole herd.",
  shelteredStockwayWithFodder:
    "Hedges keep cattle calm at alarm 0 but hide wind (lure DC 12); Cade fodder leaves this route at alarm 3, whole herd.",
  shelteredStockwayWithFodderAndAidOnly:
    "Hedges keep cattle calm at alarm 0 but hide wind (lure DC 12); Cade fodder leaves this route unchanged; aid-only makes clean lure alarm 2, whole herd.",
});

const EXPOSED_RIDGE_WITH_FODDER_PREVIEW =
  "Costs 30 minutes, 1 supply, and 25 fatigue. The visible ridge descent starts cattle alarm at 1 and clear crosswind gives first lure DC 10. Cade fodder suppresses the clean first-cast alarm; a clean lure reaches alarm 3 and keeps the whole herd.";
const EXPOSED_RIDGE_WITH_AID_ONLY_PREVIEW =
  "Costs 30 minutes, 1 supply, and 25 fatigue. The visible ridge descent starts cattle alarm at 1 and clear crosswind gives first lure DC 10. Aid-only suppresses the final ordinary clean-cast alarm; a clean lure reaches alarm 3 and keeps the whole herd.";
const EXPOSED_RIDGE_WITH_FODDER_AND_AID_ONLY_PREVIEW =
  "Costs 30 minutes, 1 supply, and 25 fatigue. The visible ridge descent starts cattle alarm at 1 and clear crosswind gives first lure DC 10. Cade fodder suppresses the first clean-cast alarm and aid-only suppresses the final one; a clean lure reaches alarm 2 and keeps the whole herd.";
const SHELTERED_STOCKWAY_WITH_FODDER_PREVIEW =
  "Costs 75 minutes, 2 supplies, and 10 fatigue. The sheltered stockway starts cattle alarm at 0 but leaves first lure DC 12. Cade fodder does not alter this route; a clean lure reaches alarm 3 and keeps the whole herd.";
const SHELTERED_STOCKWAY_WITH_AID_ONLY_PREVIEW =
  "Costs 75 minutes, 2 supplies, and 10 fatigue. The sheltered stockway starts cattle alarm at 0 but leaves first lure DC 12. Aid-only suppresses the final ordinary clean-cast alarm; a clean lure reaches alarm 2 and keeps the whole herd.";
const SHELTERED_STOCKWAY_WITH_FODDER_AND_AID_ONLY_PREVIEW =
  "Costs 75 minutes, 2 supplies, and 10 fatigue. The sheltered stockway starts cattle alarm at 0 but leaves first lure DC 12. Cade fodder does not alter this route, while aid-only suppresses the final ordinary clean-cast alarm; a clean lure reaches alarm 2 and keeps the whole herd.";

export type WolfHillRoutePresentation = Readonly<{
  tradeoffSummary: string;
  previewOverride?: string;
}>;

function boundedSummary(summary: string): string {
  if (summary.length > WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT) {
    throw new Error(
      `Wolf hill-route tradeoff summary exceeds ${String(WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT)} characters.`,
    );
  }
  return summary;
}

function dispatchBriefing(window: QuestDispatchPresentationWindow | undefined): string | null {
  if (!window) return null;
  if (window.status === "support_choices_open") {
    const { minimum, maximum } = window.finalMinutes;
    const finalRange =
      minimum === maximum ? `${String(minimum)}m` : `${String(minimum)}–${String(maximum)}m`;
    const pressure =
      minimum > WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES
        ? "Delay is already certain; starting now seals the current total."
        : maximum <= WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES
          ? "Every remaining support combination stays on time; starting now declines them."
          : "Starting now seals the current total; optional support can cross the delay threshold.";
    return (
      `Dispatch ${String(window.committedMinutes)}m committed; optional Station support remains ` +
      `(final ${finalRange}). ${pressure}`
    );
  }
  if (window.status === "delayed" && window.ledgerMinutes !== undefined) {
    return (
      `Dispatch ${String(window.ledgerMinutes)}m—delayed; roads change arrival, not delay. ` +
      "First failure: lure/drive/hunt alarm +1; fortify +1."
    );
  }
  if (window.status === "on_time" && window.ledgerMinutes !== undefined) {
    return (
      `Dispatch ${String(window.ledgerMinutes)}m—on time; roads change arrival, not dispatch. ` +
      "No opening-delay failure pressure."
    );
  }
  return (
    "Dispatch unverified—neutral; roads change arrival, not dispatch. " +
    "No opening-delay failure pressure."
  );
}

function firstCastFailureForecast(
  arrivalAlarm: number,
  window: QuestDispatchPresentationWindow | undefined,
): string {
  const delayed = window?.status === "delayed";
  const failedCastAlarm = arrivalAlarm + 2 + (delayed ? 1 : 0);
  return (
    `Fouled first cast: cattle alarm ${String(failedCastAlarm)}` +
    `${delayed ? " (includes delayed +1)" : ""}; ` +
    "feed spent, no retry; recovery remains."
  );
}

function withDispatchBriefing(
  summary: string,
  window: QuestDispatchPresentationWindow | undefined,
  arrivalAlarm: number,
): string {
  const briefing = dispatchBriefing(window);
  if (window?.status === "support_choices_open") {
    return `${briefing} ${summary}`;
  }
  const failureForecast = firstCastFailureForecast(arrivalAlarm, window);
  return briefing ? `${briefing} ${summary} ${failureForecast}` : `${summary} ${failureForecast}`;
}

export function wolfHillRoutePresentation(args: {
  launchId: string;
  optionId: string;
  knowledgeIds?: readonly string[];
  dispatchWindow?: QuestDispatchPresentationWindow;
}): WolfHillRoutePresentation | null {
  if (args.launchId !== WOLF_HILL_APPROACH_LAUNCH_ID) return null;
  const hasCadeFodder = args.knowledgeIds?.includes(CADE_FODDER_KNOWLEDGE_ID) === true;
  const hasAidOnly = args.knowledgeIds?.includes(AID_ONLY_KNOWLEDGE_ID) === true;

  if (args.optionId === EXPOSED_RIDGE_OPTION_ID) {
    let tradeoffSummary: string = ROUTE_SUMMARIES.exposedRidge;
    let previewOverride: string | undefined;
    if (hasCadeFodder && hasAidOnly) {
      tradeoffSummary = ROUTE_SUMMARIES.exposedRidgeWithFodderAndAidOnly;
      previewOverride = EXPOSED_RIDGE_WITH_FODDER_AND_AID_ONLY_PREVIEW;
    } else if (hasCadeFodder) {
      tradeoffSummary = ROUTE_SUMMARIES.exposedRidgeWithFodder;
      previewOverride = EXPOSED_RIDGE_WITH_FODDER_PREVIEW;
    } else if (hasAidOnly) {
      tradeoffSummary = ROUTE_SUMMARIES.exposedRidgeWithAidOnly;
      previewOverride = EXPOSED_RIDGE_WITH_AID_ONLY_PREVIEW;
    }
    return Object.freeze({
      tradeoffSummary: boundedSummary(
        withDispatchBriefing(tradeoffSummary, args.dispatchWindow, 1),
      ),
      ...(previewOverride ? { previewOverride } : {}),
    });
  }
  if (args.optionId === SHELTERED_STOCKWAY_OPTION_ID) {
    let tradeoffSummary: string = ROUTE_SUMMARIES.shelteredStockway;
    let previewOverride: string | undefined;
    if (hasCadeFodder && hasAidOnly) {
      tradeoffSummary = ROUTE_SUMMARIES.shelteredStockwayWithFodderAndAidOnly;
      previewOverride = SHELTERED_STOCKWAY_WITH_FODDER_AND_AID_ONLY_PREVIEW;
    } else if (hasCadeFodder) {
      tradeoffSummary = ROUTE_SUMMARIES.shelteredStockwayWithFodder;
      previewOverride = SHELTERED_STOCKWAY_WITH_FODDER_PREVIEW;
    } else if (hasAidOnly) {
      tradeoffSummary = ROUTE_SUMMARIES.shelteredStockwayWithAidOnly;
      previewOverride = SHELTERED_STOCKWAY_WITH_AID_ONLY_PREVIEW;
    }
    return Object.freeze({
      tradeoffSummary: boundedSummary(
        withDispatchBriefing(tradeoffSummary, args.dispatchWindow, 0),
      ),
      ...(previewOverride ? { previewOverride } : {}),
    });
  }
  return null;
}
