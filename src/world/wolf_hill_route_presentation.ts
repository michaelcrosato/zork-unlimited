/**
 * Player-facing, pre-commitment projection for the starting slice's hill roads.
 *
 * The route mechanics remain authored in Wolf-Winter. This small presentation
 * adapter keeps the decisive route tradeoff out of the longer launch preview,
 * where compact projections may truncate it. Strategy-specific support and
 * failure forecasts belong at Cade, after the independent ground condition is
 * visible and the player can compare all four plans as peers.
 */

import { WOLF_WINTER_DISPATCH_ON_TIME_MAX_MINUTES } from "../core/embedded_launch_overlay_receipt.js";
import type { QuestDispatchPresentationWindow } from "./quest_dispatch_window.js";

export const WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT = 360;

const WOLF_HILL_APPROACH_LAUNCH_ID = "albany:wolf_hill_approach";
const EXPOSED_RIDGE_OPTION_ID = "albany:wolf_approach_exposed_ridge";
const SHELTERED_STOCKWAY_OPTION_ID = "albany:wolf_approach_sheltered_stockway";
const ROUTE_SUMMARIES = Object.freeze({
  exposedRidge:
    "Open crest: 30m, 1 supply, fatigue +25; cattle alarm starts at 1; clear sight of the byre and weather. No plan is chosen. Cade discloses the ground for tonight before commitment.",
  shelteredStockway:
    "Sheltered lee: 75m, 2 supplies, fatigue +10; cattle alarm starts at 0; hedges conceal the byre and weather. No plan is chosen. Cade discloses the ground for tonight before commitment.",
});

export type WolfHillRoutePresentation = Readonly<{
  tradeoffSummary: string;
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

function withDispatchBriefing(
  summary: string,
  window: QuestDispatchPresentationWindow | undefined,
): string {
  const briefing = dispatchBriefing(window);
  return briefing ? `${briefing} ${summary}` : summary;
}

export function wolfHillRoutePresentation(args: {
  launchId: string;
  optionId: string;
  knowledgeIds?: readonly string[];
  dispatchWindow?: QuestDispatchPresentationWindow;
}): WolfHillRoutePresentation | null {
  if (args.launchId !== WOLF_HILL_APPROACH_LAUNCH_ID) return null;
  if (args.optionId === EXPOSED_RIDGE_OPTION_ID) {
    return Object.freeze({
      tradeoffSummary: boundedSummary(
        withDispatchBriefing(ROUTE_SUMMARIES.exposedRidge, args.dispatchWindow),
      ),
    });
  }
  if (args.optionId === SHELTERED_STOCKWAY_OPTION_ID) {
    return Object.freeze({
      tradeoffSummary: boundedSummary(
        withDispatchBriefing(ROUTE_SUMMARIES.shelteredStockway, args.dispatchWindow),
      ),
    });
  }
  return null;
}
