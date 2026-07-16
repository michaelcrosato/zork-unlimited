import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const prompt = readFileSync(join(ROOT, "blind-tester", "prompt-overworld.md"), "utf8");
const runner = readFileSync(join(ROOT, "blind-tester", "run.sh"), "utf8");

describe("pure blind prompt + runner contract", () => {
  it("contains transport and game-owned exit instructions without guided coverage", () => {
    expect(prompt).toContain("mcp__adventureforge__start_overworld");
    expect(prompt).toContain("current in-game goal");
    expect(prompt).toContain("game presents its actual journey choice");
    expect(prompt).toContain("If you choose continue");
    expect(prompt).toContain("If you choose end");
    expect(prompt).toContain("mcp__adventureforge__choose_overworld_session_journey");
    expect(prompt).toContain("visible `id` value as the tool's `choice`");
    expect(prompt).toContain("`overworld_snapshot_hash`");
    expect(prompt).toContain("state-bearing compact embedded-quest");
    expect(prompt).toContain("current legal ids in `context.actions`");
    expect(prompt).toMatch(/replace\s+any older menu/);
    expect(prompt).toContain("unchanged hash reply has no context");
    expect(prompt).toContain("journey-choice pause suppresses");
    expect(prompt).toContain("mcp__adventureforge__list_legal_actions");
    expect(prompt).toContain("defaults to labeled `{ id, command }`");
    expect(prompt).toContain("`compact_actions: true`");
    expect(prompt).toContain("defaults to labeled `available_actions`");
    expect(prompt).toContain("Only then conduct the exit interview");
    expect(prompt).toContain("`exitReceipt`");
    expect(prompt).toContain('"journey_exit_receipt": {}');
    expect(prompt).not.toMatch(/"journey_exit_receipt"\s*:\s*"/);

    expect(prompt).not.toMatch(/30\s*[–-]\s*45|30\s+to\s+45/i);
    expect(prompt).not.toMatch(
      /(?:stop|end|exit|finish|quit).{0,80}(?:after|at|around|within|once).{0,50}(?:\d+|ten|twenty|thirty|forty|fifty).{0,30}(?:mcp|tool)?\s*(?:calls?|invocations?|requests?|turns?)/is,
    );
    expect(prompt).not.toMatch(/(?:call|turn|request|invocation)\s*(?:budget|limit|quota)/i);
    expect(prompt).not.toMatch(/aim for roughly|take at least|if budget allows|watch for/i);
    expect(prompt).not.toMatch(/Albany|Colonie|Wolf-Winter|breaking_weir|cautious_scout/i);
    expect(prompt).not.toContain("mcp__adventureforge__start_world_quest");
    expect(prompt).not.toContain("resolve_overworld_session_road_encounter");
    expect(prompt).not.toContain("start_overworld_session_quest");
    expect(prompt).not.toContain("include_actions: false");
  });

  it("pins live mode to pure/default and treats the 1200-second failsafe as failure only", () => {
    expect(runner).toContain('TIMEOUT="${BLIND_TIMEOUT:-1200}"');
    expect(runner).toContain('PLAY_MODE="pure"');
    expect(runner).toContain('if [[ "$PLAY_MODE" == "pure" && "$PERSONA" != "default" ]]');
    expect(runner).toContain("no exit interview or retention result is accepted");
    expect(runner).toContain("--play-mode");
    expect(runner).toContain("--run-evidence");
    expect(runner).toContain("--require-mode pure");
    expect(runner).toContain('rm -f "$PRIVATE_RUN_SIDECAR"');
    expect(runner).toContain("PURE_PUBLICATION_COMPLETE=1");
    for (const persona of ["breaker", "casual", "explorer", "lore-reader", "speedrunner"]) {
      expect(
        readFileSync(join(ROOT, "blind-tester", "personas", `${persona}.md`), "utf8"),
      ).toContain("structural mock persona only");
    }
  });
});
