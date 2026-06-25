/**
 * Regression (§15) for bug_0307 — friars_postern gallery description falsely claimed
 * the clay pipe was still in the turnkey's lodge ("the surest road to her pipe") after
 * the player had already fetched it.
 *
 * A blind MCP playtest (seed 7, 2026-06-08) hit this in the common pipe-first route:
 *   cell → gallery → lodge (take pipe) → gallery → commons (learn postern) → gallery
 *
 * The gallery's `told_of_way` variant fires as a navigation-hint while the player walks
 * to the lodge and back — but a player who visits the lodge BEFORE the commons picks up
 * the pipe first, then hears about the postern, then returns through the gallery while
 * already holding the pipe.  At that point "the snores … are the surest road to her
 * pipe" is factually false — the pipe is already in hand.  Same reactive-description-
 * blindness class as bug_0282/0283/0287/0288/0302.
 *
 * Fix: added a new `told_of_way + has_item:clay_pipe` variant ordered ABOVE the
 * existing `told_of_way` variant (first-match-wins).  The new variant reads "her pipe
 * is already in your hands; nothing left now but to bring it to the commons and coax
 * the latch's trick from her" — factually correct and directs the player to the right
 * next step without referencing the lodge.  The old `told_of_way` variant (no pipe in
 * hand) is unchanged and still fires for the lodge-second route.  Pure prose; no flag,
 * score, exit, or ending change.
 *
 * Locked here:
 *   (1) gallery base: no pipe-hint text before told_of_way stage is set
 *   (2) gallery told_of_way + NO pipe: shows "surest road to her pipe" (old, correct)
 *   (3) gallery told_of_way + HAS pipe: shows "already in your hands" (new, correct)
 *   (4) gallery told_of_way + HAS pipe: does NOT show "surest road to her pipe"
 *   (5) full honest win route still reaches ending_free at 35/35
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const index = indexParserPack(loaded.compiled.pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt)
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

const desc = (s: GameState): string => buildParserObservation(index, s).description;

// Pipe-second route: learn postern first, then fetch the pipe.
// After ask_escape + ask_bye, player is in commons with told_of_way stage, NO pipe.
// go_east puts them in the gallery at told_of_way + no pipe.
const TO_GALLERY_NO_PIPE = [
  "go_north", // gallery (imprisoned)
  "go_west", // commons
  "talk_old_debtor",
  "ask_escape", // sets told_of_way, +10
  "ask_bye",
  "go_east", // gallery — told_of_way, no pipe
];

// Pipe-first route: fetch the pipe from the lodge before talking to the old woman.
// After ask_escape + ask_bye, player is in commons with told_of_way + clay_pipe.
// go_east puts them in the gallery at told_of_way + has pipe.
const TO_GALLERY_WITH_PIPE = [
  "go_north", // gallery (imprisoned)
  "go_east", // lodge
  "take_clay_pipe",
  "go_west", // gallery
  "go_west", // commons
  "talk_old_debtor",
  "ask_escape", // sets told_of_way, +10
  "ask_bye",
  "go_east", // gallery — told_of_way, HAS pipe
];

// Full win route (pipe-first then give): the honest postern exit ends at ending_free 35/35.
const WIN_ROUTE = [
  "read_wall_scratches", // cell: +5
  "go_north", // gallery
  "go_east", // lodge
  "take_clay_pipe",
  "go_west", // gallery
  "go_west", // commons
  "talk_old_debtor",
  "ask_escape", // +10
  "ask_give_pipe", // knows_postern
  "ask_bye",
  "go_east", // gallery
  "go_up", // chapel
  "use_font", // press the third stone
  "go_north", // postern → night_street (win)
];

describe("bug_0307 — friars_postern gallery pipe reactive description", () => {
  it("(1) gallery base: no pipe-hint text before told_of_way stage is set", () => {
    const s = play(initStateForParserPack(index, 7), ["go_north"]);
    expect(s.current).toBe("gallery");
    const d = desc(s);
    expect(d).not.toContain("surest road to her pipe");
    expect(d).not.toContain("already in your hands");
  });

  it("(2) gallery told_of_way + no pipe: shows 'surest road to her pipe' (pipe still in lodge)", () => {
    const s = play(initStateForParserPack(index, 7), TO_GALLERY_NO_PIPE);
    expect(s.current).toBe("gallery");
    expect(s.inventory).not.toContain("clay_pipe");
    const d = desc(s);
    expect(d).toContain("surest road to her pipe");
    expect(d).not.toContain("already in your hands");
  });

  it("(3) gallery told_of_way + has pipe: shows 'already in your hands' (pipe already fetched)", () => {
    const s = play(initStateForParserPack(index, 7), TO_GALLERY_WITH_PIPE);
    expect(s.current).toBe("gallery");
    expect(s.inventory).toContain("clay_pipe");
    const d = desc(s);
    expect(d).toContain("already in your hands");
    expect(d).toContain("nothing left now but to bring it");
  });

  it("(4) gallery told_of_way + has pipe: does NOT show stale 'surest road to her pipe'", () => {
    const s = play(initStateForParserPack(index, 7), TO_GALLERY_WITH_PIPE);
    expect(s.current).toBe("gallery");
    expect(s.inventory).toContain("clay_pipe");
    expect(desc(s)).not.toContain("surest road to her pipe");
  });

  it("(5) full honest win route still reaches ending_free at 35/35", () => {
    const s = play(initStateForParserPack(index, 7), WIN_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_free");
    expect(buildParserObservation(index, s).score).toBe(35);
  });
});
