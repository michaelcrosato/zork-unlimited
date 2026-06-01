/**
 * Debugger + Fixer agents (spec §12.5, §15, §16).
 *
 * The debugger classifies a trace's outcome from the pure engine; the fixer
 * applies a closed, whitelisted patch and re-validates. Both are deterministic
 * code — no live model, no file/shell access from content.
 */
import { describe, it, expect } from "vitest";
import { compilePackOrThrow } from "../../src/cyoa/pack.js";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexPack, buildRules, initStateForPack } from "../../src/cyoa/runner.js";
import { diagnose, toBugArtifact } from "../../agents/debugger.js";
import { applyContentPatch, proposeFix, type ContentPatchProposal } from "../../agents/fixer.js";

// A pack whose scene "b" has only a flag-gated choice ⇒ a soft-lock once reached.
const SOFTLOCK_YAML = `
meta: { id: dbg_pack, title: Dbg, start: a }
scenes:
  - id: a
    title: A
    text: "Start."
    choices:
      - { id: go, text: "Go to B.", next: b }
  - id: b
    title: B
    text: "A locked door, no key in sight."
    choices:
      - { id: locked, text: "Open the door.", conditions: [ { has_flag: never_set } ], next: win }
endings:
  - { id: win, title: Win, text: "Done." }
`;

describe("debugger.diagnose", () => {
  const compiled = compilePackOrThrow(SOFTLOCK_YAML);
  const index = indexPack(compiled.pack);
  const rules = buildRules(index);

  it("detects a soft-lock (no legal actions, not ended)", () => {
    const state = initStateForPack(index, 1);
    const d = diagnose(rules, state, [{ type: "CHOOSE", choiceId: "go" }]);
    expect(d.type).toBe("soft_lock");
    expect(d.severity).toBe("high");
    expect(d.where).toContain("location:b");
  });

  it("detects a non-progress loop", () => {
    // Self-loop pack: choosing 'stay' returns to the same scene/state.
    const loopPack = compilePackOrThrow(`
meta: { id: loop_pack, title: Loop, start: a }
scenes:
  - id: a
    title: A
    text: "You pace in a circle."
    choices:
      - { id: stay, text: "Pace again.", next: a }
endings: []
`);
    const li = indexPack(loopPack.pack);
    const d = diagnose(buildRules(li), initStateForPack(li, 1), [
      { type: "CHOOSE", choiceId: "stay" },
      { type: "CHOOSE", choiceId: "stay" },
    ]);
    expect(d.type).toBe("loop");
  });

  it("reports no_failure on a clean ending and builds a §15 artifact", () => {
    const winPack = compilePackOrThrow(`
meta: { id: win_pack, title: Win, start: a }
scenes:
  - id: a
    title: A
    text: "One step to victory."
    choices:
      - { id: finish, text: "Win.", next: done }
endings:
  - { id: done, title: Done, text: "Victory." }
`);
    const wi = indexPack(winPack.pack);
    const state = initStateForPack(wi, 1);
    const actions = [{ type: "CHOOSE" as const, choiceId: "finish" }];
    const d = diagnose(buildRules(wi), state, actions);
    expect(d.type).toBe("no_failure");

    const artifact = toBugArtifact(state, actions, d, { bugId: "bug_test_0001", packId: "win_pack", contentHash: winPack.contentHash });
    expect(artifact.bug_id).toBe("bug_test_0001");
    expect(artifact.initial_state).toBe("start");
    expect(artifact.trace).toEqual(actions);
  });
});

describe("fixer.applyContentPatch", () => {
  const loaded = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
  if (!loaded.ok) throw new Error("sealed_crypt failed to compile");
  const rawPack = loaded.compiled.pack;

  it("applies a benign hint and re-validates green", () => {
    const proposal: ContentPatchProposal = {
      layer: "hint_text",
      mode: "parser",
      summary: "hint at the start room",
      ops: [{ op: "add_room_journal_hint", room: "forest_path", text: "Mud shows fresh bootprints leading toward the chapel." }],
    };
    const res = applyContentPatch(rawPack, proposal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.applied).toBe(1);
  });

  it("refuses a patch whose target does not exist", () => {
    const res = applyContentPatch(rawPack, { layer: "content", mode: "parser", summary: "x", ops: [{ op: "set_object_field", id: "no_such_object", field: "quest_critical", value: true }] });
    expect(res.ok).toBe(false);
    expect(res.report.findings[0]?.code).toBe("PATCH_TARGET_MISSING");
  });

  it("refuses a patch that breaks the schema (§16)", () => {
    // max_score must be a number; a string value must be rejected, not shipped.
    const res = applyContentPatch(rawPack, { layer: "content", mode: "parser", summary: "x", ops: [{ op: "set_meta", field: "max_score", value: "lots" }] });
    expect(res.ok).toBe(false);
    expect(res.report.findings.some((f) => f.code === "PATCH_SCHEMA_BREAK")).toBe(true);
  });
});

describe("fixer.proposeFix", () => {
  it("proposes a single-layer hint for a parser soft-lock", () => {
    const p = proposeFix({ type: "soft_lock", description: "stuck", severity: "high", where: [], step: 3 }, { mode: "parser", location: "old_well" });
    expect(p.layer).toBe("hint_text");
    expect(p.ops).toHaveLength(1);
    expect(p.ops[0]?.op).toBe("add_room_journal_hint");
  });
});
