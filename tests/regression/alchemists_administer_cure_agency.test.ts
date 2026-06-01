/**
 * Regression (§15) for bug_0057 — the Alchemist's Tower's climax is a DELIBERATE
 * act, not an auto-completion on bare room entry.
 *
 * A fresh blind MCP playtester (ai-runs/2026-06-01T16-07-11-442Z, seed 67) won the
 * tower and flagged, as its #1 finding (report §5), that the winning ending narrated
 * an act it never performed and fired on a plain MOVE: the single decisive command
 * was `go up` (laboratory → spire), and that one move ended the game on ending_cured
 * — "At the spire's height you administer the antidote…" — though there was no
 * patient anywhere and no administer/give/use-antidote command was ever offered.
 * Walking upstairs with the antidote in hand auto-narrated the whole climax.
 *
 * Root cause: the win was `{ visited: spire }, { has_item: antidote }`, evaluated in
 * onEnter, so entering the spire while holding the antidote WAS the win. This is the
 * parser-pack twin of sunken_barrow's bug_0056 (a win that should turn on a
 * deliberate act fired on bare room entry). bug_0056 added the engine post-action
 * checkWin hook (§8.4.5); this is the content-only payoff — no engine change.
 *
 * The fix (content only): the spire now holds a `master` (the fevered patient); the
 * antidote is given via a deliberate USE-antidote-on-master interaction that sets
 * `cure_administered` and consumes the antidote; the win is `{ visited: spire },
 * { has_flag: cure_administered }`. `visited: spire` is KEPT (the parser validator
 * derives its soft-lock guard from `visited` win-rooms — dropping it would silently
 * disable that check, same as bug_0056). The ending carries the aftermath; the
 * interaction narrates the act.
 *
 * Locked here:
 *   (1) reaching the spire with the antidote does NOT end the game (regression: it
 *       used to auto-win on entry) and the spire offers use_antidote_on_master;
 *   (2) administering ends ending_cured at full score and consumes the antidote;
 *   (3) you cannot win merely by reaching the spire without the antidote (no
 *       administer action, no auto-win);
 *   (4) the win keeps the visited term and requires cure_administered, not has_item
 *       antidote (the deliberate-act gate, not the carry-the-vial gate);
 *   (5) the ending text carries the aftermath (it no longer narrates the act as the
 *       trigger), and the interaction narrates the administering beat;
 *   (6) the pack validates green.
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
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const pack = alch.compiled.pack;
const index = indexParserPack(pack);
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

// Brew the antidote and stand in the laboratory, one step short of the spire.
const BREW = [
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
];

describe("bug_0057 — the Alchemist's Tower climax is a deliberate cure, not an auto-win on entry", () => {
  it("entering the spire with the antidote does NOT end the game, and offers the deliberate cure", () => {
    let s = play(initStateForParserPack(index, 1), BREW);
    expect(s.inventory).toContain("antidote");

    s = play(s, ["go_up"]);
    // Regression: this MOVE used to fire ending_cured. It must not anymore.
    expect(s.current).toBe("spire");
    expect(s.ended).toBe(false);
    // Full score is already in hand as the player makes the final cure.
    expect(buildParserObservation(index, s).score).toBe(pack.meta.max_score);

    // The patient is present and the deliberate cure is offered.
    const ids = enumerateActions(index, s).map((o) => o.id);
    expect(ids).toContain("use_antidote_on_master");
    expect(ids).toContain("examine_master");
  });

  it("administering the antidote to the master wins ending_cured at full score and consumes the vial", () => {
    const won = play(initStateForParserPack(index, 1), [
      ...BREW,
      "go_up",
      "use_antidote_on_master",
    ]);
    expect(won.ended).toBe(true);
    expect(won.endingId).toBe("ending_cured");
    const obs = buildParserObservation(index, won);
    expect(obs.score).toBe(pack.meta.max_score);
    expect(obs.ending?.death).toBe(false);
    // The cure was administered (flag set) and the antidote poured out (consumed).
    expect(won.flags["cure_administered"]).toBe(true);
    expect(won.inventory).not.toContain("antidote");
  });

  it("you cannot win merely by reaching the spire without the antidote (no administer, no auto-win)", () => {
    // Skip the brew entirely; just climb to the spire empty-handed.
    const s = play(initStateForParserPack(index, 1), ["go_north", "go_north", "go_up"]);
    expect(s.current).toBe("spire");
    expect(s.ended).toBe(false);
    const ids = enumerateActions(index, s).map((o) => o.id);
    // No antidote in hand ⇒ the USE interaction is not legal, and entry did not win.
    expect(ids).not.toContain("use_antidote_on_master");
  });

  it("the win keeps the visited term and turns on cure_administered, not has_item antidote", () => {
    const wc = pack.win_conditions.find((w) => w.ending === "ending_cured");
    expect(wc).toBeDefined();
    const conds = wc!.conditions;
    expect(conds).toContainEqual({ visited: "spire" }); // soft-lock guard preserved
    expect(conds).toContainEqual({ has_flag: "cure_administered" }); // the deliberate-act gate
    expect(conds).not.toContainEqual({ has_item: "antidote" }); // no longer the carry-the-vial gate
  });

  it("the ending carries the aftermath; the administering act lives in the interaction's narration", () => {
    const ending = pack.endings.find((e) => e.id === "ending_cured")!;
    // The ending no longer narrates the administering as the trigger.
    expect(ending.text).not.toContain("you administer the antidote");
    expect(ending.text).toContain("the long sickness breaks");

    // The deliberate act is narrated by the USE-antidote-on-master interaction.
    const master = pack.objects.find((o) => o.id === "master")!;
    const give = master.interactions.find((it) => it.verb === "USE" && it.item === "antidote");
    expect(give).toBeDefined();
    const narrate = give!.effects.find((e) => "narrate" in e) as { narrate: string } | undefined;
    expect(narrate?.narrate.toLowerCase()).toContain("antidote");
    expect(give!.effects).toContainEqual({ set_flag: "cure_administered" });
    expect(give!.effects).toContainEqual({ remove_item: "antidote" });
  });

  it("the pack validates green (win references a reachable room + a settable flag; soft-lock intact)", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
