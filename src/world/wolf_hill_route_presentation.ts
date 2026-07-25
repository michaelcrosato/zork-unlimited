/**
 * Player-facing, pre-commitment projection for the starting slice's hill roads.
 *
 * The route mechanics remain authored in Wolf-Winter. This small presentation
 * adapter keeps the decisive cross-choice result out of the longer launch
 * preview, where compact projections may truncate it, and reflects both
 * already-selected modifiers that change a clean lure: Cade's route-specific
 * fodder allocation and Aid-Only's final-cast suppression.
 */

export const WOLF_HILL_ROUTE_TRADEOFF_SUMMARY_CHAR_LIMIT = 160;

const WOLF_HILL_APPROACH_LAUNCH_ID = "albany:wolf_hill_approach";
const EXPOSED_RIDGE_OPTION_ID = "albany:wolf_approach_exposed_ridge";
const SHELTERED_STOCKWAY_OPTION_ID = "albany:wolf_approach_sheltered_stockway";
const CADE_FODDER_KNOWLEDGE_ID = "albany:knowledge_relief_cade_fodder";
const AID_ONLY_KNOWLEDGE_ID = "albany:knowledge_wolf_limited_aid_only";

const ROUTE_SUMMARIES = Object.freeze({
  exposedRidge:
    "Hill lip 0; final descent 1; first lure DC 10; a clean lure reaches alarm 4 and scatters two cattle.",
  exposedRidgeWithAidOnly:
    "Hill lip 0; final descent 1; first lure DC 10; aid-only suppresses the final clean-cast alarm, so a clean lure reaches alarm 3 and keeps the herd.",
  exposedRidgeWithFodder:
    "Hill lip 0; final descent 1; first lure DC 10; Cade fodder suppresses the clean first-cast alarm, so a clean lure reaches alarm 3 and keeps the herd.",
  exposedRidgeWithFodderAndAidOnly:
    "Hill lip 0; final descent 1; first lure DC 10; Cade fodder and aid-only suppress the first and final clean-cast alarms: alarm 2, whole herd.",
  shelteredStockway:
    "Arrival alarm 0; first lure cast DC 12; a clean lure reaches alarm 3 and keeps the whole herd.",
  shelteredStockwayWithAidOnly:
    "Arrival alarm 0; first lure cast DC 12; aid-only suppresses the final clean-cast alarm, so a clean lure reaches alarm 2 and keeps the whole herd.",
  shelteredStockwayWithFodder:
    "Arrival alarm 0; first lure cast DC 12; Cade fodder does not alter the sheltered route; a clean lure reaches alarm 3 and keeps the whole herd.",
  shelteredStockwayWithFodderAndAidOnly:
    "Arrival alarm 0; first lure cast DC 12; Cade fodder does not alter this route; aid-only makes the clean-lure result alarm 2, whole herd.",
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

export function wolfHillRoutePresentation(args: {
  launchId: string;
  optionId: string;
  knowledgeIds?: readonly string[];
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
      tradeoffSummary: boundedSummary(tradeoffSummary),
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
      tradeoffSummary: boundedSummary(tradeoffSummary),
      ...(previewOverride ? { previewOverride } : {}),
    });
  }
  return null;
}
