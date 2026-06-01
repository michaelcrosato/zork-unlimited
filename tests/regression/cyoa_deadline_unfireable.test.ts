/**
 * Regression (§15) for bug_0087 — the CYOA validator now flags a `meta.deadline`
 * that can PROVABLY never fire. A declared-but-unfireable deadline is a Chekhov's
 * gun: the namesake urgency mechanic (bug_0079/0080) is dead, and — worse — it is a
 * latent unsoundness for the soft-lock graph, which treats the deadline as a real
 * escape edge whenever a scene writes a watched var. If the `when` also requires a
 * flag/item that nothing provides, that escape is a phantom.
 *
 * This is the sibling the variant-soundness family (bug_0085 shadowed / bug_0086
 * vacuous) left open: those two check scene/ending variant `when` and choice
 * `conditions`, but `meta.deadline.when` went entirely un-analysed for firability.
 *
 * Two sound, conservative grounds — both reuse existing machinery and only fire
 * when firing is PROVABLY impossible (never on a deadline that is merely hard to
 * reach), so there are no false positives on a live deadline:
 *   (a) the `when` is internally contradictory (isUnsatisfiable, bug_0086); or
 *   (b) it REQUIRES, in AND-context, a flag/item/var that no effect ever provides.
 *
 * Locked here:
 *   (1) the shipped pack with a deadline (clockwork) is NOT flagged — its
 *       `ticks>=10` is fed by real `inc_var ticks` effects, so it can fire;
 *   (2) a deadline whose watched var is never written IS flagged;
 *   (3) a deadline with crossed var bounds (contradictory `when`) IS flagged;
 *   (4) a deadline requiring a flag that nothing ever sets IS flagged;
 *   (5) a fireable deadline (its var IS advanced) is NOT flagged — soundness.
 */
import { describe, it, expect } from "vitest";
import { compilePack, loadPackFile } from "../../src/cyoa/pack.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

function codes(src: string): string[] {
  const r = compilePack(src);
  expect(r.ok).toBe(true);
  if (!r.ok) return [];
  return validateCyoa(r.compiled.pack).findings.map((f) => f.code);
}

// A deadline pack with the watched-var advance toggled on/off and the `when`
// supplied by the caller, so each case isolates exactly one ground.
const deadlinePack = (when: string, advanceDoom: boolean): string => `
meta:
  id: t
  title: T
  start: s
  flags_init: []
  vars_init: { ticks: 0, doom: 0 }
  deadline: { when: ${when}, ending: e_over }
scenes:
  - id: s
    title: S
    text: "x"
    on_enter: [ { inc_var: { name: ticks, by: 1 } }${advanceDoom ? ", { inc_var: { name: doom, by: 1 } }" : ""} ]
    choices:
      - { id: g, text: go, next: e }
      - { id: quit, text: quit, next: e_over }
      - { id: stay, text: stay, next: s }
endings:
  - { id: e, title: E, text: "done" }
  - { id: e_over, title: O, text: "the hour turns" }
`;

describe("bug_0087 — the validator flags a deadline that can never fire", () => {
  it("the shipped clockwork pack's deadline is NOT flagged (it is fireable)", () => {
    for (const path of [
      "content/cyoa/pack/clockwork_heist.yaml",
      "content/cyoa/pack/watchtower_road.yaml",
    ]) {
      const r = loadPackFile(path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const found = validateCyoa(r.compiled.pack).findings.map((f) => f.code);
      expect(found).not.toContain("DEADLINE_UNFIREABLE");
    }
  });

  it("flags a deadline whose watched var is never written", () => {
    // `doom >= 5` but `doom` is never advanced (advanceDoom = false) → can't fire.
    const src = deadlinePack("[ { var_gte: { name: doom, value: 5 } } ]", false);
    expect(codes(src)).toContain("DEADLINE_UNFIREABLE");
  });

  it("flags a deadline with crossed var bounds (contradictory `when`)", () => {
    const src = deadlinePack(
      "[ { var_gte: { name: doom, value: 5 } }, { var_lte: { name: doom, value: 3 } } ]",
      true, // doom IS advanced, but the interval is empty, so it still can never hold
    );
    expect(codes(src)).toContain("DEADLINE_UNFIREABLE");
  });

  it("flags a deadline requiring a flag that nothing ever sets", () => {
    const src = deadlinePack("[ { has_flag: alarm } ]", false);
    expect(codes(src)).toContain("DEADLINE_UNFIREABLE");
  });

  it("does NOT flag a fireable deadline (its var IS advanced) — soundness", () => {
    // `doom >= 1` with `doom` incremented on every entry → certainly fires.
    const src = deadlinePack("[ { var_gte: { name: doom, value: 1 } } ]", true);
    expect(codes(src)).not.toContain("DEADLINE_UNFIREABLE");
  });
});
