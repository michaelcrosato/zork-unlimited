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

  it("renders the overworld: entering the world, an action's journal + discoveries, quest handoff", () => {
    const start = at(
      "start_overworld",
      {},
      JSON.stringify({
        session_id: "o1",
        context: {
          here: ["colonie_town", "Colonie town", "Capital / Mohawk", null, null],
          time: "Day 1, 09:41",
        },
      }),
    );
    expect(start).toContain("enter the world — Colonie town, Capital / Mohawk");
    expect(start).toContain("Day 1, 09:41");

    const scout = at(
      "scout_overworld_session_poi",
      { poi_id: "notice_hall" },
      JSON.stringify({
        m: 25,
        entry: ["poi", "Scouted the Notice Hall", "Day 1, 10:06"],
        text: "The marked board carries a winter-relief lead from the western hills.",
        quests: [["wolf_winter", "The Wolf-Winter"]],
      }),
    );
    expect(scout).toContain("Scouted the Notice Hall");
    expect(scout).toContain("winter-relief lead from the western hills");
    expect(scout).toContain("found quest lead: The Wolf-Winter");

    const travel = at(
      "travel_overworld_session",
      { destination_town_id: "albany_city" },
      JSON.stringify({
        travel: [
          "road_albany_colonie",
          "colonie_town",
          "albany_city",
          6,
          0,
          1,
          "road_event_albany_colonie",
          "low",
          "Thruway shoulder flare-up",
          "State-police flares mark a jackknifed truck narrowing the shoulder.",
        ],
        context: { pending_road: { id: "enc1" } },
      }),
    );
    expect(travel).toContain("travel  [+6m]");
    expect(travel).toContain("Thruway shoulder flare-up (risk low)");
    expect(travel).toContain("jackknifed truck narrowing the shoulder");
    expect(travel).toContain("⚠ road encounter");

    const passage = at(
      "follow_overworld_session_goal",
      {},
      JSON.stringify({
        passage: {
          destination: "Queensbury town",
          stopped_at: "Saratoga Springs city",
          stop_reason: "road_encounter",
          minutes: [32, 0, 32],
          supplies: [1, 5],
          fatigue: [1, 1],
          travel_condition: "ready",
          legs: [
            [
              "road_albany_saratoga",
              "albany_city",
              "saratoga_springs_city",
              32,
              1,
              1,
              "relief_line",
              "low",
              "The northbound relief line",
              "Wardens and relief wagons mark the road north.",
            ],
          ],
        },
      }),
    );
    expect(passage).toContain("goal passage → Queensbury town  [+32m]");
    expect(passage).toContain("stopped at Saratoga Springs city (road_encounter)");
    expect(passage).toContain("The northbound relief line (risk low)");
    expect(passage).toContain("Wardens and relief wagons mark the road north.");
    expect(passage).toContain("⚠ road encounter");

    const resolvedRoad = at(
      "resolve_overworld_session_road_encounter",
      { strategy: "assist_travelers" },
      JSON.stringify({
        m: 40,
        entry: ["road", "Help resolve it: Thruway shoulder flare-up", "Day 1, 10:52"],
        text: "State-police flares mark a jackknifed truck; you spend stores and help clear the shoulder.",
      }),
    );
    expect(resolvedRoad).toContain("Help resolve it: Thruway shoulder flare-up");
    expect(resolvedRoad).toContain("jackknifed truck");

    const enter = at(
      "start_overworld_session_quest",
      { quest_id: "wolf_winter" },
      JSON.stringify({
        ok: true,
        quest: { title: "The Wolf-Winter" },
        rpg_session_id: "r2",
        rpg_session: {
          context: {
            here: ["yard", "The Steading Yard"],
            text: "A lone hill-steading in the black of winter.",
          },
        },
      }),
    );
    expect(enter).toContain("enter quest: The Wolf-Winter");
    expect(enter).toContain("The Steading Yard");
    expect(enter).toContain("black of winter");
  });

  it("falls back to a trimmed raw dump on non-JSON or error bodies", () => {
    const out = at("step_action", {}, "Error: boom", true);
    expect(out).toContain("✗ ERROR");
    expect(out).toContain("Error: boom");
  });
});
