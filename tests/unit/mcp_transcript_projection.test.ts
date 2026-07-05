import { describe, expect, it } from "vitest";

import type { GameEvent } from "../../src/core/events.js";
import {
  playerVisibleEvents,
  rpgStepEvents,
  transcriptEventVersion,
} from "../../src/mcp/transcript_projection.js";
import { RPG_COMPACT_EVENT_VERSION } from "../../src/mcp/compact_rpg_event.js";

describe("MCP transcript projection", () => {
  it("removes internal state-change events from player-facing streams", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "set_var", name: "__enemy_hp_wight", value: 3 },
      { type: "state_change", effect: "set_flag", flag: "__dlg_shade" },
      { type: "state_change", effect: "set_flag", flag: "door_open" },
      { type: "narration", text: "The door opens." },
    ];

    expect(playerVisibleEvents(events)).toEqual([
      { type: "state_change", effect: "set_flag", flag: "door_open" },
      { type: "narration", text: "The door opens." },
    ]);
  });

  it("emits compact event versions only when compact event rows are visible", () => {
    expect(transcriptEventVersion({ session_id: "sess_1", compact_events: true })).toEqual({
      event_v: RPG_COMPACT_EVENT_VERSION,
    });
    expect(
      transcriptEventVersion({
        session_id: "sess_1",
        compact_events: true,
        compact_turns: true,
      }),
    ).toEqual({});
    expect(
      transcriptEventVersion({
        session_id: "sess_1",
        compact_events: true,
        summary_only: true,
      }),
    ).toEqual({});
  });

  it("applies the same internal-event filter to compact step events", () => {
    const events: GameEvent[] = [
      { type: "state_change", effect: "set_var", name: "__enemy_hp_wight", value: 3 },
      { type: "narration", text: "You strike." },
    ];

    expect(rpgStepEvents(events, { compact_events: true })).toEqual([["n", "You strike."]]);
  });
});
