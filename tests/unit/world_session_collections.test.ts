import { describe, expect, it } from "vitest";
import {
  assertKnownIds,
  assertUnique,
  assertUniqueTupleMap,
  compactSortedStringSet,
  compactSortedTownIdsByPopulation,
  compareTownByPopulationThenName,
  idIndex,
  indexedList,
  insertBoundedSorted,
  keyedIndex,
  nestedIdIndex,
  pushIndexed,
  replaceStringSet,
  sortedIndex,
  sortedNumberMap,
  sortedNumberRecord,
  sortedStringMap,
  sortedStringSet,
} from "../../src/world/session_collections.js";

describe("overworld session collection helpers", () => {
  it("sorts sets, maps, and number records deterministically", () => {
    expect(sortedStringSet(new Set(["b", "a"]))).toEqual(["a", "b"]);
    expect(
      sortedStringMap(
        new Map([
          ["b", "Beta"],
          ["a", "Alpha"],
        ]),
      ),
    ).toEqual([
      ["a", "Alpha"],
      ["b", "Beta"],
    ]);
    expect(
      sortedNumberMap(
        new Map([
          ["b", 2],
          ["a", 1],
        ]),
      ),
    ).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(
      sortedNumberRecord(
        new Map([
          ["b", 2],
          ["a", 1],
        ]),
      ),
    ).toEqual({ a: 1, b: 2 });
  });

  it("keeps bounded sorted samples for compact IDs and ranked towns", () => {
    const values = ["delta", "alpha", "charlie", "bravo"];
    const target: string[] = [];
    for (const value of values) {
      insertBoundedSorted(target, value, 3, (left, right) => left.localeCompare(right));
    }
    expect(target).toEqual(["alpha", "bravo", "charlie"]);

    expect(compactSortedStringSet(new Set(values))).toEqual({
      ids: ["alpha", "bravo", "charlie", "delta"],
      count: 4,
    });

    expect(
      [
        { name: "Smaller", population_2025: 10 },
        { name: "Larger", population_2025: 20 },
        { name: "Alpha", population_2025: 10 },
      ].sort(compareTownByPopulationThenName),
    ).toEqual([
      { name: "Larger", population_2025: 20 },
      { name: "Alpha", population_2025: 10 },
      { name: "Smaller", population_2025: 10 },
    ]);

    expect(
      compactSortedTownIdsByPopulation(
        new Set(["small", "large", "missing", "alpha"]),
        new Map([
          ["small", { id: "small", name: "Smaller", population_2025: 10 }],
          ["large", { id: "large", name: "Larger", population_2025: 20 }],
          ["alpha", { id: "alpha", name: "Alpha", population_2025: 10 }],
        ]),
      ),
    ).toEqual(["large", "alpha", "small"]);
  });

  it("validates snapshot ID lists and tuple maps", () => {
    expect([...assertUnique("town id", ["a", "b"])]).toEqual(["a", "b"]);
    expect([...assertKnownIds("town id", ["a"], new Set(["a"]))]).toEqual(["a"]);
    expect(assertUniqueTupleMap("renown region", [["Capital", 1]])).toEqual(
      new Map([["Capital", 1]]),
    );

    expect(() => assertUnique("town id", ["a", "a"])).toThrow(/duplicate town id/);
    expect(() => assertKnownIds("town id", ["x"], new Set(["a"]))).toThrow(/unknown town id/);
    expect(() =>
      assertUniqueTupleMap("renown region", [
        ["Capital", 1],
        ["Capital", 2],
      ]),
    ).toThrow(/duplicate renown region/);
  });

  it("indexes grouped and keyed manifest values", () => {
    const values = [
      { id: "b", group: "north", order: 2 },
      { id: "a", group: "north", order: 1 },
      { id: "c", group: "south", order: 1 },
    ];

    const grouped = sortedIndex(
      values,
      (value) => value.group,
      (left, right) => left.order - right.order,
    );

    expect(indexedList(grouped, "north").map((value) => value.id)).toEqual(["a", "b"]);
    expect(indexedList(grouped, "missing")).toEqual([]);
    expect(keyedIndex(values, (value) => value.id).get("a")?.group).toBe("north");
    expect(idIndex(values).get("c")?.group).toBe("south");
    expect(nestedIdIndex(grouped).get("north")?.get("b")?.order).toBe(2);

    pushIndexed(grouped, "south", { id: "d", group: "south", order: 2 });
    expect(indexedList(grouped, "south").map((value) => value.id)).toEqual(["c", "d"]);
  });

  it("replaces mutable string sets without preserving stale values", () => {
    const target = new Set(["old"]);
    replaceStringSet(target, ["new", "next"]);
    expect([...target].sort()).toEqual(["new", "next"]);
  });
});
