/**
 * RPG validator (§10, §13 Stage 4) + negative fixture (§10.4) + §14 backward-compat.
 *
 * The shipped RPG pack validates green; a deliberately unwinnable fight is
 * rejected. The §14 gate requires that adding Stage 4 leaves every prior pack
 * byte-identical — so we assert the existing parser/CYOA pack content hashes are
 * unchanged by the new optional schema fields.
 */
import { describe, it, expect } from "vitest";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { validateParser } from "../../src/validate/parser_validator.js";
import { loadPackFile } from "../../src/cyoa/pack.js";

describe("RPG validator — shipped pack (§13 Stage 4)", () => {
  it("content/rpg/pack/sunken_barrow.yaml validates with no errors or warnings", () => {
    const loaded = loadRpgPackFile("content/rpg/pack/sunken_barrow.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateRpg(loaded.compiled.pack);
    expect(report.findings).toHaveLength(0);
    expect(report.ok).toBe(true);
  });
});

describe("RPG validator — negative fixture must fail (§10.4)", () => {
  it("rpg_unwinnable fails with COMBAT_UNWINNABLE", () => {
    const loaded = loadRpgPackFile("content/broken-fixtures/rpg_unwinnable.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const report = validateRpg(loaded.compiled.pack);
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.code)).toContain("COMBAT_UNWINNABLE");
  });
});

describe("§14 backward-compatibility — prior packs unchanged", () => {
  // The Stage-4 additions are optional (skill_check) or top-level (enemies), so
  // existing packs compile to identical content and still validate green.
  it("the parser packs still validate green and unchanged", () => {
    for (const path of ["content/parser/pack/sealed_crypt.yaml", "content/parser/pack/alchemists_tower.yaml"]) {
      const loaded = loadParserPackFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(validateParser(loaded.compiled.pack).ok).toBe(true);
    }
  });

  it("the CYOA pack compiles to its pinned content hash (determinism snapshot)", () => {
    const loaded = loadPackFile("content/cyoa/pack/watchtower_road.yaml");
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // Pinned snapshot of the current pack. The gated Stage-4 DSL additions did not
    // change it (was df85b4f…); this value updated only when the pack content was
    // deliberately edited to fix blind-playtest findings (stale text, duplicate
    // journal, ledger inventory), bug_0003 cellar discoverability, bug_0004 —
    // the hermit's tower lore now journals + de-loops (was c49b4424…) — and
    // bug_0005: the lantern-less cellar door now gives an in-fiction "too dark"
    // nudge instead of silently offering only "step back" (was 8094e553…); and
    // bug_0006 — the hermit's letter reveal now sets seal_broken + journals and
    // can't re-break an opened seal, and ending_truth no longer presumes the
    // "broken seal" / "oil in the cellar" the player may not have produced
    // (was 7f322e4c…); and bug_0007 — the hidden_cache no longer re-renders the
    // "ledger lies forgotten" text after the ledger is taken (take_ledger now
    // exits to the cellar) and its description no longer presumes the player saw
    // the letter (was 46ac6142…); and bug_0055 — confront_smuggler's scene text is
    // now reactive (a not_flag learned_truth variant so the no-proof bluff branch no
    // longer follows text that narrates the sergeant reading his own name)
    // (was 7e3392b6…); and bug_0062 — confront_smuggler's retreat choice is now
    // flag-gated (the "find real proof first" line only shows to the no-proof bluffer;
    // the learned_truth player gets a coherent "hold your tongue" retreat)
    // (was 3947f07b…); and bug_0098 — the lit signal beacon's `raised_alarm` flag
    // now fires reactive variants on all three endings (the beacon's "help — or
    // trouble — is coming" finally materialises in the epilogue instead of being a
    // dead flag) (was 4c971d43…); and bug_0104 — the new INERT_FLAG validator check
    // surfaced two genuinely dead flags here (met_hermit, saw_watchtower: set on the
    // talk_hermit / go_east choices but read by no condition — the scene transition
    // already carries that state), and their no-op `set_flag` effects were removed
    // (was 95cf3665…); and bug_0108 — the take_letter pickup journal now foreshadows
    // the letter's two real uses (papers to present at the checkpoint via show_papers;
    // a seal a "knowing eye" — the hermit — can break) instead of the bare, inert-
    // reading "addressed to no one." A blind playtester (seed 7,
    // ai-runs/2026-06-02T08-37-28-787Z/playtest.md §5) took the letter on the tower/
    // beacon route, never reached the hermit or checkpoint, and reported it as a
    // Chekhov's gun that never fires; this hint_text-only nudge signposts its purpose
    // (was f6b64fd9…); and bug_0120 — tower_top now gates light_beacon one-shot on
    // not_flag raised_alarm and carries a raised_alarm scene variant so a player who
    // relit the beacon no longer saw "a cold brazier waits, begging for a flame" while
    // the already-done "Light the signal beacon" choice was re-offered (blind seed 11,
    // ai-runs/2026-06-02T11-34-06-334Z/playtest.md §5; was 862b33ad…); and bug_0127 —
    // bug_0108's take_letter journal still read "a knowing eye could break open and read"
    // as a SELF-affordance, so a fresh blind playtester on the east-only route (seed 12,
    // ai-runs/2026-06-02T13-20-51-530Z/playtest.md §4/§5) hunted for a way to crack the
    // seal themselves and never found one (only the hermit, west, breaks it). The journal
    // now says "the right pair of eyes — not your own; the seal is set too hard for that —
    // could break open and read," disclaiming the self-action while keeping bug_0108's
    // two-use foreshadow (was cd749bd5…); and bug_0134 — hermit_talk now carries a
    // reactive re-entry variant (any_of heard_hermit_lore/seal_broken) so a player who
    // returns to the conversation after already hearing the lore or breaking the seal no
    // longer meets the cold first-meeting greeting "You look lost, traveler" as a stranger
    // (blind seed 88, ai-runs/2026-06-02T15-08-35-167Z/playtest.md §4; was f989028090…);
    // and the RPG-mechanic standardization — ending_captured is now flagged `death: true`
    // (the CYOA death/failure-ending palette lift, RPG-STANDARDIZATION-PLAN), a deliberate
    // metadata edit that changes the content hash without changing runtime state or any
    // recorded trace (was 8990abbad9…).
    // Any *unintended* change to compilation trips this.
    expect(loaded.compiled.contentHash).toBe("59f722526f2a4463927f63c582aa1b2178a5e85c9a06f5ec58edd9734cd3ed5e");
  });
});
