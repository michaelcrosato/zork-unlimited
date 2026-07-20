/**
 * Regression for bug_0504: Wolf-Winter's day-book and Cade once repeated a complete
 * answer key, while Cade's two topics presented the leader's close and wait openings as
 * contradictory instructions. The sources now have distinct jobs: the book records
 * evidence, and Cade teaches compatible quick/open and guarded/patient lessons whose
 * tactical commitment happens later at the wolves.
 */
import { describe, expect, it } from "vitest";
import { makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { activeDialogue } from "../../src/rpg/model.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
} from "../../src/rpg/runner.js";
import { loadRpgSourceFile } from "../../src/rpg/source.js";

const loaded = loadRpgSourceFile("content/rpg/quests/wolf_winter.yaml");
if (!loaded.ok) throw new Error("wolf_winter must compile");
const pack = loaded.compiled.pack;
const index = indexRpgPack(pack);
const step = makeStep(buildRpgRules(index));
const cade = pack.npcs.find((npc) => npc.id === "houndsman");
const node = (id: string) => cade?.dialogue.nodes.find((entry) => entry.id === id);

function takeAction(state: GameState, id: string) {
  const actions = enumerateRpgActions(index, state);
  const chosen = actions.find((action) => action.id === id);
  expect(
    chosen,
    `expected ${id} in ${state.current}; available: ${actions.map((action) => action.id).join(", ")}`,
  ).toBeDefined();
  if (!chosen) throw new Error(`missing ${id}`);
  const result = step(state, chosen.action);
  expect(result.ok, result.rejectionReason).toBe(true);
  if (!result.ok) throw new Error(`rejected ${id}`);
  return result;
}

function act(state: GameState, id: string): GameState {
  return takeAction(state, id).state;
}

function narration(events: ReturnType<typeof takeAction>["events"]): string {
  return events.flatMap((event) => (event.type === "narration" ? [event.text] : [])).join(" ");
}

function startCadeDialogue(seed: number): GameState {
  let state = initStateForRpgPack(index, seed);
  state = act(state, "go_north");
  return act(state, "talk_houndsman");
}

function dialogueActionIds(state: GameState): string[] {
  return enumerateRpgActions(index, state)
    .map((action) => action.id)
    .filter((id) => id.startsWith("ask_"));
}

describe("bug_0504 — Wolf-Winter clues are complementary rather than contradictory", () => {
  it("uses the day-book for reconnaissance and prep evidence, not combat commands", () => {
    const book = pack.objects.find((object) => object.id === "day_book")?.read_text ?? "";

    expect(book).toMatch(/THREE AT THE PALING[^]*OLD GREY LEADS/i);
    expect(book).toMatch(/spear ALREADY/i);
    expect(book).toMatch(/Cade's knack[^]*byre-JERKIN[^]*watchman standing/i);
    expect(book).toMatch(/trusted spear alone[^]*bled/i);
    expect(book).toMatch(/Heed Cade[^]*don the JERKIN[^]*both[^]*less[^]*gamble/i);
    expect(book).not.toMatch(/old eyes/i);
    expect(book).not.toMatch(/no wolf[^]*pull you down/i);
    expect(book).not.toMatch(/\bset\b[^]*\bdrive\b|\bwheel\b[^]*\bturn\b/i);
    expect(book).not.toMatch(/\b(?:close|wait)\b[^]*\b(?:feint|rush)\b/i);
  });

  it("offers Cade's quick/open and guarded/patient lessons without claiming they are exclusive", () => {
    const root = node("cade_root");
    const quick = node("cade_wolves")?.npc_text ?? "";
    const guarded = node("cade_byre")?.npc_text ?? "";
    const fortify = node("cade_fortify")?.npc_text ?? "";
    const fullDutyFortify =
      node("cade_fortify")?.variants?.find((variant) =>
        variant.when.some(
          (condition) => "has_flag" in condition && condition.has_flag === "relief_oath_full_duty",
        ),
      )?.text ?? "";

    expect(root?.npc_text).toMatch(
      /You came from Albany awake[^]*hunt kills pack[^]*holds herd\/byre[^]*risk death[^]*lure spares all if fed[^]*foul risks herd[^]*drive spares pack\/people[^]*defense lost[^]*crisis cost[^]*fortify spares all[^]*property\/seals[^]*no retreat/i,
    );
    expect(root?.npc_text).not.toMatch(/foul\s*=\s*(?:2|two) cattle/i);
    expect(root?.npc_text).not.toMatch(/two roads/i);
    expect(root?.npc_text).toMatch(/lure[^]*drive[^]*fortify/i);
    expect(root?.topics.find((topic) => topic.id === "wolves")?.prompt).toMatch(
      /quick spear-hand/i,
    );
    expect(root?.topics.find((topic) => topic.id === "byre")?.prompt).toMatch(
      /guarded spear-fighting plan/i,
    );
    expect(root?.topics.find((topic) => topic.id === "fortify")?.prompt).toMatch(
      /seal the byre[^]*outlast the living pack[^]*dawn/i,
    );

    expect(quick).toMatch(/Quick lines[^]*set[^]*drive[^]*wheel[^]*turn/i);
    expect(quick).toMatch(/close[^]*fast[^]*guard opens[^]*drive/i);
    expect(quick).toMatch(/jerkin[^]*both[^]*no wolf[^]*pull you down/i);
    expect(quick).not.toMatch(/wait[^]*true rush|wedge[^]*rail/i);

    expect(guarded).toMatch(/Guarded spear line[^]*wedge[^]*rail[^]*combat funnel/i);
    expect(guarded).toMatch(/splits[^]*bind/i);
    expect(guarded).toMatch(/wait[^]*true rush[^]*patient alternative[^]*closing early/i);
    expect(guarded).not.toMatch(/\bset\b[^]*\bdrive\b|\bwheel\b[^]*\bturn\b/i);

    expect(fortify).toMatch(
      /fortify saves lives\/herd\/byre[^]*no retreat\/switch[^]*household terms[^]*property risk[^]*seals saved[^]*Cade aid[^]*Albany[^]*property safe[^]*seals spent[^]*no Cade aid[^]*Works eases first DC[^]*mobile stabilizes a recovered miss[^]*dawn/i,
    );
    expect(fortify).not.toMatch(/Albany Repair[^]*2 easier/i);
    expect(fullDutyFortify).toMatch(/first Albany Repair 2 easier/i);

    const publicSealChecks =
      pack.objects
        .find((object) => object.id === "fortify_outer_seal")
        ?.interactions.filter(
          (interaction) =>
            interaction.item === "albany_relief_seals" && interaction.skill_check !== undefined,
        ) ?? [];
    const publicSealDc = (fullDuty: boolean, worksPrepared: boolean) => {
      const conditions = publicSealChecks.find((interaction) => {
        const encoded = JSON.stringify(interaction.conditions);
        const oath = fullDuty
          ? '{"has_flag":"relief_oath_full_duty"}'
          : '{"not_flag":"relief_oath_full_duty"}';
        const works = worksPrepared
          ? '{"has_flag":"works_fortification_prepared"}'
          : '{"not_flag":"works_fortification_prepared"}';
        return encoded.includes(oath) && encoded.includes(works);
      });
      return conditions?.skill_check?.difficulty;
    };
    expect([publicSealDc(true, true), publicSealDc(true, false)]).toEqual([10, 12]);
    expect([publicSealDc(false, true), publicSealDc(false, false)]).toEqual([12, 14]);

    const scattered = pack.win_conditions.find(
      (condition) => condition.ending === "ending_pack_diverted_cattle_scattered",
    );
    expect(scattered?.conditions).toContainEqual({
      var_gte: { name: "cattle_alarm", value: 4 },
    });
  });

  it("keeps root copy and legal lesson actions aligned when quick is heard first", () => {
    let state = startCadeDialogue(930014);
    let observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(/hunt[^]*lure[^]*drive[^]*fortify/i);
    expect(dialogueActionIds(state)).toEqual([
      "ask_wolves",
      "ask_byre",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);

    const quick = takeAction(state, "ask_wolves");
    state = quick.state;
    expect(narration(quick.events)).toMatch(/Quick lines/i);
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /quick spear-hand[^]*guarded spear-fighting plan is still yours to learn[^]*Ask for it/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_byre",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);
    expect(state.journal.some((entry) => /quick\/open line/i.test(entry))).toBe(true);

    const guarded = takeAction(state, "ask_byre");
    state = guarded.state;
    expect(narration(guarded.events)).toMatch(/Guarded spear line[^]*patient alternative/i);
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /Both lessons are yours[^]*do not choose a road here[^]*commit[^]*later[^]*at the wolves/i,
    );
    expect(dialogueActionIds(state)).toEqual(["ask_lure", "ask_drive", "ask_fortify", "ask_leave"]);
    expect(state.journal.some((entry) => /guarded\/patient/i.test(entry))).toBe(true);
    expect(state.flags).toMatchObject({ heard_counsel: true, heard_plan: true });
    expect(state.vars).toMatchObject({ attack: 7, defense: 3, hp: 30, score: 5 });
  });

  it("names the still-available quick lesson when the guarded plan is heard first", () => {
    let state = startCadeDialogue(930015);
    const guarded = takeAction(state, "ask_byre");
    state = guarded.state;

    let observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /guarded spear-fighting plan[^]*quick spear-hand is still yours to learn[^]*Ask for it/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_wolves",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);

    const quick = takeAction(state, "ask_wolves");
    state = quick.state;
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /Both lessons are yours[^]*commit[^]*later[^]*at the wolves/i,
    );
    expect(dialogueActionIds(state)).toEqual(["ask_lure", "ask_drive", "ask_fortify", "ask_leave"]);
    expect(state.flags).toMatchObject({ heard_counsel: true, heard_plan: true });
    expect(state.vars).toMatchObject({ attack: 7, defense: 3, hp: 30, score: 5 });
  });

  it("matches the labels to the leader's real attack-versus-guard tradeoff", () => {
    const leader = pack.enemies.find((enemy) => enemy.id === "grey_leader");
    const wait = leader?.maneuvers?.find((maneuver) => maneuver.id === "wait_out_feint");
    const close = leader?.maneuvers?.find((maneuver) => maneuver.id === "close_on_feint");

    expect(wait).toMatchObject({ attack_bonus: 0, defense_bonus: 3 });
    expect(close).toMatchObject({ attack_bonus: 4, defense_bonus: -3 });
    expect(node("cade_byre")?.npc_text).toMatch(/guarded[^]*patient/i);
    expect(node("cade_wolves")?.npc_text).toMatch(/quick[^]*fast[^]*guard opens/i);
  });

  it("names the opening threat as a young wolf before 'yearling' can read as cattle", () => {
    const yard = pack.rooms.find((room) => room.id === "byre_yard");
    const readTally = yard?.variants?.find((variant) => /last wolf-count/i.test(variant.text));
    const gap = pack.rooms.find((room) => room.id === "paling_gap");

    for (const text of [yard?.description, readTally?.text, gap?.description]) {
      expect(text).toMatch(/young wolf/i);
      expect(text).not.toMatch(/\byearling\b/i);
    }
  });
});
