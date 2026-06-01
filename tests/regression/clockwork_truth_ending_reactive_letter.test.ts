/**
 * Regression (§15) for bug_0051 — *The Clockwork Heist*'s "Truth" ending printed
 * ONE epilogue for two oppositely-framed letters.
 *
 * The vault copy of the steward's confession is described at pickup as "laid out
 * in plain sight, as though its writer meant whoever cracked the vault to find it";
 * the crawlspace copy as "hidden away here in the dark... where he meant no eye
 * ever to fall on it" (bug_0041 established them as the steward's paired copies).
 * But both routes funneled into the identical `ending_truth` text, so the epilogue
 * contradicted whichever framing the player had just read. A fresh MCP-only blind
 * playtester (seed 137, report ai-runs/2026-06-01T14-36-30-776Z/playtest.md §5)
 * flagged exactly this as the pack's most concrete finding.
 *
 * Fix (engine + content): endings gained the same reactive `variants` capability
 * scenes already have (src/cyoa/runner.ts `endingText`, wired through
 * src/cyoa/observation.ts `textFor`, schema `EndingSchema.variants`). The vault
 * take-letter route sets `letter_displayed`, the crawlspace strongbox route sets
 * `letter_hidden`, and `ending_truth` now selects the matching epilogue. The base
 * `text` is retained as a route-neutral fallback (so bug_0017/0025/0030 still hold).
 *
 * Locked here:
 *   (1) the displayed (vault) route's final epilogue names the plain-sight copy;
 *   (2) the hidden (crawlspace) route's final epilogue names the hidden copy;
 *   (3) the two epilogues genuinely differ (the contradiction is gone);
 *   (4) every variant — and the base fallback — keeps the truth-over-riches moral
 *       and presumes no physical gold encounter (bug_0025 invariant preserved);
 *   (5) reachability is unchanged: vault-letter & crawlspace -> truth, gold ->
 *       rich, force -> caught.
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/clockwork_heist.yaml");
if (!loaded.ok) throw new Error("clockwork_heist pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function play(ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, 137);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}

// The epilogue a player actually reads is the final observation's `text`, which
// resolves the ending's reactive variant against the frozen end-state.
function epilogueOf(ids: string[]): string {
  const s = play(ids);
  expect(s.ended).toBe(true);
  return buildObservation(index, s).text.toLowerCase();
}

const VAULT_LETTER_ROUTE = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "take_letter",
];
const CRAWLSPACE_ROUTE = [
  "inspect_clock",
  "kitchens",
  "take_pick",
  "back_foyer",
  "pry_panel",
  "open_strongbox",
];
const VAULT_GOLD_ROUTE = [
  "kitchens",
  "take_pick",
  "dumbwaiter",
  "approach_vault",
  "pick_lock",
  "grab_gold",
];
const FORCE_ROUTE = ["climb_stairs", "approach_vault", "force_door"];

describe("bug_0051 — the Truth ending reacts to which letter the player carried", () => {
  it("the vault route's epilogue names the plain-sight (displayed) copy", () => {
    const s = play(VAULT_LETTER_ROUTE);
    expect(s.endingId).toBe("ending_truth");
    expect(s.flags.letter_displayed).toBe(true);
    const text = buildObservation(index, s).text.toLowerCase();
    // The copy he left "lying open... for the thief good enough to crack his lock".
    expect(text).toContain("lying open");
    expect(text).toContain("meant to be found");
    // ...and NOT the hidden framing.
    expect(text).not.toContain("hid in the dark");
  });

  it("the crawlspace route's epilogue names the hidden copy", () => {
    const s = play(CRAWLSPACE_ROUTE);
    expect(s.endingId).toBe("ending_truth");
    expect(s.flags.letter_hidden).toBe(true);
    const text = buildObservation(index, s).text.toLowerCase();
    // The copy he "hid in the dark behind the vault, where he meant no eye to fall".
    expect(text).toContain("hid in the dark");
    expect(text).toContain("no eye");
    // ...and NOT the plain-sight framing.
    expect(text).not.toContain("lying open");
  });

  it("the two epilogues genuinely differ — the one-text contradiction is gone", () => {
    expect(epilogueOf(VAULT_LETTER_ROUTE)).not.toBe(epilogueOf(CRAWLSPACE_ROUTE));
  });

  it("every variant and the base fallback keep the moral and presume no gold encounter", () => {
    const truth = index.pack.endings.find((e) => e.id === "ending_truth");
    expect(truth).toBeDefined();
    const texts = [truth!.text, ...(truth!.variants ?? []).map((v) => v.text)].map((t) =>
      t.toLowerCase(),
    );
    expect(texts.length).toBe(3); // base + displayed + hidden
    for (const text of texts) {
      // bug_0025 invariant: no presumption the player stood over the gold.
      expect(text).not.toContain("untouched");
      expect(text).not.toContain("leave it");
      expect(text).not.toContain("leave the gold");
      // The truth-over-riches moral survives in every branch — each names the
      // steward's confession and closes on the same line (the hidden variant
      // says "the secret he could not bring himself to burn" rather than the
      // literal word "truth", so assert the shared invariants, not that word).
      expect(text).toContain("the steward's confession");
      expect(text).toContain("worth more than escaping rich");
    }
  });

  it("reachability is unchanged — letter/crawlspace -> truth, gold -> rich, force -> caught", () => {
    expect(play(VAULT_LETTER_ROUTE).endingId).toBe("ending_truth");
    expect(play(CRAWLSPACE_ROUTE).endingId).toBe("ending_truth");
    expect(play(VAULT_GOLD_ROUTE).endingId).toBe("ending_rich");
    expect(play(FORCE_ROUTE).endingId).toBe("ending_caught");
  });
});
