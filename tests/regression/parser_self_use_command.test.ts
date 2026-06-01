/**
 * Regression (§15) for bug_0009 — a self-targeted USE read as nonsensical.
 *
 * A blind MCP playtester of The Alchemist's Tower (ai-runs/2026-06-01T06-09-34-002Z,
 * seed 13) flagged the clued death trap: after taking the black phial, the only
 * action to consume it rendered as the command "use black phial on black phial"
 * (id `use_black_phial_on_black_phial`) — a USE whose item AND target are the same
 * object. It reads like an authoring bug and it contradicts the recipe's own
 * wording ("Do not DRINK it"): the warning says drink, but the matching action said
 * "use X on X". The fix is an ENGINE one, generic across every pack: a self-targeted
 * USE (item === target) is the "consume this thing" pattern (drink the phial, eat
 * the bread) and is surfaced as `use <obj>` (id `use_<obj>`), with the human command
 * parser accepting the bare "use <obj>" only when the object has a self-interaction.
 *
 * Locked here:
 *   (1) the held black phial is offered as `use_black_phial` / "use black phial",
 *       never the old self-targeted "use ... on ..." form;
 *   (2) the human parser maps "use black phial" → USE(black_phial, black_phial),
 *       and the action still fires ending_poisoned (behaviour preserved);
 *   (3) a NON-self-use item is unaffected: "use rope on old well" still parses, and
 *       a bare "use rope" (rope has no self-interaction) still asks for a target.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import { indexParserPack, buildParserRules, initStateForParserPack } from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { parseCommand } from "../../src/parser/command_map.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const alch = loadParserPackFile("content/parser/pack/alchemists_tower.yaml");
if (!alch.ok) throw new Error("alchemists_tower must compile");
const aIndex = indexParserPack(alch.compiled.pack);
const aStep = makeStep(buildParserRules(aIndex));

function play(index: typeof aIndex, step: typeof aStep, s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) throw new Error(`"${id}" not legal in ${s.current}: [${enumerateActions(index, s).map((o) => o.id).join(", ")}]`);
    const r = step(s, opt.action);
    expect(r.ok).toBe(true);
    s = r.state;
  }
  return s;
}

// Reach the laboratory and pocket the black phial (one step from drinking it).
const TO_PHIAL = [
  "go_west", "read_spellbook", "go_east", "go_east", "take_herb", "take_brass_key",
  "go_west", "go_north", "go_up", "unlock_strongbox", "open_strongbox", "take_iron_key",
  "go_down", "use_iron_key_on_cellar_door", "go_down", "take_water_vial", "go_up",
  "go_north", "take_black_phial",
];

describe("bug_0009 — a self-targeted USE reads as 'use <obj>', not 'use <obj> on <obj>'", () => {
  it("surfaces the held black phial as `use_black_phial` / 'use black phial' (no self-on-self)", () => {
    const s = play(aIndex, aStep, initStateForParserPack(aIndex, 1), TO_PHIAL);
    const actions = enumerateActions(aIndex, s);
    const phial = actions.find((a) => a.action.type === "USE" && a.action.item === "black_phial" && a.action.target === "black_phial");
    expect(phial).toBeDefined();
    expect(phial!.id).toBe("use_black_phial");
    expect(phial!.command).toBe("use black phial");
    // The old nonsensical forms are gone.
    expect(actions.some((a) => a.id === "use_black_phial_on_black_phial")).toBe(false);
    expect(actions.some((a) => a.command.includes("on black phial"))).toBe(false);
  });

  it("the human parser maps 'use black phial' to the self-USE, which still fires the death ending", () => {
    const s = play(aIndex, aStep, initStateForParserPack(aIndex, 1), TO_PHIAL);
    const parsed = parseCommand(aIndex, s, "use black phial");
    expect(parsed).toEqual({ ok: true, action: { type: "USE", item: "black_phial", target: "black_phial" } });
    const r = aStep(s, parsed.ok ? parsed.action : { type: "LOOK" });
    expect(r.ok).toBe(true);
    expect(r.state.ended).toBe(true);
    expect(r.state.endingId).toBe("ending_poisoned");
  });

  it("a non-self-use item is unaffected: 'use rope on old well' parses; bare 'use rope' still needs a target", () => {
    const crypt = loadParserPackFile("content/parser/pack/sealed_crypt.yaml");
    if (!crypt.ok) throw new Error("sealed_crypt must compile");
    const cIndex = indexParserPack(crypt.compiled.pack);
    const s0 = initStateForParserPack(cIndex, 1);
    expect(parseCommand(cIndex, s0, "use rope on old well")).toEqual({
      ok: true,
      action: { type: "USE", item: "rope", target: "old_well" },
    });
    // rope has no self-interaction, so bare "use rope" is not a valid self-USE.
    const bare = parseCommand(cIndex, s0, "use rope");
    expect(bare.ok).toBe(false);
  });
});
