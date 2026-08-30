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
import { MCP_ACTION_LABEL_CHAR_LIMIT } from "../../src/mcp/action_labels.js";
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
const CADE_ROOT_PLAIN_LANGUAGE =
  "Reviews choose nothing. Choose LURE, DRIVE, or FORTIFY in review. Choose HUNT with GO north or RELEASE JUNE. One choice permanently closes the rest. PREPARE SUPPORT chooses nothing.";
const CADE_PEER_PLAN_LABELS = {
  hunt: "HUNT — Protect home and herd. Wolves may die; failure risks cattle. Cade's tactics and padded byre-jerkin help. Review. Go north or RELEASE JUNE to choose.",
  lure: "LURE — Move the wolves alive and protect the herd. Costs Cade's last feed; the fence stays broken. First-action failure adds 2 cattle alarm. Review only.",
  drive:
    "DRIVE — Evacuate people and cattle; wolves live. Lose retreat and outer defense. Crisis costs 6 HP, two cattle, or the rig. Review only.",
  fortify:
    "FORTIFY — Protect home and herd until dawn; wolves live. Lose retreat. Use Cade's shutters and expose his property, or spend Albany's seals. Review only.",
} as const;

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

function gameplayVars(state: GameState): Record<string, number> {
  return Object.fromEntries(
    Object.entries(state.vars).filter(([name]) => !name.startsWith("__dlg_")),
  );
}

describe("bug_0504 — Wolf-Winter clues are complementary rather than contradictory", () => {
  it("uses the day-book for reconnaissance and prep evidence, not combat commands", () => {
    const book = pack.objects.find((object) => object.id === "day_book")?.read_text ?? "";

    expect(book).toMatch(/Three wolves[^]*yearling wolf[^]*flank-wolf[^]*grey leader/i);
    expect(book).toMatch(/TALK TO old Cade the houndsman[^]*PREPARE SUPPORT/i);
    expect(book).toMatch(/PREPARE SUPPORT for \+2 attack[^]*DON padded byre-jerkin/i);
    expect(book).toMatch(/\+2 attack[^]*\+2 defense/i);
    expect(book).toMatch(/bonuses affect fights still ahead[^]*do not reopen completed work/i);
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
      node("cade_fortify")?.variants?.find(
        (variant) =>
          variant.when.length === 1 &&
          variant.when.some(
            (condition) =>
              "has_flag" in condition && condition.has_flag === "relief_oath_full_duty",
          ),
      )?.text ?? "";
    const limitedDutyLure =
      node("cade_lure")
        ?.variants?.filter((variant) =>
          variant.when.some(
            (condition) =>
              "has_flag" in condition && condition.has_flag === "relief_oath_limited_duty",
          ),
        )
        .map((variant) => variant.text) ?? [];
    const limitedDutyFortify =
      node("cade_fortify")?.variants?.find(
        (variant) =>
          variant.when.length === 1 &&
          variant.when.some(
            (condition) =>
              "has_flag" in condition && condition.has_flag === "relief_oath_limited_duty",
          ),
      )?.text ?? "";
    const rootPrompt = (topicId: string) =>
      root?.topics.find((topic) => topic.id === topicId)?.prompt ?? "";
    const rootSurface = [
      root?.npc_text ?? "",
      ...(root?.topics.map((topic) => topic.prompt) ?? []),
    ].join("\n");

    expect(root?.npc_text.trimEnd()).toBe(CADE_ROOT_PLAIN_LANGUAGE);
    expect(root?.npc_text.trimEnd().length).toBe(181);
    expect(Buffer.byteLength(root?.npc_text.trimEnd() ?? "", "utf8")).toBe(181);
    expect(root?.npc_text.trimEnd().length).toBeLessThanOrEqual(360);
    expect(root?.npc_text).toMatch(
      /Reviews choose nothing[^]*Choose LURE, DRIVE, or FORTIFY in review[^]*Choose HUNT with GO north or RELEASE JUNE[^]*permanently closes the rest[^]*PREPARE SUPPORT chooses nothing/i,
    );
    expect(root?.topics.slice(0, 4).map((topic) => topic.id)).toEqual([
      "hunt",
      "lure",
      "drive",
      "fortify",
    ]);
    expect(rootPrompt("hunt")).toMatch(
      /^HUNT — Protect home and herd[^]*Wolves may die[^]*failure risks cattle[^]*Cade's tactics[^]*padded byre-jerkin[^]*Review[^]*Go north or RELEASE JUNE to choose/i,
    );
    expect(rootPrompt("lure")).toMatch(
      /^LURE — Move the wolves alive and protect the herd[^]*Costs Cade's last feed[^]*fence stays broken[^]*First-action failure adds 2 cattle alarm[^]*Review only/i,
    );
    expect(rootPrompt("drive")).toMatch(
      /^DRIVE — Evacuate people and cattle; wolves live[^]*Lose retreat and outer defense[^]*Crisis costs 6 HP, two cattle, or the rig[^]*Review only/i,
    );
    expect(rootPrompt("fortify")).toMatch(
      /^FORTIFY — Protect home and herd until dawn; wolves live[^]*Lose retreat[^]*Cade's shutters and expose his property[^]*spend Albany's seals[^]*Review only/i,
    );
    expect(rootPrompt("hunt")).toBe(CADE_PEER_PLAN_LABELS.hunt);
    for (const nodeId of ["cade_root", "cade_wolves", "cade_byre"] as const) {
      const prompts = Object.fromEntries(
        node(nodeId)?.topics.map((topic) => [topic.id, topic.prompt]) ?? [],
      );
      expect(prompts).toMatchObject({
        lure: CADE_PEER_PLAN_LABELS.lure,
        drive: CADE_PEER_PLAN_LABELS.drive,
        fortify: CADE_PEER_PLAN_LABELS.fortify,
      });
    }
    const everyPeerPrompt =
      cade?.dialogue.nodes.flatMap((dialogueNode) =>
        dialogueNode.topics.map((topic) => topic.prompt),
      ) ?? [];
    expect(everyPeerPrompt.filter((prompt) => prompt === CADE_PEER_PLAN_LABELS.hunt)).toHaveLength(
      1,
    );
    for (const plan of ["lure", "drive", "fortify"] as const) {
      expect(
        everyPeerPrompt.filter((prompt) => prompt === CADE_PEER_PLAN_LABELS[plan]),
      ).toHaveLength(3);
    }
    expect(MCP_ACTION_LABEL_CHAR_LIMIT).toBe(160);
    expect(
      Object.fromEntries(
        Object.entries(CADE_PEER_PLAN_LABELS).map(([plan, prompt]) => [
          plan,
          `ask: ${prompt}`.length,
        ]),
      ),
    ).toEqual({ hunt: 160, lure: 158, drive: 141, fortify: 158 });
    for (const prompt of Object.values(CADE_PEER_PLAN_LABELS)) {
      expect(`ask: ${prompt}`.length).toBeLessThanOrEqual(MCP_ACTION_LABEL_CHAR_LIMIT);
    }
    expect(rootPrompt("wolves")).toMatch(
      /^PREPARE SUPPORT[^]*quick HUNT tactic[^]*\+2 attack[^]*\+5 score[^]*does not choose HUNT/i,
    );
    expect(rootPrompt("byre")).toMatch(
      /PREPARE SUPPORT[^]*guarded HUNT tactic[^]*does not choose HUNT/i,
    );
    expect(rootSurface).not.toMatch(
      /\bset\b[^]*\bdrive\b[^]*\bwheel\b[^]*\bturn\b|\b(?:close|wait)\b[^]*\b(?:feint|rush)\b/i,
    );
    expect(rootSurface).not.toMatch(
      /\bDC\s*\d|no wolf[^]*pull you down|guarantees? (?:victory|survival)|foul\s*=\s*(?:2|two) cattle/i,
    );
    expect(root?.npc_text).not.toMatch(/two roads/i);

    expect(quick).toMatch(
      /SET the Albany relief spear[^]*yearling's rush[^]*shown DRIVE[^]*WHEEL[^]*flank-wolf[^]*TURN/i,
    );
    expect(quick).toMatch(/CLOSE[^]*grey leader[^]*feint[^]*DRIVE again/i);
    expect(quick).toMatch(/jerkin[^]*Both make worst-roll HUNT safe/i);
    expect(quick).not.toMatch(/wait[^]*true rush|wedge[^]*rail/i);

    expect(guarded).toMatch(
      /Guarded HUNT[^]*shown BRACE, WEDGE, SET, SPLICE, or BIND rail action/i,
    );
    expect(guarded).toMatch(/rail aids combat[^]*cannot redirect a wolf alive/i);
    expect(guarded).toMatch(/HOLD[^]*feint[^]*TAKE[^]*true rush/i);
    expect(guarded).not.toMatch(/\bset\b[^]*\bdrive\b|\bwheel\b[^]*\bturn\b/i);

    expect(fortify).toMatch(
      /FORTIFY protects home and herd until dawn[^]*all wolves alive[^]*retreat and other plans close[^]*Cade's shutters[^]*expose his property[^]*preserve Albany's seals[^]*gain his help after one failed outer seal[^]*Albany's seals[^]*protect his property[^]*spend public stock[^]*gain no help[^]*unstabilized failed seal can cost 2 HP at dawn[^]*June[^]*mobile relief crew/i,
    );
    expect(fortify).not.toMatch(/Albany Repair[^]*2 easier/i);
    expect(fullDutyFortify).toMatch(/Full Compact makes the first Repair DC 12 instead of 14/i);
    expect(limitedDutyLure).toHaveLength(2);
    for (const disclosure of limitedDutyLure) {
      expect(disclosure).toMatch(
        /first successful LURE LAY still raises cattle alarm by 1[^]*skips the last feed's \+1, not the first/i,
      );
    }
    expect(limitedDutyFortify).toMatch(
      /Cade's shutters follow the Aid-Only oath[^]*Albany's relief seals exceed the oath[^]*no Cade help/i,
    );

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

    const scatteredEnding = pack.endings.find(
      (ending) => ending.id === "ending_pack_diverted_cattle_scattered",
    );
    expect(scatteredEnding?.text).toMatch(/cattle alarm[^]*reached Breaking/i);
    expect(scatteredEnding?.text).not.toMatch(/fouled first cast/i);
    const fouledVariant = scatteredEnding?.variants?.find((variant) =>
      variant.when.some(
        (condition) => "has_flag" in condition && condition.has_flag === "lure_trail_fouled",
      ),
    );
    expect(fouledVariant?.text).toMatch(/failed first LAY attempt/i);
  });

  it("keeps root copy and legal lesson actions aligned when quick is heard first", () => {
    let state = startCadeDialogue(930014);
    let observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /Reviews choose nothing[^]*Choose HUNT with GO north or RELEASE JUNE[^]*permanently closes the rest/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_wolves",
      "ask_byre",
      "ask_leave",
    ]);

    const huntInspection = takeAction(structuredClone(state), "ask_hunt").state;
    expect(activeDialogue(index, huntInspection)?.node.id).toBe("cade_hunt");
    expect(huntInspection).toMatchObject({
      current: state.current,
      flags: state.flags,
      inventory: state.inventory,
      journal: state.journal,
    });
    expect(gameplayVars(huntInspection)).toEqual(gameplayVars(state));
    expect(dialogueActionIds(huntInspection)).toEqual([
      "ask_prepare_hunt",
      "ask_hunt_back",
      "ask_leave",
    ]);
    const preparedHunt = act(huntInspection, "ask_prepare_hunt");
    expect(preparedHunt).toMatchObject({
      current: state.current,
      flags: state.flags,
      inventory: state.inventory,
      journal: state.journal,
    });
    expect(gameplayVars(preparedHunt)).toEqual(gameplayVars(state));
    expect(activeDialogue(index, preparedHunt)).toBeNull();

    const quick = takeAction(state, "ask_wolves");
    state = quick.state;
    expect(narration(quick.events)).toMatch(
      /SET the Albany relief spear against the yearling's rush[^]*shown DRIVE[^]*\+2 attack[^]*\+5 score/i,
    );
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /You know the quick HUNT tactic[^]*still learn the guarded tactic[^]*Going north[^]*chooses HUNT/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_byre",
      "ask_leave",
    ]);
    expect(state.journal.some((entry) => /quick HUNT tactic[^]*SET\/DRIVE/i.test(entry))).toBe(
      true,
    );

    const guarded = takeAction(state, "ask_byre");
    state = guarded.state;
    expect(narration(guarded.events)).toMatch(/Guarded HUNT[^]*BRACE[^]*WEDGE[^]*HOLD[^]*TAKE/i);
    expect(activeDialogue(index, state)?.node.id).toBe("cade_byre");
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /Guarded HUNT[^]*BRACE[^]*WEDGE[^]*BIND[^]*HOLD[^]*TAKE/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_byre_back",
      "ask_leave",
    ]);

    state = takeAction(state, "ask_byre_back").state;
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /You know both HUNT tactics[^]*does not choose HUNT[^]*go north to choose HUNT/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);
    expect(state.journal.some((entry) => /guarded HUNT tactic/i.test(entry))).toBe(true);
    expect(state.flags).toMatchObject({ heard_counsel: true, heard_plan: true });
    expect(state.vars).toMatchObject({ attack: 7, defense: 3, hp: 30, score: 5 });
  });

  it("names the still-available quick lesson when the guarded plan is heard first", () => {
    let state = startCadeDialogue(930015);
    const guarded = takeAction(state, "ask_byre");
    state = guarded.state;

    let observation = buildRpgObservation(index, state);
    expect(activeDialogue(index, state)?.node.id).toBe("cade_byre");
    expect(observation.dialogue?.npc_text).toMatch(
      /Guarded HUNT[^]*BRACE[^]*WEDGE[^]*BIND[^]*HOLD[^]*TAKE/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_wolves",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_byre_back",
      "ask_leave",
    ]);

    state = takeAction(state, "ask_byre_back").state;
    expect(activeDialogue(index, state)?.node.id).toBe("cade_root");
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /You know the guarded HUNT tactic[^]*still learn the quick tactic[^]*yearling's set-and-drive sequence[^]*flank-wolf's off-side wheel-and-turn sequence[^]*grey leader's close-and-drive sequence/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_wolves",
      "ask_leave",
    ]);

    const quick = takeAction(state, "ask_wolves");
    state = quick.state;
    observation = buildRpgObservation(index, state);
    expect(observation.dialogue?.npc_text).toMatch(
      /You know both HUNT tactics[^]*does not choose HUNT[^]*go north to choose HUNT/i,
    );
    expect(dialogueActionIds(state)).toEqual([
      "ask_hunt",
      "ask_lure",
      "ask_drive",
      "ask_fortify",
      "ask_leave",
    ]);
    expect(state.flags).toMatchObject({ heard_counsel: true, heard_plan: true });
    expect(state.vars).toMatchObject({ attack: 7, defense: 3, hp: 30, score: 5 });
  });

  it("matches the labels to the leader's real attack-versus-guard tradeoff", () => {
    const leader = pack.enemies.find((enemy) => enemy.id === "grey_leader");
    const wait = leader?.maneuvers?.find((maneuver) => maneuver.id === "wait_out_feint");
    const close = leader?.maneuvers?.find((maneuver) => maneuver.id === "close_on_feint");

    expect(wait).toMatchObject({ attack_bonus: 0, defense_bonus: 3 });
    expect(close).toMatchObject({ attack_bonus: 4, defense_bonus: -3 });
    expect(node("cade_byre")?.npc_text).toMatch(
      /Guarded HUNT[^]*HOLD the spear point[^]*wait out the grey leader's feint[^]*TAKE the grey leader's true rush/i,
    );
    expect(node("cade_wolves")?.npc_text).toMatch(/CLOSE[^]*feint[^]*DRIVE again/i);
  });

  it("names the opening threat as a yearling wolf before using its possessive follow-up", () => {
    const yard = pack.rooms.find((room) => room.id === "byre_yard");
    const readTally = yard?.variants?.find((variant) =>
      /You read the wolf count/i.test(variant.text),
    );
    const gap = pack.rooms.find((room) => room.id === "paling_gap");

    for (const text of [yard?.description, readTally?.text]) {
      expect(text).toMatch(/yearling wolf/i);
      expect(text).not.toMatch(/\byearling\b(?!\s+wolf)/i);
    }
    expect(gap?.description).toMatch(/yearling wolf/i);
    expect(gap?.description).toMatch(/yearling's rush/i);
  });
});
