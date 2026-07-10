import { describe, expect, it } from "vitest";
import { clusterIssues, jaccard, tokenizeIssue } from "../../src/feedback/cluster.js";
import type { IssueRecord } from "../../src/feedback/cluster.js";
import type { CanonicalLocation } from "../../src/feedback/schema.js";

const loc: CanonicalLocation = {
  kind: "overworld",
  questId: null,
  region: null,
  node: "albany_city",
  sceneId: null,
  raw: ["Albany"],
};
const issue = (text: string, over: Partial<IssueRecord> = {}): IssueRecord => ({
  source: "fleet",
  ref: "r",
  location: loc,
  severity: "S3",
  text,
  persona: null,
  target: "overworld",
  ...over,
});

describe("clustering", () => {
  it("tokenize stems and drops stopwords deterministically", () => {
    expect(tokenizeIssue("The notice boards were confusing!")).toEqual(
      tokenizeIssue("notice board confusing"),
    );
  });

  it("jaccard basics", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });

  it("same-location near-duplicates merge; different locations never do", () => {
    const a = issue("notice board wording is confusing about the quest start");
    const b = issue("the notice board is confusing — where does the quest start?");
    const c = issue("notice board confusing", { location: { ...loc, node: "troy_city" } });
    const clusters = clusterIssues([a, b, c]);
    expect(clusters).toHaveLength(2);
    expect(Math.max(...clusters.map((x) => x.issues.length))).toBe(2);
  });

  it("input order never changes the clustering", () => {
    const items = [
      issue("board confusing start"),
      issue("confusing board quest start"),
      issue("music too loud"),
    ];
    const keyset = (xs: ReturnType<typeof clusterIssues>) => xs.map((c) => c.key).sort();
    expect(keyset(clusterIssues(items))).toEqual(keyset(clusterIssues([...items].reverse())));
  });

  it("clustering by content is invariant to any permutation, not just reversal", () => {
    const items = [
      issue("board confusing start"),
      issue("confusing board quest start"),
      issue("music too loud"),
      issue("totally unrelated remark", { location: { ...loc, node: "troy_city" } }),
    ];
    const shuffled = [items[3]!, items[1]!, items[0]!, items[2]!];
    const summarize = (xs: ReturnType<typeof clusterIssues>) =>
      xs
        .map((c) => ({ key: c.key, refs: c.issues.map((i) => i.ref).sort() }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    expect(summarize(clusterIssues(shuffled))).toEqual(summarize(clusterIssues(items)));
  });

  it("different unmapped raw texts never cluster together even at the same 'kind'", () => {
    const unmapped: CanonicalLocation = {
      kind: "unmapped",
      questId: null,
      region: null,
      node: null,
      sceneId: null,
      raw: ["somewhere vaguely damp"],
    };
    const a = issue("the lever would not budge", { location: unmapped });
    const b = issue("the lever would not budge", {
      location: { ...unmapped, raw: ["a completely different unmapped place"] },
    });
    const clusters = clusterIssues([a, b]);
    expect(clusters).toHaveLength(2);
  });

  it("empty input yields no clusters", () => {
    expect(clusterIssues([])).toEqual([]);
  });

  it("aggregates maxSeverity, severityBand, sources, and personas across a merged cluster", () => {
    const a = issue("board confusing start", {
      severity: "S1",
      source: "fleet",
      persona: "skeptic",
    });
    const b = issue("confusing board quest start", {
      severity: "S3",
      source: "crawler",
      persona: "casual",
    });
    const [cluster] = clusterIssues([a, b]);
    expect(cluster!.maxSeverity).toBe("S3");
    expect(cluster!.severityBand).toBe("severe");
    expect(cluster!.sources.sort()).toEqual(["crawler", "fleet"]);
    expect(cluster!.personas.sort()).toEqual(["casual", "skeptic"]);
  });
});
