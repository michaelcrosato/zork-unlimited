import { describe, it, expect, vi } from "vitest";
import { assertTraceMode } from "../../src/trace/replay.js";
import { SAVE_MODE, SaveIntegrityError } from "../../src/persist/save_load.js";
import * as integrity from "../../src/trace/integrity.js";

describe("assertTraceMode", () => {
  it("throws SaveIntegrityError if trace mode is not SAVE_MODE", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTraceMode({ mode: "invalid" } as any)).toThrow(SaveIntegrityError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTraceMode({} as any)).toThrow(SaveIntegrityError);
  });

  it("calls all integrity checks when trace mode is valid", () => {
    const trace = { mode: SAVE_MODE };

    const identitySpy = vi
      .spyOn(integrity, "assertTraceIdentityFields")
      .mockImplementation(() => {});
    const stateSpy = vi.spyOn(integrity, "assertTraceState").mockImplementation(() => {});
    const actionsSpy = vi.spyOn(integrity, "assertTraceActions").mockImplementation(() => {});
    const expectedFinalHashSpy = vi
      .spyOn(integrity, "assertTraceExpectedFinalHash")
      .mockImplementation(() => {});
    const stepHashesSpy = vi.spyOn(integrity, "assertTraceStepHashes").mockImplementation(() => {});
    const sourceRefConsistencySpy = vi
      .spyOn(integrity, "assertTraceSourceRefConsistency")
      .mockImplementation(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assertTraceMode(trace as any);

    expect(identitySpy).toHaveBeenCalledWith(trace);
    expect(stateSpy).toHaveBeenCalledWith(trace);
    expect(actionsSpy).toHaveBeenCalledWith(trace);
    expect(expectedFinalHashSpy).toHaveBeenCalledWith(trace);
    expect(stepHashesSpy).toHaveBeenCalledWith(trace);
    expect(sourceRefConsistencySpy).toHaveBeenCalledWith(trace);

    vi.restoreAllMocks();
  });
});
