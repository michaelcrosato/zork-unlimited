/**
 * Regression (§15) for the content_new pack *Dead Reckoning*, the project's 10th pack
 * and the first deliberately TWO-AXIS branching CYOA. Where white_stag (bug_0135) and
 * wreckers_light (bug_0099) turn on a SINGLE hidden truth, this pack presses the breadth
 * lever a step further: TWO independent things the player may learn — the captain's log
 * (`knows_course`) and the stowaway's identity (`knows_pilot`) — in either order, which
 * COMBINE into a 2x2 of knowledge over one climactic decision at the water cask. That is
 * the direct answer to the standing blind-tester critique of the single-fork packs
 * ("short — essentially one rich decision"): here there are two consequential
 * investigations and the finale reads differently in all four knowledge cells.
 *
 * Knowledge never adds routes; it REFRAMES them (the paired-epilogue device — white_stag's
 * ending_quarry, the manor's two letters). This test locks that structure:
 *   (1) all four endings (holdfast / landfall / jonah / adrift) are reachable and distinct;
 *   (2) the moral fork is real — the SAME state at the cask reaches ration / jonah / seize
 *       by choice alone (different endingId), no hidden gating doing the deciding;
 *   (3) `trust_pilot` (the surest ending, ending_landfall) is GATED on knows_pilot — the
 *       choice is absent until the player has gone below and heard the girl out, and present
 *       after (the truth is mechanically load-bearing, a payoff for the investigation);
 *   (4) the TWO flags are INDEPENDENT and order-free — each is set by its own side-room and
 *       neither learning gates the other, so all four (neither / course / pilot / both)
 *       knowledge cells are reachable at the cask;
 *   (5) knows_course fires reactive endingText on holdfast and adrift (a read course / a
 *       knowing hoard) and knows_pilot on jonah (knowing murder vs ignorant superstition),
 *       while the uninformed routes render the base text;
 *   (6) those variants are cosmetic — informed and uninformed routes to the SAME act
 *       converge on the SAME endingId (the truths change prose and unlock trust_pilot,
 *       never silently reroute an existing choice).
 *
 * bug_0175 adds a FIFTH act and locks it here too: the captain's pistol (a THIRD optional
 * thing to take from the chest, `has_pistol`) unlocks `draw_pistol` at the cask — ruling the
 * boat by lethal force, ending_irons. It is the investigate-to-unlock symmetry of trust_pilot
 * (the choice is ABSENT until you take the pistol, PRESENT after), the take is INDEPENDENT and
 * order-free vs the two truths, and ending_irons fires a knows_course reactive variant (a true
 * course enforced at the gun vs a blind gamble). Promoting the pistol — described in the chest
 * but previously inert, the one concrete finding of the seed-7 blind playtest — to a real
 * affordance, so the named object now fires.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";

const loaded = loadPackFile("content/cyoa/pack/dead_reckoning.yaml");
if (!loaded.ok) throw new Error("dead_reckoning pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string) => ({ type: "CHOOSE", choiceId: id }) as const;

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 1);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const obs = (s: ReturnType<typeof play>) => buildObservation(index, s);
const text = (s: ReturnType<typeof play>) => obs(s).text.toLowerCase();
const endId = (s: ReturnType<typeof play>) => obs(s).ending_id;
const actionIds = (s: ReturnType<typeof play>) => obs(s).available_actions.map((a) => a.id);

// ── Route fragments ──────────────────────────────────────────────────────────
// Learn the course (read the captain's log) and return to the deck.
const LEARN_COURSE = ["to_chest", "read_log", "leave_chest"];
// Learn the pilot (hear the stowaway out) and return to the deck.
const LEARN_PILOT = ["to_hold", "speak_girl", "leave_hold"];

// Uninformed climax: straight to the cask, having learned nothing.
const AT_CASK = ["to_cask"];
const RATION = [...AT_CASK, "ration"];
const JONAH = [...AT_CASK, "give_jonah"];
const SEIZE = [...AT_CASK, "seize"];

// Informed climaxes.
const COURSE_RATION = [...LEARN_COURSE, "to_cask", "ration"];
const COURSE_SEIZE = [...LEARN_COURSE, "to_cask", "seize"];
const PILOT_JONAH = [...LEARN_PILOT, "to_cask", "give_jonah"];
const PILOT_LANDFALL = [...LEARN_PILOT, "to_cask", "trust_pilot"]; // gated on knows_pilot
const BOTH_LANDFALL = [...LEARN_COURSE, ...LEARN_PILOT, "to_cask", "trust_pilot"];

// Take the captain's pistol from the chest and return to the deck (bug_0175). A THIRD
// optional take, independent of the two truths; it unlocks the fifth act at the cask.
const TAKE_PISTOL = ["to_chest", "take_pistol", "leave_chest"];
const PISTOL_IRONS = [...TAKE_PISTOL, "to_cask", "draw_pistol"]; // gated on has_pistol
// Read the log AND take the pistol in one chest visit, then rule by force (knows_course cell).
const COURSE_PISTOL_IRONS = [
  "to_chest",
  "read_log",
  "take_pistol",
  "leave_chest",
  "to_cask",
  "draw_pistol",
];

describe("dead_reckoning — four distinct endings are all reachable (anti-linearity)", () => {
  it("reaches holdfast / landfall / jonah / adrift, each a distinct endingId", () => {
    const ids = [RATION, PILOT_LANDFALL, JONAH, SEIZE].map((r) => endId(play(r)));
    expect(ids).toEqual(["ending_holdfast", "ending_landfall", "ending_jonah", "ending_adrift"]);
    expect(new Set(ids).size).toBe(4); // genuinely distinct, not aliases
  });
});

describe("dead_reckoning — the moral fork is real (same state, opposite ending by choice)", () => {
  it("the identical uninformed state at the cask reaches ration / jonah / seize by choice alone", () => {
    expect(RATION.slice(0, 1)).toEqual(JONAH.slice(0, 1)); // identical prefix (at the cask)
    expect(SEIZE.slice(0, 1)).toEqual(JONAH.slice(0, 1));
    expect(endId(play(RATION))).toBe("ending_holdfast");
    expect(endId(play(JONAH))).toBe("ending_jonah");
    expect(endId(play(SEIZE))).toBe("ending_adrift");
  });
});

describe("dead_reckoning — trust_pilot is gated on the pilot truth (knows_pilot is load-bearing)", () => {
  it("trust_pilot is absent at the cask until the girl is heard out, and present after", () => {
    const ignorant = actionIds(play(AT_CASK));
    expect(ignorant).toContain("ration");
    expect(ignorant).toContain("give_jonah");
    expect(ignorant).toContain("seize");
    expect(ignorant).not.toContain("trust_pilot"); // no helm to her without learning who she is

    const informed = actionIds(play([...LEARN_PILOT, "to_cask"]));
    expect(informed).toContain("trust_pilot"); // hearing her out unlocks it
  });

  it("the landfall ending is reachable ONLY via the pilot truth", () => {
    expect(endId(play(PILOT_LANDFALL))).toBe("ending_landfall");
    // Sanity: the route really did set knows_pilot (the cask reframes for it).
    expect(text(play([...LEARN_PILOT, "to_cask"]))).toContain("read the inshore water");
  });
});

describe("dead_reckoning — the two truths are independent and order-free (2x2 knowledge)", () => {
  it("neither flag gates the other; all four knowledge cells reach the cask", () => {
    // Each side-room is reachable and its learn-choice present regardless of the other.
    expect(actionIds(play(["to_chest"]))).toContain("read_log");
    expect(actionIds(play([...LEARN_PILOT, "to_chest"]))).toContain("read_log"); // course after pilot
    expect(actionIds(play(["to_hold"]))).toContain("speak_girl");
    expect(actionIds(play([...LEARN_COURSE, "to_hold"]))).toContain("speak_girl"); // pilot after course
    // The both-cell finale is reachable in either learning order.
    expect(endId(play(BOTH_LANDFALL))).toBe("ending_landfall");
  });
});

describe("dead_reckoning — knows_course / knows_pilot fire reactive epilogue variants", () => {
  it("ending_holdfast: a read course vs an even-handed guess", () => {
    expect(text(play(COURSE_RATION))).toContain("hale's log told you");
    expect(text(play(RATION))).not.toContain("hale's log told you");
    expect(text(play(RATION))).toContain("you do not know that the wind will come");
  });

  it("ending_adrift: a knowing hoard over a landfall you knew was reachable", () => {
    expect(text(play(COURSE_SEIZE))).toContain("you knew");
    expect(text(play(SEIZE))).not.toContain("you knew");
  });

  it("ending_jonah: a knowing murder of the pilot vs ignorant superstition", () => {
    expect(text(play(PILOT_JONAH))).toContain("you knew what she was");
    expect(text(play(JONAH))).not.toContain("you knew what she was");
  });
});

describe("dead_reckoning — the truth variants are cosmetic, not route changes", () => {
  it("informed and uninformed routes to the same act converge on the same endingId", () => {
    expect(endId(play(COURSE_RATION))).toBe(endId(play(RATION)));
    expect(endId(play(COURSE_SEIZE))).toBe(endId(play(SEIZE)));
    expect(endId(play(PILOT_JONAH))).toBe(endId(play(JONAH)));
  });
});

describe("dead_reckoning — the pistol unlocks a fifth act, ruling by force (bug_0175)", () => {
  it("draw_pistol is ABSENT at the cask until the pistol is taken, PRESENT after (has_pistol load-bearing)", () => {
    const unarmed = actionIds(play(AT_CASK));
    expect(unarmed).not.toContain("draw_pistol"); // no gun, no fifth act
    // The four prior acts are unaffected by the addition.
    expect(unarmed).toEqual(expect.arrayContaining(["ration", "give_jonah", "seize", "back_deck"]));

    const armed = actionIds(play([...TAKE_PISTOL, "to_cask"]));
    expect(armed).toContain("draw_pistol"); // taking the pistol unlocks it
  });

  it("draw_pistol reaches ending_irons — a fifth, distinct endingId", () => {
    expect(endId(play(PISTOL_IRONS))).toBe("ending_irons");
    // Genuinely a new ending, not an alias of the prior four.
    const all = [RATION, PILOT_LANDFALL, JONAH, SEIZE, PISTOL_IRONS].map((r) => endId(play(r)));
    expect(new Set(all).size).toBe(5);
  });

  it("taking the pistol is INDEPENDENT and order-free vs the two truths", () => {
    // take_pistol present at the chest regardless of whether the log is read or the girl heard.
    expect(actionIds(play(["to_chest"]))).toContain("take_pistol");
    expect(actionIds(play([...LEARN_COURSE, "to_chest"]))).toContain("take_pistol"); // after course
    expect(actionIds(play([...LEARN_PILOT, "to_chest"]))).toContain("take_pistol"); // after pilot
    // ...and reading the log still works after the pistol is taken (neither gates the other).
    expect(actionIds(play(["to_chest", "take_pistol"]))).toContain("read_log");
    // The both-knowledge finale is still reachable when also armed.
    expect(endId(play([...LEARN_PILOT, ...TAKE_PISTOL, "to_cask", "trust_pilot"]))).toBe(
      "ending_landfall",
    );
  });

  it("ending_irons fires a knows_course reactive variant (a true course enforced at the gun)", () => {
    expect(text(play(COURSE_PISTOL_IRONS))).toContain("you used the gun to buy those two days");
    expect(text(play(PISTOL_IRONS))).not.toContain("you used the gun to buy those two days");
    // The uninformed pistol ending renders the base text (fear, not fairness).
    expect(text(play(PISTOL_IRONS))).toContain("fear and not fairness");
  });
});
