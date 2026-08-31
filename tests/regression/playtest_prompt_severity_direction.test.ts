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
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROMPT_DIR = "blind-tester";

/** Mild end of the scale, in the phrasings the prompts use. */
const MILD = String.raw`(?:cosmetic|mildest|trivial|minor)`;
/** Severe end of the scale. */
const SEVERE = String.raw`(?:blocking|most severe|critical|worst)`;

/**
 * Names the ascending direction: S0 bound to a mild word, then S4 bound to a
 * severe word. The short gap absorbs the separators actually in use — `) through
 * (`, `)-(`, `)–(` — without letting two unrelated mentions elsewhere in the file
 * pair up by accident.
 */
const STATES_DIRECTION = new RegExp(
  String.raw`S0\s*[([:=-]?\s*${MILD}[\s\S]{0,24}?S4\s*[([:=-]?\s*${SEVERE}`,
  "i",
);

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
    const offenders: string[] = [];

    for (const name of promptFiles()) {
      const text = readFileSync(join(PROMPT_DIR, name), "utf8");
      // Only prompts that actually use the scale are in scope; a prompt that
      // never asks for a severity has nothing to get backwards.
      const usesScale = text.includes("S0") && text.includes("S4");
      if (!usesScale) continue;
      if (!STATES_DIRECTION.test(text)) offenders.push(name);
    }

    expect(
      offenders,
      `These prompts ask for an S0-S4 severity without saying which end is severe, ` +
        `so a reporter arriving with the usual S1-is-critical convention will invert ` +
        `the scale and the doubling weight will rank their report backwards. Name the ` +
        `direction, e.g. "S0 (cosmetic) through S4 (blocking)".`,
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
  });
});
