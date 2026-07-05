import { describe, expect, it } from "vitest";

import { MCP_ACTION_LABEL_CHAR_LIMIT } from "../../src/mcp/action_labels.js";
import { publicActions } from "../../src/mcp/rpg_view_projection.js";
import type { RpgActionOption } from "../../src/rpg/legal_actions.js";

function option(command: string): RpgActionOption {
  return {
    id: "use_long_template",
    command,
    action: { type: "LOOK" },
  };
}

describe("MCP action labels", () => {
  it("caps public action command labels without changing action ids", () => {
    const command = `use ${"x".repeat(400)}a`;
    const samePrefixCommand = `use ${"x".repeat(400)}b`;
    const [row] = publicActions([option(command)]);
    const [samePrefixRow] = publicActions([option(samePrefixCommand)]);

    expect(row?.id).toBe("use_long_template");
    expect(row?.command).not.toBe(command);
    expect(row?.command).toHaveLength(MCP_ACTION_LABEL_CHAR_LIMIT);
    expect(row?.command).toMatch(/^use x+/);
    expect(row?.command).toMatch(/\.\.\.\(\+\d+ chars\)#[0-9a-f]{12}$/);
    expect(samePrefixRow?.command).not.toBe(row?.command);
  });

  it("leaves short labels exact and omits labels for compact action rows", () => {
    const [fullRow] = publicActions([option("look")]);
    const [compactRow] = publicActions([option("look")], { compactActions: true });

    expect(fullRow?.command).toBe("look");
    expect(compactRow).toEqual({ id: "use_long_template" });
  });
});
