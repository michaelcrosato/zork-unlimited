import { describe, expect, it } from "vitest";
import { compareCaseFoldedCodeUnits, compareCodeUnits } from "../../src/world/string_order.js";

/**
 * bug_0608 — the world layer ordered roads, areas, characters, jobs and snapshot map
 * keys with bare `localeCompare`, so the order a blind agent navigates by index (and the
 * snapshot hash built from sorted map keys) depended on the host's ICU locale. The two
 * comparators here are pure functions of code units: the same order on every host.
 */
describe("compareCodeUnits", () => {
  it("orders by UTF-16 code units, so uppercase sorts before lowercase", () => {
    expect(["b", "B", "a", "A"].sort(compareCodeUnits)).toEqual(["A", "B", "a", "b"]);
  });

  it("does not apply Czech digraph or Lithuanian letter tailoring (bug_0608 witnesses)", () => {
    expect(["cicero_town", "cheektowaga_town"].sort(compareCodeUnits)).toEqual([
      "cheektowaga_town",
      "cicero_town",
    ]);
    expect(["Yonkers city", "New Rochelle city"].sort(compareCodeUnits)).toEqual([
      "New Rochelle city",
      "Yonkers city",
    ]);
  });

  it("is a total order: equal strings compare 0 and the sign flips with the arguments", () => {
    expect(compareCodeUnits("x", "x")).toBe(0);
    expect(Math.sign(compareCodeUnits("a", "b"))).toBe(-Math.sign(compareCodeUnits("b", "a")));
  });
});

describe("compareCaseFoldedCodeUnits", () => {
  it("compares ASCII case-insensitively first, which keeps today's English order for the one shipped case clash", () => {
    // A shipped event title ("charter backlog", lowercase continuation) and a job title
    // ("Civic Ledger Run", Title Case) tie on their area; English collation put the event
    // first and code-unit order alone would put the job first.
    const event = "Airmont village Civic Center: charter backlog";
    const job = "Airmont village Civic Center: Civic Ledger Run";
    expect([job, event].sort(compareCaseFoldedCodeUnits)).toEqual([event, job]);
  });

  it("falls back to code-unit order so strings differing only by case still have a fixed order", () => {
    expect(["b", "B", "a", "A"].sort(compareCaseFoldedCodeUnits)).toEqual(["A", "a", "B", "b"]);
    expect(compareCaseFoldedCodeUnits("Ab", "ab")).toBeLessThan(0);
  });

  it("folds only ASCII letters, so it stays locale-independent for non-Latin input", () => {
    expect(["É", "e", "E"].sort(compareCaseFoldedCodeUnits)).toEqual(["E", "e", "É"]);
  });
});
