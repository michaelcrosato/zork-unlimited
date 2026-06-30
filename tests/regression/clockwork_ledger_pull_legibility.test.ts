/**
 * Regression (§15) for bug_0053 — *The Clockwork Heist*'s steward's-ledger clue
 * was load-bearing but ILLEGIBLE at the point of decision. The ledger is the heist's
 * key timing clue: reading it (study) is what keeps the safe `approach_vault`
 * crossing open on the hour while a no-ledger player gets only the blind gamble
 * (bug_0019 / bug_0040). But the study scene named "Ledgers" only as ambient
 * furniture and its one signposted feature, the brass wall-plate, speaks to the
 * LOCK ("never to force"), not the watch — so nothing told a first-time player that
 * the OPEN ledger logs the watchman's rounds before they committed to reading it.
 * A fresh, MCP-only blind playtester (seed 211, report
 * ai-runs/2026-06-01T15-05-47-942Z/playtest.md §4) flagged exactly this: the ledger
 * "dependency is subtle; a first-timer might over- or under-value it," and a player
 * could leave the study having skipped its whole point.
 *
 * The fix is content-only and legibility-only: the study scene text now draws the
 * eye to the single open ledger and names what its last page records (when the staff
 * retire, when the watch walks its rounds), and the `read_ledger` choice text says
 * so. This gives the load-bearing clue an honest pull and pre-seeds the gallery's
 * existing "the hourly patrol the steward's ledger warned of" callback (so the ledger
 * now genuinely warned of it). NO flag/tick/route/gating/reachable-ending change —
 * the read_ledger payoff (set read_ledger + the rounds journal + the on-the-hour safe
 * crossing) is byte-for-byte the same behaviour bug_0040/bug_0042 locked.
 *
 * Locked here:
 *   (1) the study scene text now names the open ledger AND what it records — the
 *       watch's rounds — so the clue's value is legible before reading;
 *   (2) the read_ledger choice text signals the watch (not a bare "read the ledger");
 *   (3) the payoff is unchanged: reading sets read_ledger, journals the guard's
 *       rounds, and on the hour a reader keeps the safe `approach_vault` crossing
 *       while a no-ledger player on the hour gets only `cross_to_vault_blind`;
 *   (4) reachability unchanged — all four endings still fire.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]): GameState {
  const step = makeStep(rules);
  let s = initStateForPack(index, 211);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obsOf = (s: GameState) => buildObservation(index, s);
const optionIds = (s: GameState): string[] => obsOf(s).available_actions.map((a) => a.id);
const optionText = (s: GameState, id: string): string =>
  obsOf(s).available_actions.find((a) => a.id === id)?.text ?? "";

// Routes used below. Reaching the study early (under the hour) is the natural first
// visit a curious player makes; the on-the-hour assertions reuse the thorough route.
const TO_STUDY = ["climb_stairs", "enter_study"];
// The thorough read-ledger route arrives at the gallery exactly on the hour (tick 4).
//   kitchen(1) gallery(2) study(3) [read] gallery(4)
const READER_TO_GALLERY = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "enter_study",
  "read_ledger",
  "leave_study",
];
// Same thorough route, ledger NOT read — same tick-4 crossing.
const NOREAD_TO_GALLERY = ["kitchens", "take_pick", "dumbwaiter", "enter_study", "leave_study"];

const WATCH_IN_TEXT = /watch walks its rounds|household's hours/i;
const ROUNDS_JOURNAL = /walks the gallery on the hour|time a crossing/i;

describe("bug_0053 — the load-bearing steward's ledger reads as a clue, not furniture", () => {
  it("the study text names the open ledger and what its last page records (the watch's rounds)", () => {
    const s = play(TO_STUDY);
    expect(s.current).toBe("study");
    const text = obsOf(s).text;
    expect(text).toMatch(/one ledger lies open/i); // the readable one is singled out
    expect(text).toMatch(WATCH_IN_TEXT); // its value — the watch — is legible before reading
  });

  it("the read choice signals the watch rather than a bare 'read the ledger'", () => {
    const s = play(TO_STUDY);
    expect(optionIds(s)).toContain("read_ledger");
    expect(optionText(s, "read_ledger")).toMatch(/watch|rounds/i);
  });

  it("the read_ledger payoff is unchanged: flag set, rounds journalled, safe crossing kept on the hour", () => {
    const reader = play(READER_TO_GALLERY);
    expect(reader.current).toBe("landing");
    expect(reader.vars.ticks).toBe(4); // natural arrival is the hour — no dawdling
    expect(reader.flags.read_ledger).toBe(true);
    // The reveal journal still fires with its actionable detail.
    expect(reader.journal.some((j) => ROUNDS_JOURNAL.test(j))).toBe(true);
    // The ledger payoff still gates the safe crossing on the hour...
    expect(optionIds(reader)).toContain("approach_vault");
    expect(optionIds(reader)).not.toContain("cross_to_vault_blind");
    // ...and the no-ledger player on the same on-the-hour crossing still loses it.
    const noread = play(NOREAD_TO_GALLERY);
    expect(noread.vars.ticks).toBe(4);
    expect(noread.flags.read_ledger).toBeFalsy();
    expect(optionIds(noread)).not.toContain("approach_vault");
    expect(optionIds(noread)).toContain("cross_to_vault_blind");
  });

  it("reachability unchanged — all four endings still fire", () => {
    expect(
      play([...READER_TO_GALLERY, "approach_vault", "pick_lock", "take_letter"]).endingId,
    ).toBe("ending_truth");
    expect(
      play(["kitchens", "take_pick", "dumbwaiter", "approach_vault", "pick_lock", "grab_gold"])
        .endingId,
    ).toBe("ending_rich");
    expect(play(["climb_stairs", "approach_vault", "force_door"]).endingId).toBe("ending_caught");
    expect(play([...NOREAD_TO_GALLERY, "cross_to_vault_blind"]).endingId).toBe("ending_patrol");
  });
});
