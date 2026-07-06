/**
 * Spectate formatting — the human-readable play-by-play must surface the game's
 * generated content (narration, die rolls, dialogue, scene moves, endings), not
 * just echo the LLM's action. Pure, deterministic (injected clock).
 */
import { describe, expect, it } from "vitest";
import { formatSpectateEntry } from "../../src/mcp/spectate.js";

const NOW = new Date("2026-07-06T23:40:33.000Z");
const at = (name: string, args: unknown, body: string, isError = false): string =>
  formatSpectateEntry(name, args, body, isError, NOW);

describe("formatSpectateEntry", () => {
  it("renders a step's narration (die roll + prose) and scene move as readable lines", () => {
    const body = JSON.stringify({
      ok: true,
      events: [
        ["n", "craft check: d20 15 + 3 = 18 vs 9 — success."],
        ["s", "f", "rack_freed"],
        ["m", "keeper_lodge", "weir_head"],
        ["n", "You wedge the weir-iron behind the jam and the drift comes away in a rush."],
      ],
      context: { here: ["weir_head", "The Weir-Head"], text: "The head of the weir." },
      state_hash: "abc",
    });
    const out = at("step_action", { action_id: "use_weir_iron_on_head_rack" }, body);
    expect(out).toContain("use_weir_iron_on_head_rack"); // the LLM's action
    expect(out).toContain("craft check: d20 15 + 3 = 18 vs 9 — success."); // die roll (game)
    expect(out).toContain("You wedge the weir-iron behind the jam"); // narration prose (game)
    expect(out).toContain("→ The Weir-Head"); // scene move surfaced
    expect(out).not.toContain('"state_hash"'); // not a raw JSON dump
    expect(out).not.toContain('["n"'); // tuples decoded, not shown raw
  });

  it("shows the opening scene text on start", () => {
    const body = JSON.stringify({
      session_id: "r1",
      context: { here: ["keeper_lodge", "The Keeper's Lodge"], text: "A stone hut by the weir." },
      world_quest_id: "breaking_weir",
      state_hash: "h",
    });
    const out = at("start_world_quest", { world_quest_id: "breaking_weir", seed: 7 }, body);
    expect(out).toContain("start breaking_weir (seed 7)");
    expect(out).toContain("The Keeper's Lodge");
    expect(out).toContain("A stone hut by the weir.");
  });

  it("surfaces a rejected action and an ending", () => {
    const rej = at(
      "step_action",
      { action_id: "ask_ask_walk" },
      JSON.stringify({ ok: false, rejection_reason: "That action is not available right now." }),
    );
    expect(rej).toContain("✗ That action is not available right now.");

    const end = at(
      "step_action",
      { action_id: "go_north" },
      JSON.stringify({
        ok: true,
        events: [["e", "ending_held"]],
        context: { here: ["valley_held", "The Weir Holds"], ended: true },
      }),
    );
    expect(end).toContain("ending: ending_held");
    expect(end).toContain("THE END");
  });

  it("renders the action menu compactly", () => {
    const out = at(
      "list_legal_actions",
      {},
      JSON.stringify({
        actions: [
          { id: "go_north", command: "go north" },
          { id: "take_life_line", command: "take life-line" },
        ],
        state_hash: "h",
      }),
    );
    expect(out).toContain("options (2)");
    expect(out).toContain("go north");
    expect(out).toContain("take life-line");
  });

  it("falls back to a trimmed raw dump on non-JSON or error bodies", () => {
    const out = at("step_action", {}, "Error: boom", true);
    expect(out).toContain("✗ ERROR");
    expect(out).toContain("Error: boom");
  });
});
