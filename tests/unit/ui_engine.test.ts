/**
 * UI engine client (spec §13 Stage 5). Proves the browser GameSession drives the
 * SAME deterministic core through the structured API — no rule is reimplemented in
 * the view. Runs in Node (the client has no React, no Node-only APIs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GameSession, isRpgSource } from "../../ui/src/engine.js";

const read = (p: string): string => readFileSync(p, "utf8");

describe("GameSession — RPG-only structured play", () => {
  it("accepts RPG sources and rejects legacy pack shapes", () => {
    expect(isRpgSource(read("content/rpg/pack/sunken_barrow.yaml"))).toBe(true);
    expect(isRpgSource(read("content/cyoa/pack/watchtower_road.yaml"))).toBe(false);
    expect(isRpgSource(read("content/parser/pack/sealed_crypt.yaml"))).toBe(false);
    expect(() => GameSession.start(read("content/cyoa/pack/watchtower_road.yaml"), 1)).toThrow(
      /RPG-only/i,
    );
  });

  it("rejects an illegal action id without advancing", () => {
    const s = GameSession.start(read("content/rpg/pack/sunken_barrow.yaml"), 1);
    const before = s.view().stateHash;
    const out = s.choose("not_an_action");
    expect(out.ok).toBe(false);
    expect(s.view().stateHash).toBe(before);
  });

  it("reset restores the deterministic initial RPG state", () => {
    const s = GameSession.start(read("content/rpg/pack/sunken_barrow.yaml"), 1);
    const initial = s.view().stateHash;
    const down = s.view().choices.find((c) => c.label === "go down");
    expect(down).toBeTruthy();
    expect(s.choose(down!.id).ok).toBe(true);
    expect(s.view().stateHash).not.toBe(initial);
    s.reset();
    expect(s.view().stateHash).toBe(initial);
  });

  it("plays the RPG pack (combat + skill check) to victory and is deterministic", () => {
    const play = (): string => {
      const s = GameSession.start(read("content/rpg/pack/sunken_barrow.yaml"), 1);
      const byLabel = (needle: string): string | undefined =>
        s.view().choices.find((c) => c.label.includes(needle))?.id;
      expect(s.choose(byLabel("go down")!).ok).toBe(true);
      expect(s.choose(byLabel("take iron bar")!).ok).toBe(true);
      expect(s.choose(byLabel("go north")!).ok).toBe(true);
      for (let i = 0; i < 40 && !s.view().ended; i++) {
        const atk = s.view().choices.find((c) => c.label.startsWith("attack"));
        if (!atk) break;
        s.choose(atk.id);
      }
      expect(s.choose(byLabel("go east")!).ok).toBe(true);
      for (let i = 0; i < 40; i++) {
        // The slab USE now reads with its natural verb ("lever stone slab with iron
        // bar"), not the generic "use ... on stone slab" (bug_0078 command_verb).
        const use = s.view().choices.find((c) => c.label.startsWith("lever"));
        const down = s.view().choices.find((c) => c.label === "go down");
        if (down) break;
        if (use) s.choose(use.id);
        else break;
      }
      const down = s.view().choices.find((c) => c.label === "go down");
      expect(down).toBeTruthy();
      s.choose(down!.id);
      // The win turns on claiming the circlet, not on entering the chamber (bug_0056).
      expect(s.view().ended).toBe(false);
      const take = s
        .view()
        .choices.find((c) => c.label.includes("take") && c.label.includes("circlet"));
      expect(take).toBeTruthy();
      s.choose(take!.id);
      const v = s.view();
      expect(v.ended).toBe(true);
      expect(v.endingId).toBe("ending_victory");
      return v.stateHash;
    };
    expect(play()).toBe(play()); // identical final hash — determinism through the UI client
  });
});
