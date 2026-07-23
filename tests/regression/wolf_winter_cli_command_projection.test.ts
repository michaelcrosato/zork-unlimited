import { describe, expect, it, vi } from "vitest";

import { actionEquals, makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { runQuestSession, type QuestCommandReader } from "../../bin/overworld_play.js";
import {
  render as renderCli,
  renderActionHelp,
  resolve as resolveCli,
} from "../../bin/rpg_play.js";
import { RpgSourceRuntime } from "../../src/mcp/rpg_source_runtime.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("Wolf-Winter must compile");
const index = indexRpgPack(loaded.compiled.pack);
const rules = buildRpgRules(index);
const world = loadOverworldManifest(process.cwd());

function act(state: GameState, raw: string): GameState {
  const parsed = resolveCli(index, state, raw);
  expect(parsed.ok, parsed.ok ? undefined : parsed.reason).toBe(true);
  if (!parsed.ok) throw new Error(parsed.reason);
  expect(
    enumerateRpgActions(index, state).some((option) => actionEquals(option.action, parsed.action)),
  ).toBe(true);
  const result = makeStep(rules)(state, parsed.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  return result.state;
}

function atCade(): GameState {
  let state = initStateForRpgPack(index, 541);
  state = act(state, "go north");
  state = act(state, "talk to old Cade the houndsman");
  return state;
}

function atStore(): GameState {
  let state = initStateForRpgPack(index, 541);
  state = act(state, "go north");
  state = act(state, "go west");
  return state;
}

function atCadeWithJerkin(): GameState {
  let state = atStore();
  state = act(state, "take padded byre-jerkin");
  state = act(state, "go east");
  state = act(state, "talk to old Cade the houndsman");
  return state;
}

function overworldAtWolf(): OverworldSession {
  const session = new OverworldSession(world);
  const moveToArea = (areaId: string): void => {
    if (session.view().currentArea?.id === areaId) return;
    const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
    if (!route) throw new Error(`Expected a visible route to ${areaId}.`);
    session.moveArea(route.id);
  };
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(world.opening_preparation!.area);
  session.chooseJourneyStory("albany:prep_works_fortification");
  session.chooseJourneyStory("albany:relief_resident_shelter");
  return session;
}

describe("Wolf-Winter terminal dialogue commands", () => {
  it("renders each visible person's name once and omits the line when empty or ended", () => {
    const empty = buildRpgObservation(index, initStateForRpgPack(index, 541));
    expect(empty.npcs_present).toEqual([]);
    expect(renderCli(empty)).not.toContain("People here:");

    const observation = buildRpgObservation(index, atCade());
    expect(observation.npcs_present).toEqual([{ id: "houndsman", name: "old Cade the houndsman" }]);
    const duplicated = {
      ...observation,
      npcs_present: [
        ...observation.npcs_present,
        { id: "houndsman_duplicate", name: "old Cade the houndsman" },
      ],
    };
    expect(
      renderCli(duplicated)
        .split("\n")
        .filter((line) => line.startsWith("People here:")),
    ).toEqual(["People here: old Cade the houndsman."]);
    expect(renderCli({ ...duplicated, ended: true })).not.toContain("People here:");
  });

  it("accepts exact-id and unique-partial speaker qualifiers for the active NPC", () => {
    let state = atCade();
    for (const command of ["ask houndsman about lure", "ask old Cade about lure"]) {
      expect(resolveCli(index, state, command)).toEqual({
        ok: true,
        action: { type: "ASK", npc: "houndsman", topic: "lure" },
      });
    }

    state = act(state, "lure");
    for (const command of [
      "ask old Cade about commit lure",
      "ask old Cade about commit_lure",
      "ask old Cade about commit-feed",
    ]) {
      expect(resolveCli(index, state, command)).toEqual({
        ok: true,
        action: { type: "ASK", npc: "houndsman", topic: "commit_lure" },
      });
    }
  });

  it("does not let a grammar-shaped topic alias bypass qualified-speaker validation", () => {
    const pack = structuredClone(loaded.compiled.pack);
    const houndsman = pack.npcs.find((npc) => npc.id === "houndsman");
    const root = houndsman?.dialogue.nodes.find((node) => node.id === "cade_root");
    const lure = root?.topics.find((topic) => topic.id === "lure");
    if (!lure) throw new Error("expected Cade's lure topic");
    lure.aliases = [...(lure.aliases ?? []), "ask Rowan about lure"];

    const fixtureIndex = indexRpgPack(pack);
    const state = atCade();
    expect(
      enumerateRpgActions(fixtureIndex, state).find((option) => option.id === "ask_lure")
        ?.inputAliases,
    ).toContain("ask Rowan about lure");
    expect(resolveCli(fixtureIndex, state, "ask Rowan about lure")).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/no visible person called "rowan" here/i),
    });
    expect(resolveCli(fixtureIndex, state, "lure")).toEqual({
      ok: true,
      action: { type: "ASK", npc: "houndsman", topic: "lure" },
    });
  });

  it("does not print a dialogue alias that collides with a contextual wear command", () => {
    const pack = structuredClone(loaded.compiled.pack);
    const houndsman = pack.npcs.find((npc) => npc.id === "houndsman");
    const root = houndsman?.dialogue.nodes.find((node) => node.id === "cade_root");
    const lure = root?.topics.find((topic) => topic.id === "lure");
    if (!lure) throw new Error("expected Cade's lure topic");
    lure.aliases = [...(lure.aliases ?? []), "wear coat"];

    const fixtureIndex = indexRpgPack(pack);
    const state = atCadeWithJerkin();
    expect(resolveCli(fixtureIndex, state, "wear coat")).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/matches more than one current action/i),
    });
    const help = renderActionHelp(fixtureIndex, state);
    expect(help).toContain("\n  lure");
    expect(help).not.toContain("wear coat");
  });

  it("shows and executes lure and commit lure as concise commands", () => {
    let state = atCade();
    const rootHelp = renderActionHelp(index, state);
    expect(rootHelp).toMatch(
      /\n {2}lure \(also: ask lure, ask feed, ask alive\) — Ask how Cade's/i,
    );

    state = act(state, "lure");
    const commitmentHelp = renderActionHelp(index, state);
    expect(commitmentHelp).toMatch(
      /\n {2}commit lure \(also: commit feed, commit alive\) — Commit to the finite feed-and-hounds line now\./i,
    );

    state = act(state, "commit lure");
    expect(state.flags.strategy_lure_committed).toBe(true);
  });

  it("maps wear only to the current legal don action and advertises that authored verb", () => {
    const beforeTake = atStore();
    expect(resolveCli(index, beforeTake, "wear jerkin").ok).toBe(false);

    let state = act(beforeTake, "take padded byre-jerkin");
    const don = enumerateRpgActions(index, state).find(
      (option) => option.action.type === "USE" && option.command === "don padded byre-jerkin",
    );
    if (!don) throw new Error("expected legal byre-jerkin don action");
    for (const command of [
      "wear byre_jerkin",
      "wear padded byre-jerkin",
      "wear the jerkin",
      "wear coat",
    ]) {
      expect(resolveCli(index, state, command)).toEqual({ ok: true, action: don.action });
    }
    expect(resolveCli(index, state, "wear feed").ok).toBe(false);

    const correction = resolveCli(index, state, "equip jerkin");
    expect(correction.ok).toBe(false);
    if (correction.ok) throw new Error("equip must remain outside the controlled grammar");
    expect(correction.reason).toMatch(/current action verb(?:s)?: [^.]*\bdon\b/i);
    expect(correction.reason).not.toContain("use <obj> on <obj>");

    const blocked: GameState = {
      ...state,
      flags: { ...state.flags, strategy_drive_committed: true },
    };
    expect(resolveCli(index, blocked, "wear jerkin").ok).toBe(false);

    state = act(state, "wear coat");
    expect(state.flags.jerkin_donned).toBe(true);
    expect(resolveCli(index, state, "wear jerkin").ok).toBe(false);
  });

  it("fails closed on a shared wear alias and never maps another legal self-use verb", () => {
    const pack = structuredClone(loaded.compiled.pack);
    const jerkin = pack.objects.find((object) => object.id === "byre_jerkin");
    if (!jerkin) throw new Error("expected byre jerkin fixture");
    jerkin.held = true;

    const spare = structuredClone(jerkin);
    spare.id = "spare_jerkin";
    spare.name = "spare winter coat";
    spare.aliases = ["coat"];
    for (const interaction of spare.interactions) {
      if (interaction.verb !== "USE") continue;
      interaction.item = spare.id;
      interaction.target = spare.id;
    }
    const tonic = structuredClone(spare);
    tonic.id = "winter_tonic";
    tonic.name = "winter tonic";
    tonic.aliases = ["tonic"];
    for (const interaction of tonic.interactions) {
      if (interaction.verb !== "USE") continue;
      interaction.item = tonic.id;
      interaction.target = tonic.id;
      interaction.command_verb = "drink";
    }
    pack.objects.push(spare, tonic);

    const fixtureIndex = indexRpgPack(pack);
    const state = initStateForRpgPack(fixtureIndex, 541);
    expect(resolveCli(fixtureIndex, state, "wear coat")).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/matches more than one current action/i),
    });
    expect(resolveCli(fixtureIndex, state, "wear tonic").ok).toBe(false);
    expect(resolveCli(fixtureIndex, state, "drink tonic")).toMatchObject({
      ok: true,
      action: { type: "USE", item: "winter_tonic", target: "winter_tonic" },
    });
  });

  it("keeps an uncommitted north crossing on the hunt-and-hold path", () => {
    let state = atCade();
    expect(state.flags.strategy_lure_committed).not.toBe(true);
    state = act(state, "leave");
    state = act(state, "go north");

    expect(state.current).toBe("paling_gap");
    expect(state.flags.strategy_lure_committed).not.toBe(true);
    const huntActions = enumerateRpgActions(index, state).map((option) => option.id);
    expect(huntActions).toContain("maneuver_yearling_wolf_set_spear");
    expect(huntActions).not.toContain("ask_commit_lure");
  });

  it("lets the real overworld handoff execute Cade's legal leave before abandon", async () => {
    const session = overworldAtWolf();
    const commands = [
      "choose 1",
      "descend exposed ridge last mile",
      "talk to old Cade the houndsman",
      "leave",
      "abandon",
    ];
    const reader: QuestCommandReader = {
      scripted: true,
      read: async () => commands.shift() ?? null,
    };
    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => {
      output.push(values.map(String).join(" "));
    });
    try {
      await expect(
        runQuestSession(session, new RpgSourceRuntime(process.cwd()), "wolf_winter", 541, reader),
      ).resolves.toBe("done");
    } finally {
      log.mockRestore();
    }

    expect(session.view().startedQuestIds).toContain("wolf_winter");
    expect(output.join("\n")).toContain("(You end the conversation.)");
    expect(commands).toEqual([]);
  });

  it("keeps unmatched leave as the legacy embedded-quest abandon fallback", async () => {
    const session = overworldAtWolf();
    const commands = ["choose 1", "leave"];
    const reader: QuestCommandReader = {
      scripted: true,
      read: async () => commands.shift() ?? null,
    };
    const output: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => {
      output.push(values.map(String).join(" "));
    });
    try {
      await expect(
        runQuestSession(session, new RpgSourceRuntime(process.cwd()), "wolf_winter", 542, reader),
      ).resolves.toBe("done");
    } finally {
      log.mockRestore();
    }

    expect(session.view().startedQuestIds).toContain("wolf_winter");
    expect(output.join("\n")).not.toMatch(/don't understand|rejected|illegal/i);
    expect(commands).toEqual([]);
  });
});
