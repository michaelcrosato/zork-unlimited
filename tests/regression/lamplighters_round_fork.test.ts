/**
 * Regression (§15) for bug_0205 — The Lamplighter's Round: the project's 15th pack and
 * 4th PARSER pack (content/parser/pack/lamplighters_round.yaml). Parser was the under-
 * represented mode (3 vs 6 cyoa / 5 rpg) and the one the benchmark gap-analysis (bug_0198)
 * flagged as the thinnest / most-inverted CURATED witness, so a new hand-authored parser
 * pack strengthens exactly that set; it also spends the standing "too short / near-linear"
 * blind-pass note (every clean pack returns it) on a LONGER, well-clued chain than the
 * curated norm — brass-key → cupboard → store-key → store door → oil-cask → carry oil →
 * light the great lamp → guide the lost home (five gated milestones, not three).
 *
 * The auto-discovered parser suites already prove the GENERIC structure the moment it ships
 * (all-endings reachability for all three of ending_guided/ending_thief/ending_caught, no
 * soft-lock pocket, score economy max==35, action-id uniqueness, variant liveness). This
 * pins the pack-SPECIFIC claims those generic suites do not — and, like sealed_crypt's
 * three-way iron-key fork (bug_0105/0130), the climax here is a THREE-WAY EXCISE-KEY fork:
 * everything impounded in the excise store answers to the one store-key, which reads three
 * ways —
 *   • the oil-cask         → draw the oil, light the lamp, guide the child → ending_guided (the win)
 *   • the excise strongbox → take the Crown's seized silver and slip away → ending_thief (greed; terminal)
 *   • the sealed spirit-cask → force the impounded naphtha by your lit lantern → ending_caught (a DEATH)
 * ending_caught is the failure pole, reached by end_game in unlock_effects (the sealed_crypt
 * bound_tomb path), telegraphed by the notice, the watchman, AND the cask's own warning
 * (the §8.7 / bug_0123 "never an ambush" discipline), recoverable via an earlier save.
 *
 * Locked here on the REAL engine (enumerateActions + makeStep), out-of-band teeth and all:
 *   (1) the fork is genuinely THREE-way — in the excise store holding the store-key, the
 *       oil-cask, the strongbox AND the spirit-cask can all be unlocked in the SAME state;
 *   (2) the win route reaches ending_guided at the full 35/35 (read notice +5, store door
 *       +10, light lamp +20), and lighting the lamp opens the way down to the strand;
 *   (3) taking the silver fires ending_thief (NON-death), the lamp left dark (no lamp_lit);
 *   (4) forcing the spirit-cask fires ending_caught (a DEATH), distinct from guided/thief,
 *       the strand never reached, and its narration names the rock-spirit and the flame;
 *   (5) ending_caught is the pack's ONLY death ending, reached ONLY by end_game; ending_guided
 *       stays the sole winnable ending (no win_condition resolves to a fork);
 *   (6) the climax is the TWO-BEAT the prose promises (bug_0210): `pour` the carried oil into
 *       the font (consumes the oil, sets font_filled, no score), THEN `light` the now-filled
 *       font with the tinderbox (+20). The oil stays the hard precondition (no oil → no pour →
 *       a dry font is un-lightable → strand barred); the +20 rides the one-shot light only;
 *   (7) the death is telegraphed off-stage too — the notice, the spirit-cask examine, and the
 *       watchman all warn the rock-spirit takes fire from the lighter's own flame.
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

const loaded = loadParserPackFile("content/parser/pack/lamplighters_round.yaml");
if (!loaded.ok) throw new Error("lamplighters_round must compile");
const pack = loaded.compiled.pack;
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

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);

// Read the notice (+5), gather the tools, win the store-key from the watch-house cupboard
// and unlock the excise-store door (+10) — the point at which the three-way fork is live,
// store-key in hand, score 15, nothing in the store opened yet.
const ROUTE_TO_STORE_WITH_KEY = [
  "read_night_notice",
  "take_brass_key",
  "take_tinderbox",
  "go_north",
  "go_west",
  "unlock_wall_cupboard",
  "open_wall_cupboard",
  "take_store_key",
  "go_east",
  "unlock_store_door",
  "go_east",
];

describe("bug_0205 — The Lamplighter's Round: the three-way excise-key fork (oil / silver / spirit)", () => {
  it("validates clean as a parser pack, max_score 35", () => {
    const report = validateParser(pack);
    expect(report.ok).toBe(true);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(pack.meta.max_score).toBe(35);
  });

  it("the fork is genuinely three-way: in the store with the key, oil-cask, strongbox AND spirit-cask can all be unlocked", () => {
    const { state } = play(initStateForParserPack(index, 3), ROUTE_TO_STORE_WITH_KEY);
    expect(state.current).toBe("excise_store");
    expect(state.inventory).toContain("store_key");
    expect(state.vars.score).toBe(15); // +5 notice, +10 door; the lamp's +20 not yet earned
    const ids = actionIds(state);
    expect(ids).toContain("unlock_oil_cask"); // draw the oil → light the lamp → the win
    expect(ids).toContain("unlock_excise_box"); // OR take the Crown's silver (greed)
    expect(ids).toContain("unlock_spirit_cask"); // OR force the rock-spirit (death)
  });

  it("the win route reaches ending_guided at the full 35/35, and lighting the lamp opens the way down", () => {
    const win = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_oil_cask",
      "open_oil_cask",
      "take_whale_oil",
      "go_west",
      "go_north",
      "use_whale_oil_on_harbour_lamp", // pour the font…
      "use_tinderbox_on_harbour_lamp", // …then strike the light (the two-beat climax, bug_0210)
      "go_down",
    ]);
    expect(win.state.ended).toBe(true);
    expect(win.state.endingId).toBe("ending_guided");
    expect(win.state.visited.the_strand).toBe(true);
    expect(win.state.flags["lamp_lit"]).toBe(true);
    expect(buildParserObservation(index, win.state).score).toBe(35);
  });

  it("taking the silver fires ending_thief (a NON-death greed end) — the lamp left dark, no win", () => {
    const { state } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_excise_box",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_thief");
    expect(state.flags["lamp_lit"]).toBeFalsy(); // the great lamp never lit
    expect(state.visited.the_strand).toBeFalsy();
    expect(state.vars.score).toBe(15); // no score rides the greed fork
    const thief = pack.endings.find((e) => e.id === "ending_thief");
    expect(thief!.death).toBeFalsy(); // you are not killed; you chose the silver
  });

  it("forcing the spirit-cask fires ending_caught (a DEATH), distinct from guided/thief, the strand never reached, and the narration names the flame", () => {
    const { state, narration } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_spirit_cask",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_caught");
    expect(state.endingId).not.toBe("ending_guided");
    expect(state.endingId).not.toBe("ending_thief");
    expect(state.visited.the_strand).toBeFalsy();
    expect(state.vars.score).toBe(15); // no score rides the death fork
    const n = narration.toLowerCase();
    expect(n).toContain("rock-spirit");
    expect(n).toContain("flame");
  });

  it("ending_caught is the pack's only death ending, reached ONLY by end_game — ending_guided stays the sole winnable win", () => {
    const caught = pack.endings.find((e) => e.id === "ending_caught");
    expect(caught!.death).toBe(true);
    expect(pack.endings.filter((e) => e.death).map((e) => e.id)).toEqual(["ending_caught"]);
    // No win_condition resolves to a fork ending — both forks are pure end_game.
    expect(pack.win_conditions.some((w) => w.ending === "ending_caught")).toBe(false);
    expect(pack.win_conditions.some((w) => w.ending === "ending_thief")).toBe(false);
    expect(pack.win_conditions.every((w) => w.ending === "ending_guided")).toBe(true);
  });

  it("the great lamp HARD-requires the oil: reaching the staith-head without it offers the lamp to examine but neither to pour nor to light", () => {
    // tools but no oil: river_stair → lamp_walk → harbour_head, the oil still locked in the store.
    const { state } = play(initStateForParserPack(index, 3), [
      "take_tinderbox",
      "go_north",
      "go_north",
    ]);
    expect(state.current).toBe("harbour_head");
    expect(state.inventory).not.toContain("whale_oil");
    const ids = actionIds(state);
    expect(ids).toContain("examine_harbour_lamp"); // visible…
    expect(ids).not.toContain("use_whale_oil_on_harbour_lamp"); // …no oil to pour into the font…
    expect(ids).not.toContain("use_tinderbox_on_harbour_lamp"); // …and a dry font cannot be lit
    // and the strand stays barred while the lamp is dark.
    expect(ids).not.toContain("go_down");
  });

  it("the climax is the two-beat the prose promises (bug_0210): pour the font, THEN strike the light — the dry lamp is un-lightable, and lighting needs no oil in hand", () => {
    // Arrive at the staith-head with the oil and the tinderbox, the font still dry.
    const dry = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_oil_cask",
      "open_oil_cask",
      "take_whale_oil",
      "go_west",
      "go_north",
    ]);
    expect(dry.state.flags["font_filled"]).toBeFalsy();
    const dryIds = actionIds(dry.state);
    expect(dryIds).toContain("use_whale_oil_on_harbour_lamp"); // can pour…
    expect(dryIds).not.toContain("use_tinderbox_on_harbour_lamp"); // …but a DRY font cannot be lit

    // Pour: consumes the oil, fills the font, no score yet, and the pour retires (one-shot).
    const poured = play(dry.state, ["use_whale_oil_on_harbour_lamp"]);
    expect(poured.state.flags["font_filled"]).toBe(true);
    expect(poured.state.inventory).not.toContain("whale_oil"); // poured into the font
    expect(poured.state.vars.score).toBe(15); // the +20 rides the LIGHT, not the pour
    const pouredIds = actionIds(poured.state);
    expect(pouredIds).not.toContain("use_whale_oil_on_harbour_lamp"); // no re-pour (oil spent)
    expect(pouredIds).toContain("use_tinderbox_on_harbour_lamp"); // NOW the filled font can be lit

    // Strike: the +20 rides here, needs only font_filled (no oil in hand), and retires.
    const lit = play(poured.state, ["use_tinderbox_on_harbour_lamp"]);
    expect(lit.state.flags["lamp_lit"]).toBe(true);
    expect(lit.state.vars.score).toBe(35);
    expect(actionIds(lit.state)).not.toContain("use_tinderbox_on_harbour_lamp"); // one-shot, no farming
  });

  it("the death is telegraphed off-stage too: the notice, the spirit-cask examine, and the watchman all warn the flame fires the spirit", () => {
    const notice = pack.objects.find((o) => o.id === "night_notice")!;
    expect(notice.read_text!.toUpperCase()).toContain("NEVER BRING A FLAME");
    expect(notice.read_text!.toUpperCase()).toContain("ROCK-SPIRIT");

    const cask = pack.objects.find((o) => o.id === "spirit_cask")!;
    expect(cask.description.toLowerCase()).toContain("naked light");
    expect(cask.description.toLowerCase()).toContain("spark");

    const watchman = pack.npcs.find((n) => n.id === "watchman")!;
    const warns = watchman.dialogue.nodes.some((node) =>
      /rock-spirit|leaded it shut|open flame/i.test(node.npc_text),
    );
    expect(warns).toBe(true);
  });
});

/**
 * Regression (§15) for bug_0216 — the lamplighters seed-7 blind pass (clarity 5/5,
 * enjoyment 4/5, mechanics flawless across all three endings) returned ONE actionable
 * finding: the warning that makes the spirit-cask a DEATH hangs on "the lit round-lantern
 * on your belt" being an ever-present open flame, but that flame was never an inventory
 * item nor an examinable object — it lived only in room/dialogue prose, so a careful
 * player could not look at the very thing the excise warns will kill them. The fix
 * instantiates `round_lantern` as the lighter's third tool on the river-stair sill:
 * takeable (so once carried it is examinable ANYWHERE, including in the excise store at
 * the instant of the three-way fork), its examine spelling out the carried naked flame and
 * the rock-spirit danger. It is NOT quest_critical and gates nothing, so it adds no
 * soft-lock surface and changes none of the three routes. This pins exactly that.
 */
describe("bug_0216 — the round-lantern: the carried open flame, now a takeable + examinable object", () => {
  it("round_lantern exists, is takeable, NOT quest_critical, and gates nothing (no soft-lock surface added)", () => {
    const lantern = pack.objects.find((o) => o.id === "round_lantern");
    expect(lantern).toBeDefined();
    expect(lantern!.takeable).toBe(true);
    expect(lantern!.quest_critical).toBeFalsy();
    // It is referenced by no exit / win / interaction condition and by no key_id — purely
    // an examinable affordance, so it cannot wedge the quest or be required to win.
    const id = "round_lantern";
    const inExitConds = pack.rooms.some((r) =>
      r.exits.some((e) => JSON.stringify(e.conditions ?? []).includes(id)),
    );
    const inWinConds = pack.win_conditions.some((w) => JSON.stringify(w.conditions).includes(id));
    const asKey = pack.objects.some((o) => o.key_id === id);
    const inInteractions = pack.objects.some((o) =>
      o.interactions.some((it) => it.item === id || JSON.stringify(it.conditions).includes(id)),
    );
    expect(inExitConds || inWinConds || asKey || inInteractions).toBe(false);
  });

  it("its examine names the carried open flame and ties it to the rock-spirit warning (telegraph reinforcement)", () => {
    const lantern = pack.objects.find((o) => o.id === "round_lantern")!;
    const d = lantern.description.toLowerCase();
    expect(d).toContain("flame");
    expect(d).toContain("rock-spirit");
  });

  it("the lantern starts on the river-stair sill and can be carried, then examined at the excise-store fork (with the store-key, before any cask is opened)", () => {
    // Lift the lantern at the start, then run the standard route to the store with the key.
    const { state } = play(initStateForParserPack(index, 3), [
      "take_round_lantern",
      ...ROUTE_TO_STORE_WITH_KEY,
    ]);
    expect(state.current).toBe("excise_store");
    expect(state.inventory).toContain("round_lantern"); // carried into the store…
    expect(state.inventory).toContain("store_key");
    const ids = actionIds(state);
    // …and examinable RIGHT HERE, in the instant the three-way fork is live.
    expect(ids).toContain("examine_round_lantern");
    // The fork is still genuinely three-way with the lantern in hand — nothing changed.
    expect(ids).toContain("unlock_oil_cask");
    expect(ids).toContain("unlock_excise_box");
    expect(ids).toContain("unlock_spirit_cask");
  });

  it("carrying the lantern leaves all three endings reachable and unchanged (win 35/35, thief, death)", () => {
    // Win, lantern in hand throughout.
    const win = play(initStateForParserPack(index, 3), [
      "take_round_lantern",
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_oil_cask",
      "open_oil_cask",
      "take_whale_oil",
      "go_west",
      "go_north",
      "use_whale_oil_on_harbour_lamp",
      "use_tinderbox_on_harbour_lamp",
      "go_down",
    ]);
    expect(win.state.endingId).toBe("ending_guided");
    expect(buildParserObservation(index, win.state).score).toBe(35);
    expect(win.state.inventory).toContain("round_lantern"); // never spent

    // Death still fires on forcing the spirit-cask, lantern carried.
    const death = play(initStateForParserPack(index, 3), [
      "take_round_lantern",
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_spirit_cask",
    ]);
    expect(death.state.endingId).toBe("ending_caught");

    // Greed still fires on the strongbox, lantern carried.
    const thief = play(initStateForParserPack(index, 3), [
      "take_round_lantern",
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_excise_box",
    ]);
    expect(thief.state.endingId).toBe("ending_thief");
  });
});
