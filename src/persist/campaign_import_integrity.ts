import type { GameState } from "../core/state.js";
import {
  assertCampaignImportReceiptMatchesCatalog,
  type CampaignCharacterImports,
} from "../rpg/campaign_character_import.js";
import { SaveIntegrityError } from "./save_load.js";

/**
 * Check a present receipt against the current quest's import catalog. Generated
 * RPGs and legacy quests have no catalog, so a present receipt is incompatible.
 * A missing receipt remains valid for legacy, direct, and no-op starts. This is
 * the same structural/content-compatibility guarantee as the rest of save
 * loading; local save files are not cryptographically authenticated.
 */
export function assertCampaignImportReceiptCatalogCompatibility(
  state: Pick<GameState, "campaignImportReceipt">,
  imports: CampaignCharacterImports | undefined,
): void {
  try {
    assertCampaignImportReceiptMatchesCatalog(state.campaignImportReceipt, imports);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SaveIntegrityError(`Campaign import receipt is not catalog-compatible: ${detail}`);
  }
}
