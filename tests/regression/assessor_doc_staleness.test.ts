/**
 * bug_0045 — the assessor gains a third cross-category radar: a DOC-STALENESS detector.
 *
 * Backstory: bug_0038 closed the last lint-coverage gap (ui/), so the assessor's two
 * non-content levers were both inert — repo-eslint disarmed since the config ships,
 * the engine TODO/marker scan at zero markers — leaving only the uniform 0.5
 * blind-playtest reviews as its honest top. Every recent cycle (since bug_0032/0035,
 * re-logged through bug_0044 deferred) named the SAME next-best cross-category
 * improvement: a deterministic detector for DOC ROT — a canonical, maintained doc that
 * points at a first-party file which no longer exists (a rename/delete the doc was
 * never updated for).
 *
 * The detector must be CONSERVATIVE: it can only flag tokens under a known first-party
 * dir that carry a concrete file extension, and must skip the path shapes a doc names
 * WITHOUT claiming they exist — glob/placeholder patterns and command-line output
 * destinations (`--record traces/run.json`). Empirically, that last class is the one
 * false positive present in the real repo today (README's `--record traces/run.json`
 * CLI example), so it is regression-locked here. It FIRES when a reference no longer
 * resolves and DISARMS when every one does — the same fire-while-real / silent-when-done
 * discipline as the lint-coverage radar (bug_0035).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assess, findStaleDocRefs } from "../../src/afk/assessor.js";

const a = assess(process.cwd());
const DOC_STALE = "repo-doc-staleness";

describe("bug_0045 — findStaleDocRefs (the predicate that flags doc rot)", () => {
  // A doc that references a file which the injected `exists` says is gone.
  it("flags a concrete first-party ref that no longer resolves", () => {
    const text = "See `src/afk/assessor.ts` and the old `src/afk/old_brain.ts`.";
    const exists = (p: string): boolean => p === "src/afk/assessor.ts";
    expect(findStaleDocRefs(text, exists)).toEqual(["src/afk/old_brain.ts"]);
  });

  it("is silent when every concrete ref resolves (disarmed)", () => {
    const text = "Run `npm run health`; brain lives in `src/afk/assessor.ts`.";
    expect(findStaleDocRefs(text, () => true)).toEqual([]);
  });

  it("ignores glob / placeholder patterns (not liveness claims)", () => {
    // These name a SHAPE, not a specific tracked file — must never be flagged even
    // though `exists` returns false for the literal glob/placeholder string.
    const text = [
      "validate `content/cyoa/pack/*.yaml`",
      "lock it in `traces/bugs/bug_0001_*.yaml`",
      "write to `ai-runs/<id>/playtest.md`",
      "scan `docs/**/*.md`",
      "the artifact `traces/bugs/.../old.yaml`", // exercises the `...` ellipsis guard
    ].join(" ");
    expect(findStaleDocRefs(text, () => false)).toEqual([]);
  });

  it("ignores command-line OUTPUT destinations (--record / --out / -o / >)", () => {
    // The doc tells you to CREATE these, not that they already exist — the exact
    // false positive present in the real README (`--record traces/run.json`).
    const text = [
      "add `--record traces/run.json` to save a trace",
      "playtest with `--out traces/playtests/run.json`",
      "pipe `> scripts/generated.json`",
    ].join("\n");
    expect(findStaleDocRefs(text, () => false)).toEqual([]);
  });

  it("ignores bare dir mentions and non-first-party prefixes", () => {
    // No file extension (a dir) → not a file ref; node_modules/dist → not first-party.
    const text =
      "edit under `tests/regression/` — built into `dist/x.js`, vendored `node_modules/y.js`";
    expect(findStaleDocRefs(text, () => false)).toEqual([]);
  });

  it("dedups a ref repeated across the doc", () => {
    const text = "`src/gone.ts` here, and again `src/gone.ts` there.";
    expect(findStaleDocRefs(text, () => false)).toEqual(["src/gone.ts"]);
  });

  it("strips trailing markdown/sentence punctuation before resolving", () => {
    // A ref at the end of a sentence: the period must not become part of the path.
    const text = "The brain is src/afk/assessor.ts. The end.";
    expect(findStaleDocRefs(text, (p) => p === "src/afk/assessor.ts")).toEqual([]);
  });
});

describe("bug_0045 — the detector on the REAL repo (ships disarmed, non-noisy)", () => {
  it("raises NO repo-doc-staleness candidate: the canonical docs are clean", () => {
    // Fire-while-real / silent-when-done: with every canonical-doc reference live,
    // the radar is quiet. If a future edit renames a file a doc points at without
    // updating the doc, this candidate RE-ARMS — that's the regression guard.
    expect(a.candidates.find((c) => c.id === DOC_STALE)).toBeUndefined();
  });

  it("does NOT false-fire on README's `--record traces/run.json` CLI example", () => {
    // The one non-resolving concrete path in the canonical docs today is an output
    // destination, not a stale reference — locking the output-flag exclusion so a
    // future detector tweak can't regress into flagging it.
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    expect(readme).toContain("--record traces/run.json"); // the example still ships
    expect(existsSync(join(process.cwd(), "traces/run.json"))).toBe(false); // and the file genuinely doesn't exist
    expect(findStaleDocRefs(readme, (p) => existsSync(join(process.cwd(), p)))).not.toContain(
      "traces/run.json",
    );
  });

  it("WOULD catch a genuinely deleted ref in a canonical doc (mechanism live)", () => {
    // Prove the detector isn't vacuously disarmed: feed AGENTS.md but pretend one of
    // the real files it names is gone, and the predicate flags exactly that one.
    const agents = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");
    const target = "scripts/verify-integrity.ts";
    expect(agents).toContain(target); // AGENTS.md really does reference it
    const stale = findStaleDocRefs(agents, (p) =>
      p === target ? false : existsSync(join(process.cwd(), p)),
    );
    expect(stale).toContain(target);
  });
});
