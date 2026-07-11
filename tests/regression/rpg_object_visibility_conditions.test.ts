import { describe, expect, it } from "vitest";

import type { RpgAction } from "../../src/api/types.js";
import { actionEquals, makeStep } from "../../src/core/engine.js";
import type { GameState } from "../../src/core/state.js";
import { compactRpgObservation } from "../../src/mcp/compact_rpg_observation.js";
import { buildRpgObservation } from "../../src/rpg/observation.js";
import {
  buildRpgRules,
  enumerateRpgActions,
  indexRpgPack,
  initStateForRpgPack,
  type RpgIndex,
} from "../../src/rpg/runner.js";
import { compileRpgSource } from "../../src/rpg/source.js";
import { relabelRpgPack } from "./support/relabel_rpg.js";

const SOURCE = `
meta:
  id: object_visibility_fixture
  title: Object Visibility Fixture
  start_room: lab
  vars_init: { hp: 10, attack: 2, defense: 1 }
rooms:
  - id: lab
    name: The Laboratory
    description: A panel, two cabinets, and a brass switch stand here.
    objects: [panel, chest, locked_box, switch]
objects:
  - id: panel
    name: survey panel
    aliases: [panel]
    description: A portable survey panel.
    visible_when: [{ not_flag: objects_hidden }]
    takeable: true
    read_text: PROPERTY OF THE SURVEY.
    interactions:
      - verb: USE
        target: panel
        effects: [{ narrate: You check the panel's fittings. }]
  - id: chest
    name: specimen chest
    aliases: [chest]
    description: A specimen chest with a loose lid.
    visible_when: [{ not_flag: objects_hidden }]
    container: true
    openable: true
    contents: [gem, sealed_note]
  - id: gem
    name: glass gem
    aliases: [gem]
    description: A bright glass specimen.
    visible_when: [{ is_open: chest }]
    takeable: true
  - id: sealed_note
    name: sealed note
    aliases: [note]
    description: A folded note under the specimen tray.
    visible_when: [{ has_flag: note_revealed }]
    read_text: The note is legible.
  - id: locked_box
    name: locked sample box
    aliases: [box]
    description: A locked sample box.
    visible_when: [{ not_flag: objects_hidden }]
    container: true
    openable: true
    locked: true
    key_id: brass_key
  - id: brass_key
    name: brass key
    aliases: [key]
    description: A small brass key.
    held: true
  - id: switch
    name: brass switch
    aliases: [switch]
    description: A two-position brass switch.
    interactions:
      - verb: USE
        target: switch
        command_verb: hide
        conditions: [{ not_flag: objects_hidden }]
        effects: [{ set_flag: objects_hidden }]
      - verb: USE
        target: switch
        command_verb: reveal
        conditions: [{ has_flag: objects_hidden }]
        effects: [{ clear_flag: objects_hidden }]
win_conditions:
  - id: done
    conditions: [{ has_flag: never_set }]
    ending: ending_done
endings:
  - id: ending_done
    title: Done
    text: Done.
enemies: []
`;

const loaded = compileRpgSource(SOURCE);
if (!loaded.ok) throw loaded.error;
const pack = loaded.compiled.pack;
const index: RpgIndex = indexRpgPack(pack);
const rules = buildRpgRules(index);
const step = makeStep(rules);

function fresh(): GameState {
  return initStateForRpgPack(index, 7);
}

function view(state: GameState) {
  const options = enumerateRpgActions(index, state);
  const ids = options.map((option) => option.id);
  const observation = buildRpgObservation(index, state, { availableActions: options });
  return {
    ids,
    observation,
    compact: compactRpgObservation(observation, ids, { includeActions: true }),
  };
}

function act(state: GameState, actionId: string) {
  const option = enumerateRpgActions(index, state).find((candidate) => candidate.id === actionId);
  if (!option) throw new Error(`missing action ${actionId}`);
  const result = step(state, option.action);
  if (!result.ok) throw new Error(result.rejectionReason ?? `action ${actionId} rejected`);
  return result;
}

function hidden(state: GameState): GameState {
  return { ...state, flags: { ...state.flags, objects_hidden: true } };
}

function opened(state: GameState): GameState {
  return {
    ...state,
    objectState: {
      ...state.objectState,
      chest: { ...state.objectState.chest, open: true },
    },
  };
}

describe("RPG object visible_when world gates", () => {
  it("keeps the absent field out of legacy object shapes and relabels authored conditions", () => {
    const legacyObject = pack.objects.find((object) => object.id === "switch");
    expect(legacyObject).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(legacyObject, "visible_when")).toBe(false);

    const { pack: twin, relabeler } = relabelRpgPack(pack);
    const twinPanel = twin.objects.find((object) => object.id === relabeler.r("panel"));
    expect(twinPanel?.visible_when).toEqual([{ not_flag: relabeler.r("objects_hidden") }]);
    const twinSwitch = twin.objects.find((object) => object.id === relabeler.r("switch"));
    expect(Object.prototype.hasOwnProperty.call(twinSwitch, "visible_when")).toBe(false);
  });

  it("updates full and compact visibility reversibly from the same legal-action view", () => {
    let state = fresh();
    const before = view(state);
    expect(before.observation.visible_objects.map((object) => object.id)).toEqual([
      "chest",
      "locked_box",
      "panel",
      "switch",
    ]);
    expect(before.compact.objects).toEqual(["chest", "locked_box", "panel", "switch"]);
    expect(before.ids).toEqual(
      expect.arrayContaining([
        "examine_panel",
        "read_panel",
        "take_panel",
        "use_panel",
        "open_chest",
        "unlock_locked_box",
      ]),
    );

    state = act(state, "use_switch").state;
    const concealed = view(state);
    expect(concealed.observation.visible_objects.map((object) => object.id)).toEqual(["switch"]);
    expect(concealed.compact.objects).toEqual(["switch"]);
    expect(concealed.ids.some((id) => /panel|chest|locked_box/.test(id))).toBe(false);
    expect(concealed.compact.actions?.some((id) => /panel|chest|locked_box/.test(id))).toBe(false);

    state = act(state, "use_switch").state;
    expect(view(state).observation.visible_objects.map((object) => object.id)).toEqual(
      before.observation.visible_objects.map((object) => object.id),
    );
  });

  it("removes every built-in world-object action and rejects forced stale actions", () => {
    const closed = fresh();
    const open = opened(closed);
    const cases: Array<{ id: string; action: RpgAction; before: GameState }> = [
      { id: "examine_panel", action: { type: "LOOK", target: "panel" }, before: closed },
      { id: "read_panel", action: { type: "READ", target: "panel" }, before: closed },
      { id: "take_panel", action: { type: "TAKE", item: "panel" }, before: closed },
      { id: "use_panel", action: { type: "USE", target: "panel" }, before: closed },
      { id: "open_chest", action: { type: "OPEN", target: "chest" }, before: closed },
      { id: "close_chest", action: { type: "CLOSE", target: "chest" }, before: open },
      {
        id: "unlock_locked_box",
        action: { type: "UNLOCK", target: "locked_box", with: "brass_key" },
        before: closed,
      },
    ];

    for (const candidate of cases) {
      expect(
        rules
          .legalActions(candidate.before)
          .some((action) => actionEquals(action, candidate.action)),
        `${candidate.id} positive control`,
      ).toBe(true);
      const staleState = hidden(candidate.before);
      expect(view(staleState).ids).not.toContain(candidate.id);
      const result = step(staleState, candidate.action);
      expect(result.ok).toBe(false);
      expect(result.state).toBe(staleState);
      expect(result.rejectionReason).toBe("That action is not available right now.");
    }
  });

  it("keeps inventory authoritative, then reapplies the gate when the item is dropped", () => {
    let state = act(fresh(), "take_panel").state;
    state = act(state, "use_switch").state;
    const carried = view(state);
    expect(carried.observation.inventory).toContain("panel");
    expect(carried.compact.inv).toContain("panel");
    expect(carried.observation.visible_objects.map((object) => object.id)).not.toContain("panel");
    expect(carried.ids).toEqual(
      expect.arrayContaining(["examine_panel", "read_panel", "drop_panel", "use_panel"]),
    );

    state = act(state, "drop_panel").state;
    const droppedWhileHidden = view(state);
    expect(droppedWhileHidden.observation.inventory).not.toContain("panel");
    expect(droppedWhileHidden.observation.visible_objects.map((object) => object.id)).not.toContain(
      "panel",
    );
    expect(droppedWhileHidden.ids.some((id) => id.endsWith("_panel"))).toBe(false);

    state = act(state, "use_switch").state;
    expect(view(state).observation.visible_objects.map((object) => object.id)).toContain("panel");
  });

  it("hides open-container children with their parent and narrates only post-open contents", () => {
    const openedChest = act(fresh(), "open_chest");
    const narration = openedChest.events
      .flatMap((event) => (event.type === "narration" ? [event.text] : []))
      .join(" ");
    expect(narration).toContain("Inside: glass gem.");
    expect(narration).not.toContain("sealed note");

    let state = openedChest.state;
    const openView = view(state);
    expect(openView.observation.visible_objects.map((object) => object.id)).toContain("gem");
    expect(openView.observation.visible_objects.map((object) => object.id)).not.toContain(
      "sealed_note",
    );

    state = act(state, "use_switch").state;
    const hiddenParent = view(state);
    expect(hiddenParent.observation.visible_objects.map((object) => object.id)).not.toContain(
      "chest",
    );
    expect(hiddenParent.observation.visible_objects.map((object) => object.id)).not.toContain(
      "gem",
    );
    expect(hiddenParent.compact.objects).not.toContain("gem");
    expect(hiddenParent.ids).not.toContain("examine_gem");
    expect(hiddenParent.ids).not.toContain("take_gem");
  });
});
