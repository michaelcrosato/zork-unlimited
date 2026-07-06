import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("active build spec is RPG-only", () => {
  const spec = readFileSync(join(process.cwd(), "ADVENTUREFORGE_BUILD_SPEC.md"), "utf8");

  it("does not direct agents back to retired staged engines", () => {
    expect(spec).not.toContain("Start at Stage 0");
    expect(spec).not.toContain("Stage 1 (CYOA)");
    expect(spec).not.toMatch(/Stage 2.*Zork-style/);
    expect(spec).not.toContain("content/cyoa/");
    expect(spec).not.toContain("content/parser/");
    expect(spec).not.toContain("src/cyoa/");
    expect(spec).not.toContain("src/parser/");
    expect(spec).not.toContain("validateCyoa");
    expect(spec).not.toContain("validateParser");
  });

  it("names the current unified RPG surfaces and gates", () => {
    expect(spec).toContain("One runtime mode: `rpg`");
    expect(spec).toContain("start_world_quest(world_quest_id)");
    expect(spec).toContain("list_world");
    expect(spec).toContain("npm run validate");
    expect(spec).toContain("npm test");
  });
});
