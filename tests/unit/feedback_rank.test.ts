import { describe, expect, it } from "vitest";
import {
  BOTH_SOURCES_BONUS,
  SEVERITY_WEIGHT,
  recommendNextFix,
  scoreCluster,
  suggestFixLayer,
} from "../../src/feedback/rank.js";
import type { IssueCluster } from "../../src/feedback/cluster.js";

/**
 * The brief's snippets build fake IssueCluster-ish objects via `as never`
 * casts for brevity. Casting the helper's own return type to `never` makes
 * every downstream object-spread of it a compile error under this repo's
 * strict tsconfig ("Spread types may only be created from object types"), so
 * this keeps the SAME test intent (minimal fixtures, no real IssueRecord
 * fields beyond what each test actually reads) via one small typed helper
 * instead: `cluster(...)` returns a plain object, and `asCluster` is the
 * single cast point to `IssueCluster` at each call site.
 */
const cluster = (n: number, sev: "S0" | "S4", sources: ("crawler" | "fleet")[]) => ({
  key: "k",
  issues: Array(n).fill(0),
  tokens: [] as string[],
  location: {
    kind: "unmapped",
    questId: null,
    region: null,
    node: null,
    sceneId: null,
    raw: ["x"],
  },
  maxSeverity: sev,
  severityBand: sev === "S4" ? "severe" : "minor",
  sources,
  personas: [] as string[],
});

function asCluster(value: object): IssueCluster {
  return value as unknown as IssueCluster;
}

describe("ranking", () => {
  it("S4 outweighs S0 sixteenfold", () => {
    expect(SEVERITY_WEIGHT.S4 / SEVERITY_WEIGHT.S0).toBe(16);
  });

  it("score = count × severity × diversity", () => {
    expect(scoreCluster(asCluster(cluster(3, "S4", ["fleet"])))).toBe(3 * 16);
    expect(scoreCluster(asCluster(cluster(3, "S4", ["fleet", "crawler"])))).toBe(
      3 * 16 * BOTH_SOURCES_BONUS,
    );
  });

  it("fix layers route by origin and keywords", () => {
    expect(
      suggestFixLayer(
        asCluster({
          ...cluster(1, "S4", ["crawler"]),
          tokens: [],
          issues: [{ text: "CRASH: step threw", severity: "S4" }],
        }),
      ),
    ).toBe("engine_rule");
    expect(
      suggestFixLayer(
        asCluster({
          ...cluster(1, "S0", ["fleet"]),
          tokens: ["hint", "unclear"],
          issues: [{ text: "unclear hint" }],
        }),
      ),
    ).toBe("hint_text");
  });

  it("routes every crawler code prefix through the engine_rule/quest_structure/content ladder", () => {
    const withCode = (code: string) =>
      asCluster({
        ...cluster(1, "S4", ["crawler"]),
        tokens: [],
        issues: [{ text: `${code}: message`, severity: "S4" }],
      });
    expect(suggestFixLayer(withCode("CRASH"))).toBe("engine_rule");
    expect(suggestFixLayer(withCode("INTEGRITY"))).toBe("engine_rule");
    expect(suggestFixLayer(withCode("DESYNC"))).toBe("engine_rule");
    expect(suggestFixLayer(withCode("PERSIST"))).toBe("engine_rule");
    expect(suggestFixLayer(withCode("LEGALITY"))).toBe("engine_rule");
    expect(suggestFixLayer(withCode("SOFTLOCK"))).toBe("quest_structure");
    expect(suggestFixLayer(withCode("WORLD"))).toBe("quest_structure");
    expect(suggestFixLayer(withCode("RENDER"))).toBe("content");
  });

  it("routes fix_layer by the HIGHEST-severity crawler code in a mixed-code cluster", () => {
    // A merged cluster can hold issues of different crawler codes at the same
    // location — e.g. a cosmetic RENDER(S2) report and a CRASH(S4) report
    // that both fingerprinted to the same bucket. The cluster's overall
    // severity_band is driven by maxSeverity (S4 -> "severe"), so fix_layer
    // must be routed by CRASH ("engine_rule"), not by RENDER ("content"),
    // even though RENDER is the lower-severity issue and — per the real
    // clusterIssues sort (ascending severity) — sorts first in `issues`.
    const mixed = asCluster({
      ...cluster(2, "S4", ["crawler"]),
      tokens: [],
      issues: [
        { text: "RENDER: glyph misaligned", severity: "S2" },
        { text: "CRASH: step threw", severity: "S4" },
      ],
    });
    expect(mixed.severityBand).toBe("severe");
    expect(suggestFixLayer(mixed)).toBe("engine_rule");
  });

  it("routes fleet-origin keyword groups: quest_structure, content, engine_rule, and default", () => {
    const withTokens = (tokens: string[]) =>
      asCluster({ ...cluster(1, "S0", ["fleet"]), tokens, issues: [{ text: tokens.join(" ") }] });
    expect(suggestFixLayer(withTokens(["softlock", "cannot", "proceed"]))).toBe("quest_structure");
    expect(suggestFixLayer(withTokens(["typo", "in", "sign"]))).toBe("content");
    expect(suggestFixLayer(withTokens(["crash", "on", "load"]))).toBe("engine_rule");
    expect(suggestFixLayer(withTokens(["nothing", "keyword", "here"]))).toBe("content");
  });

  it("recommends the top-scoring cluster with a rationale citing count/severity/sources", () => {
    const low = asCluster({ ...cluster(1, "S0", ["fleet"]), key: "low" });
    const high = asCluster({ ...cluster(5, "S4", ["fleet", "crawler"]), key: "high" });
    const rec = recommendNextFix([low, high]);
    expect(rec).not.toBeNull();
    expect(rec!.hotspot_id).toBe(high.key);
    expect(rec!.rationale).toMatch(/5/);
    expect(rec!.rationale).toMatch(/S4/);
  });

  it("finds the top cluster regardless of input order", () => {
    const low = asCluster(cluster(1, "S0", ["fleet"]));
    const high = asCluster({ ...cluster(5, "S4", ["fleet", "crawler"]), key: "z" });
    expect(recommendNextFix([low, high])!.hotspot_id).toBe("z");
    expect(recommendNextFix([high, low])!.hotspot_id).toBe("z");
  });

  it("returns null for empty input", () => {
    expect(recommendNextFix([])).toBeNull();
  });
});
