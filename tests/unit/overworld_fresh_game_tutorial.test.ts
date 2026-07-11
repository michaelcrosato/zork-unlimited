import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TOOL_REGISTRATIONS } from "../../src/mcp/server.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { FRESH_GAME_TUTORIAL, freshGameTutorial } from "../../src/world/fresh_game_tutorial.js";
import { INITIAL_JOURNEY_GOAL } from "../../src/world/journey_contract.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function api() {
  return createToolApi({ root: ROOT });
}

describe("fresh-game tutorial", () => {
  it("is a compact, immutable, spoiler-free orientation for the opening loop", () => {
    expect(Object.isFrozen(FRESH_GAME_TUTORIAL)).toBe(true);
    expect(Object.isFrozen(FRESH_GAME_TUTORIAL.steps)).toBe(true);
    expect(FRESH_GAME_TUTORIAL.steps).toHaveLength(4);
    expect(FRESH_GAME_TUTORIAL.start_label).toBe("Explore Albany");
    expect(FRESH_GAME_TUTORIAL.goal).toBe(INITIAL_JOURNEY_GOAL.text);

    const copy = [
      FRESH_GAME_TUTORIAL.goal,
      ...FRESH_GAME_TUTORIAL.steps.flatMap((step) => [step.title, step.text]),
    ].join(" ");
    expect(copy.length).toBeLessThanOrEqual(720);
    expect(copy).toMatch(/local lead.*Albany/is);
    expect(copy).toMatch(/supplies.*fatigue/is);
    expect(copy).toMatch(/scout.*talk.*investigate.*explore/is);
    expect(copy).toMatch(/local area.*roads.*rest.*resupply/is);
    expect(copy).toMatch(/journal.*save.*export.*resume/is);
    expect(copy).toMatch(/40.*80.*every 40/is);
    expect(copy).toMatch(/completing the goal.*sooner/is);
    expect(copy).not.toMatch(/wolf_winter|world_quest_id|session_id|mcp__/i);
  });

  it("clones the canonical payload so fresh sessions cannot mutate one another", () => {
    const first = freshGameTutorial();
    const second = freshGameTutorial();

    expect(first).toEqual(FRESH_GAME_TUTORIAL);
    expect(second).toEqual(FRESH_GAME_TUTORIAL);
    expect(first).not.toBe(second);
    expect(first.steps).not.toBe(second.steps);
    expect(first.steps[0]).not.toBe(second.steps[0]);

    (first.steps as unknown as { text: string }[])[0]!.text = "mutated response";
    expect(second.steps[0]?.text).toBe(FRESH_GAME_TUTORIAL.steps[0]?.text);
  });

  it("appears on every compact or verbose fresh start and nowhere in resumed play", () => {
    const a = api();
    const compact = a.start_overworld();
    const verbose = a.start_overworld({ compact_context: false });
    const another = a.start_overworld();

    expect(compact.tutorial).toEqual(FRESH_GAME_TUTORIAL);
    expect(verbose.tutorial).toEqual(FRESH_GAME_TUTORIAL);
    expect(another.tutorial).toEqual(FRESH_GAME_TUTORIAL);
    expect(compact.tutorial).not.toBe(another.tutorial);

    const exported = a.export_overworld_session({ session_id: compact.session_id });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error("expected export to succeed");
    expect("tutorial" in exported).toBe(false);
    expect("tutorial" in exported.snapshot).toBe(false);

    const restored = a.restore_overworld_session({ snapshot: exported.snapshot });
    expect(restored.snapshot_hash).toBe(compact.snapshot_hash);
    expect("tutorial" in restored).toBe(false);

    const reread = a.get_overworld_session_context({ session_id: compact.session_id });
    expect("tutorial" in reread).toBe(false);
    const rested = a.rest_overworld_session({ session_id: compact.session_id });
    expect("tutorial" in rested).toBe(false);
  });

  it("describes the one-time fresh-start contract at the MCP boundary", () => {
    const start = TOOL_REGISTRATIONS.find(
      (registration) => registration.name === "start_overworld",
    );
    const restore = TOOL_REGISTRATIONS.find(
      (registration) => registration.name === "restore_overworld_session",
    );

    expect(start?.description).toMatch(/fresh.*tutorial/i);
    expect(restore?.description).toMatch(/without replaying.*tutorial/i);
  });
});
