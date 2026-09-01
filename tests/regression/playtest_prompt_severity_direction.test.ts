/**
 * Every prompt that asks a player for an S0-S4 severity must say which end is
 * which (intake 4ccaf8b0bba934b2).
 *
 * The scale ASCENDS — S0 mildest, S4 most severe — which is the reverse of the
 * convention nearly every reporter arrives with, where S1 is critical and S4
 * cosmetic. `SEVERITY_WEIGHT` doubles at every step (S0 1 -> S4 16), so an
 * inverted report does not misrank by a little: a cosmetic nit filed as S4
 * outranks a real defect filed as S2 by four times, and the dev loop's queue
 * comes out close to backwards while every individual report still reads as
 * reasonable. Nothing downstream can detect it, because a severity is just a
 * label the reporter chose.
 *
 * The exit-interview schema grew a description saying so, and three of the four
 * player prompts spell it out. `prompt-overworld-spark.md` did not: it asked for
 * `severity` (`S0`-`S4`) three times and never once named a direction, so the
 * Spark lane's reporters were the one cohort left to guess — and the convention
 * they would guess with is the inverted one.
 *
 * This scans the prompts rather than pinning a list of filenames, so a new
 * vendor's prompt is covered the day it lands instead of the day someone
 * remembers to add it here.
 *
 * The check is ORDERED on purpose. Looking for a direction-word anywhere in the
 * file would accept the exact regression it exists to catch: `S0 (blocking)
 * through S4 (cosmetic)` contains both words and states the scale backwards, so
 * a presence test would pass it while every Spark report came out inverted. The
 * pattern therefore binds the mild word to S0 and the severe word to S4, in that
 * order, and `rejects the inverted wording` below proves it does.
 *
 * It is also checked BOTH WAYS, because "at least one correct statement" is not
 * the property we want either. A prompt may state the scale more than once —
 * `prompt-grok-mcp-instant.md` explains it in the schema notes and again in the
 * report headings — and a one-good-match test goes green when only one of them is
 * flipped. That state is worse than a prompt with no direction at all: the
 * reporter is handed two contradictory rules and picks one. So a correct
 * statement must be present AND no inverted statement may appear anywhere.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROMPT_DIR = "blind-tester";

/** Mild end of the scale, in the phrasings the prompts use. */
const MILD = String.raw`(?:cosmetic|mildest|trivial|minor)`;
/** Severe end of the scale. */
const SEVERE = String.raw`(?:blocking|most severe|critical|worst)`;
/** The punctuation that ties a label to its rung: `S0 (cosmetic`, `S0(cosmetic`, `S0 = cosmetic`. */
const BIND = String.raw`\s*[([:=-]?\s*`;
/**
 * Distance allowed between the two rungs. Wide enough for the separators actually
 * in use — `) through `, `)-`, `)–` — and narrow enough that two unrelated
 * mentions elsewhere in the file cannot pair up by accident.
 */
const GAP = String.raw`[\s\S]{0,24}?`;

/** The scale as it really is: S0 bound to the mild end, then S4 to the severe end. */
const STATES_DIRECTION = new RegExp(`S0${BIND}${MILD}${GAP}S4${BIND}${SEVERE}`, "i");

/**
 * The same shape with the ends swapped. Any occurrence is a defect on its own,
 * even in a file that also states the scale correctly somewhere else.
 */
const STATES_INVERTED = new RegExp(`S0${BIND}${SEVERE}${GAP}S4${BIND}${MILD}`, "i");

function promptFiles(): string[] {
  return readdirSync(PROMPT_DIR)
    .filter((name) => name.startsWith("prompt") && name.endsWith(".md"))
    .sort();
}

describe("player prompt severity direction", () => {
  it("finds the prompts at all", () => {
    // A rename that emptied this list would make every assertion below vacuous.
    expect(promptFiles().length).toBeGreaterThan(0);
  });

  it("states the scale direction wherever it asks for an S0-S4 severity", () => {
    const silent: string[] = [];
    const inverted: string[] = [];

    for (const name of promptFiles()) {
      const text = readFileSync(join(PROMPT_DIR, name), "utf8");
      // Only prompts that actually use the scale are in scope; a prompt that
      // never asks for a severity has nothing to get backwards.
      const usesScale = text.includes("S0") && text.includes("S4");
      if (!usesScale) continue;
      if (!STATES_DIRECTION.test(text)) silent.push(name);
      if (STATES_INVERTED.test(text)) inverted.push(name);
    }

    expect(
      silent,
      `These prompts ask for an S0-S4 severity without saying which end is severe, ` +
        `so a reporter arriving with the usual S1-is-critical convention will invert ` +
        `the scale and the doubling weight will rank their report backwards. Name the ` +
        `direction, e.g. "S0 (cosmetic) through S4 (blocking)".`,
    ).toEqual([]);

    expect(
      inverted,
      `These prompts state the S0-S4 scale BACKWARDS somewhere in the file. A prompt ` +
        `may explain the scale more than once, and one flipped explanation is enough ` +
        `to invert a reporter's severities even when another explanation is correct — ` +
        `contradictory guidance is worse than none. The scale ascends: S0 is mildest, ` +
        `S4 is blocking.`,
    ).toEqual([]);
  });

  it("rejects the inverted wording, so the guard above is not vacuous", () => {
    // The failure this whole file exists to prevent is a prompt that names both
    // ends and swaps them. A presence-only check accepts it — which would leave
    // Spark's reports ranked backwards with the regression green — so assert
    // directly that the pattern refuses it.
    expect(STATES_DIRECTION.test("severity S0 (blocking) through S4 (cosmetic)")).toBe(false);
    expect(STATES_DIRECTION.test("severity S0 (cosmetic) through S4 (blocking)")).toBe(true);
    // The phrasings actually shipped in blind-tester/ must all pass.
    expect(STATES_DIRECTION.test("severity S0 (mildest) through S4 (blocking)")).toBe(true);
    expect(STATES_DIRECTION.test("a severity S0(cosmetic)\u2013S4(blocking).")).toBe(true);
    // A file that merely mentions both words far apart is not a statement of direction.
    expect(
      STATES_DIRECTION.test("S0 is used for cosmetic things.\n\nSeparately, S4 means blocking."),
    ).toBe(false);

    // The inverted pattern is the mirror image, and must not fire on correct prose.
    expect(STATES_INVERTED.test("severity S0 (blocking) through S4 (cosmetic)")).toBe(true);
    expect(STATES_INVERTED.test("severity S0 (cosmetic) through S4 (blocking)")).toBe(false);
  });

  it("catches one flipped explanation in a prompt that also states the scale correctly", () => {
    // prompt-grok-mcp-instant.md explains the scale twice. Requiring only one good
    // match anywhere would pass this text, handing the reporter two opposite rules.
    const contradictory =
      "- `bugs`: severity S0 (blocking) through S4 (cosmetic).\n" +
      "5. Bugs or design flaws, with severity S0 (cosmetic) through S4 (blocking).";

    expect(STATES_DIRECTION.test(contradictory)).toBe(true); // the good half still matches
    expect(STATES_INVERTED.test(contradictory)).toBe(true); // and the bad half is caught
  });
});
