/**
 * bug_0260 — internal-bookkeeping `state_change` events must not leak into the
 * player-facing event stream (a blind-playtest finding, sunken_barrow seed 13 §4,
 * ai-runs/2026-06-04T23-46-24-371Z/playtest.md).
 *
 * Some engine effects write `__`-prefixed vars/flags that exist only to drive
 * mechanics, never to be read by the player: the per-enemy HP tracker
 * `__enemy_hp_<id>` (rpg/schema enemyHpVar, written every combat round) and the
 * dialogue-progress flag `__dlg_<npc>` (parser/model dlgFlag). observation.ts has
 * always hidden these from `state.flags` / `state.vars`, but the raw `events` array
 * returned by step_action — and recorded in the transcript get_transcript shows —
 * still surfaced them as `set_var` / `set_flag` state_change events, so a
 * source-blind MCP-only player saw `__enemy_hp_barrow_wight` / `__dlg_reaver_shade`
 * scroll past. tools.ts:playerVisibleEvents now filters them at the player boundary.
 *
 * The contract this pins:
 *   1. No player-facing event (step_action return OR get_transcript turn) is an
 *      internal `__`-prefixed state_change.
 *   2. The filter is NOT vacuous: the internal write genuinely HAPPENED — the raw
 *      GameState (get_state, the debug window) carries the `__`-prefixed var — yet
 *      the event stream omits it.
 *   3. No legible information is lost: the combat NARRATION ("You strike … N HP
 *      left") still rides the same step's events.
 */
import { describe, it, expect } from "vitest";
import { createToolApi } from "../../src/mcp/tools.js";
import type { GameEvent } from "../../src/core/events.js";

const ROOT = process.cwd();
const WORLD_QUEST_ID = "sunken_barrow";

const isInternalStateChange = (e: GameEvent): boolean => {
  if (e.type !== "state_change") return false;
  const sc = e as { flag?: unknown; name?: unknown };
  const key = typeof sc.flag === "string" ? sc.flag : typeof sc.name === "string" ? sc.name : "";
  return key.startsWith("__");
};

type LegalAction = { id: string; command: string };
const api = () => createToolApi({ root: ROOT });

describe("MCP step_action / get_transcript hide internal __-prefixed events (bug_0260)", () => {
  it("a combat round writes __enemy_hp internally but never surfaces it as an event", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    const sid = game.session_id;
    const byCmd = (needle: string): string | undefined =>
      (a.list_legal_actions({ session_id: sid }).actions as LegalAction[]).find((x) =>
        x.command.includes(needle),
      )?.id;

    // down → take iron bar → north → the barrow-wight stands in the guard crypt.
    expect(a.step_action({ session_id: sid, action_id: byCmd("go down")! }).ok).toBe(true);
    expect(a.step_action({ session_id: sid, action_id: byCmd("take iron bar")! }).ok).toBe(true);
    expect(a.step_action({ session_id: sid, action_id: byCmd("go north")! }).ok).toBe(true);

    const attackId = byCmd("attack");
    expect(attackId).toBeTruthy();
    const r = a.step_action({
      session_id: sid,
      action_id: attackId!,
      compact_events: false,
    }) as {
      ok: boolean;
      events: GameEvent[];
    };
    expect(r.ok).toBe(true);

    // (1) No internal state_change leaks into the player-facing events.
    expect(r.events.some(isInternalStateChange)).toBe(false);
    expect(
      r.events.some(
        (e) =>
          e.type === "state_change" && /^__enemy_hp_/.test(String((e as { name?: unknown }).name)),
      ),
    ).toBe(false);

    // (2) Not vacuous: the combat round DID write the hidden enemy-HP var — the raw
    // GameState (get_state, the debug window, deliberately unfiltered) proves it.
    const raw = a.get_state({ session_id: sid, include_state: true }) as {
      state: { vars: Record<string, number> };
    };
    const enemyHpKey = Object.keys(raw.state.vars).find((k) => k.startsWith("__enemy_hp_"));
    expect(enemyHpKey).toBeTruthy();

    // (3) No legible information lost: the strike narration still rides this step.
    expect(r.events.some((e) => e.type === "narration" && /strike/i.test(e.text))).toBe(true);

    // The transcript get_transcript shows is filtered the same way.
    const tx = a.get_transcript({
      session_id: sid,
      summary_only: false,
      compact_events: false,
    }) as { turns: { events: GameEvent[] }[] };
    expect(tx.turns.flatMap((t) => t.events).some(isInternalStateChange)).toBe(false);
  });

  it("a dialogue topic writes __dlg internally but never surfaces it as an event", () => {
    const a = api();
    const game = a.start_world_quest({ world_quest_id: WORLD_QUEST_ID, seed: 1 });
    const sid = game.session_id;
    const byCmd = (needle: string): string | undefined =>
      (a.list_legal_actions({ session_id: sid }).actions as LegalAction[]).find((x) =>
        x.command.includes(needle),
      )?.id;

    // down → west → talk to the reaver's shade (opens the dialogue, sets __dlg).
    expect(a.step_action({ session_id: sid, action_id: byCmd("go down")! }).ok).toBe(true);
    expect(a.step_action({ session_id: sid, action_id: byCmd("go west")! }).ok).toBe(true);
    const talkId = byCmd("talk to");
    expect(talkId).toBeTruthy();
    const talk = a.step_action({
      session_id: sid,
      action_id: talkId!,
      compact_events: false,
    }) as {
      ok: boolean;
      events: GameEvent[];
    };
    expect(talk.ok).toBe(true);

    // The dialogue-progress var (__dlg_<npc>, set on TALK) is internal and must not
    // appear as an event...
    expect(talk.events.some(isInternalStateChange)).toBe(false);
    expect(
      talk.events.some(
        (e) => e.type === "state_change" && /^__dlg_/.test(String((e as { name?: unknown }).name)),
      ),
    ).toBe(false);

    // ...yet the raw state proves the __dlg var was genuinely written.
    const raw = a.get_state({ session_id: sid, include_state: true }) as {
      state: { vars: Record<string, number> };
    };
    expect(Object.keys(raw.state.vars).some((v) => v.startsWith("__dlg_"))).toBe(true);

    // And the dialogue node text the player should read still surfaces via the
    // observation (a `dialogue` event), not via a leaked flag.
    const tx = a.get_transcript({
      session_id: sid,
      summary_only: false,
      compact_events: false,
    }) as { turns: { events: GameEvent[] }[] };
    expect(tx.turns.flatMap((t) => t.events).some(isInternalStateChange)).toBe(false);
  });
});
