import { describe, expect, it } from "vitest";

import { renderTerminalStoryChoiceComparison } from "../../bin/terminal_story_choice.js";
import {
  compactJourneyStoryChoiceComparison,
  compactJourneyStoryChoicePrompt,
  JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE,
} from "../../src/mcp/journey_projection.js";
import { createToolApi } from "../../src/mcp/tools.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const WORLD = loadOverworldManifest(process.cwd());
const REGISTRATION =
  WORLD.opening_registration ??
  (() => {
    throw new Error("Expected Albany's opening registration.");
  })();

const EXPECTED = {
  "albany:road_warden": {
    starter: "Fieldcraft 4; weatherproof field kit",
    obligation: "return Hayden's winter packet with an honest account",
    def: "Starting DEF 3 → 4 when the authored campaign import applies.",
  },
  "albany:ledger_advocate": {
    starter: "Mediation 4; sealed evidence folio",
    obligation: "return a truthful relief account to Rowan",
    def: "No Road-Warden Fieldcraft import; the quest keeps its authored starting DEF.",
  },
  "albany:ironhands_repairer": {
    starter: "Repair 4; insulated repair roll",
    obligation: "return Reese's borrowed diagnostic tools intact",
    def: "No Road-Warden Fieldcraft import; the quest keeps its authored starting DEF.",
  },
  "albany:unaffiliated_courier": {
    starter: "Streetwise 4; unmarked courier satchel",
    obligation: "return or publicly void the emergency tag; no unchanged refusal retry",
    def: "No Road-Warden Fieldcraft import; the quest keeps its authored starting DEF.",
  },
} as const;

function presentedSession(): OverworldSession {
  const session = new OverworldSession(WORLD);
  session.scoutPoi(session.view().pois[0]!.id);
  session.talkToCharacter(REGISTRATION.contact);
  expect(session.journey().storyChoice?.id).toBe(REGISTRATION.id);
  return session;
}

describe("Albany registration progressive disclosure", () => {
  it("projects permanent identity, starter package, obligation, and quest DEF before choice", () => {
    const canonical = presentedSession().journey().storyChoice;
    if (!canonical) throw new Error("Expected the canonical registration prompt.");
    const compact = compactJourneyStoryChoicePrompt(canonical);
    const comparison = compactJourneyStoryChoiceComparison(canonical);

    for (const profile of REGISTRATION.profiles) {
      const expected = EXPECTED[profile.id as keyof typeof EXPECTED];
      const option = compact.options.find((candidate) => candidate.id === profile.id);
      const compared = comparison.options.find((candidate) => candidate.id === profile.id);
      if (!expected || !option?.summary || !compared?.summary) {
        throw new Error(`Missing compact registration profile "${profile.id}".`);
      }
      expect(option.summary).toEqual({
        commitment: profile.summary,
        fieldTrigger: expected.starter,
        fieldTriggerScope: "starter",
        highlights: [
          { label: "Permanent role", value: profile.title },
          { label: "Role experience", value: profile.summary },
          { label: "Return obligation — ACTIVE", value: expected.obligation },
          { label: "Quest DEF", value: expected.def },
        ],
        immediateCost: `no time/fee; starts with $${String(profile.character.money)}`,
        tradeoff: profile.tradeoff,
      });
      expect(compared.summary).toEqual(option.summary);
      expect(option.consequence).toBe(JOURNEY_STORY_CHOICE_STAGED_CONSEQUENCE);
    }

    const compactJson = JSON.stringify(compact);
    for (const profile of REGISTRATION.profiles) {
      expect(compactJson).not.toContain(profile.preview);
      expect(compactJson).not.toContain(profile.consequence);
    }
    const terminal = renderTerminalStoryChoiceComparison(canonical);
    expect(terminal).toContain(
      "Starter package / field edge: Fieldcraft 4; weatherproof field kit",
    );
    expect(terminal).toContain("Return obligation — ACTIVE:");
    expect(terminal).toContain("Quest DEF: Starting DEF 3 → 4");
  });

  it("reveals only one selected profile's exact authored terms without changing state", () => {
    const session = presentedSession();
    const canonical = session.journey().storyChoice;
    if (!canonical) throw new Error("Expected the canonical registration prompt.");
    const selected = REGISTRATION.profiles[2]!;
    const before = session.snapshot();
    const detail = compactJourneyStoryChoiceComparison(canonical, selected.id);

    expect(detail.inspectedOption.consequence).toBe(
      `${selected.summary} ${selected.preview} ${selected.consequence}`,
    );
    const detailJson = JSON.stringify(detail);
    for (const sibling of REGISTRATION.profiles.filter((profile) => profile.id !== selected.id)) {
      expect(detailJson).not.toContain(sibling.preview);
      expect(detailJson).not.toContain(sibling.consequence);
    }
    expect(session.snapshot()).toEqual(before);
  });

  it("keeps MCP inspection read-only and choice outcomes identical", () => {
    const api = createToolApi({ root: process.cwd() });
    const direct = api.start_overworld();
    const inspected = api.start_overworld();
    for (const sessionId of [direct.session_id, inspected.session_id]) {
      api.scout_overworld_session_poi({
        session_id: sessionId,
        poi_id: "albany_city__civic_core__poi",
      });
      api.talk_overworld_session_contact({
        session_id: sessionId,
        character_id: REGISTRATION.contact,
      });
    }
    const selected = REGISTRATION.profiles[1]!;
    const beforeInspection = api.export_overworld_session({ session_id: inspected.session_id });
    const exact = api.inspect_overworld_session_story({
      session_id: inspected.session_id,
      story_choice_id: REGISTRATION.id,
      option_id: selected.id,
    });
    expect(exact.story.inspectedOption?.consequence).toBe(
      `${selected.summary} ${selected.preview} ${selected.consequence}`,
    );
    expect(api.export_overworld_session({ session_id: inspected.session_id })).toEqual(
      beforeInspection,
    );

    const directChoice = api.choose_overworld_session_story({
      session_id: direct.session_id,
      choice: selected.id,
    });
    const inspectedChoice = api.choose_overworld_session_story({
      session_id: inspected.session_id,
      choice: selected.id,
    });
    expect(inspectedChoice.result).toEqual(directChoice.result);
    expect(inspectedChoice.snapshot_hash).toBe(directChoice.snapshot_hash);
  });
});
