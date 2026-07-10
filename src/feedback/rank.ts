/**
 * Severity-weighted ranking and fix-layer suggestion — also NO LLM anywhere
 * in this path. Every score and every routing decision is a pure function of
 * an already-built `IssueCluster` (see cluster.ts).
 */
import type { FeedbackSource, FixLayer } from "./schema.js";
import type { IssueCluster, IssueSeverity } from "./cluster.js";

/** S4 (blocking) outweighs S0 (cosmetic) sixteenfold — protocol polarity. */
export const SEVERITY_WEIGHT = { S0: 1, S1: 2, S2: 4, S3: 8, S4: 16 } as const;

/** Crawler+fleet agreement on the same cluster is the strongest signal. */
export const BOTH_SOURCES_BONUS = 2;

function hasBothSources(sources: readonly FeedbackSource[]): boolean {
  return sources.includes("crawler") && sources.includes("fleet");
}

/** count × severity weight × (both sources agree ? BOTH_SOURCES_BONUS : 1). */
export function scoreCluster(c: IssueCluster): number {
  const diversity = hasBothSources(c.sources) ? BOTH_SOURCES_BONUS : 1;
  return c.issues.length * SEVERITY_WEIGHT[c.maxSeverity] * diversity;
}

/**
 * Crawler findings are compiled with a `"CODE: message"` text prefix (see
 * crawl finding -> IssueRecord conversion). Parse the leading all-caps code
 * token so crawler-origin clusters can route on the oracle that raised them
 * rather than on free text.
 */
function parseCrawlerCode(text: string): string | null {
  const match = /^([A-Z]+):/.exec(text);
  return match ? match[1]! : null;
}

const CRAWLER_CODE_LAYER: Readonly<Record<string, FixLayer>> = {
  CRASH: "engine_rule",
  INTEGRITY: "engine_rule",
  DESYNC: "engine_rule",
  PERSIST: "engine_rule",
  LEGALITY: "engine_rule",
  SOFTLOCK: "quest_structure",
  WORLD: "quest_structure",
  RENDER: "content",
};

/**
 * Fleet-origin keyword ladder over the cluster's (already-tokenized/stemmed)
 * `tokens`. First rung that hits wins. Keywords are given in the exact form
 * `tokenizeIssue` would stem real occurrences down to — e.g. "wording" is
 * listed here as "word" (tokenizeIssue stems the real surface word
 * "wording"/"worded"/"words" to "word" via its trailing-suffix stripper), so
 * a literal "wording" here would never match anything in practice.
 */
const FLEET_LADDER: ReadonlyArray<{ layer: FixLayer; keywords: readonly string[] }> = [
  { layer: "hint_text", keywords: ["stuck", "lost", "hint", "unclear", "confus"] },
  { layer: "quest_structure", keywords: ["softlock", "block", "cannot", "impossible"] },
  { layer: "content", keywords: ["typo", "word", "text", "prose", "repeat"] },
  { layer: "engine_rule", keywords: ["crash", "error", "reject"] },
];

function fleetFixLayer(tokens: readonly string[]): FixLayer {
  const tokenSet = new Set(tokens);
  for (const rung of FLEET_LADDER) {
    if (rung.keywords.some((keyword) => tokenSet.has(keyword))) return rung.layer;
  }
  return "content"; // default
}

/**
 * Picks the code from the HIGHEST-severity crawler-coded issue in the
 * cluster — never the first one encountered. A merged cluster can hold
 * issues of mixed crawler codes at different severities (e.g. a RENDER(S2)
 * and a CRASH(S4) issue merged at the same location); routing on whichever
 * code happened to sort first would silently downgrade a `severity_band:
 * "severe"` cluster to a cosmetic fix layer. Ties (same severity, distinct
 * codes) break deterministically on the code string itself so the result
 * never depends on input array order.
 */
function firstCrawlerCode(
  issues: ReadonlyArray<{ text: string; severity: IssueSeverity }>,
): string | null {
  let bestCode: string | null = null;
  let bestWeight = -1;
  for (const issue of issues) {
    const code = parseCrawlerCode(issue.text);
    if (code === null) continue;
    const weight = SEVERITY_WEIGHT[issue.severity];
    if (weight > bestWeight || (weight === bestWeight && bestCode !== null && code < bestCode)) {
      bestCode = code;
      bestWeight = weight;
    }
  }
  return bestCode;
}

/**
 * crawler-origin (cluster.sources includes "crawler"): parse the CODE prefix
 * off the highest-severity crawler-coded issue text and route through the
 * fixed code -> layer table. fleet-origin (or a crawler-origin cluster whose
 * issues carry no recognized code, e.g. a mixed crawler+fleet cluster where
 * the crawler code isn't in the table): fall back to the fleet keyword
 * ladder over the cluster's tokens.
 */
export function suggestFixLayer(c: IssueCluster): FixLayer {
  if (c.sources.includes("crawler")) {
    const code = firstCrawlerCode(c.issues);
    if (code !== null && code in CRAWLER_CODE_LAYER) {
      return CRAWLER_CODE_LAYER[code]!;
    }
  }
  return fleetFixLayer(c.tokens);
}

/**
 * Top hotspot recommendation. Picks the max-`scoreCluster` cluster out of
 * `ranked` (rather than blindly trusting `ranked[0]`, so this stays correct
 * even if a caller passes clusters out of score order) and cites the count,
 * max severity, and sources behind the pick. `hotspot_id` here is the
 * cluster's `key` — the compiler step that builds the final `Hotspot` list
 * (shortHash(key) per schema.ts) is responsible for mapping this back to the
 * matching Hotspot's real `id`.
 */
export function recommendNextFix(
  ranked: IssueCluster[],
): { hotspot_id: string; rationale: string } | null {
  if (ranked.length === 0) return null;

  let best = ranked[0]!;
  let bestScore = scoreCluster(best);
  for (const c of ranked.slice(1)) {
    const score = scoreCluster(c);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }

  const sourceLabel = hasBothSources(best.sources) ? "crawler+fleet" : best.sources.join("+");
  const count = best.issues.length;
  const rationale =
    `${count} report${count === 1 ? "" : "s"}, max severity ${best.maxSeverity}, ` +
    `sources: ${sourceLabel} (score ${bestScore})`;
  return { hotspot_id: best.key, rationale };
}
