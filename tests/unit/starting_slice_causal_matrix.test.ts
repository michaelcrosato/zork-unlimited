import { describe, expect, it } from "vitest";
import {
  assertCountedStartingSliceProofsExist,
  loadStartingSliceCausalMatrix,
  parseStartingSliceCausalMatrix,
} from "../../src/starting_slice/causal_matrix.js";

describe("starting-slice causal matrix", () => {
  it("is machine-readable, uniquely keyed, and counts only the proven registration fork", () => {
    const matrix = loadStartingSliceCausalMatrix();

    expect(matrix.status).toBe("active_unproven");
    expect(matrix.forks).toHaveLength(12);
    expect(new Set(matrix.forks.map((fork) => fork.id)).size).toBe(12);
    expect(
      matrix.forks.filter((fork) => fork.counts_toward_contract).map((fork) => fork.id),
    ).toEqual(["SS-F01-character-background"]);
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
    const plannedFork = falselyCountedForks.find(
      (fork) => fork.implementation_status !== "implemented",
    );
    if (!plannedFork) throw new Error("expected an unimplemented starting-slice fork");
    plannedFork.counts_toward_contract = true;
    expect(() => parseStartingSliceCausalMatrix(falselyCounted)).toThrow(
      /counted fork must be implemented/i,
    );
  });

  it("refuses certification until every numeric contract threshold is proven", () => {
    const matrix = loadStartingSliceCausalMatrix();
    const premature = { ...structuredClone(matrix), status: "certified" };
    expect(() => parseStartingSliceCausalMatrix(premature)).toThrow(
      /Certification requires 12 material forks/,
    );
  });
});
