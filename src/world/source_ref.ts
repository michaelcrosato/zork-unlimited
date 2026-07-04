/** Compact canonical source identity shared by saves, traces, and source resolution. */
export type CompactSourceRef = ["wq", string] | ["gen", number] | ["pack", string];

export type CompactSourceMetadata = {
  worldQuestId?: unknown;
  generatedRpgSeed?: unknown;
};

export type CompactSourceMetadataLabels = {
  source: string;
  worldQuestId: string;
  generatedRpgSeed: string;
};

export type CompactSourceRefResult =
  | { ok: true; sourceRef: CompactSourceRef }
  | { ok: false; error: string };

export function compactSourceRefFromMetadata(
  fallbackPackId: string,
  metadata: CompactSourceMetadata,
  labels: CompactSourceMetadataLabels,
): CompactSourceRefResult {
  const worldQuestId = metadata.worldQuestId ?? undefined;
  const generatedRpgSeed = metadata.generatedRpgSeed ?? undefined;
  const hasWorldQuest = worldQuestId !== undefined;
  const hasGeneratedSeed = generatedRpgSeed !== undefined;
  if (hasWorldQuest && hasGeneratedSeed) {
    return {
      ok: false,
      error: `${labels.source} cannot carry both worldQuestId and generatedRpgSeed.`,
    };
  }
  if (hasWorldQuest) {
    if (typeof worldQuestId !== "string") {
      return {
        ok: false,
        error: `${labels.worldQuestId} must be a string, got ${JSON.stringify(worldQuestId)}.`,
      };
    }
    return { ok: true, sourceRef: ["wq", worldQuestId] };
  }
  if (hasGeneratedSeed) {
    if (typeof generatedRpgSeed !== "number" || !Number.isInteger(generatedRpgSeed)) {
      return {
        ok: false,
        error: `${labels.generatedRpgSeed} must be an integer, got ${JSON.stringify(
          generatedRpgSeed,
        )}.`,
      };
    }
    return { ok: true, sourceRef: ["gen", generatedRpgSeed] };
  }
  return { ok: true, sourceRef: ["pack", fallbackPackId] };
}

export function compactSourceRefValidationError(raw: unknown, label: string): string | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return `${label} must be a compact tuple when present.`;
  }
  const [tag, value] = raw;
  if (tag === "wq") {
    return typeof value === "string" ? undefined : `${label} world quest id must be a string.`;
  }
  if (tag === "gen") {
    return typeof value === "number" && Number.isInteger(value)
      ? undefined
      : `${label} generated seed must be an integer.`;
  }
  if (tag === "pack") {
    return typeof value === "string" ? undefined : `${label} pack id must be a string.`;
  }
  return `${label} tag must be "wq", "gen", or "pack", got ${JSON.stringify(tag)}.`;
}
