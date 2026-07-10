import { describe, expect, it } from "vitest";
import { buildLocationIndex, canonicalizeLocation } from "../../src/feedback/normalize.js";

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
