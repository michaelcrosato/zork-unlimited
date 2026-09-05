import { describe, it, expect } from "vitest";
import { generateRpgPack } from "../../src/gen/rpg_generator.js";
import { validateRpg } from "../../src/validate/rpg_validator.js";

describe("RPG validator — enemy identity", () => {
  it.each(["the same room", "different rooms"])(
    "rejects duplicate enemy IDs in %s",
    (placement) => {
      const pack = generateRpgPack(0);
      expect(validateRpg(pack).findings).toEqual([]);
      const duplicate = structuredClone(pack.enemies[0]!);
      if (placement === "different rooms") {
        duplicate.room = pack.enemies[1]!.room;
        expect(duplicate.room).not.toBe(pack.enemies[0]!.room);
      }
      pack.enemies.push(duplicate);

      const report = validateRpg(pack);
      expect(report.ok).toBe(false);
      expect(report.findings).toContainEqual(
        expect.objectContaining({
          code: "DUPLICATE_ID",
          severity: "error",
          message: `duplicate enemy id "${duplicate.id}".`,
        }),
      );
    },
  );
});
