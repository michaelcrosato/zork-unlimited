/**
 * blind-launch flag recovery — `npm run blind` flags must survive PowerShell.
 *
 * PowerShell strips a bare `--` (its own end-of-options token), after which npm
 * consumes `--flags` as unknown npm configs and only orphaned values reach the
 * script (a real run launched with quest "1500"). npm exposes eaten flags as
 * npm_config_* env vars; the launcher reconstructs them. These pin the exact
 * mangled shapes observed live.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs module without type declarations
import { recoverNpmEatenFlags } from "../../blind-tester/blind-launch.mjs";

describe("recoverNpmEatenFlags", () => {
  it("reconstructs the exact PowerShell mangling: `-- --spectate --delay-ms 1500`", () => {
    // PS strips `--`; npm eats both flags (delay-ms becomes boolean `true`) and
    // forwards the orphaned value 1500 as a positional.
    const { args, recovered } = recoverNpmEatenFlags(["1500"], {
      npm_config_spectate: "true",
      npm_config_delay_ms: "true",
    });
    expect(recovered).toBe(true);
    expect(args).toContain("--spectate");
    const at = args.indexOf("--delay-ms");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(args[at + 1]).toBe("1500");
    expect(args).not.toContain("1500\n"); // the orphan was claimed, not duplicated
    expect(args.filter((a: string) => a === "1500")).toHaveLength(1);
  });

  it("recovers equals-form values and quest ids", () => {
    const { args } = recoverNpmEatenFlags([], {
      npm_config_quest: "breaking_weir",
      npm_config_delay_ms: "1500",
      npm_config_mock: "true",
      npm_config_spectate: "true",
      npm_config_persona: "breaker",
    });
    expect(args).toEqual(
      expect.arrayContaining([
        "--quest",
        "breaking_weir",
        "--delay-ms",
        "1500",
        "--mock",
        "--spectate",
        "--persona",
        "breaker",
      ]),
    );
  });

  it("never duplicates flags a correctly-forwarding shell already passed", () => {
    const { args, recovered } = recoverNpmEatenFlags(["--spectate", "--quest", "gallowmere"], {
      npm_config_spectate: "true",
      npm_config_quest: "gallowmere",
    });
    expect(args.filter((a: string) => a === "--spectate")).toHaveLength(1);
    expect(args.filter((a: string) => a === "--quest")).toHaveLength(1);
    expect(recovered).toBe(false);
  });

  it("is a no-op without npm_config markers (Git Bash / Linux path)", () => {
    const { args, recovered } = recoverNpmEatenFlags(
      ["--quest", "breaking_weir", "--seed", "7"],
      {},
    );
    expect(args).toEqual(["--quest", "breaking_weir", "--seed", "7"]);
    expect(recovered).toBe(false);
  });

  it("ignores false/empty markers", () => {
    const { args, recovered } = recoverNpmEatenFlags([], {
      npm_config_spectate: "false",
      npm_config_quest: "",
    });
    expect(args).toEqual([]);
    expect(recovered).toBe(false);
  });
});
