/**
 * Regression (§15) for bug_0268 — *The Midnight Edition*'s composing_room hub showed stale
 * "open door" prose once the alley door was barred AND a knowledge flag (read_letter /
 * knows_proof) was also set.
 *
 * Root cause: the hub's reactive variants live on two orthogonal axes — the knowledge axis
 * (read_letter / knows_proof) and the door axis (door_barred). The barred-door variant was
 * placed LAST and, being first-match-wins, only fired when NEITHER knowledge flag was set.
 * So after barring the door and THEN reading the letter (or proving the story), the
 * read_letter / knows_proof variant won and still called the alley door one that merely
 * "stands shut on the boots that keep pacing the cobbles beyond it" — with door_barred set.
 * That stale-on-state-change contradiction is the bug_0232 / bug_0248-0250 / bug_0251 class,
 * caught by the mandated blind playtest (seed 5, run 4: go_alley → steady_and_bar → read_letter).
 *
 * Fix (content only): door_barred twins for the knows_proof and read_letter forms, ordered
 * before their open-door counterparts ({knows_proof∧barred} ▸ {knows_proof} ▸
 * {read_letter∧barred} ▸ {read_letter} ▸ {barred} ▸ base). Each twin keeps its knowledge
 * flavour and names the barred door. door_barred is monotonic, so no form regresses.
 *
 * This locks:
 *   (1) barred ∧ read_letter — hub shows the barred clause, never the open-door "boots that
 *       keep pacing" stale clause (the teeth: this is what bug_0251 did not cover);
 *   (2) barred ∧ knows_proof — same, on the full-diligence path;
 *   (3) backward-compat — read_letter WITHOUT barring still shows the open-door form (the fix
 *       did not over-fire the barred clause onto the unbarred path);
 *   (4) structural pin — the hub has a variant guarded on BOTH read_letter ∧ door_barred and
 *       one on BOTH knows_proof ∧ door_barred (the cross-product cells the bug missed).
 */
import { describe, it, expect } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { Action } from "../../src/api/types.js";

const loaded = loadPackFile("content/cyoa/pack/midnight_edition.yaml");
if (!loaded.ok) throw new Error("midnight_edition pack must compile");
const index = indexPack(loaded.compiled.pack);
const rules = buildRules(index);
const choose = (id: string): Action => ({ type: "CHOOSE", choiceId: id });

function playFrom(seed: number, ids: string[]) {
  const step = makeStep(rules);
  let s = initStateForPack(index, seed);
  for (const id of ids) s = step(s, choose(id)).state;
  return s;
}
const text = (s: ReturnType<typeof playFrom>) => buildObservation(index, s).text.toLowerCase();

// The stale "open door" clause that must NOT appear once the door is barred.
const OPEN_DOOR = "boots that keep pacing";
// The barred-door clause: every barred hub form names the men "you found" behind the bar.
const BARRED = "the men you found";

describe("bug_0268 — composing_room hub door-state prose survives the barred × knowledge cross-product", () => {
  it("(1) TEETH — barred ∧ read_letter: hub names the barred door, never the open-door 'boots' clause", () => {
    // The exact route the blind tester hit: out to the alley, bar the door, THEN read the letter.
    const s = playFrom(5, ["go_alley", "bar_door", "read_letter"]);
    expect(s.current).toBe("composing_room");
    expect(s.flags["door_barred"]).toBe(true);
    expect(s.flags["read_letter"]).toBe(true);
    const t = text(s);
    expect(t).toContain("is barred"); // door state reflected
    expect(t).toContain(BARRED);
    expect(t).not.toContain(OPEN_DOOR); // the stale clause is gone
    // and the knowledge flavour is retained, not lost to the barred-only form:
    expect(t).toContain("make it true or break it");
  });

  it("(2) barred ∧ knows_proof: full-diligence hub still names the barred door, not the stale clause", () => {
    const s = playFrom(5, [
      "go_alley",
      "bar_door",
      "read_letter",
      "go_office",
      "search_desk",
      "open_safe",
      "read_report",
      "leave_office",
    ]);
    expect(s.current).toBe("composing_room");
    expect(s.flags["door_barred"]).toBe(true);
    expect(s.flags["knows_proof"]).toBe(true);
    const t = text(s);
    expect(t).toContain("is barred");
    expect(t).toContain(BARRED);
    expect(t).not.toContain(OPEN_DOOR);
    // proven-report flavour retained (the knows_proof form, not the barred-only form):
    expect(t).toContain("read and\n          proven".replace(/\s+/g, " ")); // "read and proven"
    expect(t).toContain("which page you set");
  });

  it("(3) backward-compat — read_letter WITHOUT barring keeps the open-door form", () => {
    const s = playFrom(5, ["read_letter"]);
    expect(s.current).toBe("composing_room");
    expect(s.flags["door_barred"]).not.toBe(true);
    const t = text(s);
    expect(t).toContain(OPEN_DOOR); // unbarred path is unchanged
    expect(t).not.toContain(BARRED);
  });

  it("(4) structural pin — the hub carries read_letter∧door_barred and knows_proof∧door_barred variants", () => {
    const scene = loaded.compiled.pack.scenes.find((sc) => sc.id === "composing_room");
    expect(scene, "composing_room must exist").toBeTruthy();
    const variants = scene?.variants ?? [];
    const hasFlag = (when: unknown[], flag: string) =>
      when.some(
        (c) =>
          typeof c === "object" && c !== null && (c as { has_flag?: string }).has_flag === flag,
      );
    const guardsCombo = (a: string, b: string) =>
      variants.some((v) => hasFlag(v.when, a) && hasFlag(v.when, b));
    expect(guardsCombo("read_letter", "door_barred")).toBe(true);
    expect(guardsCombo("knows_proof", "door_barred")).toBe(true);
  });
});
