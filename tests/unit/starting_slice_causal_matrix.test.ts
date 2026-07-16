import { describe, expect, it } from "vitest";
import {
  assertCountedStartingSliceProofsExist,
  loadStartingSliceCausalMatrix,
  parseStartingSliceCausalMatrix,
} from "../../src/starting_slice/causal_matrix.js";

describe("starting-slice causal matrix", () => {
  it("is machine-readable, uniquely keyed, and counts only proven opening forks", () => {
    const matrix = loadStartingSliceCausalMatrix();

    expect(matrix.status).toBe("active_unproven");
    expect(matrix.forks).toHaveLength(12);
    expect(new Set(matrix.forks.map((fork) => fork.id)).size).toBe(12);
    expect(
      matrix.forks.filter((fork) => fork.counts_toward_contract).map((fork) => fork.id),
    ).toEqual([
      "SS-F01-character-background",
      "SS-F02-relief-oath",
      "SS-F03-lead-source",
      "SS-F04-ally-commitment",
      "SS-F05-preparation-profile",
      "SS-F06-relief-allocation",
      "SS-F07-hill-route",
      "SS-F08-cade-trust",
      "SS-F09-wolf-strategy",
      "SS-F10-crisis-priority",
      "SS-F11-saved-wood",
      "SS-F12-albany-return",
    ]);
    expect(() => assertCountedStartingSliceProofsExist(matrix)).not.toThrow();
  });

  it("rejects duplicate ids and forks counted without implementation and proof", () => {
    const matrix = loadStartingSliceCausalMatrix();
    const duplicate = structuredClone(matrix) as unknown as Record<string, unknown>;
    const duplicateForks = duplicate.forks as Record<string, unknown>[];
    duplicateForks[1]!.id = duplicateForks[0]!.id;
    expect(() => parseStartingSliceCausalMatrix(duplicate)).toThrow(/Duplicate fork id/);

    const falselyCounted = structuredClone(matrix) as unknown as Record<string, unknown>;
    const falselyCountedForks = falselyCounted.forks as Record<string, unknown>[];
    const plannedFork = falselyCountedForks.find((fork) => fork.counts_toward_contract === true);
    if (!plannedFork) throw new Error("expected a counted starting-slice fork");
    plannedFork.implementation_status = "planned";
    expect(() => parseStartingSliceCausalMatrix(falselyCounted)).toThrow(
      /counted fork must be implemented/i,
    );
  });

  it("refuses structural certification while any required fork remains uncounted", () => {
    const matrix = loadStartingSliceCausalMatrix();
    const premature = structuredClone(matrix);
    premature.status = "certified";
    premature.forks[1]!.counts_toward_contract = false;
    expect(() => parseStartingSliceCausalMatrix(premature)).toThrow(
      /Certification requires 12 material forks/,
    );
  });
});
