/**
 * Version-bump guard for the compact-payload legends (the blind-agent contract).
 *
 * The compact contexts are positional — [town_id, name, region, ...] — so a blind
 * playtester can only decode them through the `legend` field that rides on
 * session-creating responses. Two invariants keep that contract honest:
 *
 *   1. Every key the compact encoders emit must have a legend entry, so adding a
 *      new positional field without documenting it fails here (the `satisfies`
 *      clauses on the legends enforce the same at compile time).
 *   2. Every registered MCP tool must carry a real description — terse
 *      abbreviations ("Start OW.") regress the interface to unreadable.
 */
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createToolApi } from "../../src/mcp/tools.js";
import { TOOL_REGISTRATIONS } from "../../src/mcp/server.js";
import { OVERWORLD_COMPACT_LEGEND } from "../../src/world/compact_view.js";
import { RPG_COMPACT_LEGEND } from "../../src/mcp/compact_rpg_observation.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Response keys that are not part of the compact context itself. */
const SCALAR_CONTEXT_KEYS = new Set(["v", "time", "world"]);

function api() {
  return createToolApi({ root: ROOT });
}

function expectLegendCovers(legend: Record<string, string>, context: Record<string, unknown>) {
  const legendKeys = new Set(Object.keys(legend));
  for (const key of Object.keys(context)) {
    if (SCALAR_CONTEXT_KEYS.has(key)) continue;
    expect(legendKeys, `compact context key "${key}" has no legend entry`).toContain(key);
  }
}

describe("compact legends", () => {
  it("start_overworld carries a legend covering every compact context key", () => {
    const a = api();
    // Opt into every projection so the context carries its widest key set.
    const started = a.start_overworld({
      include_ids: true,
      include_route_options: true,
      include_world_name: true,
    });

    expect(started.legend).toBe(OVERWORLD_COMPACT_LEGEND);
    expectLegendCovers(started.legend!, started.context as Record<string, unknown>);
    for (const [key, text] of Object.entries(started.legend!)) {
      expect(typeof text, `legend entry "${key}"`).toBe("string");
      expect(text.length, `legend entry "${key}"`).toBeGreaterThan(10);
    }
    expect(started.legend?.quest_starts).toContain("start_overworld_session_quest");
    expect(started.legend?.quest_starts).toContain("approach_id");
  });

  it("describes unavailable jobs and optional aftermath without overstating either", () => {
    expect(OVERWORLD_COMPACT_LEGEND.hidden).toContain(
      "undiscovered jobs plus discovered, incomplete authored job scenes",
    );
    expect(OVERWORLD_COMPACT_LEGEND.hidden).toContain("no legal options currently available");
    expect(OVERWORLD_COMPACT_LEGEND.hidden).not.toContain("counts still undiscovered");

    expect(OVERWORLD_COMPACT_LEGEND.opportunity_leads).toContain(
      "do not create, replace, or activate a journey objective",
    );
    expect(OVERWORLD_COMPACT_LEGEND.opportunity_leads).toContain(
      "no choices, rewards, or outcomes are disclosed",
    );
    expect(OVERWORLD_COMPACT_LEGEND.opportunity_leads).not.toContain(
      "journey objective remains available",
    );
  });

  it("restore_overworld_session repeats the legend; per-action responses do not", () => {
    const a = api();
    const started = a.start_overworld();
    const exported = a.export_overworld_session({ session_id: started.session_id });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("expected export to succeed");

    const restored = a.restore_overworld_session({ snapshot: exported.snapshot });
    expect(restored.legend).toBe(OVERWORLD_COMPACT_LEGEND);
    expect("tutorial" in restored).toBe(false);
    expectLegendCovers(restored.legend!, restored.context as Record<string, unknown>);

    const reread = a.get_overworld_session_context({ session_id: started.session_id });
    expect("legend" in reread).toBe(false);
    const rested = a.rest_overworld_session({ session_id: started.session_id });
    expect("legend" in rested).toBe(false);
  });

  it("RPG session starts carry a legend covering every compact observation key", () => {
    const a = api();
    const started = a.start_world_quest({
      world_quest_id: "sunken_barrow",
      seed: 1,
      include_actions: true,
      include_context_version: true,
    });

    expect(started.legend).toBe(RPG_COMPACT_LEGEND);
    const legendKeys = new Set(Object.keys(started.legend!));
    for (const key of Object.keys(started.context)) {
      expect(legendKeys, `compact observation key "${key}" has no legend entry`).toContain(key);
    }
    // The one-time legend also decodes the step_action event tuples.
    expect(started.legend!.events).toContain("step_action");

    const fresh = a.new_game({ generate_rpg_seed: 7 });
    expect(fresh.legend).toBe(RPG_COMPACT_LEGEND);

    const save = a.save_game({ session_id: started.session_id });
    expect(save.ok).toBe(true);
    if (!save.ok) throw new Error("expected save to succeed");
    const reloaded = a.load_game({ save: save.save });
    expect(reloaded.legend).toBe(RPG_COMPACT_LEGEND);

    // Per-step payloads stay lean: no legend outside session creation.
    const stepped = a.step_action({
      session_id: started.session_id,
      action_id: a.list_legal_actions({ session_id: started.session_id }).actions[0] as string,
    });
    expect("legend" in stepped).toBe(false);
    const observed = a.get_observation({ session_id: started.session_id });
    expect("legend" in observed).toBe(false);
  });

  it("every registered MCP tool has an informative description", () => {
    expect(TOOL_REGISTRATIONS.length).toBeGreaterThanOrEqual(35);
    const names = TOOL_REGISTRATIONS.map((registration) => registration.name);
    expect(new Set(names).size).toBe(names.length);
    for (const { name, description } of TOOL_REGISTRATIONS) {
      expect(description.length, `tool "${name}" description too terse`).toBeGreaterThanOrEqual(15);
      expect(description.trim(), `tool "${name}" description is blank`).not.toBe("");
    }
  });
});
