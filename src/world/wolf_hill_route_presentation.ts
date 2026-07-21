/**
 * Player-facing, pre-commitment projection for the starting slice's hill roads.
 *
 * The route mechanics remain authored in Wolf-Winter. This small presentation
 * adapter keeps the decisive cross-choice result out of the longer launch
 * preview, where compact projections may truncate it, and reflects the one
 * already-selected relief allocation that changes the clean ridge outcome.
 */

export const WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT = 160;

const WOLF_HILL_APPROACH_LAUNCH_ID = "albany:wolf_hill_approach";
const EXPOSED_RIDGE_OPTION_ID = "albany:wolf_approach_exposed_ridge";
const SHELTERED_STOCKWAY_OPTION_ID = "albany:wolf_approach_sheltered_stockway";
const CADE_FODDER_KNOWLEDGE_ID = "albany:knowledge_relief_cade_fodder";

const ROUTE_SUMMARIES = Object.freeze({
  exposedRidge:
    "Hill lip 0; final descent 1; first lure DC 10; a clean lure reaches alarm 4 and scatters two cattle.",
  exposedRidgeWithFodder:
    "Hill lip 0; final descent 1; first lure DC 10; Cade fodder suppresses the clean first-cast alarm, so a clean lure reaches alarm 3 and keeps the herd.",
  shelteredStockway:
    "Arrival alarm 0; first lure cast DC 12; a clean lure reaches alarm 3 and keeps the whole herd.",
  shelteredStockwayWithFodder:
    "Arrival alarm 0; first lure cast DC 12; Cade fodder does not alter the sheltered route; a clean lure reaches alarm 3 and keeps the whole herd.",
});

const EXPOSED_RIDGE_WITH_FODDER_PREVIEW =
  "Hill lip: cattle alarm 0. Take the visible final descent to raise it to 1 before the byre watch. Clear crosswind gives first lure DC 10. Cade fodder suppresses the clean first-cast alarm; Route tradeoff gives herd result.";

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

export function wolfHillRoutePresentation(args: {
  launchId: string;
  optionId: string;
  knowledgeIds?: readonly string[];
}): WolfHillRoutePresentation | null {
  if (args.launchId !== WOLF_HILL_APPROACH_LAUNCH_ID) return null;
  const hasCadeFodder = args.knowledgeIds?.includes(CADE_FODDER_KNOWLEDGE_ID) === true;

  if (args.optionId === EXPOSED_RIDGE_OPTION_ID) {
    return Object.freeze({
      tradeoffSummary: boundedSummary(
        hasCadeFodder ? ROUTE_SUMMARIES.exposedRidgeWithFodder : ROUTE_SUMMARIES.exposedRidge,
      ),
      ...(hasCadeFodder ? { previewOverride: EXPOSED_RIDGE_WITH_FODDER_PREVIEW } : {}),
    });
  }
  if (args.optionId === SHELTERED_STOCKWAY_OPTION_ID) {
    return Object.freeze({
      tradeoffSummary: boundedSummary(
        hasCadeFodder
          ? ROUTE_SUMMARIES.shelteredStockwayWithFodder
          : ROUTE_SUMMARIES.shelteredStockway,
      ),
    });
  }
  return null;
}
