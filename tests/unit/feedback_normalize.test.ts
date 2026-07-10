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
});
