/**
 * Regression (§15) for bug_0185 — content_new: *The Friars' Postern*, the eleventh
 * shipped pack and the first PARSER pack whose central gate is a CONVERSATION rather
 * than a lock. The mandated blind pass this cycle (alchemists_tower seed 47) re-confirmed
 * the content set is blind-clean (clarity 5/5, enjoyment 4/5, all three endings, ZERO
 * mechanical bugs); its only ceiling was the recurring "short / wants a fresh mechanic"
 * note. The two existing parser packs each carry an NPC, but in both the talk is an
 * OPTIONAL clue source (sealed_crypt's sexton only hints at puzzles you can also solve by
 * poking the world). This pack makes the talk LOAD-BEARING: the one way out of the gaol —
 * the friars' walled-up postern — can be learned ONLY from the old debtor, and the flag
 * her telling sets (`knows_postern`) is the SOLE key to the escape exit. No item opens it.
 *
 * The pack inverts the genre reflex: the OBVIOUS physical key (the drunk turnkey's ring)
 * opens only ruin — the barred night-gate, where the watch waits (a DEATH, ending_taken),
 * and the inmates' alms-box (rob your fellow wretches and bolt, a non-death greed ending,
 * ending_thief — the sealed_crypt bug_0105 "one key, two locks" device, here a key with
 * two BAD locks). Freedom costs no key: fetch the old woman's confiscated pipe, and be TOLD
 * the trick of the latch. Score (max 35) rides the milestones, the climactic +20 on the
 * LEARNING (the take_pipe dialogue node), so the perfect score coincides with knowing the
 * way out — one act before the visited win, the accepted sealed_crypt denouement shape.
 *
 * Locked here:
 *   (1) the honest WIN is reachable purely through the conversation, ending_free at 35/35;
 *   (2) the postern exit is dialogue-GATED — absent from the chapel's legal actions until
 *       `knows_postern` is set, present after (the conversation is genuinely on the win path);
 *   (3) the conversation is the ONLY key — standing in the chapel holding the turnkey's ring
 *       but WITHOUT the telling, the postern still will not open (no item substitutes for it);
 *   (4) the turnkey's ring opens only the two BAD ends: unlocking the alms-box ends at
 *       ending_thief (greed, non-death, score 0), the night-gate at ending_taken (death, 0);
 *   (5) the score awards are one-shot — after the telling the dialogue offers neither the
 *       escape nor the give-pipe topic again, so +10/+20 cannot be farmed;
 *   (6) the pack validates 0/0 and ending_free is the SOLE non-death win (the two BAD ends
 *       are not win_conditions, so NO_WINNABLE_ENDING / WIN_IS_DEATH stay intact).
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  indexParserPack,
  buildParserRules,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/friars_postern.yaml");
if (!loaded.ok) throw new Error("friars_postern must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function start(): GameState {
  return initStateForParserPack(index, 1);
}

function legalIds(s: GameState): string[] {
  return enumerateActions(index, s).map((o) => o.id);
}

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${legalIds(s).join(", ")}]`);
    const r = step(s, opt.action);
    expect(r.ok, `step ${id} ok`).toBe(true);
    s = r.state;
  }
  return s;
}

// cell -> read the clue -> gallery -> lodge -> take the pipe -> back to the commons,
// learn the postern through the conversation, then climb to the chapel and out.
const LEARN_THE_POSTERN = [
  "read_wall_scratches", // +5, the §17 clue
  "go_north", // gallery
  "go_east", // lodge
  "take_clay_pipe",
  "go_west", // gallery
  "go_west", // commons
  "talk_old_debtor",
  "ask_escape", // about_postern: +10, heard_postern
  "ask_give_pipe", // take_pipe: +20, knows_postern
  "ask_bye",
];

const score = (s: GameState): number => s.vars.score ?? 0;

describe("bug_0185 — The Friars' Postern: dialogue is the key", () => {
  it("validates with zero errors and zero warnings", () => {
    const report = validateParser(pack);
    expect(report.findings).toEqual([]);
  });

  it("(1) the honest escape is won purely through the conversation, 35/35", () => {
    let s = play(start(), LEARN_THE_POSTERN);
    expect(s.flags.knows_postern).toBe(true);
    expect(score(s)).toBe(35);
    s = play(s, ["go_east", "go_up", "go_north"]); // gallery -> chapel -> postern
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_free");
    expect(score(s)).toBe(35);
  });

  it("(2)+(3) the postern exit is dialogue-gated, and no item substitutes for the telling", () => {
    // Carry the turnkey's ring to the chapel WITHOUT having learned the postern.
    const armed = play(start(), [
      "go_north", // gallery
      "go_east", // lodge
      "take_gate_key",
      "go_west", // gallery
      "go_up", // chapel
    ]);
    expect(armed.inventory).toContain("gate_key");
    expect(armed.flags.knows_postern ?? false).toBe(false);
    // The postern is hidden: no go_north out of the chapel, even holding the key.
    expect(legalIds(armed)).not.toContain("go_north");

    // Now learn it and return to the same chapel: the postern appears.
    const informed = play(start(), [...LEARN_THE_POSTERN, "go_east", "go_up"]);
    expect(informed.current).toBe("chapel");
    expect(informed.flags.knows_postern).toBe(true);
    expect(legalIds(informed)).toContain("go_north");
  });

  it("(4) the turnkey's ring opens only ruin: the alms-box (greed) and the night-gate (death)", () => {
    const toKey = ["go_north", "go_east", "take_gate_key", "go_west"];

    const greed = play(start(), [...toKey, "go_up", "unlock_alms_box"]);
    expect(greed.ended).toBe(true);
    expect(greed.endingId).toBe("ending_thief");
    expect(score(greed)).toBe(0);

    const death = play(start(), [...toKey, "go_down", "unlock_iron_gate"]);
    expect(death.ended).toBe(true);
    expect(death.endingId).toBe("ending_taken");
    expect(score(death)).toBe(0);
  });

  it("(5) the dialogue score awards are one-shot (no farming the +10/+20)", () => {
    const learned = play(start(), LEARN_THE_POSTERN);
    expect(score(learned)).toBe(35);
    // Re-open the conversation: with both flags set, neither progress topic is offered.
    const reopened = play(learned, ["talk_old_debtor"]);
    const ids = legalIds(reopened);
    expect(ids).not.toContain("ask_escape");
    expect(ids).not.toContain("ask_give_pipe");
    // Only the flavour topic and the exit remain — leaving cannot move the score.
    const after = play(reopened, ["ask_bye"]);
    expect(score(after)).toBe(35);
  });

  it("(6) ending_free is the sole non-death win; the two bad ends are not wins", () => {
    expect(pack.win_conditions).toHaveLength(1);
    expect(pack.win_conditions[0]!.ending).toBe("ending_free");
    const byId = new Map(pack.endings.map((e) => [e.id, e]));
    expect(byId.get("ending_free")!.death ?? false).toBe(false);
    expect(byId.get("ending_taken")!.death).toBe(true);
    // ending_thief is non-death (the player lives, walks free, robbed the poor) but is
    // reached only via the alms-box end_game — never a win_condition.
    expect(byId.get("ending_thief")!.death ?? false).toBe(false);
    expect(pack.win_conditions.some((w) => w.ending === "ending_thief")).toBe(false);
    expect(pack.win_conditions.some((w) => w.ending === "ending_taken")).toBe(false);
  });
});
