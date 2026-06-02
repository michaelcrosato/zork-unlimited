/**
 * Regression (§15) for bug_0114 — *The Alchemist's Tower* gains a climactic NON-DEATH
 * MORAL FORK.
 *
 * bug_0111 made the spire a decision, but BOTH its branches are deaths (drink the phial
 * yourself → ending_poisoned; dose the master with it → ending_master_poisoned), so the
 * pack still had exactly ONE satisfying outcome. Every blind playtest keeps rating it
 * clarity 5/5 but enjoyment 3–4/5 on that same "short and fully linear … no real choice
 * or misdirection beyond the obvious poison trap" knock (this cycle's mandated pass,
 * ai-runs/2026-06-02T10-21-17-693Z/playtest.md, seed 41, scored it 3/5). Linear parser
 * packs cap at enjoyment 3–4 across the loop; the branching packs (clockwork, wreckers_light)
 * and the now-branched sealed_crypt (bug_0105: 3→4) rate higher.
 *
 * The fix (content only — the proven bug_0105 lever): the iron key the player already
 * carries (it opened the cellar hatch) becomes a FORK, exactly the sealed_crypt device.
 * A locked silver casket holding the alchemist's Great Work now sits at the master's
 * deathbed, keyed to that same iron:
 *   • GIVE the antidote to the master → ending_cured  (the unchanged altruistic win)
 *   • UNLOCK the silver casket        → ending_betrayal (greed; terminal, non-death)
 * The casket fires end_game via unlock_effects (the bug_0077 path), so the two are
 * MUTUALLY EXCLUSIVE — a genuine choice, not a detour. You live; she does not.
 *
 * Crucially the VICTORY route is byte-identical: the casket adds no inc_var (max_score
 * stays 40, so the perfect score still coincides with the cure, bug_0104) and no
 * exit/flag/gating to the win path, so every prior route/score test is unaffected.
 *
 * Locked here:
 *   (1) the fork is REAL — at the spire after brewing, holding the iron key, BOTH the
 *       cure act and the casket-unlock are legal in the SAME state;
 *   (2) unlocking the casket ends the game in ending_betrayal (non-death), the master is
 *       never cured, and the narration names the Great Work taken;
 *   (3) ending_betrayal is non-death and reached ONLY by end_game (no win_condition
 *       resolves to it); ending_cured stays the sole winnable win;
 *   (4) the casket needs the iron key — reaching the spire without it offers the casket
 *       to examine but NOT to unlock;
 *   (5) the casket examine is reactive — the antidote bearer sees the sharper "choose the
 *       Work over the maker" weight, the key-only greed route sees the base text;
 *   (6) the victory route is unchanged — the canonical solve still wins ending_cured 40/40;
 *   (7) the pack validates clean (no SOFTLOCK / END_GAME_UNDECLARED / WIN_IS_DEATH /
 *       NO_WINNABLE_ENDING).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions, resolveParserAction } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const pack = alch.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): { state: GameState; narration: string } {
  let narration = "";
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
    narration = r.events
      .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
      .map((e) => e.text)
      .join(" ");
  }
  return { state: s, narration };
}

function legalIds(s: GameState): string[] {
  return enumerateActions(index, s).map((o) => o.id);
}

function examineNarration(s: GameState, target: string): string {
  const res = resolveParserAction(index, s, { type: "LOOK", target });
  const eff = res?.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
  if (!eff) throw new Error(`no examine narration for ${target} in ${s.current}`);
  return eff.narrate;
}

// The canonical brew route, stopping one step short of the cure: in the spire, holding
// the antidote AND the iron key (UNLOCK never consumes it), the moment the fork is live.
const BREW_TO_SPIRE = [
  "go_west",
  "read_spellbook",
  "go_east",
  "go_east",
  "take_herb",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
  "unlock_cellar_door",
  "go_down",
  "take_water_vial",
  "go_up",
  "go_north",
  "use_herb_on_cauldron",
  "use_water_vial_on_cauldron",
  "go_up",
];

// The greed route: fetch the iron key (never brew) and climb to the spire holding it.
// courtyard -E-> garden (brass key) -W-> courtyard -N-> great_hall -U-> study
// (strongbox -> iron key) -D-> great_hall -N-> laboratory -U-> spire.
const KEY_TO_SPIRE = [
  "go_east",
  "take_brass_key",
  "go_west",
  "go_north",
  "go_up",
  "unlock_strongbox",
  "open_strongbox",
  "take_iron_key",
  "go_down",
  "go_north",
  "go_up",
];

describe("bug_0114 — The Alchemist's Tower's climactic moral fork (cure vs. the Great Work)", () => {
  it("the fork is real: at the spire after brewing, holding the iron key, BOTH the cure and the casket-unlock are legal", () => {
    const { state } = play(initStateForParserPack(index, 1), BREW_TO_SPIRE);
    expect(state.current).toBe("spire");
    expect(state.inventory).toContain("antidote");
    expect(state.inventory).toContain("iron_key"); // UNLOCK did not consume it
    const ids = legalIds(state);
    expect(ids).toContain("use_antidote_on_master"); // cure her — the win
    expect(ids).toContain("unlock_silver_casket"); // OR take her Great Work
  });

  it("unlocking the casket ends the game in ending_betrayal — non-death, master never cured, Great Work named", () => {
    const { state, narration } = play(initStateForParserPack(index, 1), [
      ...KEY_TO_SPIRE,
      "unlock_silver_casket",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_betrayal");
    expect(state.endingId).not.toBe("ending_cured");
    expect(buildParserObservation(index, state).ending?.death).toBe(false); // you choose greed; you live
    // It is the alternative to the cure, not the cure: she is never administered the antidote.
    expect(state.flags["cure_administered"]).toBeFalsy();
    // The act is legible — the narration names what you took.
    expect(narration.toLowerCase()).toContain("great work");
  });

  it("ending_betrayal is non-death and reached ONLY by end_game — ending_cured stays the sole winnable win", () => {
    const betrayal = pack.endings.find((e) => e.id === "ending_betrayal");
    expect(betrayal).toBeTruthy();
    expect(betrayal!.death).toBeFalsy(); // greed, not death
    expect(pack.win_conditions.some((w) => w.ending === "ending_betrayal")).toBe(false);
    expect(pack.win_conditions.every((w) => w.ending === "ending_cured")).toBe(true);
    expect(pack.endings.some((e) => !e.death)).toBe(true); // NO_WINNABLE_ENDING intact
  });

  it("the casket needs the iron key: reaching the spire without it offers the casket to examine but not unlock", () => {
    // courtyard -N-> great_hall -N-> laboratory -U-> spire, carrying nothing.
    const { state } = play(initStateForParserPack(index, 5), ["go_north", "go_north", "go_up"]);
    expect(state.current).toBe("spire");
    expect(state.inventory).not.toContain("iron_key");
    const ids = legalIds(state);
    expect(ids).toContain("examine_silver_casket"); // visible…
    expect(ids).not.toContain("unlock_silver_casket"); // …but not unlockable without the key
  });

  it("the casket examine is reactive: the antidote bearer sees the heavier moral weight, the greed route the base text", () => {
    // antidote in hand — "choose the Work over the maker".
    const cure = play(initStateForParserPack(index, 1), BREW_TO_SPIRE).state;
    expect(cure.inventory).toContain("antidote");
    expect(examineNarration(cure, "silver_casket")).toMatch(/choose the Work over the maker/i);

    // key only, no antidote — the base description (no antidote-specific weight).
    const greed = play(initStateForParserPack(index, 1), KEY_TO_SPIRE).state;
    expect(greed.inventory).not.toContain("antidote");
    const baseText = examineNarration(greed, "silver_casket");
    expect(baseText).toMatch(/locked away within arm's reach|masterwork/i);
    expect(baseText).not.toMatch(/choose the Work over the maker/i);
  });

  it("the victory route is unchanged — the canonical solve still wins ending_cured 40/40", () => {
    const { state } = play(initStateForParserPack(index, 1), [
      ...BREW_TO_SPIRE,
      "use_antidote_on_master",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_cured");
    expect(buildParserObservation(index, state).score).toBe(pack.meta.max_score);
    expect(pack.meta.max_score).toBe(40);
  });

  it("the pack validates clean (no SOFTLOCK / END_GAME_UNDECLARED / WIN_IS_DEATH / NO_WINNABLE_ENDING)", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    const codes = report.findings.map((f) => f.code);
    for (const bad of ["SOFTLOCK", "END_GAME_UNDECLARED", "WIN_IS_DEATH", "NO_WINNABLE_ENDING"]) {
      expect(codes).not.toContain(bad);
    }
  });
});
