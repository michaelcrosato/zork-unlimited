/**
 * bug_0494 / bug_0512 — explanation alone did not fix modal dialogue friction.
 *
 * A fresh pure player again tried the already-visible day-book and a room move
 * while talking to Cade. Those natural actions now stay legal: a same-room read
 * preserves the offered topics, while leaving ends the exchange atomically. A
 * genuinely unknown id still rejects without state or journey progress.
 */
import { describe, expect, it } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";

type StepResult = {
  ok: boolean;
  rejection_reason?: string;
  state_hash: string;
  journeyDecision: { countsTowardJourney: boolean; reason: string };
  events: Array<{ type: string; text?: string }>;
  observation: { room: string; dialogue: unknown };
};

describe("bug_0512 — dialogue is an interruptible exchange", () => {
  it("reads or moves in one accepted step, while a truly unknown id remains a no-op", () => {
    const api = createToolApi({ root: process.cwd() });
    const start = api.start_world_quest({
      world_quest_id: "wolf_winter",
      seed: 7,
      compact_observation: false,
    });
    const sid = start.session_id;
    const step = (action_id: string): StepResult =>
      api.step_action({
        session_id: sid,
        action_id,
        compact_observation: false,
        compact_events: false,
      }) as unknown as StepResult;

    expect(step("go_north").ok).toBe(true);
    const talking = step("talk_houndsman");
    expect(talking.ok).toBe(true);
    expect(talking.observation.dialogue).not.toBeNull();

    const listed = api.list_legal_actions({ session_id: sid, compact_actions: false }).actions as {
      id: string;
    }[];
    expect(listed.map((action) => action.id)).toEqual(
      expect.arrayContaining(["ask_wolves", "ask_byre", "read_day_book", "go_south"]),
    );

    const read = step("read_day_book");
    expect(read.ok).toBe(true);
    expect(read.rejection_reason).toBeUndefined();
    expect(read.state_hash).not.toBe(talking.state_hash);
    expect(read.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "stateful_clue",
    });
    expect(read.observation.room).toBe("byre_yard");
    expect(read.observation.dialogue).not.toBeNull();
    expect(read.events.map((event) => event.text ?? "").join(" ")).toMatch(/last tally/i);

    const followup = step("ask_byre");
    expect(followup.ok).toBe(true);
    expect(followup.journeyDecision).toEqual({
      countsTowardJourney: true,
      reason: "substantive_dialogue",
    });
    expect(followup.observation.dialogue).not.toBeNull();
    const beforeUnknown = step("missing");
    expect(beforeUnknown.ok).toBe(false);
    expect(beforeUnknown.rejection_reason).toBe("That action is not available right now.");
    expect(beforeUnknown.journeyDecision).toEqual({
      countsTowardJourney: false,
      reason: "rejected",
    });
    expect(beforeUnknown.observation.dialogue).not.toBeNull();

    const moved = step("go_south");
    expect(moved.ok).toBe(true);
    expect(moved.journeyDecision).toEqual({ countsTowardJourney: true, reason: "movement" });
    expect(moved.observation.room).toBe("steading_yard");
    expect(moved.observation.dialogue).toBeNull();
  });
});
