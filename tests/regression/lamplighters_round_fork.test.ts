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
  "take_horn_windscreen",
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
 * Regression (§15) for bug_0216 → bug_0220 — the round-lantern: the carried open flame the
 * whole death fork turns on, now made literally ALWAYS-CARRIED.
 *
 * History. The lamplighters seed-7 blind pass (clarity 5/5, enjoyment 4/5, mechanics flawless
 * across all three endings) flagged that the warning making the spirit-cask a DEATH hangs on
 * "the lit round-lantern on your belt" being an ever-present open flame, yet that flame lived
 * only in prose — uninspectable. bug_0216 first answered that by instantiating `round_lantern`
 * as a TAKEABLE object so a careful player could examine the very thing the excise warns will
 * kill them.
 *
 * The gap bug_0220 closes. "Takeable" let the player NOT carry it — leave it on the stair, or
 * never lift it. A seed-7 replay forcing the spirit-cask while carrying ONLY the keys (lantern
 * left behind) STILL fired ending_caught, whose every line presupposes a flame the player
 * demonstrably was not carrying ("the little flame burning honest on your belt", "the flame you
 * carried in to it", "you were the naked light"). A sealed naphtha cask cracked with NO open
 * flame near it would not even take fire — so the death was unsound, not merely mis-narrated.
 *
 * The fix makes the fiction true in STATE via the new engine primitive `held: true`: the lighter
 * carries this lit lantern from the first turn and can never set it down (it is seeded into the
 * starting inventory and DROP is refused for it), exactly as a lamplighter on the round never is
 * without one. So the death is sound on EVERY path that reaches it, and the lantern stays
 * examinable ANYWHERE (always in hand). It is NOT takeable (already held), NOT quest_critical and
 * gates nothing, so it adds no soft-lock surface and changes none of the three routes.
 */
describe("bug_0216 → bug_0220 — the round-lantern: a HELD (always-carried, never-dropped) open flame", () => {
  it("round_lantern is held (not takeable), NOT quest_critical, gates nothing, and is not also placed in a room", () => {
    const lantern = pack.objects.find((o) => o.id === "round_lantern");
    expect(lantern).toBeDefined();
    expect(lantern!.held).toBe(true);
    expect(lantern!.takeable).toBeFalsy(); // already carried; the schema forbids held + takeable
    expect(lantern!.quest_critical).toBeFalsy();
    // A held object is carried, never placed — it must not appear in any room's object list.
    expect(pack.rooms.some((r) => r.objects.includes("round_lantern"))).toBe(false);
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

  it("the lantern is carried from the VERY FIRST turn — examinable at the start, never offered to take, never droppable", () => {
    const start = initStateForParserPack(index, 3);
    expect(start.inventory).toContain("round_lantern"); // in hand before any action
    const startIds = actionIds(start);
    expect(startIds).toContain("examine_round_lantern"); // examinable immediately…
    expect(startIds).not.toContain("take_round_lantern"); // …never taken (already held)…
    expect(startIds).not.toContain("drop_round_lantern"); // …and never set down
  });

  it("it is STILL in hand and examinable at the three-way fork, with no extra step needed to carry it", () => {
    // The standard route never touches the lantern, yet it is carried into the store.
    const { state } = play(initStateForParserPack(index, 3), ROUTE_TO_STORE_WITH_KEY);
    expect(state.current).toBe("excise_store");
    expect(state.inventory).toContain("round_lantern"); // carried into the store, hands-free
    expect(state.inventory).toContain("store_key");
    const ids = actionIds(state);
    expect(ids).toContain("examine_round_lantern"); // examinable RIGHT at the live fork
    expect(ids).not.toContain("drop_round_lantern"); // and still cannot be set down here
    // The fork is still genuinely three-way with the lantern in hand — nothing changed.
    expect(ids).toContain("unlock_oil_cask");
    expect(ids).toContain("unlock_excise_box");
    expect(ids).toContain("unlock_spirit_cask");
  });

  it("SOUNDNESS: forcing the spirit-cask kills you on the MINIMAL route (no take step) — the flame the death names is provably in hand", () => {
    // bug_0220's exact witness: run to the cask carrying ONLY what the route grabs (the keys),
    // never touching the lantern — yet it is held, so the death's "flame on your belt" is true.
    const { state, narration } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_spirit_cask",
    ]);
    expect(state.endingId).toBe("ending_caught");
    expect(state.inventory).toContain("round_lantern"); // the carried flame the prose presupposes
    const n = narration.toLowerCase();
    expect(n).toContain("flame");
    expect(n).toContain("belt"); // the death narration's "flame burning honest on your belt"
  });

  it("all three endings stay reachable and unchanged with the lantern always in hand (win 35/35, thief, death)", () => {
    const win = play(initStateForParserPack(index, 3), [
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
    expect(win.state.inventory).toContain("round_lantern"); // never spent, never dropped

    const death = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_spirit_cask",
    ]);
    expect(death.state.endingId).toBe("ending_caught");

    const thief = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_excise_box",
    ]);
    expect(thief.state.endingId).toBe("ending_thief");
  });
});

/**
 * Regression (§15) for bug_0229 — the lit Staith-Head names the waiting child, closing the
 * "am I finished at 35/35?" beat the seed-23 blind pass flagged.
 *
 * The win is a LOCOMOTION win: lighting the great lamp earns the final +20 (score 35/35) but the
 * game does not end until you walk `down` to the strand and reach the child. The seed-23 blind
 * pass (clarity 5/5, enjoyment 4/5, all three endings, zero bugs) noted that the lit-room text
 * pointed "down to the strand" without naming the child below, so at the moment the score reads
 * full the REMAINING goal was implicit — a small "am I done?" friction. The fix surfaces the
 * child in the lamp_lit variant of harbour_head, so the lit room itself states the last step.
 * Pure prose: no mechanic, score, flag, exit or ending changes; the +20 still rides the one-shot
 * light, max_score stays 35, and the generic bar (all-endings reachability, no soft-lock, score
 * economy, action-id uniqueness, variant liveness) re-derives clean over the edited pack.
 */
describe("bug_0229 — the lit Staith-Head names the waiting child (the 35/35 'am I finished?' beat)", () => {
  it("the unlit Staith-Head room does NOT mention the child — the strand below is still dark", () => {
    // tools but lamp unlit: arrive at harbour_head, font dry, nothing said of a child yet.
    const { state } = play(initStateForParserPack(index, 3), [
      "take_tinderbox",
      "go_north",
      "go_north",
    ]);
    expect(state.current).toBe("harbour_head");
    expect(state.flags["lamp_lit"]).toBeFalsy();
    const desc = buildParserObservation(index, state).description.toLowerCase();
    expect(desc).not.toContain("child"); // the strand below is lightless; the child is unseen
  });

  it("once the lamp is lit (35/35, before going down) the room itself names the child still to be reached", () => {
    // Full win route, stopped one beat short of the ending — lamp lit, score 35, still at the head.
    const { state } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_STORE_WITH_KEY,
      "unlock_oil_cask",
      "open_oil_cask",
      "take_whale_oil",
      "go_west",
      "go_north",
      "use_whale_oil_on_harbour_lamp",
      "use_tinderbox_on_harbour_lamp",
    ]);
    expect(state.current).toBe("harbour_head");
    expect(state.flags["lamp_lit"]).toBe(true);
    expect(state.ended).toBeFalsy(); // the win still wants the walk DOWN
    const obs = buildParserObservation(index, state);
    expect(obs.score).toBe(35); // max score already reached…
    const desc = obs.description.toLowerCase();
    expect(desc).toContain("child"); // …yet the lit room names the remaining goal explicitly…
    expect(obs.available_actions.map((a) => a.id)).toContain("go_down"); // …and the way down is open to it
  });
});

/**
 * Regression (§15) for bug_0249 — The Lamplighter's Round: the Staith-Head re-showed its base
 * "the wick is dry" description to a player who had ALREADY poured the oil, if they stepped south
 * to the hub after pouring and came back.
 *
 * Root cause (the SAME class as bug_0248 / bug_0120 / bug_0134, stale-on-re-entry reactive text).
 * The harbour_head "deep font brimming…" variant was gated on `quest_stage: the_round == font_filled`.
 * The quest stage is NON-monotonic, and lamp_walk.on_enter unconditionally re-fires
 * `set_quest_stage round_begun` on EVERY entry — so a single dip south to the hub after pouring
 * REGRESSED the stage to round_begun, and the brimming-font variant stopped matching on the walk
 * back north. The room reverted to its base prose ("The wick is dry: it wants oil poured into the
 * font and a flame set to it") even though the font was demonstrably full: the font_filled FLAG was
 * still set, the pour was in the journal, and the `light great harbour-lamp` action was still offered.
 * The pack's own design comment wrongly claimed the variant "displays route-independently … with no
 * on_enter between" — true only on the direct pour→light path; a detour through the hub inserts
 * exactly such an on_enter. Reproduced live via the MCP tools (seed 41) before fixing.
 *
 * Fix (content only): gate the scene variant on the MONOTONIC flag `has_flag: font_filled` (plus
 * `not_flag: lamp_lit` to stay mutually exclusive with the lit variant), exactly mirroring the
 * flag-keyed harbour_lamp OBJECT variant that was always correct. Flags survive the detour; the
 * stage does not. set_quest_stage on the_round is now a pure never-read progress marker. Reactive
 * TEXT ONLY — no flag/var/score/exit/ending change; all three endings stay reachable. This locks:
 *   (1) right after pouring (no detour) the room reads the brimming-font variant, stage == font_filled;
 *   (2) a dip south to the hub and back REGRESSES the stage to round_begun (the latent hazard is real);
 *   (3) yet after that detour the room STILL reads the brimming-font variant and NOT the dry base —
 *       the stale-on-re-entry bug is gone, the font_filled flag is set, and the lamp is still lightable;
 *   (4) the win is still reachable THROUGH the detour (light → go down → ending_guided at 35/35);
 *   (5) structural pin: the brimming-font variant keys off has_flag font_filled, never off quest_stage.
 */
const BRIMMING = "brimming with the oil you have just drawn and poured";
const DRY_BASE = "the wick is dry: it wants oil poured into the font";

// Route to the staith-head with the oil POURED (font_filled set, stage font_filled), still at the head.
const ROUTE_TO_FONT_FILLED = [
  ...ROUTE_TO_STORE_WITH_KEY,
  "unlock_oil_cask",
  "open_oil_cask",
  "take_whale_oil",
  "go_west",
  "go_north",
  "use_whale_oil_on_harbour_lamp",
];

describe("bug_0249 — the Staith-Head does not revert to 'the wick is dry' after a hub detour post-pour", () => {
  it("(1) right after pouring (no detour) the room reads the brimming-font variant, stage == font_filled", () => {
    const { state } = play(initStateForParserPack(index, 3), ROUTE_TO_FONT_FILLED);
    expect(state.current).toBe("harbour_head");
    expect(state.flags["font_filled"]).toBe(true);
    expect(state.questStage["the_round"]).toBe("font_filled");
    const desc = buildParserObservation(index, state).description.toLowerCase();
    expect(desc).toContain(BRIMMING);
    expect(desc).not.toContain(DRY_BASE);
  });

  it("(2) a dip south to the hub and back regresses the quest stage to round_begun (the latent hazard)", () => {
    const { state } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_FONT_FILLED,
      "go_south", // lamp_walk.on_enter re-fires set_quest_stage round_begun…
      "go_north", // …and we return to the head with the stage regressed
    ]);
    expect(state.current).toBe("harbour_head");
    expect(state.questStage["the_round"]).toBe("round_begun"); // the stage really did go backwards
    expect(state.flags["font_filled"]).toBe(true); // but the flag never cleared
  });

  it("(3) after the detour the room STILL shows the brimming-font variant, not the dry base; lamp still lightable", () => {
    const { state } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_FONT_FILLED,
      "go_south",
      "go_north",
    ]);
    const obs = buildParserObservation(index, state);
    const desc = obs.description.toLowerCase();
    expect(desc).toContain(BRIMMING); // the reactive prose survives the detour…
    expect(desc).not.toContain(DRY_BASE); // …and the stale "the wick is dry" is gone
    expect(obs.available_actions.map((a) => a.id)).toContain("use_tinderbox_on_harbour_lamp");
  });

  it("(4) the win is still reachable THROUGH the detour (light → down → ending_guided at 35/35)", () => {
    const { state } = play(initStateForParserPack(index, 3), [
      ...ROUTE_TO_FONT_FILLED,
      "go_south",
      "go_north",
      "use_tinderbox_on_harbour_lamp",
      "go_down",
    ]);
    expect(state.ended).toBe(true);
    expect(state.endingId).toBe("ending_guided");
    expect(buildParserObservation(index, state).score).toBe(35);
  });

  it("(5) structural pin: the brimming-font variant keys off has_flag font_filled, never off quest_stage", () => {
    const head = pack.rooms.find((r) => r.id === "harbour_head")!;
    const brimming = head.variants!.find((v) => v.text.toLowerCase().includes(BRIMMING))!;
    expect(brimming).toBeDefined();
    const conds = JSON.stringify(brimming.when);
    expect(conds).toContain('"has_flag":"font_filled"');
    expect(conds).not.toContain("quest_stage"); // the non-monotonic stage must NOT gate the prose
  });
});

/**
 * Regression for bug_0382 — the horn windscreen is no longer an optional, orphaned
 * steadiness beat. It is now the required shelter for the final act of striking the
 * great lamp in river fog.
 */
describe("bug_0382 — the horn windscreen is a real final-lighting precondition", () => {
  const horn = pack.objects.find((o) => o.id === "horn_windscreen")!;
  const lamp = pack.objects.find((o) => o.id === "harbour_lamp")!;
  const lightInteraction = lamp.interactions.find(
    (it) => it.verb === "USE" && it.item === "tinderbox" && it.target === "harbour_lamp",
  )!;

  it("(1) the windscreen is quest-critical and carries no standalone skill-check action", () => {
    expect(horn.quest_critical).toBe(true);
    expect(horn.interactions).toHaveLength(0);
    expect(horn.description).toMatch(/need it when you strike the great lamp/i);
    expect(pack.meta.vars_init).not.toHaveProperty("steadiness");
    expect(JSON.stringify(pack)).not.toContain("steadied_the_flame");
    expect(JSON.stringify(pack)).not.toContain("attempted_windscreen");
  });

  it("(2) the light interaction requires the filled font and the horn windscreen", () => {
    expect(lightInteraction).toBeDefined();
    expect(JSON.stringify(lightInteraction.conditions)).toContain('"has_flag":"font_filled"');
    expect(JSON.stringify(lightInteraction.conditions)).toContain('"has_item":"horn_windscreen"');
    expect(JSON.stringify(lightInteraction.effects)).toContain("horn windscreen");
  });

  it("(3) a filled font without the windscreen still cannot be lit", () => {
    const noScreen = play(initStateForParserPack(index, 3), [
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
      "unlock_oil_cask",
      "open_oil_cask",
      "take_whale_oil",
      "go_west",
      "go_north",
      "use_whale_oil_on_harbour_lamp",
    ]);
    expect(noScreen.state.flags["font_filled"]).toBe(true);
    expect(noScreen.state.inventory).not.toContain("horn_windscreen");
    expect(actionIds(noScreen.state)).not.toContain("use_tinderbox_on_harbour_lamp");
  });
});
