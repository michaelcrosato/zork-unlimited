/**
 * UI engine client (spec §13 Stage 5). Proves the browser GameSession drives the
 * SAME deterministic core through the structured API — no rule is reimplemented in
 * the view. Runs in Node (the client has no React, no Node-only APIs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { GameSession, detectMode } from "../../ui/src/engine.js";

const read = (p: string): string => readFileSync(p, "utf8");

describe("GameSession — mode detection + structured play", () => {
  it("detects all three modes", () => {
    expect(detectMode(read("content/cyoa/pack/watchtower_road.yaml"))).toBe("cyoa");
    expect(detectMode(read("content/parser/pack/sealed_crypt.yaml"))).toBe("parser");
    expect(detectMode(read("content/rpg/pack/sunken_barrow.yaml"))).toBe("rpg");
  });

  it("plays a CYOA route to an ending via choice ids", () => {
    const s = GameSession.start(read("content/cyoa/pack/watchtower_road.yaml"), 1);
    expect(s.mode).toBe("cyoa");
    const view = s.view();
    expect(view.choices.length).toBeGreaterThan(0);
    for (const id of ["go_west", "ford_brook", "cross_north", "slip_into_woods", "slip_away"]) {
      expect(s.choose(id).ok).toBe(true);
    }
    const end = s.view();
    expect(end.ended).toBe(true);
    expect(end.endingId).toBe("ending_escape");
  });

  it("rejects an illegal choice id without advancing", () => {
    const s = GameSession.start(read("content/cyoa/pack/watchtower_road.yaml"), 1);
    const before = s.view().stateHash;
    const out = s.choose("not_a_choice");
    expect(out.ok).toBe(false);
    expect(s.view().stateHash).toBe(before);
  });

  it("plays the RPG pack (combat + skill check) to victory and is deterministic", () => {
    const play = (): string => {
      const s = GameSession.start(read("content/rpg/pack/sunken_barrow.yaml"), 1);
      const byLabel = (needle: string): string | undefined => s.view().choices.find((c) => c.label.includes(needle))?.id;
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
        const use = s.view().choices.find((c) => c.label.includes("on stone slab"));
        const down = s.view().choices.find((c) => c.label === "go down");
        if (down) break;
        if (use) s.choose(use.id);
        else break;
      }
      const down = s.view().choices.find((c) => c.label === "go down");
      expect(down).toBeTruthy();
      s.choose(down!.id);
      const v = s.view();
      expect(v.ended).toBe(true);
      expect(v.endingId).toBe("ending_victory");
      return v.stateHash;
    };
    expect(play()).toBe(play()); // identical final hash — determinism through the UI client
  });
});
