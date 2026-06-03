/**
 * Regression (§15) for bug_0202 — content_fix on friars_postern (the 11th pack, bug_0185).
 *
 * The mandated blind pass this cycle (friars_postern, parser, seed 11) reached all three
 * endings, rated the pack clarity 5/5 / enjoyment 4/5 with ZERO mechanical bugs, and flagged
 * ONE concrete cosmetic flaw: The Gallery's description split the compound word "night-gate"
 * across a folded-scalar line break ("...steps drop down to the night-\ngate."), so the YAML
 * `>` fold collapsed the newline to a SPACE and the room rendered "...drop down to the night-
 * gate." — a stray hyphen+space mid-word, visible every time the player is in the gallery.
 * The fix rejoined "night-gate" onto one source line so the fold no longer breaks the word.
 *
 * Locked here (behavioural witnesses on the REAL pack's rendered text — reverting the edit
 * re-breaks them):
 *   (1) the gallery's effective description renders "night-gate" intact, never "night- gate";
 *   (2) no room description in the pack carries the folded-linewrap signature `<letter>- <letter>`
 *       (a hyphen immediately followed by a space then a letter — the artifact's fingerprint).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, initStateForParserPack } from "../../src/parser/runner.js";
import { roomDescription } from "../../src/parser/model.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const state = initStateForParserPack(index, 1);

describe("bug_0202 — friars_postern gallery 'night-gate' is not split by a folded-scalar linewrap", () => {
  it("(1) the gallery renders 'night-gate' intact, never the broken 'night- gate'", () => {
    const gallery = pack.rooms.find((r) => r.id === "gallery")!;
    const text = roomDescription(gallery, state);
    expect(text).toContain("night-gate");
    expect(text).not.toContain("night- gate");
  });

  it("(2) no room description carries the folded-linewrap signature (<letter>- <letter>)", () => {
    // A hyphen directly followed by a space then a letter is the fold-broke-a-word fingerprint;
    // legitimate prose hyphenates closed (cloister-walk) and uses spaced em-dashes ( — ).
    for (const room of pack.rooms) {
      const text = roomDescription(room, state);
      expect(text, `room ${room.id} description`).not.toMatch(/[a-z]- [a-z]/);
    }
  });
});
