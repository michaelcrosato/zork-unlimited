import type { Rules } from "../../../src/core/engine.js";
import type { Rng } from "../../../src/core/rng.js";
import type { ParserIndex } from "../../../src/parser/model.js";
import { buildParserRules } from "../../../src/parser/runner.js";

type ForcedRoll = "best" | "worst";

function forcedRng(roll: ForcedRoll): Rng {
  return {
    next(): number {
      return roll === "best" ? 0.999999 : 0;
    },
    int(min: number, max: number): number {
      return roll === "best" ? Math.floor(max) : Math.ceil(min);
    },
  };
}

export function parserBestRollRules(index: ParserIndex): Rules {
  return buildParserRules(index, () => forcedRng("best"));
}

export function parserWorstRollRules(index: ParserIndex): Rules {
  return buildParserRules(index, () => forcedRng("worst"));
}

export function parserRollRuleSets(index: ParserIndex): Rules[] {
  return [parserBestRollRules(index), parserWorstRollRules(index)];
}
