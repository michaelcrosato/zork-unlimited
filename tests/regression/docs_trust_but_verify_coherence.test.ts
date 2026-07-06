/**
 * bug_0049 — the canonical blind-playtest protocol stops instructing the RETIRED
 * §14 human-approval ceremony as live policy.
 *
 * Backstory: the project switched to "trust, but verify" — the agent has full
 * authority over ALL game code (engine, validators, schemas), gated by nothing but
 * the automated verification (AGENTS.md: "no human-approval gate and no §14
 * ceremony"). But docs/blind_playtest_protocol.md — the canonical protocol the AFK
 * loop runs EVERY cycle and wires into the agent prompt (src/ai-loop.ts) — still
 * carried the pre-charter triage rule: "engine_rule / validator / schema → gated
 * (§14): propose only; a human reviews. Do not silently change engine rules in an
 * AFK cycle." A fresh agent following it would refuse the very engine/validator
 * fixes the charter grants — the concrete form of the long-logged bug_0045
 * deferred[a] lever (docs citing a RETIRED CONCEPT, the §14 ceremony).
 *
 * This locks the fix with a conservative, deterministic guard: it flags only the
 * phrases that instruct the gate as LIVE policy, and must stay silent on the
 * legitimate NEGATIONS the charter docs use ("no §14 ceremony", "no human-approval
 * gate") and on history/spec docs that merely RECORD the retired ceremony. We check
 * only the docs a fresh agent actually follows as current process.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// The conservative predicate now lives in a shared module (bug_0050 reuses it to
// guard agent-facing code comments as well as these current-process docs).
import { instructsRetiredGateAsLive } from "../../src/afk/gate_coherence.js";

const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

// The docs a fresh agent follows as CURRENT process (NOT README's mixed history,
// NOT the historical AI_LOOP_STATE.md, NOT the ROADMAP/BUILD_SPEC/stage4 records).
const CURRENT_PROCESS_DOCS = ["AGENTS.md", "docs/blind_playtest_protocol.md", "docs/afk_loop.md"];

describe("bug_0049 — instructsRetiredGateAsLive (the predicate)", () => {
  it("flags the pre-charter triage instruction", () => {
    const stale =
      "`engine_rule` / `validator` / schema → **gated** (§14): propose only; a human\nreviews. Do not silently change engine rules in an AFK cycle.";
    expect(instructsRetiredGateAsLive(stale).length).toBeGreaterThan(0);
  });

  it("is silent on the trust-but-verify replacement", () => {
    const fixed =
      "`engine_rule` / `validator` / schema → change them **freely under trust, but\nverify** (`AGENTS.md`): full authority, no human-approval gate, no §14 ceremony.\nThe automated verification is the bar — keep `npm run health` green.";
    expect(instructsRetiredGateAsLive(fixed)).toEqual([]);
  });

  it("does NOT false-fire on the legitimate negations the charter docs use", () => {
    // AGENTS.md / afk_loop.md correctly say the ceremony is GONE — never flag those.
    const negations = [
      "with **no human-approval gate and no §14 ceremony**. You decide what to build",
      "full authority; new mechanics need no §14 ceremony, but stay verified",
      "no permission needed, no human gate, no extension-gate paperwork",
    ].join("\n");
    expect(instructsRetiredGateAsLive(negations)).toEqual([]);
  });

  it("does NOT false-fire on a historical record of the retired ceremony", () => {
    // README/stage4 record what HAPPENED ("went through the §14 gate") — history,
    // not a live instruction. The predicate only matches imperative gate phrasing.
    const history = "Two small additive engine extensions went through the §14 gate, recorded in";
    expect(instructsRetiredGateAsLive(history)).toEqual([]);
  });
});

describe("bug_0049 — the current-process docs on the REAL repo (charter-coherent)", () => {
  it.each(CURRENT_PROCESS_DOCS)("%s does not instruct the retired §14 gate as live", (doc) => {
    expect(instructsRetiredGateAsLive(read(doc))).toEqual([]);
  });

  it("the protocol affirmatively routes engine/validator fixes through trust-but-verify", () => {
    // Guard against passing VACUOUSLY (by deleting the triage bullet): the doc must
    // still tell the agent what to do with an engine/validator finding — and that it
    // is full-authority + verification-gated, matching AGENTS.md.
    const protocol = read("docs/blind_playtest_protocol.md");
    expect(protocol).toMatch(/engine_rule.*validator.*schema/s);
    expect(protocol).toMatch(/trust, but\s+verify/i);
    expect(protocol).toContain("no human-approval gate");
  });

  it("the blind protocol keeps MCP playtests on compact RPG loop responses", () => {
    const protocol = read("docs/blind_playtest_protocol.md");
    expect(protocol).toContain("compact_observation = true");
    expect(protocol).toContain("hide_graph = true");
    expect(protocol).toContain("list_legal_actions");
    expect(protocol).toContain("compact_actions = true");
    expect(protocol).toContain("expected_state_hash = latest state_hash");
    expect(protocol).toContain("include_actions = true");
    expect(protocol).toContain("compact_actions = false");
    expect(protocol).toContain("get_state");
    expect(protocol).toContain("compact_state = true");
    expect(protocol).toContain("include_state = true");
    expect(protocol).toContain("summary_only = true");
    expect(protocol).toContain("compact_summary = true");
    expect(protocol).toContain("compact_turns = true");
  });

  it("stays coherent with the AGENTS.md charter (no §14 ceremony, no human gate)", () => {
    const agents = read("AGENTS.md");
    expect(agents).toContain("no §14 ceremony");
    expect(instructsRetiredGateAsLive(agents)).toEqual([]);
  });

  it("WOULD catch a regression if the stale instruction returned (mechanism live)", () => {
    // Prove the guard isn't vacuous: re-inject the exact retired-gate line into the
    // real protocol text and the predicate flags it.
    const protocol = read("docs/blind_playtest_protocol.md");
    const regressed =
      protocol + "\n   - engine_rule → **gated** (§14): propose only; a human\nreviews.";
    expect(instructsRetiredGateAsLive(regressed).length).toBeGreaterThan(0);
  });
});
