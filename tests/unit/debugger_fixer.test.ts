/**
 * Debugger + Fixer agents (spec §12.5, §15, §16).
 *
 * The debugger classifies a trace's outcome from the pure engine; the fixer
 * applies a closed, whitelisted patch and re-validates. Both are deterministic
 * code — no live model, no file/shell access from content.
 */
import { describe, it, expect } from "vitest";
import { initState } from "../../src/core/state.js";
import type { Rules } from "../../src/core/engine.js";
import { loadRpgPackFile } from "../../src/rpg/pack.js";
import { diagnose, toBugArtifact } from "../../agents/debugger.js";
import {
  applyContentPatch,
  proposeFix,
  regressionTestStub,
  type ContentPatchProposal,
} from "../../agents/fixer.js";

const startState = () => initState({ seed: 1, start: "a" });

describe("debugger.diagnose", () => {
  it("detects a soft-lock (no legal actions, not ended)", () => {
    const rules: Rules = {
      legalActions: (state) => (state.current === "a" ? [{ type: "MOVE", direction: "east" }] : []),
      resolve: (state, action) =>
        state.current === "a" && action.type === "MOVE"
          ? { conditions: [], effects: [{ goto: "b" }] }
          : null,
    };

    const d = diagnose(rules, startState(), [{ type: "MOVE", direction: "east" }]);
    expect(d.type).toBe("soft_lock");
    expect(d.severity).toBe("high");
    expect(d.where).toContain("location:b");
  });

  it("detects a non-progress loop", () => {
    const rules: Rules = {
      legalActions: () => [{ type: "LOOK" }],
      resolve: () => ({ conditions: [], effects: [] }),
    };
    const d = diagnose(rules, startState(), [{ type: "LOOK" }, { type: "LOOK" }]);
    expect(d.type).toBe("loop");
  });

  it("reports no_failure on a clean ending and builds a §15 artifact", () => {
    const rules: Rules = {
      legalActions: () => [{ type: "LOOK" }],
      resolve: () => ({ conditions: [], effects: [{ end_game: "done" }] }),
    };
    const state = startState();
    const actions = [{ type: "LOOK" as const }];
    const d = diagnose(rules, state, actions);
    expect(d.type).toBe("no_failure");

    const artifact = toBugArtifact(state, actions, d, {
      bugId: "bug_test_0001",
      packId: "win_pack",
      contentHash: "hash",
    });
    expect(artifact.bug_id).toBe("bug_test_0001");
    expect(artifact.initial_state).toBe("start");
    expect(artifact.trace).toEqual(actions);
  });
});

describe("fixer.applyContentPatch", () => {
  const loaded = loadRpgPackFile("content/rpg/pack/cold_forge.yaml");
  if (!loaded.ok) throw new Error("cold_forge failed to compile");
  const rawPack = loaded.compiled.pack;

  it("applies a benign hint and re-validates green", () => {
    const proposal: ContentPatchProposal = {
      layer: "hint_text",
      summary: "hint at the start room",
      ops: [
        {
          op: "add_room_journal_hint",
          room: "forge_steps",
          text: "The forge below answers only to a delver who reads the room carefully.",
        },
      ],
    };
    const res = applyContentPatch(rawPack, proposal);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.applied).toBe(1);
  });

  it("refuses a patch whose target does not exist", () => {
    const res = applyContentPatch(rawPack, {
      layer: "content",
      summary: "x",
      ops: [{ op: "set_object_field", id: "no_such_object", field: "quest_critical", value: true }],
    });
    expect(res.ok).toBe(false);
    expect(res.report.findings[0]?.code).toBe("PATCH_TARGET_MISSING");
  });

  it("refuses a patch that breaks the schema (§16)", () => {
    // max_score must be a number; a string value must be rejected, not shipped.
    const res = applyContentPatch(rawPack, {
      layer: "content",
      summary: "x",
      ops: [{ op: "set_meta", field: "max_score", value: "lots" }],
    });
    expect(res.ok).toBe(false);
    expect(res.report.findings.some((f) => f.code === "PATCH_SCHEMA_BREAK")).toBe(true);
  });
});

describe("fixer.proposeFix", () => {
  it("proposes a single-layer hint for an RPG soft-lock", () => {
    const p = proposeFix(
      { type: "soft_lock", description: "stuck", severity: "high", where: [], step: 3 },
      { location: "old_well" },
    );
    expect(p.layer).toBe("hint_text");
    expect(p.ops).toHaveLength(1);
    expect(p.ops[0]?.op).toBe("add_room_journal_hint");
  });
});

describe("fixer.regressionTestStub", () => {
  it("generates replay regressions that load by world_quest_id through the source runtime", () => {
    const source = regressionTestStub(
      "bug_test_0002",
      "traces/bugs/bug_test_0002.yaml",
      "cold_forge",
    );

    expect(source).toContain("RpgSourceRuntime");
    expect(source).toContain('requireWorldQuestPlayable("cold_forge")');
    expect(source).not.toContain("loadRpgPackFile");
    expect(source).not.toContain("content/rpg/pack");
    expect(source).not.toContain("packPath");
  });
});
