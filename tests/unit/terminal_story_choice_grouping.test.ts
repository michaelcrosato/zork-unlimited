import { describe, expect, it } from "vitest";

import {
  renderTerminalStoryChoiceComparison,
  runTerminalStoryChoiceController,
} from "../../bin/terminal_story_choice.js";
import type { JourneyStoryChoicePrompt } from "../../src/world/journey_contract.js";
import {
  OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION,
  OPENING_RELIEF_OATH_CUSTOMIZE_LABEL,
  OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS,
} from "../../src/world/opening_relief_oath_presentation.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());

function roadWardenReliefOathPrompt(): JourneyStoryChoicePrompt {
  const session = new OverworldSession(WORLD);
  const registration = WORLD.opening_registration!;
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(registration.contact);
  session.chooseJourneyStory("albany:road_warden");
  const storyChoice = session.journey().storyChoice;
  if (!storyChoice?.progressiveDisclosure) {
    throw new Error("Expected the Road-Warden quick setup and comparison affordance.");
  }
  return storyChoice;
}

function prompt(kind: JourneyStoryChoicePrompt["kind"]): JourneyStoryChoicePrompt {
  return {
    id: "test:registration",
    kind,
    message: "Choose a starting role.",
    options: [
      {
        id: "custom-scout",
        label: "Scout",
        group: "custom_role",
        summary: { commitment: "Scout ahead.", immediateCost: "None", tradeoff: "No doctrine." },
        consequence: "Scout ahead. Actual cost: None. No doctrine.",
      },
      {
        id: "doctrine-keeper",
        label: "Keeper doctrine",
        group: "doctrine",
        summary: { commitment: "Keep faith.", immediateCost: "None", tradeoff: "No custom role." },
        consequence: "Keep faith. Actual cost: None. No custom role.",
      },
      {
        id: "custom-medic",
        label: "Medic",
        group: "custom_role",
        summary: { commitment: "Treat wounds.", immediateCost: "None", tradeoff: "No doctrine." },
        consequence: "Treat wounds. Actual cost: None. No doctrine.",
      },
      {
        id: "doctrine-warden",
        label: "Warden doctrine",
        group: "doctrine",
        summary: { commitment: "Guard roads.", immediateCost: "None", tradeoff: "No custom role." },
        consequence: "Guard roads. Actual cost: None. No custom role.",
      },
    ],
  } as JourneyStoryChoicePrompt;
}

function progressiveReliefOathPrompt(): JourneyStoryChoicePrompt {
  return {
    id: "test:relief-oath",
    kind: "relief_oath",
    message: "Choose duty and evidence.",
    options: [
      {
        id: "standard-packet",
        label: "Standard packet",
        summary: {
          commitment: "Bind the standard duty and evidence.",
          immediateCost: "10 minutes",
          tradeoff: "Other duty/source choices close.",
        },
        consequence: "Standard receipt.",
      },
      {
        id: "custom-full",
        label: "Full duty",
        summary: {
          commitment: "Take full duty.",
          immediateCost: "10 minutes",
          tradeoff: "Public seals bind you.",
        },
        consequence: "Full receipt.",
      },
      {
        id: "custom-limited",
        label: "Limited duty",
        summary: {
          commitment: "Take limited duty.",
          immediateCost: "5 minutes",
          tradeoff: "Cade keeps property authority.",
        },
        consequence: "Limited receipt.",
      },
      {
        id: "custom-bond",
        label: "Personal bond",
        summary: {
          commitment: "Take a personal bond.",
          immediateCost: "No time",
          tradeoff: "No public warrant.",
        },
        consequence: "Bond receipt.",
      },
    ],
    progressiveDisclosure: {
      initialOptionIds: ["standard-packet"],
      reveal: {
        id: "custom-duty-evidence",
        label: "Compare individual duties",
        description: "Reveal the three original duty cards before choosing one.",
        optionIds: ["custom-full", "custom-limited", "custom-bond"],
      },
    },
  } as JourneyStoryChoicePrompt;
}

describe("terminal registration story-choice groups", () => {
  it("offers the quick setup immediately and keeps custom duty comparison read-only", async () => {
    const prompt = roadWardenReliefOathPrompt();
    const initial = renderTerminalStoryChoiceComparison(prompt);

    expect(initial).toContain(
      `Customize: \`customize\` — ${OPENING_RELIEF_OATH_CUSTOMIZE_LABEL}. ${OPENING_RELIEF_OATH_CUSTOMIZE_DESCRIPTION}`,
    );
    expect(initial).not.toContain(OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS);
    expect(initial).toContain("1. Ready-made setup — Aid-Only + Hayden's report");
    expect(initial).toContain(
      "Ready-made plan: Start with Defense 4, the clean-feed LURE benefit, and Hayden's conditional HUNT brace.",
    );
    expect(initial).toContain("Cost: 10 minutes and $0");
    expect(initial).toContain("Give up: Other promise/report pairs close.");
    expect(initial).not.toMatch(/\b(?:DEF|DC|import|fieldTrigger)\b/i);
    expect(initial).not.toContain("Wolf-Winter promise:");
    expect(initial).not.toContain("Accept Full Compact Authority");
    expect(initial).not.toContain("Accept Aid-Only Terms\n");
    expect(initial).not.toContain("Use a Personal Bond");

    const revealSession = new OverworldSession(WORLD);
    revealSession.scoutPoi(revealSession.view().pois[0]!.id);
    revealSession.talkToCharacter(WORLD.opening_registration!.contact);
    revealSession.chooseJourneyStory("albany:road_warden");
    const revealedPrompt = revealSession.revealJourneyStory(
      prompt.id,
      prompt.progressiveDisclosure!.reveal.id,
    );
    const revealed = renderTerminalStoryChoiceComparison(revealedPrompt);
    expect(revealed).toContain(OPENING_RELIEF_OATH_FIELD_OUTCOME_COMPASS);
    expect(revealed).toContain("1. Ready-made setup — Aid-Only + Hayden's report");
    expect(revealed).toContain("2. Accept Full Compact Authority");
    expect(revealed).toContain("3. Accept Aid-Only Terms");
    expect(revealed).toContain("4. Use a Personal Bond");
    expect(revealed).toContain("Wolf-Winter promise:");
    expect(revealed).not.toContain("Customize: `customize`");
    expect(revealed.match(/^ {4}\d+\. /gm)).toHaveLength(4);
    expect(revealed.indexOf("Ready-made setup —")).toBeLessThan(
      revealed.indexOf("Accept Full Compact Authority"),
    );

    const selected: string[] = [];
    const rejected: string[] = [];
    const written: string[] = [];
    const commands = ["back", "choose albany:doctrine_road_warden_aid_route"];
    const result = await runTerminalStoryChoiceController({
      prompt,
      reader: { read: async () => commands.shift() ?? null },
      write: (text) => written.push(text),
      reject: (message) => rejected.push(message),
      choose: (option) => selected.push(option.id),
    });
    expect(rejected).toEqual([]);
    expect(written).toEqual([
      initial,
      "You must choose. Inspect an option or choose one; `back` and `cancel` cannot close this choice.",
    ]);
    expect(result).toMatchObject({
      kind: "chosen",
      option: { id: "albany:doctrine_road_warden_aid_route" },
    });
    expect(selected).toEqual(["albany:doctrine_road_warden_aid_route"]);

    const hiddenDutyId = prompt.progressiveDisclosure!.reveal.optionIds[0]!;
    const customizedSelected: string[] = [];
    const customizedRejected: string[] = [];
    const customizedWritten: string[] = [];
    const customizedCommands = [
      `choose ${hiddenDutyId}`,
      "customize",
      "choose 99",
      `choose ${hiddenDutyId}`,
    ];
    const customizedResult = await runTerminalStoryChoiceController({
      prompt,
      reader: { read: async () => customizedCommands.shift() ?? null },
      write: (text) => {
        customizedWritten.push(text);
        if (text === revealed) expect(customizedSelected).toEqual([]);
      },
      reject: (message) => customizedRejected.push(message),
      choose: (option) => customizedSelected.push(option.id),
      reveal: () => revealedPrompt,
    });
    expect(customizedRejected).toEqual([
      "Type `customize` to show the individual promises before choosing one.",
      "Choose using a number, exact option id, or full label shown above.",
    ]);
    expect(customizedWritten).toEqual([initial, revealed]);
    expect(customizedResult).toMatchObject({
      kind: "chosen",
      option: { id: hiddenDutyId },
    });
    expect(customizedSelected).toEqual([hiddenDutyId]);

    const numericSelected: string[] = [];
    const numericResult = await runTerminalStoryChoiceController({
      prompt,
      reader: { read: async () => "choose 1" },
      write: () => undefined,
      reject: (message) => {
        throw new Error(message);
      },
      choose: (option) => numericSelected.push(option.id),
    });
    expect(numericResult).toMatchObject({
      kind: "chosen",
      option: { id: "albany:doctrine_road_warden_aid_route" },
    });
    expect(numericSelected).toEqual(["albany:doctrine_road_warden_aid_route"]);
  });

  it("labels doctrine and custom-role cards without changing generic comparisons", async () => {
    const grouped = renderTerminalStoryChoiceComparison(prompt("registration"));

    expect(grouped).toContain("  Choose a ready-made background");
    expect(grouped).toContain("  Build a custom background");
    expect(grouped.indexOf("Choose a ready-made background")).toBeLessThan(
      grouped.indexOf("Build a custom background"),
    );
    expect(grouped.match(/^ {4}\d+\. /gm)).toHaveLength(4);
    expect(grouped.indexOf("1. Keeper doctrine")).toBeLessThan(grouped.indexOf("3. Scout"));
    expect(grouped).toContain("4. Medic");
    expect(grouped).toContain("Background: Keep faith.");

    const generic = renderTerminalStoryChoiceComparison(prompt("preparation"));
    expect(generic).not.toContain("Choose a ready-made background");
    expect(generic).not.toContain("Build a custom background");
    expect(generic.match(/^ {4}\d+\. /gm)).toHaveLength(4);
    expect(generic.indexOf("1. Scout")).toBeLessThan(generic.indexOf("2. Keeper doctrine"));
    expect(generic).toContain("Field kit: Scout ahead.");
    expect(generic).not.toContain("Promise / priority:");

    const selected: string[] = [];
    const result = await runTerminalStoryChoiceController({
      prompt: prompt("registration"),
      reader: { read: async () => "choose 1" },
      write: () => undefined,
      reject: (message) => {
        throw new Error(message);
      },
      choose: (option) => selected.push(option.id),
    });
    expect(result).toMatchObject({ kind: "chosen", option: { id: "doctrine-keeper" } });
    expect(selected).toEqual(["doctrine-keeper"]);
  });

  it("reveals custom relief terms locally before their exact commands become available", async () => {
    const prompt = progressiveReliefOathPrompt();
    const initial = renderTerminalStoryChoiceComparison(prompt);
    expect(initial).toContain("1. Standard packet");
    expect(initial).toContain("Customize: `customize` — Compare individual duties.");
    expect(initial.indexOf("Customize: `customize`")).toBeLessThan(
      initial.indexOf("1. Standard packet"),
    );
    expect(initial).not.toContain("Full duty");
    expect(initial).not.toContain("custom-full");

    const revealed = renderTerminalStoryChoiceComparison(prompt, {
      revealId: prompt.progressiveDisclosure!.reveal.id,
    });
    expect(revealed).toContain("1. Standard packet");
    expect(revealed).toContain("2. Full duty");
    expect(revealed).toContain("3. Limited duty");
    expect(revealed).toContain("4. Personal bond");
    expect(revealed).not.toContain("Customize: `customize`");

    const commands = [
      "choose custom-full",
      "customize",
      "inspect custom-full",
      "choose custom-full",
    ];
    const selected: string[] = [];
    const rejected: string[] = [];
    const written: string[] = [];
    const result = await runTerminalStoryChoiceController({
      prompt,
      reader: { read: async () => commands.shift() ?? null },
      write: (text) => written.push(text),
      reject: (message) => rejected.push(message),
      choose: (option) => selected.push(option.id),
    });

    expect(rejected).toEqual([
      "Type `customize` to show the individual promises before choosing one.",
    ]);
    expect(written).toHaveLength(3);
    expect(written[0]).toBe(initial);
    expect(written[1]).toBe(revealed);
    expect(written[2]).toContain("Choice details — Full duty");
    expect(result).toMatchObject({ kind: "chosen", option: { id: "custom-full" } });
    expect(selected).toEqual(["custom-full"]);
  });
});
