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
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PROMPT_DIR = "blind-tester";

/** Names the ascending direction in any of the phrasings the prompts use. */
const STATES_DIRECTION = /cosmetic|blocking|mildest|most severe|trivial/i;

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
});
