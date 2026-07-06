import { describe, expect, it } from "vitest";
import {
  parseRoadJournalId,
  parseServiceJournalId,
  parseTimeLabel,
  roadResolutionKey,
  timeLabel,
} from "../../src/world/session_journal_codec.js";

describe("overworld session journal codec", () => {
  it("round-trips compact overworld time labels", () => {
    expect(timeLabel(8 * 60)).toBe("Day 1, 08:00");
    expect(timeLabel(1440 + 23 * 60 + 59)).toBe("Day 2, 23:59");

    expect(parseTimeLabel("Day 1, 08:00")).toBe(8 * 60);
    expect(parseTimeLabel("Day 2, 23:59")).toBe(1440 + 23 * 60 + 59);
  });

  it("rejects malformed journal time labels", () => {
    expect(() => parseTimeLabel("Day 0, 08:00")).toThrow(/malformed journal timestamp/);
    expect(() => parseTimeLabel("Day 1, 24:00")).toThrow(/malformed journal timestamp/);
    expect(() => parseTimeLabel("Day 1, 08:60")).toThrow(/malformed journal timestamp/);
  });

  it("parses road journal ids and derives replay keys", () => {
    const parsed = parseRoadJournalId("road:albany-to-kingston:615:cautious_scout");

    expect(parsed).toEqual({
      edgeId: "albany-to-kingston",
      arrivedAt: 615,
      strategy: "cautious_scout",
    });
    expect(roadResolutionKey(parsed)).toBe("albany-to-kingston@615");
  });

  it("rejects malformed road journal ids", () => {
    expect(() => parseRoadJournalId("road:albany-to-kingston:cautious_scout")).toThrow(
      /must match/,
    );
    expect(() => parseRoadJournalId("road:albany-to-kingston:615:reckless")).toThrow(
      /unknown strategy/,
    );
  });

  it("parses service journal ids", () => {
    expect(parseServiceJournalId("service:rest:720")).toEqual({
      action: "rest",
      recordedAt: 720,
    });
    expect(parseServiceJournalId("service:resupply:900")).toEqual({
      action: "resupply",
      recordedAt: 900,
    });
  });

  it("rejects malformed service journal ids", () => {
    expect(() => parseServiceJournalId("service:travel:720")).toThrow(/must match/);
    expect(() => parseServiceJournalId("service:rest:now")).toThrow(/must match/);
  });
});
