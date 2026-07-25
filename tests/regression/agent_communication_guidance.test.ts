import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("agent communication guidance", () => {
  it("keeps status updates game-focused and personal app state out of scope", () => {
    const charter = readFileSync(join(process.cwd(), "AGENTS.md"), "utf8");

    expect(charter).toContain("Use ordinary game-development language in status updates");
    expect(charter).toContain("If a required service is unavailable, note it briefly");
    expect(charter).toContain("Do not inspect personal application state.");
  });
});
