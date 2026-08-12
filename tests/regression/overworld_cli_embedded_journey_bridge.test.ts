import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveActionOption } from "../../bin/rpg_play.js";
import {
  CLI_JOURNEY_SAVE_KIND,
  CliJourneySession,
  type CliJourneySave,
} from "../../src/cli/embedded_quest_journey.js";
import { actionEquals } from "../../src/core/engine.js";
import { prepareShippedQuest } from "../../src/crawl/prepare.js";
import { solveToEnding } from "../../src/crawl/quest_solver.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const ROOT = process.cwd();
const WORLD = loadOverworldManifest(ROOT);
const WOLF = "wolf_winter";
const EXPOSED_RIDGE = "albany:wolf_approach_exposed_ridge";
const SHELTERED_STOCKWAY = "albany:wolf_approach_sheltered_stockway";
const PREPARATION = "albany:prep_works_fortification";
const ALLOCATION = "albany:relief_resident_shelter";
const WOLF_DEATH_ROUTE = [
  "use_sheltered_stockway_last_mile",
  "go_north",
  "maneuver_yearling_wolf_set_spear",
  "maneuver_yearling_wolf_drive_set_spear_unarmored",
  "go_north",
  "attack_flank_wolf",
  "attack_flank_wolf",
  "attack_flank_wolf",
  "go_north",
  "attack_grey_leader",
  "attack_grey_leader",
] as const;

function moveToArea(session: ReturnType<CliJourneySession["overworld"]>, areaId: string): void {
  if (session.view().currentArea?.id === areaId) return;
  const route = session.view().areaExits.find((candidate) => candidate.destination.id === areaId);
  if (!route) throw new Error(`Expected a local route to ${areaId}.`);
  session.moveArea(route.id);
}

function preparedParent(targetDecisions?: number): CliJourneySession {
  const cli = CliJourneySession.fresh(ROOT, WORLD);
  const session = cli.overworld();
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  moveToArea(session, WORLD.opening_preparation!.area);
  session.chooseJourneyStory(PREPARATION);
  session.chooseJourneyStory(ALLOCATION);

  if (targetDecisions !== undefined) {
    const questArea = session.view().quests.find((quest) => quest.id === WOLF)?.area;
    if (!questArea) throw new Error("Expected the Wolf-Winter quest area.");
    while (session.journey().acceptedDecisions < targetDecisions) {
      const route =
        session.view().currentArea?.id === questArea
          ? session.view().areaExits[0]
          : session.view().areaExits.find((candidate) => candidate.destination.id === questArea);
      if (!route) throw new Error("Expected reversible Albany area movement.");
      session.moveArea(route.id);
    }
    moveToArea(session, questArea);
    expect(session.journey().acceptedDecisions).toBe(targetDecisions);
  }
  return cli;
}

function preparedGallowmereParent(): CliJourneySession {
  const cli = CliJourneySession.fresh(ROOT, WORLD);
  const session = cli.overworld();
  session.scoutPoi("albany_city__civic_core__poi");
  session.talkToCharacter("albany_city__civic_core__contact");
  session.chooseJourneyStory("albany:ledger_advocate");
  session.chooseJourneyStory("albany:oath_limited_aid_only");
  session.chooseJourneyStory("albany:source_rowan_civic_docket");
  session.travel("road_albany_city__saratoga_springs_city");
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.travel("road_saratoga_springs_city__queensbury_town");
  if (session.view().pendingRoadEncounter) session.resolveRoadEncounter("press_on");
  session.exploreArea("queensbury_town__civic_core");
  moveToArea(session, "queensbury_town__market");
  expect(session.view().quests.map((quest) => quest.id)).toContain("gallowmere");
  return cli;
}

function act(cli: CliJourneySession, raw: string) {
  const child = cli.child();
  if (!child) throw new Error("Expected an embedded child.");
  const resolution = resolveActionOption(child.index, child.state, raw);
  expect(resolution.ok, resolution.ok ? undefined : resolution.reason).toBe(true);
  if (!resolution.ok) throw new Error(resolution.reason);
  return cli.stepQuest(resolution.option);
}

function actId(cli: CliJourneySession, actionId: string) {
  const child = cli.child();
  if (!child) throw new Error("Expected an embedded child.");
  const options = child.actions.filter((option) => option.id === actionId);
  expect(options, actionId).toHaveLength(1);
  return cli.stepQuest(options[0]!);
}

function atEmbeddedCheckpoint(): CliJourneySession {
  const cli = preparedParent(36);
  cli.beginQuest(WOLF, 541, EXPOSED_RIDGE);
  expect(cli.journey()).toMatchObject({ acceptedDecisions: 37, pendingChoice: null });
  expect(act(cli, "descend exposed ridge last mile")).toMatchObject({
    ok: true,
    journeyDecision: { countsTowardJourney: true, reason: "situation_changed" },
  });
  expect(act(cli, "go north")).toMatchObject({
    ok: true,
    journeyDecision: { countsTowardJourney: true, reason: "movement" },
  });
  const child = cli.child()!;
  const wedge = resolveActionOption(child.index, child.state, "wedge the paling-rail");
  expect(wedge.ok).toBe(true);
  if (!wedge.ok) throw new Error(wedge.reason);
  expect(wedge.option).toMatchObject({
    id: "set_paling_rail",
    skill_check: { skill: "repair", difficulty: 12, die: "d20" },
  });
  expect(cli.stepQuest(wedge.option).journeyDecision).toEqual({
    countsTowardJourney: true,
    reason: "skill_check",
  });
  // Threshold 40 falls inside the yearling scene. The checkpoint must defer
  // until the spear line clears combat at the first safe break. The seeded
  // first stroke may itself finish the yearling; otherwise take its exact
  // canonical follow-up row.
  expect(cli.journey()).toMatchObject({ status: "active", acceptedDecisions: 40 });
  expect(actId(cli, "maneuver_yearling_wolf_set_spear").ok).toBe(true);
  if (cli.journey().status === "active") {
    const followUp = cli
      .child()!
      .actions.find(
        (option) =>
          option.id === "maneuver_yearling_wolf_drive_set_spear_unarmored" ||
          option.id === "maneuver_yearling_wolf_drive_set_spear" ||
          option.id === "attack_yearling_wolf",
      );
    if (!followUp) throw new Error("Expected the yearling spear line's exact follow-up row.");
    expect(cli.stepQuest(followUp).ok).toBe(true);
  }
  expect(cli.journey()).toMatchObject({
    status: "awaiting_choice",
    decisionProof: {
      last: {
        surface: "quest",
        reason: "combat",
      },
    },
  });
  return cli;
}

function continueParent(cli: CliJourneySession): void {
  cli.overworld().chooseJourney("continue");
  cli.afterParentChoice();
}

function endParent(cli: CliJourneySession): void {
  cli.overworld().chooseJourney("end");
  cli.afterParentChoice();
}

function runCli(restorePath: string, commands: string) {
  return spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
      "bin/overworld_play.ts",
      "--restore",
      restorePath,
      "--commands",
      commands,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
  );
}

describe("persistent CLI embedded-quest journey bridge", () => {
  it("preempts the child at a parent checkpoint and resumes the exact hash and action rows", () => {
    const cli = atEmbeddedCheckpoint();
    const child = cli.child()!;
    const childHash = child.stateHash;
    const actionRows = child.actions.map((option) => ({
      id: option.id,
      command: option.command,
      skill_check: option.skill_check,
    }));

    // Saving/restoring at the parent gate retains the post-action child exactly.
    const restored = CliJourneySession.restore(ROOT, WORLD, JSON.parse(cli.serialize()));
    expect(restored.child()!.stateHash).toBe(childHash);
    expect(
      restored.child()!.actions.map((option) => ({
        id: option.id,
        command: option.command,
        skill_check: option.skill_check,
      })),
    ).toEqual(actionRows);
    expect(() => restored.stepQuest(restored.child()!.actions[0]!)).toThrow(
      /parent journey choice/i,
    );

    continueParent(restored);
    expect(restored.child()!.stateHash).toBe(childHash);
    expect(restored.child()!.actions.map((option) => option.id)).toEqual(
      actionRows.map((option) => option.id),
    );

    const next = restored.child()!.actions[0]!;
    expect(restored.stepQuest(next).ok).toBe(true);
  });

  it("ends at the parent gate with a read-only receipt and no exposed child", () => {
    const cli = CliJourneySession.restore(
      ROOT,
      WORLD,
      JSON.parse(atEmbeddedCheckpoint().serialize()),
    );
    endParent(cli);
    expect(cli.journey().status).toBe("ended");
    expect(cli.overworld().journeyExitReceipt()).not.toBeNull();
    expect(cli.child()).toBeNull();
    expect(cli.document()).toMatchObject({
      kind: CLI_JOURNEY_SAVE_KIND,
      phase: "overworld",
      child: null,
    });
    const restored = CliJourneySession.restore(ROOT, WORLD, JSON.parse(cli.serialize()));
    expect(restored.journey().status).toBe("ended");
    expect(restored.child()).toBeNull();
    expect(restored.overworld().journeyExitReceipt()).toEqual(cli.overworld().journeyExitReceipt());
  });

  it("gives the real terminal parent-gate priority, then resumes the retained child", () => {
    const cli = atEmbeddedCheckpoint();
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-gated-child-"));
    const savePath = join(temp, "gated-child.json");
    writeFileSync(savePath, cli.serialize());
    try {
      const blocked = runCli(savePath, "go south");
      const blockedOutput = `${blocked.stdout ?? ""}\n${blocked.stderr ?? ""}`;
      expect(blocked.status, blockedOutput).toBe(1);
      expect(blockedOutput).toContain("Choose the active journey prompt first");
      expect(blockedOutput).toContain("A scripted command was rejected.");
      expect(blockedOutput).not.toContain("[quest:");

      const resumed = runCli(savePath, "choose continue; actions");
      const resumedOutput = `${resumed.stdout ?? ""}\n${resumed.stderr ?? ""}`;
      expect(resumed.status, resumedOutput).toBe(0);
      expect(resumedOutput).toContain("Chosen: Continue toward checkpoint 80.");
      expect(resumedOutput).toContain("[quest: The Wolf-Winter]");
      expect(resumedOutput).toContain("You can:");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("rejects wrapper mismatches and legacy unfinished-parent saves", () => {
    const cli = atEmbeddedCheckpoint();
    const document = cli.document();
    if (!document.child) throw new Error("Expected a saved child.");

    const wrongHash = structuredClone(document) as CliJourneySave;
    wrongHash.child!.contentHash = "0".repeat(64);
    expect(() => CliJourneySession.restore(ROOT, WORLD, wrongHash)).toThrow(
      /content hash mismatch/i,
    );

    const wrongContinuity = structuredClone(document) as CliJourneySave;
    wrongContinuity.child!.continuity.persistent_record.health.current -= 1;
    expect(() => CliJourneySession.restore(ROOT, WORLD, wrongContinuity)).toThrow(/continuity/i);

    expect(() => CliJourneySession.restore(ROOT, WORLD, cli.overworld().snapshot())).toThrow(
      /legacy overworld save has unfinished quest state/i,
    );
  });

  it("rejects a child path that disagrees with the parent's quest decision trail", () => {
    const counted = preparedParent();
    counted.beginQuest(WOLF, 79, EXPOSED_RIDGE);
    expect(act(counted, "descend exposed ridge last mile").journeyDecision).toMatchObject({
      countsTowardJourney: true,
    });

    const excluded = preparedParent();
    excluded.beginQuest(WOLF, 79, EXPOSED_RIDGE);
    expect(actId(excluded, "examine_relief_spear").journeyDecision).toMatchObject({
      countsTowardJourney: false,
    });

    const spliced = counted.document();
    spliced.child = excluded.document().child;
    expect(() => CliJourneySession.restore(ROOT, WORLD, spliced)).toThrow(
      /action trail parent decisions/i,
    );
  });

  it("restores a no-approach quest from its parent-proven start decision", () => {
    const cli = preparedGallowmereParent();
    cli.beginQuest("gallowmere", 80);
    const first = cli.child()!.actions[0]!;
    expect(cli.stepQuest(first).ok).toBe(true);
    const combinedHash = cli.snapshotHash();

    const restored = CliJourneySession.restore(ROOT, WORLD, JSON.parse(cli.serialize()));
    expect(restored.snapshotHash()).toBe(combinedHash);
    expect(restored.child()).toMatchObject({
      worldQuestId: "gallowmere",
      stateHash: cli.child()!.stateHash,
    });
  });

  it("suspends and resumes one child without spending quest start twice", () => {
    const cli = preparedParent();
    expect(cli.snapshotHash()).toBe(cli.overworld().snapshotHash());
    const started = cli.beginQuest(WOLF, 77, EXPOSED_RIDGE);
    const parentHashAfterStart = cli.overworld().snapshotHash();
    const childHash = cli.child()!.stateHash;
    cli.suspendQuest();

    const restored = CliJourneySession.restore(ROOT, WORLD, JSON.parse(cli.serialize()));
    expect(restored.child()).toMatchObject({ phase: "suspended", stateHash: childHash });
    expect(restored.overworld().snapshotHash()).toBe(parentHashAfterStart);
    expect(restored.overworld().view().startedQuestIds).toEqual(
      expect.arrayContaining([started.id]),
    );
    restored.resumeQuest(WOLF);
    expect(restored.child()).toMatchObject({ phase: "active", stateHash: childHash });
    expect(restored.overworld().snapshotHash()).toBe(parentHashAfterStart);
  });

  it("keeps a suspended child bound to its exact launch character while the parent evolves", () => {
    const cli = preparedParent();
    cli.beginQuest(WOLF, 78, EXPOSED_RIDGE);
    const childHash = cli.child()!.stateHash;
    cli.suspendQuest();

    moveToArea(cli.overworld(), "albany_city__market");
    const suppliesBefore = cli.overworld().view().supplies;
    expect(cli.overworld().resupplyAtTown()).toMatchObject({ changed: true });
    const evolved = cli.document();
    const restored = CliJourneySession.restore(ROOT, WORLD, evolved);
    expect(restored.overworld().view().supplies).toBeGreaterThan(suppliesBefore);
    expect(restored.child()).toMatchObject({ phase: "suspended", stateHash: childHash });

    const tamperedAnchor = structuredClone(evolved);
    tamperedAnchor.child!.launchCharacter.health.current -= 1;
    expect(() => CliJourneySession.restore(ROOT, WORLD, tamperedAnchor)).toThrow(
      /launch character/i,
    );

    const other = preparedParent();
    other.beginQuest(WOLF, 88, SHELTERED_STOCKWAY);
    const spliced = structuredClone(evolved);
    spliced.child = other.document().child;
    expect(() => CliJourneySession.restore(ROOT, WORLD, spliced)).toThrow(/launch character/i);
  });

  it("holds a fatal child at the end-only death gate across save/restore", () => {
    const cli = preparedParent();
    cli.beginQuest(WOLF, 6, SHELTERED_STOCKWAY);

    let fatal: ReturnType<CliJourneySession["stepQuest"]> | undefined;
    let preFatalDocument: CliJourneySave | undefined;
    for (const actionId of WOLF_DEATH_ROUTE) {
      if (actionId === WOLF_DEATH_ROUTE.at(-1)) {
        preFatalDocument = structuredClone(cli.document());
      }
      fatal = actId(cli, actionId);
      expect(fatal.ok, fatal.rejectionReason ?? actionId).toBe(true);
    }
    if (!preFatalDocument) throw new Error("Expected the pre-fatal save boundary.");
    expect(fatal).toMatchObject({
      terminalDeath: true,
      actionOption: { id: "attack_grey_leader" },
    });
    expect(cli.child()).toMatchObject({
      phase: "terminal",
      state: { ended: true, endingId: "ending_pulled_down" },
    });
    expect(cli.journey()).toMatchObject({
      status: "awaiting_choice",
      goal: { status: "active" },
      pendingChoice: {
        reasons: ["character_died"],
        checkpoint: null,
        goalVersion: null,
        goalId: null,
        options: [{ id: "end" }],
      },
      decisionProof: { last: { surface: "quest", actionId: "attack_grey_leader" } },
    });
    expect(cli.journey().pendingChoice?.options.map((option) => option.id)).toEqual(["end"]);

    const deathParent = cli.overworld().snapshot();
    expect(deathParent.questCharacterDeathBoundary).toMatchObject({
      questId: WOLF,
      endingId: "ending_pulled_down",
      acceptedDecisions: cli.journey().acceptedDecisions,
      journeyDecisionProof: {
        hash: cli.journey().decisionProof.hash,
        last: { surface: "quest", actionId: "attack_grey_leader" },
      },
    });
    const combinedHash = cli.snapshotHash();
    const childHash = cli.child()!.stateHash;
    const deathDocument = cli.document();

    const terminalChildWithoutDeathParent = structuredClone(deathDocument);
    terminalChildWithoutDeathParent.overworld = preFatalDocument.overworld;
    expect(() => CliJourneySession.restore(ROOT, WORLD, terminalChildWithoutDeathParent)).toThrow(
      /action trail parent decisions|character-death boundary and end-only gate/i,
    );

    const deathParentWithLiveChild = structuredClone(deathDocument);
    deathParentWithLiveChild.phase = "quest_active";
    deathParentWithLiveChild.child = preFatalDocument.child;
    expect(() => CliJourneySession.restore(ROOT, WORLD, deathParentWithLiveChild)).toThrow(
      /action trail parent decisions|death boundary cannot retain a live or suspended embedded child/i,
    );

    const restored = CliJourneySession.restore(ROOT, WORLD, JSON.parse(cli.serialize()));
    expect(restored.snapshotHash()).toBe(combinedHash);
    expect(restored.child()).toMatchObject({ phase: "terminal", stateHash: childHash });
    expect(restored.overworld().snapshot().questCharacterDeathBoundary).toEqual(
      deathParent.questCharacterDeathBoundary,
    );

    const beforeRejectedContinue = restored.snapshotHash();
    expect(() => restored.overworld().chooseJourney("continue")).toThrow(/character died/i);
    expect(restored.snapshotHash()).toBe(beforeRejectedContinue);

    const ended = restored.overworld().chooseJourney("end");
    restored.afterParentChoice();
    expect(ended.exitReceipt).toMatchObject({
      goalStatus: "active",
      exitReasons: ["character_died"],
      decisionProofHash: deathParent.questCharacterDeathBoundary?.journeyDecisionProof.hash,
    });
    expect(restored.child()).toBeNull();
    expect(restored.journey()).toMatchObject({ status: "ended", pendingChoice: null });

    // A pre-wrapper raw parent snapshot remains a valid read-only receipt after
    // End even though the fatal quest is intentionally unfinished.
    const legacy = CliJourneySession.restore(ROOT, WORLD, restored.overworld().snapshot());
    expect(legacy.child()).toBeNull();
    expect(legacy.journey().status).toBe("ended");
    expect(legacy.overworld().journeyExitReceipt()).toEqual(ended.exitReceipt);
  });

  it("makes a wrong scripted child-surface command exit 1 without changing the saved child", () => {
    const cli = preparedParent();
    cli.beginQuest(WOLF, 88, EXPOSED_RIDGE);
    const combinedHash = cli.snapshotHash();
    const temp = mkdtempSync(join(tmpdir(), "adventureforge-cli-child-"));
    const savePath = join(temp, "active-child.json");
    writeFileSync(savePath, cli.serialize());
    try {
      const result = runCli(savePath, "hash; go definitely-not-a-direction; hash");
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      expect(result.status, output).toBe(1);
      expect(output).toContain("A scripted command was rejected.");
      expect(output.match(/^[0-9a-f]{64}$/gm)).toEqual([combinedHash, combinedHash]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("folds a solver-proven living ending back exactly once", () => {
    const cli = preparedParent();
    cli.beginQuest(WOLF, 91, EXPOSED_RIDGE);
    const initial = cli.child()!;
    const solved = solveToEnding(prepareShippedQuest(ROOT, WOLF), initial.state.seed, 60_000, {
      initialState: initial.state,
    });
    expect(solved.ok, solved.ok ? undefined : solved.reason).toBe(true);
    if (!solved.ok) throw new Error(solved.reason);

    for (const action of solved.actions) {
      if (cli.journey().pendingChoice) continueParent(cli);
      const child = cli.child();
      if (!child) break;
      const matches = child.actions.filter((option) => actionEquals(option.action, action));
      expect(matches, JSON.stringify(action)).toHaveLength(1);
      const result = cli.stepQuest(matches[0]!);
      expect(result.ok, result.rejectionReason ?? undefined).toBe(true);
    }
    if (cli.journey().pendingChoice) continueParent(cli);
    expect(cli.child()).toBeNull();
    expect(cli.overworld().view().completedQuestIds).toContain(WOLF);
    expect(cli.overworld().snapshot().questOutcomes).toContainEqual([WOLF, solved.endingId]);
  });
});
