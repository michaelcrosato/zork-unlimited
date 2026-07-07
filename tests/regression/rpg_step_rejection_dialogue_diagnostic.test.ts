/**
 * bug_0494 — the mid-dialogue rejection names the dialogue modality.
 *
 * Found by the 2026-07-07 overworld blind playtest (wolf_winter via the Albany
 * bridge): a player acting from an action menu fetched BEFORE talking to old
 * Cade stepped `read_day_book`, got the bare "That action is not available
 * right now.", and burned three calls guessing why. Dialogue is modal — only
 * the current node's topics are legal — but that constraint was invisible at
 * the exact moment it bites. The MCP rejection now says so; every other
 * unknown-id rejection keeps the terse default (transcript token economy).
 */
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

type StepResult = { ok: boolean; rejection_reason?: string };

describe("bug_0494 — mid-dialogue rejection diagnostic", () => {
  it("explains WHY a stale-menu action id is illegal mid-conversation, tersely otherwise", () => {
    const a = createToolApi({ root: process.cwd() });
    const start = a.start_world_quest({ world_quest_id: "wolf_winter", seed: 7 });
    const sid = start.session_id;
    const step = (action_id: string): StepResult =>
      a.step_action({ session_id: sid, action_id }) as unknown as StepResult;

    // Walk to old Cade and start the conversation (stable wolf_winter opening).
    expect(step("go_north").ok).toBe(true);
    expect(step("talk_houndsman").ok).toBe(true);

    // The exact blind-playtest miss: read_day_book from a pre-TALK menu.
    const rejected = step("read_day_book");
    expect(rejected.ok).toBe(false);
    expect(rejected.rejection_reason).toContain("mid-conversation");
    expect(rejected.rejection_reason).toContain("ask topics");

    // Ending the conversation restores the room actions — the id was fine, the
    // MOMENT was wrong, which is exactly what the diagnostic must convey.
    expect(step("ask_leave_cade").ok).toBe(true);
    expect(step("read_day_book").ok).toBe(true);

    // Outside dialogue the terse default is unchanged (pinned elsewhere too).
    const missing = step("missing");
    expect(missing.ok).toBe(false);
    expect(missing.rejection_reason).toBe("That action is not available right now.");
  });
});
