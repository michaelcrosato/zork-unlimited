import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findStaleDocRefs } from "../../src/afk/assessor.js";

const roadmap = readFileSync(join(process.cwd(), "docs", "ROADMAP.md"), "utf8");

describe("active roadmap is RPG-only and scanned", () => {
  it("does not preserve retired staged-engine guidance as active roadmap text", () => {
    expect(roadmap).not.toMatch(/\bCYOA\b/);
    expect(roadmap).not.toMatch(/\bparser\b/i);
    expect(roadmap).not.toContain("content/cyoa");
    expect(roadmap).not.toContain("content/parser");
    expect(roadmap).not.toContain("src/cyoa");
    expect(roadmap).not.toContain("src/parser");
    expect(roadmap).not.toContain("list_stories");
  });

  it("names the current RPG world architecture and gates", () => {
    expect(roadmap).toContain("One runtime mode: `rpg`");
    expect(roadmap).toContain("world_quest_id");
    expect(roadmap).toContain("content/world/new_york_overworld.json");
    expect(roadmap).toContain("src/world/session.ts");
    expect(roadmap).toContain("npm run validate");
    expect(roadmap).toContain("npm test");
  });

  it("has no stale first-party file references", () => {
    expect(findStaleDocRefs(roadmap, (p) => existsSync(join(process.cwd(), p)))).toEqual([]);
  });
});
