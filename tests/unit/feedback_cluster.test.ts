import { describe, expect, it } from "vitest";
import {
  clusterIssues,
  jaccard,
  JACCARD_MERGE_THRESHOLD,
  tokenizeIssue,
} from "../../src/feedback/cluster.js";
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

describe("merging independently-authored reports of one defect", () => {
  // Calibration cover. The threshold used to sit at 0.5, above the point where anything
  // real merged: four sessions describing ONE blocked-exit defect in their own words
  // scored 0.219-0.429 pairwise and produced four separate tickets. Corroboration could
  // not fire on independent prose at all, only on near-duplicate text.
  //
  // These strings are verbatim from four real sessions. Keeping them verbatim is the
  // point — paraphrasing them into something more similar is exactly the mistake that
  // let the original threshold look adequate.
  const ONE_DEFECT = [
    "Blocked reason reads 'Choose the single approach named by Hayden's dispatch. You cannot descend while both approach routes are selected.' Exactly one approach was selected.",
    "steading_yard north blocks with 'You cannot descend while both approach routes are selected.' Exactly one approach was selected each time. The stated condition is never true.",
    "Copy bug. I launched with exactly one approach (albany:wolf_approach_exposed_ridge), and the flags confirm a single approach, but the blocked exit says both approach routes are selected.",
    "The quest-launch blocked exit reads 'while both approach routes are selected' when exactly one was selected.",
  ];

  // Three genuinely DIFFERENT defects a single session filed against one story choice.
  const THREE_DEFECTS = [
    "A permanent background is committed at decision 2, triggered by talking to the only contact on screen, with no prerequisite and no warning beforehand.",
    "The mechanical consequence that matters most is hidden from the summaries. 'In Wolf-Winter, Defense starts at 4 instead of 3' appears only under inspect.",
    "Every option carries consequence as an empty string rather than omitting the field, in both story choices.",
  ];

  function issuesAt(location: CanonicalLocation, texts: readonly string[]): IssueRecord[] {
    return texts.map((text, i) => ({
      source: "fleet" as const,
      ref: `session-${i}`,
      location,
      severity: "S3" as const,
      text,
      persona: null,
      target: "quest:wolf_winter",
    }));
  }

  const somewhere: CanonicalLocation = {
    kind: "quest",
    questId: "wolf_winter",
    region: null,
    node: null,
    sceneId: "steading_yard",
    raw: ["steading_yard"],
  };

  it("merges four independent wordings of one defect into a single cluster", () => {
    const clusters = clusterIssues(issuesAt(somewhere, ONE_DEFECT));
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.issues).toHaveLength(4);
  });

  it("keeps genuinely different defects apart even when they share a location", () => {
    // The safety half. A threshold low enough to merge independent prose must not also
    // collapse distinct findings filed against the same place.
    const clusters = clusterIssues(issuesAt(somewhere, THREE_DEFECTS));
    expect(clusters).toHaveLength(3);
  });

  it("separates the two populations by a real margin, not by luck", () => {
    const tok = (t: string) => tokenizeIssue(t);
    const pairs = (texts: readonly string[]): number[] => {
      const out: number[] = [];
      for (let i = 0; i < texts.length; i++)
        for (let j = i + 1; j < texts.length; j++)
          out.push(jaccard(tok(texts[i]!), tok(texts[j]!)));
      return out;
    };
    const same = pairs(ONE_DEFECT);
    const different = pairs(THREE_DEFECTS);
    // The threshold must sit strictly between the populations, or it is tuned to one
    // example rather than to a separation that actually exists.
    expect(Math.max(...different)).toBeLessThan(JACCARD_MERGE_THRESHOLD);
    expect(Math.min(...same)).toBeGreaterThan(JACCARD_MERGE_THRESHOLD);
  });
});
