import { describe, expect, it } from "vitest";

import type { RpgActionOption } from "../../src/rpg/legal_actions.js";
import {
  projectRpgPlayerCommands,
  renderRpgActiveDialoguePrompt,
  renderRpgPlayerActionHelp,
  resolveRpgPlayerCommand,
} from "../../src/rpg/player_command_projection.js";

function ask(
  id: string,
  topic: string,
  prompt: string,
  inputAliases: readonly string[] = [],
): RpgActionOption {
  return {
    id,
    command: `ask: ${prompt}`,
    action: { type: "ASK", npc: "guide", topic },
    inputAliases,
  };
}

describe("terminal RPG command projection", () => {
  it("separates dialogue prose from normalized exact topic commands and aliases", () => {
    const options = [
      ask("ask_commit_lure", "commit_lure", "Commit to the finite feed-and-hounds line now.", [
        "commit-feed",
        "commit_alive",
      ]),
      {
        id: "go_north",
        command: "go north",
        action: { type: "MOVE", direction: "north" },
      },
    ] satisfies RpgActionOption[];

    const projected = projectRpgPlayerCommands(options);
    expect(projected[0]).toMatchObject({
      command: "commit lure",
      aliases: ["commit feed", "commit alive"],
      description: "Commit to the finite feed-and-hounds line now.",
    });
    expect(projected[1]).toMatchObject({ command: "go north", aliases: [] });

    for (const input of [projected[0]!.command, ...projected[0]!.aliases]) {
      expect(resolveRpgPlayerCommand(options, input)).toMatchObject({
        kind: "resolved",
        option: { id: "ask_commit_lure" },
      });
    }
    expect(resolveRpgPlayerCommand(options, "COMMIT_LURE")).toMatchObject({
      kind: "resolved",
      option: { id: "ask_commit_lure" },
    });

    const help = renderRpgPlayerActionHelp(options);
    expect(help).toContain(
      "commit lure (also: commit feed, commit alive) — Commit to the finite feed-and-hounds line now.",
    );
    expect(help).not.toContain("ask: Commit");
  });

  it("fails closed on normalized collisions and prints unique id fallbacks", () => {
    const options = [
      ask("ask_first", "shared_topic", "Take the first route.", ["common-path"]),
      ask("ask_second", "shared-topic", "Take the second route.", ["common_path"]),
    ];

    expect(resolveRpgPlayerCommand(options, "shared topic")).toMatchObject({ kind: "ambiguous" });
    expect(resolveRpgPlayerCommand(options, "common path")).toMatchObject({ kind: "ambiguous" });

    const projected = projectRpgPlayerCommands(options);
    expect(projected.map((row) => ({ command: row.command, aliases: row.aliases }))).toEqual([
      { command: "choose ask_first", aliases: [] },
      { command: "choose ask_second", aliases: [] },
    ]);
    expect(resolveRpgPlayerCommand(options, projected[0]!.command)).toMatchObject({
      kind: "resolved",
      option: { id: "ask_first" },
    });
    expect(resolveRpgPlayerCommand(options, projected[1]!.command)).toMatchObject({
      kind: "resolved",
      option: { id: "ask_second" },
    });

    const prompt = renderRpgActiveDialoguePrompt(
      {
        dialogue: { npc: "guide" },
        npcs_present: [{ id: "guide", name: "the guide" }],
      },
      options,
    );
    expect(prompt).toContain("[Active speaker: the guide]");
    expect(prompt).toContain("choose ask_first");
    expect(prompt).toContain("choose ask_second");
    expect(prompt).not.toContain("\n  shared topic");
  });

  it("gives every action a choose-id fallback when dialogue collides with an ordinary command", () => {
    const options = [
      ask("ask_look", "look", "Ask what the guide sees."),
      {
        id: "look_around",
        command: "look",
        action: { type: "LOOK" },
      },
    ] satisfies RpgActionOption[];

    expect(resolveRpgPlayerCommand(options, "look")).toMatchObject({ kind: "ambiguous" });
    const projected = projectRpgPlayerCommands(options);
    expect(
      projected.map((row) => ({ command: row.command, description: row.description })),
    ).toEqual([
      { command: "choose ask_look", description: "Ask what the guide sees." },
      { command: "choose look_around", description: "look" },
    ]);
    for (const row of projected) {
      expect(resolveRpgPlayerCommand(options, row.command)).toMatchObject({
        kind: "resolved",
        option: { id: row.option.id },
      });
    }
  });

  it("leaves grammar-shaped qualified ASK aliases for active-speaker validation", () => {
    const options = [
      ask("ask_lure", "lure", "Ask about the lure.", ["ask Rowan about lure", "ask_lure"]),
    ];

    expect(resolveRpgPlayerCommand(options, "ask Rowan about lure")).toEqual({
      kind: "unmatched",
    });
    expect(resolveRpgPlayerCommand(options, "lure")).toMatchObject({
      kind: "resolved",
      option: { id: "ask_lure" },
    });
    expect(resolveRpgPlayerCommand(options, "ask lure")).toMatchObject({
      kind: "resolved",
      option: { id: "ask_lure" },
    });
  });

  it("never advertises commands consumed by the interactive loops", () => {
    const reservedTopics = ["actions", "help", "?", "quit", "q", "exit", "abandon"].map((topic) =>
      ask(`ask_${topic.replace(/\W/g, "word")}`, topic, `Ask about ${topic}.`),
    );
    expect(projectRpgPlayerCommands(reservedTopics).map((row) => row.command)).toEqual(
      reservedTopics.map((option) => `choose ${option.id}`),
    );

    const lure = ask("ask_lure", "lure", "Ask about the lure.", [
      "actions",
      "help",
      "quit",
      "abandon",
    ]);
    expect(projectRpgPlayerCommands([lure])).toMatchObject([{ command: "lure", aliases: [] }]);
  });
});
