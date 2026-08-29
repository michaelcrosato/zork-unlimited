import { describe, expect, it } from "vitest";
import {
  buildLocationIndex,
  canonicalizeLocation,
  matchesAtTokenBoundary,
} from "../../src/feedback/normalize.js";

const idx = buildLocationIndex(process.cwd());
const c = (raw: string) => canonicalizeLocation(raw, idx);

describe("location normalization", () => {
  it("maps exact ids", () => {
    expect(c("albany_city")).toMatchObject({ kind: "overworld", node: "albany_city" });
    expect(c("sunken_barrow")).toMatchObject({ kind: "quest", questId: "sunken_barrow" });
  });

  it("maps names conservatively", () => {
    // Reality check (content/world/new_york_overworld.json): exactly one overworld
    // node's name contains "Albany" — id "albany_city", name "Albany city" (token set
    // {albany, city}). "the notice board in Albany" lowercases to token set
    // {the, notice, board, in, albany} — it does NOT contain "city", so the node name
    // is neither a whole-phrase substring of raw (step 2) nor a name-token-subset of
    // raw's tokens (step 3: the candidate's tokens must be fully contained in raw's).
    // Every other Albany-prefixed candidate (areas like "Albany Civic Center", "Albany
    // Market Streets", quest-adjacent POIs, etc.) carries even more tokens absent from
    // raw. Per the conservative ladder ("never force"), this must land unmapped, not
    // overworld — the brief's illustrative expectation of `kind: "overworld"` does not
    // hold against the real manifest data.
    expect(c("the notice board in Albany")).toMatchObject({ kind: "unmapped" });
  });

  it("refuses to force a match", () => {
    expect(c("somewhere vaguely damp")).toMatchObject({ kind: "unmapped" });
    expect(c("")).toMatchObject({ kind: "unmapped" });
  });

  it("quest scene ids resolve to quest+scene", () => {
    expect(c("barrow_mouth")).toMatchObject({
      kind: "quest",
      questId: "sunken_barrow",
      sceneId: "barrow_mouth",
    });
  });

  it("treats colliding exact ids as ambiguous rather than forcing a pick", () => {
    // Reality check: "new_york_city" is simultaneously a region id (region "New York
    // City") and a node id (node "New York City", itself inside that region) in the
    // real manifest. The two candidate locations differ in shape (one has `node` set,
    // the other doesn't), so an id hit that resolves to two distinct locations must
    // not be forced to either — and neither the exact-name nor the fuzzy-token step
    // disambiguates it either, since both the region name and the node name are the
    // literal string "New York City". The whole raw stays unmapped.
    expect(c("new_york_city")).toMatchObject({ kind: "unmapped" });
  });

  it("treats a punctuation-only title collision across quests as ambiguous", () => {
    // Reality check (content/rpg/quests/dawn_beacon.yaml, factors_mark.yaml): both
    // packs ship a room literally called "gate_arch", titled "The Gate-Arch" (dawn_beacon)
    // and "The Gate Arch" (factors_mark) respectively — identical except for the
    // hyphen. Punctuation-normalizing both the indexed phrase and the raw text collapses
    // them to the same string ("the gate arch"), so either spelling of the raw hits
    // BOTH quests' rooms at rung 2 (and both again at rung 3, since their stopword-
    // stripped content tokens are also identical: ["gate", "arch"]). A tie at every
    // rung must fall through to unmapped rather than crediting whichever quest happened
    // to be indexed first.
    expect(c("The Gate Arch")).toMatchObject({ kind: "unmapped" });
    expect(c("The Gate-Arch")).toMatchObject({ kind: "unmapped" });
  });

  it("does not force a match on scattered tokens that aren't a contiguous name", () => {
    // Reality check: the overworld manifest's quest list includes a "cold_forge" quest
    // titled "The Cold Forge" (content/world/new_york_overworld.json). Under the old
    // loose rung 3 (candidate token set fully contained in raw's token set, order and
    // adjacency ignored), this raw's tokens {it, felt, cold, near, the, forge} contain
    // the title's tokens {the, cold, forge} as a subset, forcing a match to cold_forge
    // even though the raw is not describing that location — it's describing a forge
    // room in a *different* quest ("near the forge"), with "cold" an unrelated
    // adjective. The tightened rung 3 requires the candidate's stopword-stripped
    // content tokens (["cold", "forge"]) to appear CONTIGUOUSLY in raw's stopword-
    // stripped content tokens (["it", "felt", "cold", "near", "forge"]) — "near"
    // breaks the contiguity, so this correctly stays unmapped instead of guessing.
    expect(c("it felt cold near the forge")).toMatchObject({ kind: "unmapped" });
  });

  it("still allows a legitimate contiguous fuzzy hit through punctuation noise", () => {
    // Reality check (content/rpg/quests/wolf_winter.yaml): room id "store", titled
    // "The Store-Shed". Punctuation-normalizing the title collapses the hyphen to a
    // space ("the store shed"), which appears verbatim — and uniquely across the whole
    // index — inside this raw, so the ladder still resolves it (at rung 2, or rung 3's
    // contiguous stopword-stripped ["store", "shed"] match if rung 2 were ever
    // defeated by a competing candidate). Confirms the stricter rung 3 isn't so tight
    // it also rejects genuine, differently-punctuated hits.
    expect(c("the store shed had nothing in it")).toMatchObject({
      kind: "quest",
      questId: "wolf_winter",
      sceneId: "store",
    });
  });

  it("makes a name ineligible for rung 3 once stopwords leave fewer than 2 content tokens", () => {
    // Reality check (content/rpg/quests/dawn_beacon.yaml): room id "armory", titled
    // "The Armory". Stripping the rung-3 stopword set from its normalized tokens
    // ["the", "armory"] leaves only ["armory"] — a single content token. Under the old
    // loose rung 3, a raw containing both "the" and "armory" anywhere (not necessarily
    // adjacent) would satisfy the token-subset test and force a match; the tightened
    // rung 3 declares single-content-token names ineligible outright, and this raw also
    // fails rung 2 since "the armory" never appears as a contiguous phrase in it. Stays
    // unmapped rather than pinning every stray mention of "armory" to dawn_beacon.
    expect(c("armory sounds drifted past, and the watch stayed quiet")).toMatchObject({
      kind: "unmapped",
    });
  });
});

describe("rung 1b — an id quoted inside a sentence", () => {
  // Regression cover for a live failure: six playtest sessions produced 55 issues and
  // 55 clusters, nothing merging, because reporters cite MACHINE IDS in prose (the MCP
  // surface hands models ids, never titles) and every such report fell to `unmapped`,
  // which keys on the raw wording. Four reports of one defect became four locations,
  // and clustering never merges across locations — so corroboration could never build.
  it("resolves a room id cited in prose, exactly as if it stood alone", () => {
    // Reality check (content/rpg/quests/wolf_winter.yaml): room id "steading_yard".
    expect(c("quest wolf_winter, room steading_yard, blocked exit north")).toMatchObject({
      kind: "quest",
      questId: "wolf_winter",
      sceneId: "steading_yard",
    });
  });

  it("gives four wordings of one defect the identical location", () => {
    // The four raws below are verbatim from four independent playtest reports of the
    // same blocked exit. Same location or they cannot cluster, whatever else matches.
    const wordings = [
      "wolf_winter quest opening room steading_yard, blocked exit north",
      "quest wolf_winter, room steading_yard, blocked exit north",
      "steading_yard",
      "quest wolf_winter, room steading_yard, blocked exit north (reproduced on both approaches)",
    ];
    const resolved = wordings.map((raw) => {
      const { raw: _ignoredRawText, ...identity } = c(raw);
      return JSON.stringify(identity);
    });
    expect(new Set(resolved).size).toBe(1);
    expect(resolved[0]).toContain("steading_yard");
  });

  it("prefers the room over the quest that contains it, rather than reading a tie", () => {
    // Both ids are present. They are one place at two zoom levels, not two rivals.
    expect(c("in wolf_winter the room steading_yard is unclear")).toMatchObject({
      sceneId: "steading_yard",
    });
  });

  it("still refuses a one-word id, which prose cannot be told apart from", () => {
    // "armory" is a dawn_beacon room id and an ordinary noun. Requiring an underscore
    // is what keeps a stray mention from pinning the report to that room.
    expect(c("armory sounds drifted past, and the watch stayed quiet")).toMatchObject({
      kind: "unmapped",
    });
  });

  it("still refuses two genuinely different places named in one sentence", () => {
    // Reality check: "gate_arch" is a room id in BOTH dawn_beacon and factors_mark.
    // Sibling rooms under different quests are rivals, and no narrowing applies.
    expect(c("the gate_arch description is wrong")).toMatchObject({ kind: "unmapped" });
  });

  it("does not let a bare colliding id be narrowed behind rung 1's back", () => {
    // "new_york_city" is both a region and a node. A raw that IS just that id stays
    // rung 1's call — ambiguous — even though the region is a coarser view of the node.
    expect(c("new_york_city")).toMatchObject({ kind: "unmapped" });
  });

  it("resolves an id wrapped in punctuation exactly as the bare id does", () => {
    // Regression: the rung was guarded on "raw has more than one token", but an id in
    // markdown backticks — the near-universal way a model quotes a machine id — is ONE
    // token, so it was skipped, while rung 1 had already missed it because its lookup
    // key still carried the backticks. Reality check (content/rpg/quests/
    // advocates_case.yaml): room id "market_stall", whose title ("The Market Stall")
    // shares no distinguishing words with the id, so rungs 2-3 cannot rescue it either
    // — every quoted spelling landed `unmapped`, keyed on its own raw wording.
    const bare = { kind: "quest", questId: "advocates_case", sceneId: "market_stall" };
    expect(c("market_stall")).toMatchObject(bare);
    expect(c("`market_stall`")).toMatchObject(bare);
    expect(c('"market_stall"')).toMatchObject(bare);
    expect(c("(market_stall)")).toMatchObject(bare);
    expect(c("market_stall.")).toMatchObject(bare);
  });

  it("keeps both id guards for a decorated id, not just for prose", () => {
    // The punctuation spelling reaches rung 1b on the same terms prose does, so the two
    // guards that keep the rung honest still apply: "armory" is a one-word id
    // indistinguishable from the noun, and "gate_arch" is a room id in two quest packs.
    expect(c("`armory`")).toMatchObject({ kind: "unmapped" });
    expect(c("`gate_arch`")).toMatchObject({ kind: "unmapped" });
  });

  it("matches whole tokens only, never an id that merely prefixes a longer one", () => {
    // "armory_annex" is not an id. It must not resolve to the "armory" room just
    // because that id is a prefix of it. ("armory" is chosen because its title, "The
    // Armory", is a single content token and so ineligible for rung 3 — this asserts
    // the token boundary rather than accidentally measuring a later rung.)
    expect(c("armory_annex was confusing")).toMatchObject({ kind: "unmapped" });
  });
});

describe("rungs 2-3 — longest match wins between rival names", () => {
  // Regression cover: a location whose human-facing NAME properly contains a shorter
  // location's name used to be unresolvable from its own exact name, because both hit
  // and the ladder read a two-candidate tie. That is the worst possible bucket for a
  // blind-tester report — testers write the name the game showed them, and an unmapped
  // location keys on its raw wording (cluster.ts locationKey), so corroboration can
  // never accumulate. 51 of 783 shipped named locations were affected.
  it("resolves a name that properly contains a shorter location's name", () => {
    // Reality check (content/world/new_york_overworld.json): nodes "North Hempstead
    // town" (north_hempstead_town) and "Hempstead town" (hempstead_town). The shorter
    // name sits entirely inside the longer one at token boundaries, so both used to hit
    // rung 2 and rung 3 and the raw stayed unmapped.
    expect(c("North Hempstead town")).toMatchObject({
      kind: "overworld",
      node: "north_hempstead_town",
    });
    expect(c("the notice board in North Hempstead town would not open")).toMatchObject({
      kind: "overworld",
      node: "north_hempstead_town",
    });
    // Same shape one zoom level down: an area name built on the longer node name.
    expect(c("North Hempstead Civic Center")).toMatchObject({
      kind: "overworld",
      node: "north_hempstead_town",
    });
  });

  it("still resolves the shorter name on its own", () => {
    // The preference must not shadow the contained location: nothing longer matches
    // here, so its own name still resolves to it.
    expect(c("Hempstead town")).toMatchObject({ kind: "overworld", node: "hempstead_town" });
  });

  it("refuses to force a pick when the shorter name is also mentioned on its own", () => {
    // The rule drops redundancy, never rivalry: it is judged per OCCURRENCE, so a raw
    // that names the shorter place somewhere the longer name does not cover keeps both
    // candidates and falls through to unmapped, exactly as before.
    expect(c("I went from Hempstead town to North Hempstead town and both stalled")).toMatchObject({
      kind: "unmapped",
    });
  });

  it("leaves two equally long rival names ambiguous", () => {
    // Two distinct locations registered under the identical phrase cannot eclipse each
    // other (neither span is strictly longer), so the tie survives. Reality check:
    // "New York City" is both a region name and a node name in the real manifest.
    expect(c("New York City")).toMatchObject({ kind: "unmapped" });
  });
});

describe("matchesAtTokenBoundary (rung-2 substring guard)", () => {
  // No shipped location name is currently a single short token like "store" —
  // every real "...store..." title is multi-word ("The Herb Store", "The
  // Apothecary's Store", "The Store-Shed"), so this can't be demonstrated
  // against the real index (see feedback_normalize's other cases, which all
  // exercise real content). Test the exported boundary-check helper directly
  // instead, against the synthetic case the brief calls out: a raw containing
  // "restore" must not match a candidate phrase "store" — a plain
  // `normalizedRaw.includes(phrase)` substring test (the old, buggy rung 2)
  // would incorrectly match here since "store" sits inside "restore".
  it("does not match a short phrase mid-word inside a longer word", () => {
    expect(matchesAtTokenBoundary("i had to restore the old fence", "store")).toBe(false);
  });

  it("still matches the same phrase when it appears as its own token", () => {
    expect(matchesAtTokenBoundary("the store had nothing left", "store")).toBe(true);
  });

  it("matches a phrase at the very start or end of raw (no surrounding tokens)", () => {
    expect(matchesAtTokenBoundary("store shelves are bare", "store")).toBe(true);
    expect(matchesAtTokenBoundary("visited the store", "store")).toBe(true);
  });

  it("matches a multi-token phrase only when contiguous at token boundaries", () => {
    expect(matchesAtTokenBoundary("the store shed had nothing in it", "store shed")).toBe(true);
    expect(matchesAtTokenBoundary("restore shed the old habit", "store shed")).toBe(false);
  });
});
