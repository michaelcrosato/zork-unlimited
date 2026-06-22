/**
 * Regression for bug_0437 — the marking knife evidence path existed, but a blind
 * player missed it, finished at 30/40, and the registered ending still claimed a
 * notched cable span. The knife path is now signposted in the contract/shed/object
 * prose, and the ending stays truthful when either or both knife findings are absent.
 */
import { describe, it, expect } from "vitest";
import { loadParserPackFile } from "../../src/parser/pack.js";
import {
  buildParserRules,
  indexParserPack,
  initStateForParserPack,
} from "../../src/parser/runner.js";
import { enumerateActions } from "../../src/parser/legal_actions.js";
import { buildParserObservation } from "../../src/parser/observation.js";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";

const loaded = loadParserPackFile("content/parser/pack/ropewalkers_twist.yaml");
if (!loaded.ok) throw new Error("ropewalkers_twist must compile");
const pack = loaded.compiled.pack;
const index = indexParserPack(pack);
const step = makeStep(buildParserRules(index));

function play(s: GameState, ids: string[]): GameState {
  for (const id of ids) {
    const opt = enumerateActions(index, s).find((o) => o.id === id);
    if (!opt) {
      throw new Error(
        `"${id}" not legal in ${s.current}: [${enumerateActions(index, s)
          .map((o) => o.id)
          .join(", ")}]`,
      );
    }
    const result = step(s, opt.action);
    expect(result.ok).toBe(true);
    s = result.state;
  }
  return s;
}

const actionIds = (s: GameState): string[] => enumerateActions(index, s).map((o) => o.id);
const obs = (s: GameState) => buildParserObservation(index, s);
const desc = (s: GameState): string => obs(s).description;

function actionNarration(s: GameState, id: string): string {
  const opt = enumerateActions(index, s).find((o) => o.id === id);
  if (!opt) throw new Error(`"${id}" not legal in ${s.current}`);
  const result = step(s, opt.action);
  expect(result.ok).toBe(true);
  return result.events
    .filter((e): e is { type: "narration"; text: string } => e.type === "narration")
    .map((e) => e.text)
    .join(" ");
}

const BLIND_ROUTE = [
  "read_quay_contract",
  "take_inspector_token",
  "go_east",
  "take_twist_gauge",
  "use_twist_gauge_on_laid_cable",
  "go_up",
  "read_foremans_tally",
  "take_foremans_tally",
  "go_down",
  "go_west",
  "go_north",
];

const FULL_ROUTE = [
  "read_quay_contract",
  "take_inspector_token",
  "go_east",
  "take_marking_knife",
  "take_twist_gauge",
  "use_marking_knife_on_green_hemp",
  "use_twist_gauge_on_laid_cable",
  "use_marking_knife_on_laid_cable",
  "go_up",
  "take_foremans_tally",
  "go_down",
  "go_west",
  "go_north",
];

describe("bug_0437 — ropewalkers_twist signposts and truthfully reports the marking-knife evidence", () => {
  it("contract, shed, hemp, cable, and knife prose all point at parting hemp / notching the span", () => {
    const contract = pack.objects.find((o) => o.id === "quay_contract")!;
    expect(contract.read_text).toMatch(/part the hemp with the marking knife/i);
    expect(contract.read_text).toMatch(/notch the measured span/i);

    const shed = pack.rooms.find((r) => r.id === "rope_shed")!;
    expect(shed.description).toMatch(/marking knife.*parting hemp and notching/i);

    const hemp = pack.objects.find((o) => o.id === "green_hemp")!;
    expect(hemp.description).toMatch(/knife point.*part the outer fiber/i);

    const knife = pack.objects.find((o) => o.id === "marking_knife")!;
    expect(knife.description).toMatch(/part suspect hemp/i);
    expect(knife.description).toMatch(/notch a strand/i);

    const measuredCable = pack.objects
      .find((o) => o.id === "laid_cable")!
      .variants?.find((v) => JSON.stringify(v.when).includes("twist_measured"));
    expect(measuredCable?.text).toMatch(/marking knife can notch this span/i);
  });

  it("taking the knife surfaces the green-hemp action, and measuring then surfaces the cable-notch action", () => {
    const withKnife = play(initStateForParserPack(index, 7), ["go_east", "take_marking_knife"]);
    expect(actionIds(withKnife)).toContain("use_marking_knife_on_green_hemp");
    expect(actionIds(withKnife)).not.toContain("use_marking_knife_on_laid_cable");

    const measured = play(withKnife, ["take_twist_gauge", "use_twist_gauge_on_laid_cable"]);
    expect(actionIds(measured)).toContain("use_marking_knife_on_green_hemp");
    expect(actionIds(measured)).toContain("use_marking_knife_on_laid_cable");
    expect(actionNarration(measured, "examine_laid_cable")).toMatch(
      /marking knife can notch this span/i,
    );
  });

  it("the blind 30/40 route no longer lies about a notched cable span and tells what was missed", () => {
    const s = play(initStateForParserPack(index, 7), BLIND_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_registered");
    expect(obs(s).score).toBe(30);
    expect(s.flags["twist_measured"]).toBe(true);
    expect(s.flags["found_green_hemp"]).toBeFalsy();
    expect(s.flags["cable_notched"]).toBeFalsy();

    const ending = desc(s).toLowerCase();
    expect(ending).not.toContain("notched cable span");
    expect(ending).toContain("hemp unparted");
    expect(ending).toContain("span unnotched");
  });

  it("the full knife route reaches 40/40 and keeps the original full-proof ending truthful", () => {
    const s = play(initStateForParserPack(index, 7), FULL_ROUTE);
    expect(s.ended).toBe(true);
    expect(s.endingId).toBe("ending_registered");
    expect(obs(s).score).toBe(40);
    expect(s.flags["found_green_hemp"]).toBe(true);
    expect(s.flags["cable_notched"]).toBe(true);

    const ending = desc(s).toLowerCase();
    expect(ending).toContain("notched cable span");
    expect(ending).toContain("green hemp");
    expect(ending).not.toContain("hemp unparted");
    expect(ending).not.toContain("span unnotched");
  });

  it("partial knife evidence variants name the specific missing proof instead of using the full-proof text", () => {
    const hempOnly = play(initStateForParserPack(index, 7), [
      "read_quay_contract",
      "take_inspector_token",
      "go_east",
      "take_marking_knife",
      "use_marking_knife_on_green_hemp",
      "go_up",
      "take_foremans_tally",
      "go_down",
      "go_west",
      "go_north",
    ]);
    expect(obs(hempOnly).score).toBe(30);
    expect(desc(hempOnly)).toMatch(/left the measured\s+span unnotched/i);

    const notchOnly = play(initStateForParserPack(index, 7), [
      "read_quay_contract",
      "take_inspector_token",
      "go_east",
      "take_marking_knife",
      "take_twist_gauge",
      "use_twist_gauge_on_laid_cable",
      "use_marking_knife_on_laid_cable",
      "go_up",
      "take_foremans_tally",
      "go_down",
      "go_west",
      "go_north",
    ]);
    expect(obs(notchOnly).score).toBe(35);
    expect(desc(notchOnly)).toMatch(/left the green hemp\s+unparted/i);
  });
});
