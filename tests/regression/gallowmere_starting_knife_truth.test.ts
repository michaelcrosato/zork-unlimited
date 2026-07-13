/**
 * Regression for bug_0516 — two independent pure players trusted the opening
 * claim that their hunting-knife was already at their belt, then discovered an
 * empty inventory after leaving. The knife is the hunter's mandatory tool, not a
 * zero-payoff pickup: every human and MCP surface must start with it as real gear.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import { compactText } from "../../src/mcp/compact_truncation.js";
import { COMPACT_DESCRIPTION_CHAR_LIMIT } from "../../src/mcp/compact_rpg_observation.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { GameSession } from "../../ui/src/engine.js";

const SOURCE_PATH = "content/rpg/quests/gallowmere.yaml";
const SOURCE = readFileSync(SOURCE_PATH, "utf8");
const loaded = loadRpgSourceFile(SOURCE_PATH);
if (!loaded.ok) throw new Error("gallowmere must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const rules = buildRpgRules(index);

type CompactContext = {
  here: readonly [string, string];
  text: string;
  inv?: string[];
  objects?: string[];
  actions?: string[];
  blocked?: Array<readonly [string, string]>;
};

function idsAt(state: ReturnType<typeof initStateForRpgPack>): string[] {
  return enumerateRpgActions(index, state).map((option) => option.id);
}

describe("bug_0516 — Gallowmere starts with its promised hunting-knife", () => {
  it("models the knife as real, non-droppable starting gear instead of room loot", () => {
    const knife = pack.objects.find((object) => object.id === "hunting_knife");
    const edge = pack.rooms.find((room) => room.id === "moor_edge");
    expect(knife).toMatchObject({ held: true, takeable: false });
    expect(edge?.objects).not.toContain("hunting_knife");
    expect(edge?.variants ?? []).toEqual([]);

    const state = initStateForRpgPack(index, 2218);
    const observation = buildRpgObservation(index, state);
    const actions = idsAt(state);
    expect(state.inventory).toEqual(["hunting_knife"]);
    expect(observation.inventory).toEqual(["hunting_knife"]);
    expect(observation.visible_objects.map((object) => object.id)).not.toContain("hunting_knife");
    expect(actions).toContain("examine_hunting_knife");
    expect(actions).not.toContain("take_hunting_knife");
    expect(actions).not.toContain("drop_hunting_knife");
    expect(rules.legalActions(state)).not.toContainEqual({
      type: "TAKE",
      item: "hunting_knife",
    });
  });

  it("gives UI, full MCP, and compact MCP the same truthful opening state", () => {
    const ui = GameSession.start(SOURCE, 2218);
    const human = ui.view();
    const api = createToolApi({ root: process.cwd() });
    const full = api.start_world_quest({
      world_quest_id: "gallowmere",
      seed: 2218,
      compact_observation: false,
    });
    const compact = api.start_world_quest({
      world_quest_id: "gallowmere",
      seed: 2218,
      hide_graph: true,
      compact_observation: true,
      include_actions: true,
    }) as unknown as { context: CompactContext };

    expect(human.text).toMatch(/hunting-knife is secured at your belt/i);
    expect(human.text).toMatch(/bothy[^]*west[^]*path[^]*north/i);
    expect(human.inventory).toEqual(["hunting_knife"]);
    expect(human.choices.map((choice) => choice.id)).toContain("examine_hunting_knife");
    expect(human.choices.map((choice) => choice.id)).not.toEqual(
      expect.arrayContaining(["take_hunting_knife", "drop_hunting_knife"]),
    );

    expect(full.observation.description).toBe(human.text);
    expect(full.observation.inventory).toEqual(human.inventory);
    expect(full.observation.available_actions.map((choice) => choice.id)).toEqual(
      human.choices.map((choice) => choice.id),
    );
    expect(compact.context.text).toBe(human.text.trimEnd());
    expect(compact.context.inv).toEqual(human.inventory);
    expect(compact.context.objects ?? []).not.toContain("hunting_knife");
    expect(compact.context.actions).toEqual(human.choices.map((choice) => choice.id));
    expect(compact.context.text).toBe(
      compactText(human.text.trimEnd(), COMPACT_DESCRIPTION_CHAR_LIMIT),
    );
    expect(compact.context.text).not.toMatch(/\.\.\.\(\+\d+ chars\)/);
  });

  it("carries the knife to both tool checks without a pickup or recovery detour", () => {
    const ui = GameSession.start(SOURCE, 2218);
    expect(ui.choose("go_north").ok).toBe(true);
    expect(ui.choose("go_east").ok).toBe(true);
    expect(ui.view().inventory).toEqual(["hunting_knife"]);
    expect(ui.view().choices.map((choice) => choice.id)).toContain(
      "use_hunting_knife_on_spoor_ground",
    );

    expect(ui.choose("go_west").ok).toBe(true);
    expect(ui.choose("go_north").ok).toBe(true);
    expect(ui.view().inventory).toEqual(["hunting_knife"]);
    expect(ui.view().choices.map((choice) => choice.id)).toContain(
      "use_hunting_knife_on_wind_stone",
    );
    expect(
      ui
        .view()
        .facts.some(
          (fact) => fact.startsWith("blocked: north — ") && /read(?:ing)? the wind/i.test(fact),
        ),
    ).toBe(true);
  });

  it("keeps Gallowmere's score, combat contract, and validator green", () => {
    expect(pack.meta.max_score).toBe(50);
    expect(pack.meta.vars_init).toMatchObject({ hp: 24, attack: 4, defense: 2 });
    expect(pack.meta.combat_guaranteed).toBe(true);
    const report = validateRpg(pack);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
