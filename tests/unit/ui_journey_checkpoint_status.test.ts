import { describe, expect, it } from "vitest";

import { journeyNextPauseText } from "../../ui/src/journeyCheckpointStatus.js";

describe("human journey checkpoint status", () => {
  it("describes an upcoming checkpoint as a threshold followed by its first safe break", () => {
    expect(
      journeyNextPauseText({
        status: "active",
        acceptedDecisions: 39,
        nextCheckpoint: 40,
      }),
    ).toBe("Checkpoint threshold 40; choice appears at the first safe break at or after it.");
  });

  it.each([40, 45])(
    "marks checkpoint 40 due without promising an interruption at active decision %i",
    (acceptedDecisions) => {
      expect(
        journeyNextPauseText({
          status: "active",
          acceptedDecisions,
          nextCheckpoint: 40,
        }),
      ).toBe("Checkpoint 40 is due; choice appears at the first safe break.");
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
      ).toBe("A choice is ready now.");
    },
  );

  it("describes the terminal state without a next checkpoint", () => {
    expect(
      journeyNextPauseText({
        status: "ended",
        acceptedDecisions: 40,
        nextCheckpoint: null,
      }),
    ).toBe("No further checkpoint");
  });
});
