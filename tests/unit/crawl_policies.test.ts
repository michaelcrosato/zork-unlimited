import { describe, expect, it } from "vitest";
import { mulberry32 } from "../../src/core/rng.js";
import { makePolicy } from "../../src/crawl/policies.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";

const opt = (id: string, type = "LOOK"): RpgActionOption =>
  ({ id, command: id, action: { type } }) as unknown as RpgActionOption;
const ctx = (tried: string[] = []) => ({
  visitedRooms: new Set<string>(),
  triedActionIds: new Set(tried),
});

describe("crawl policies", () => {
  it("same seed ⇒ identical pick sequence; different seed ⇒ diverges", () => {
    const options = [opt("a"), opt("b"), opt("c"), opt("d")];
    const run = (seed: number) => {
      const p = makePolicy("random", mulberry32(seed));
      return Array.from({ length: 20 }, () => p.pick(options, ctx()).id).join("");
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it("coverage prefers untried MOVE options first, then any untried", () => {
    const options = [opt("look", "LOOK"), opt("go-n", "MOVE"), opt("take-x", "TAKE")];
    const p = makePolicy("coverage", mulberry32(1));
    expect(p.pick(options, ctx()).id).toBe("go-n");
    expect(p.pick(options, ctx(["go-n"])).id).not.toBe("go-n"); // untried non-MOVE next
    const allTried = ctx(["look", "go-n", "take-x"]);
    expect(options.map((o) => o.id)).toContain(p.pick(options, allTried).id); // falls back uniform
  });

  it("mixed is deterministic for a fixed seed", () => {
    const options = [opt("a"), opt("b", "MOVE"), opt("c")];
    const seq = (seed: number) => {
      const p = makePolicy("mixed", mulberry32(seed));
      return Array.from({ length: 30 }, () => p.pick(options, ctx()).id).join("");
    };
    expect(seq(7)).toBe(seq(7));
  });
});
