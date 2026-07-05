import type { RpgActionOption } from "../rpg/legal_actions.js";
import type { RpgObservation } from "../rpg/observation.js";

export const SESSION_PROJECTION_CACHE_LIMIT = 8;

export type StateProjectionCacheEntry = {
  stateHash: string;
  projection: unknown;
};

export type TranscriptProjectionCacheEntry = {
  transcriptLogHash: string;
  projection: unknown;
};

export type StateTranscriptProjectionCacheEntry = {
  stateHash: string;
  transcriptLogHash: string;
  projection: unknown;
};

export type SessionRuntimeCaches<TranscriptSummary> = {
  legalActionsCache?: {
    stateHash: string;
    actions: RpgActionOption[];
  };
  legalActionProjectionCaches?: Map<string, StateProjectionCacheEntry>;
  observationCache?: {
    stateHash: string;
    hideGraph: boolean;
    includeWorldIntro: boolean;
    observation: RpgObservation;
  };
  observationProjectionCaches?: Map<string, StateProjectionCacheEntry>;
  transcriptSummaryCache?: {
    stateHash: string;
    transcriptLogHash: string;
    summary: TranscriptSummary;
  };
  transcriptSummaryProjectionCaches?: Map<string, StateTranscriptProjectionCacheEntry>;
  transcriptProjectionCaches?: Map<string, TranscriptProjectionCacheEntry>;
};

export function cachedSessionProjection<T, Entry extends { projection: unknown }>(
  cacheMap: Map<string, Entry> | undefined,
  key: string,
  isFresh: (entry: Entry) => boolean,
  entryFor: (projection: T) => Entry,
  build: () => T,
  maxEntries = SESSION_PROJECTION_CACHE_LIMIT,
): { value: T; cacheMap: Map<string, Entry> } {
  if (cacheMap !== undefined) {
    const cached = cacheMap.get(key);
    if (cached !== undefined && isFresh(cached)) {
      cacheMap.delete(key);
      cacheMap.set(key, cached);
      return { value: cached.projection as T, cacheMap };
    }
  }
  const value = build();
  const nextCacheMap = cacheMap ?? new Map<string, Entry>();
  nextCacheMap.delete(key);
  nextCacheMap.set(key, entryFor(value));
  while (nextCacheMap.size > maxEntries) {
    const oldestKey = nextCacheMap.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    nextCacheMap.delete(oldestKey);
  }
  return { value, cacheMap: nextCacheMap };
}

export function invalidateSessionStateCaches(caches: SessionRuntimeCaches<unknown>): void {
  delete caches.legalActionsCache;
  delete caches.legalActionProjectionCaches;
  delete caches.observationCache;
  delete caches.observationProjectionCaches;
  delete caches.transcriptSummaryCache;
  delete caches.transcriptSummaryProjectionCaches;
}

export function invalidateSessionTranscriptCaches(caches: SessionRuntimeCaches<unknown>): void {
  delete caches.transcriptSummaryCache;
  delete caches.transcriptSummaryProjectionCaches;
  delete caches.transcriptProjectionCaches;
}
