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
 *   2. exact name hit — a node/region/area name or quest/room title, each
 *      punctuation-normalized (lowercased; every run of non-alphanumeric
 *      characters collapsed to a single space; trimmed), appears as a
 *      literal substring of raw normalized the same way. Punctuation
 *      normalization means two titles that differ only in punctuation (e.g.
 *      "The Gate-Arch" vs "The Gate Arch") produce the identical phrase — a
 *      raw that hits that phrase then hits every location registered under
 *      it, and a tie across distinct locations falls through rather than
 *      silently crediting whichever one happened to be indexed first.
 *   3. unique contiguous fuzzy hit — strip a small fixed stopword set ("the",
 *      "a", "an", "of", "in", "on", "at", "to", "and") from both the
 *      candidate's normalized tokens and raw's normalized tokens. A candidate
 *      left with fewer than 2 content tokens is ineligible for this rung —
 *      too short to disambiguate safely, so it's skipped rather than risking
 *      a match on a single common word. Otherwise the candidate hits iff its
 *      content-token sequence appears CONTIGUOUSLY, in the same order,
 *      inside raw's content-token sequence — tolerant of a little connective
 *      noise around the name, never of its words scattered loose across an
 *      unrelated sentence.
 *   4. otherwise: `unmapped`, raw preserved for audit.
 */
import { listShippedQuestIds, prepareShippedQuest } from "../crawl/prepare.js";
import { loadOverworldManifest } from "../world/source.js";
import type { CanonicalLocation } from "./schema.js";

/** A resolved location shape without the caller-supplied raw text attached yet. */
type LocationTemplate = Omit<CanonicalLocation, "raw">;

/**
 * Minimal stopword set for rung 3's contiguous fuzzy match. Deliberately small —
 * only articles/prepositions/conjunctions common enough to appear incidentally
 * between a location name's content words in freeform reports. A bigger list would
 * risk stripping enough of a real name to make it collide with something else,
 * which is exactly what the "never force" mandate rules out.
 */
const RUNG3_STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "at",
  "to",
  "and",
]);

type NameCandidate = {
  /** Punctuation-normalized literal name/title text — used for the rung-2 substring test. */
  phrase: string;
  /**
   * `phrase`'s tokens with the rung-3 stopword set stripped — used for the rung-3
   * contiguous match. Fewer than 2 entries makes the candidate ineligible for rung 3.
   */
  contentTokens: readonly string[];
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

/**
 * Lowercases, collapses every run of non-alphanumeric characters to a single space,
 * and trims. Used for both indexed name/title phrases and query-time raw text so
 * punctuation-only differences (a hyphen vs a space, an apostrophe, etc.) can't cause
 * two spellings of the same name to fail to collide at rung 2/3, nor a genuinely
 * different name to dodge the tie-detection that keeps those rungs from forcing a pick.
 * Deliberately separate from the id lookup's normalization, which preserves the raw
 * string (including underscores) since ids are matched verbatim.
 */
function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripStopwords(tokens: readonly string[]): string[] {
  return tokens.filter((token) => !RUNG3_STOPWORDS.has(token));
}

/**
 * True iff `phrase` appears inside `normalizedRaw` aligned to token
 * boundaries — not merely as a raw character run that happens to sit inside
 * a longer word (e.g. "store" must not match inside "restore"). Both
 * arguments are assumed already run through `normalizePhrase` (lowercased,
 * every run of non-alphanumeric characters collapsed to a single space,
 * trimmed — so no leading/trailing/doubled spaces). Padding both sides with
 * a single space turns "phrase sits at the very start/end of raw" and
 * "phrase sits between two other tokens" into the same `includes` check.
 * Exported for direct unit coverage (see feedback_normalize.test.ts) — no
 * shipped location name is currently a single token short enough to trigger
 * the old bug against real content, so the regression is pinned against this
 * helper directly rather than through the compiled index.
 */
export function matchesAtTokenBoundary(normalizedRaw: string, phrase: string): boolean {
  if (phrase.length === 0) return false;
  return ` ${normalizedRaw} `.includes(` ${phrase} `);
}

/** True iff `needle` appears as a contiguous, in-order run inside `haystack`. */
function containsContiguousSubsequence(
  haystack: readonly string[],
  needle: readonly string[],
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    let matched = true;
    for (let i = 0; i < needle.length; i++) {
      if (haystack[start + i] !== needle[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
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
    const phrase = normalizePhrase(rawName);
    if (phrase.length === 0) return;
    names.push({ phrase, contentTokens: stripStopwords(tokenize(phrase)), location });
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

  // Rung 1: exact id hit. Ids are matched verbatim (trim + lowercase only — no
  // punctuation normalization, since ids like "gate_arch" rely on their underscores).
  const idKey = raw.trim().toLowerCase();
  if (idKey.length > 0) {
    const idCandidates = uniqueLocations(idx.ids.get(idKey) ?? []);
    if (idCandidates.length === 1) return finalize(idCandidates[0]!);
  }

  const normalizedRaw = normalizePhrase(raw);
  if (normalizedRaw.length > 0) {
    // Rung 2: exact name hit, both sides punctuation-normalized (see normalizePhrase)
    // and token-boundary-aligned (see matchesAtTokenBoundary) so a short name never
    // matches mid-word inside an unrelated longer word.
    const nameHits = idx.names.filter((candidate) =>
      matchesAtTokenBoundary(normalizedRaw, candidate.phrase),
    );
    const nameCandidates = uniqueLocations(nameHits.map((hit) => hit.location));
    if (nameCandidates.length === 1) return finalize(nameCandidates[0]!);

    // Rung 3: unique contiguous fuzzy hit over stopword-stripped content tokens.
    const rawContentTokens = stripStopwords(tokenize(normalizedRaw));
    if (rawContentTokens.length > 0) {
      const fuzzyHits = idx.names.filter(
        (candidate) =>
          candidate.contentTokens.length >= 2 &&
          containsContiguousSubsequence(rawContentTokens, candidate.contentTokens),
      );
      const fuzzyCandidates = uniqueLocations(fuzzyHits.map((hit) => hit.location));
      if (fuzzyCandidates.length === 1) return finalize(fuzzyCandidates[0]!);
    }
  }

  return finalize(UNMAPPED_TEMPLATE);
}
