/**
 * Feedback location normalization.
 *
 * Crawler findings and fleet blind-tester reports both describe a "location"
 * as free text (a room title, an area name, whatever the reporting persona
 * called it). Hotspot clustering needs a single canonical identity per real
 * place so two reports of the same spot merge instead of forking. This module
 * builds a compile-time index over the overworld manifest and every shipped
 * quest pack, then resolves free text against it through a conservative
 * ladder that would rather stay `unmapped` than guess wrong.
 *
 * Resolution ladder (each rung tried in order; a rung "hits" only when it
 * finds exactly one candidate location — a tie falls through to the next
 * rung, never forcing a pick):
 *   1. exact id hit — raw equals a questId / node id / region id / room|scene
 *      id (case-insensitive, trimmed).
 *   2. exact name hit — a node/region/area name or quest/room title appears
 *      as a literal substring of raw (case-insensitive).
 *   3. unique fuzzy hit — a candidate's token set is fully contained in raw's
 *      token set, and it is the only candidate for which that holds.
 *   4. otherwise: `unmapped`, raw preserved for audit.
 */
import { listShippedQuestIds, prepareShippedQuest } from "../crawl/prepare.js";
import { loadOverworldManifest } from "../world/source.js";
import type { CanonicalLocation } from "./schema.js";

/** A resolved location shape without the caller-supplied raw text attached yet. */
type LocationTemplate = Omit<CanonicalLocation, "raw">;

type NameCandidate = {
  /** Lowercased, trimmed literal name/title text — used for the substring test. */
  phrase: string;
  /** Lowercased tokens of `phrase` — used for the fuzzy subset test. */
  tokens: readonly string[];
  location: LocationTemplate;
};

export type LocationIndex = {
  /** Lowercased id -> every candidate location registered under that id. */
  readonly ids: ReadonlyMap<string, readonly LocationTemplate[]>;
  /** Every name/title candidate across regions, nodes, areas, quests, and rooms. */
  readonly names: readonly NameCandidate[];
};

const UNMAPPED_TEMPLATE: LocationTemplate = {
  kind: "unmapped",
  questId: null,
  region: null,
  node: null,
  sceneId: null,
};

function tokenize(lowerText: string): string[] {
  return lowerText.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

/** Builds the location index once, compiling every shipped quest pack. Cache the result. */
export function buildLocationIndex(root: string): LocationIndex {
  const overworld = loadOverworldManifest(root);
  const ids = new Map<string, LocationTemplate[]>();
  const names: NameCandidate[] = [];

  const addId = (rawId: string, location: LocationTemplate): void => {
    const key = rawId.trim().toLowerCase();
    if (key.length === 0) return;
    const existing = ids.get(key);
    if (existing) existing.push(location);
    else ids.set(key, [location]);
  };

  const addName = (rawName: string, location: LocationTemplate): void => {
    const phrase = rawName.trim().toLowerCase();
    if (phrase.length === 0) return;
    names.push({ phrase, tokens: tokenize(phrase), location });
  };

  const regionNameByNodeId = new Map<string, string>();
  for (const node of overworld.nodes) {
    regionNameByNodeId.set(node.id, node.region);
  }

  for (const region of overworld.regions) {
    const location: LocationTemplate = {
      kind: "overworld",
      questId: null,
      region: region.name,
      node: null,
      sceneId: null,
    };
    addId(region.id, location);
    addName(region.name, location);
  }

  for (const node of overworld.nodes) {
    const location: LocationTemplate = {
      kind: "overworld",
      questId: null,
      region: node.region,
      node: node.id,
      sceneId: null,
    };
    addId(node.id, location);
    addName(node.name, location);
  }

  for (const area of overworld.areas) {
    const location: LocationTemplate = {
      kind: "overworld",
      questId: null,
      region: regionNameByNodeId.get(area.home) ?? null,
      node: area.home,
      sceneId: null,
    };
    addId(area.id, location);
    addName(area.name, location);
  }

  for (const quest of overworld.quests) {
    const location: LocationTemplate = {
      kind: "quest",
      questId: quest.id,
      region: null,
      node: null,
      sceneId: null,
    };
    addId(quest.id, location);
    addName(quest.title, location);
  }

  for (const questId of listShippedQuestIds(root)) {
    const prepared = prepareShippedQuest(root, questId);
    for (const room of prepared.index.rooms.values()) {
      const location: LocationTemplate = {
        kind: "quest",
        questId,
        region: null,
        node: null,
        sceneId: room.id,
      };
      addId(room.id, location);
      addName(room.name, location);
    }
  }

  return { ids, names };
}

function locationTemplateKey(location: LocationTemplate): string {
  return JSON.stringify([
    location.kind,
    location.questId,
    location.region,
    location.node,
    location.sceneId,
  ]);
}

/** Distinct locations by shape — duplicate registrations of the identical location collapse. */
function uniqueLocations(locations: readonly LocationTemplate[]): LocationTemplate[] {
  const byKey = new Map<string, LocationTemplate>();
  for (const location of locations) {
    byKey.set(locationTemplateKey(location), location);
  }
  return [...byKey.values()];
}

/**
 * Resolves free-text `raw` against the index via the conservative ladder
 * described above. Never forces a match: any step that lands on more than one
 * distinct candidate location falls through to the next step, and running
 * out of steps yields `unmapped` with `raw` preserved.
 */
export function canonicalizeLocation(raw: string, idx: LocationIndex): CanonicalLocation {
  const finalize = (location: LocationTemplate): CanonicalLocation => ({
    ...location,
    raw: [raw],
  });
  const lower = raw.trim().toLowerCase();

  if (lower.length > 0) {
    const idCandidates = uniqueLocations(idx.ids.get(lower) ?? []);
    if (idCandidates.length === 1) return finalize(idCandidates[0]!);

    const nameHits = idx.names.filter((candidate) => lower.includes(candidate.phrase));
    const nameCandidates = uniqueLocations(nameHits.map((hit) => hit.location));
    if (nameCandidates.length === 1) return finalize(nameCandidates[0]!);

    const rawTokens = new Set(tokenize(lower));
    if (rawTokens.size > 0) {
      const fuzzyHits = idx.names.filter(
        (candidate) =>
          candidate.tokens.length > 0 && candidate.tokens.every((token) => rawTokens.has(token)),
      );
      const fuzzyCandidates = uniqueLocations(fuzzyHits.map((hit) => hit.location));
      if (fuzzyCandidates.length === 1) return finalize(fuzzyCandidates[0]!);
    }
  }

  return finalize(UNMAPPED_TEMPLATE);
}
