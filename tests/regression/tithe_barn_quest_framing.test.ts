/**
 * Regression for bug_0422 -- The Tithe-Barn's world quest hook said
 * "concealed tithe record" even though the steward's book is openly on the
 * table. A blind player read that as a promise of a second hidden document.
 */
import { describe, expect, it } from "vitest";
import { loadPackFile } from "../../src/cyoa/pack.js";
import { indexPack, initStateForPack } from "../../src/cyoa/runner.js";
import { buildObservation } from "../../src/cyoa/observation.js";
import { validateCyoa } from "../../src/validate/cyoa_validator.js";

const loaded = loadPackFile("content/cyoa/pack/tithe_barn.yaml");
if (!loaded.ok) throw new Error("tithe_barn pack must compile");
const pack = loaded.compiled.pack;
const index = indexPack(pack);

describe("bug_0422 -- Tithe-Barn quest framing matches the open ledger", () => {
  it("world quest copy names the actual grain decision, not a hidden record hunt", () => {
    const quest = pack.meta.world?.quest;
    if (!quest) throw new Error("tithe_barn must declare a world quest");

    expect(quest).toMatch(/hoarded grain/i);
    expect(quest).toMatch(/stays locked/i);
    expect(quest).not.toMatch(/concealed/i);
    expect(quest).not.toMatch(/hidden/i);
    expect(quest).not.toMatch(/record/i);
  });

  it("opening world text does not point players at a phantom concealed document", () => {
    const opening = buildObservation(index, initStateForPack(index, 7), {
      includeWorldIntro: true,
    }).text;

    expect(opening).toContain("North Tithe Barn");
    expect(opening).toContain("tithe watcher");
    expect(opening).toMatch(/hoarded grain stays locked/i);
    expect(opening).not.toMatch(/concealed tithe record/i);
  });

  it("pack still validates cleanly", () => {
    const report = validateCyoa(pack);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });
});
