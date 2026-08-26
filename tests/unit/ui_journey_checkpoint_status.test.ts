import { describe, expect, it } from "vitest";

import { journeyNextPauseText } from "../../ui/src/journeyCheckpointStatus.js";

describe("human journey checkpoint status", () => {
  it("describes an upcoming choice as a safe journey break after an exact decision", () => {
    expect(
      journeyNextPauseText({
        status: "active",
        acceptedDecisions: 39,
        nextCheckpoint: 40,
      }),
    ).toBe("First safe break on or after decision 40");
  });

  it.each([40, 45])(
    "marks decision 40 passed without promising an interruption at active decision %i",
    (acceptedDecisions) => {
      expect(
        journeyNextPauseText({
          status: "active",
          acceptedDecisions,
          nextCheckpoint: 40,
        }),
      ).toBe("Decision 40 passed. Choice at next safe break.");
    },
  );

  it.each([
    {
      label: "a delayed checkpoint",
      acceptedDecisions: 41,
      nextCheckpoint: 40,
    },
    {
      label: "a pre-threshold goal pause",
      acceptedDecisions: 12,
      nextCheckpoint: 40,
    },
  ])(
    "describes $label as ready now rather than appointing it to the threshold",
    ({ acceptedDecisions, nextCheckpoint }) => {
      expect(
        journeyNextPauseText({
          status: "awaiting_choice",
          acceptedDecisions,
          nextCheckpoint,
        }),
      ).toBe("Journey choice ready now");
    },
  );

  it("describes the terminal state without a next checkpoint", () => {
    expect(
      journeyNextPauseText({
        status: "ended",
        acceptedDecisions: 40,
        nextCheckpoint: null,
      }),
    ).toBe("No further journey pause");
  });
});
