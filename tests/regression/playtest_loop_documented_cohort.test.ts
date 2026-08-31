/**
 * The usage header's live cohort example must be a cohort that actually runs
 * (intake P0 e605134a2c956cec).
 *
 * `playtest-loop.sh`'s own env-knob header advertised
 * `PLAYTEST_COHORT="gemini_cli:8,codex:2"`, and copying that line into a shell
 * earned an immediate `Refusing the cohort`: `gemini_cli` declares no capture
 * block, so eight of those ten players can never be proved blind. The example
 * dated from when the cohort gate was the hand-written literal
 * `[[ "$provider" != "codex" ]]`; the gate was later rewritten to DERIVE
 * live-capability from what the checkout contains, the runbook's copy of the
 * example was corrected, and the script's own header was missed.
 *
 * A usage line that documents a refusal is worse than no usage line, because it
 * reads as the blessed shape and its failure names the vendor rather than the
 * doc. So rather than pinning today's answer — which would go stale the moment
 * another vendor's capture reader lands — this test parses the example out of
 * the header and asks the SAME authority the preflight asks
 * (`blind-tester/resolve-provider.mjs`, the shell-facing mirror of
 * `derivePlaytestIsolation`) whether every provider in it is live-capable.
 * The header is therefore checked against the derivation, never against a list,
 * and stays correct as readers land or are removed.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The gate's own two conditions, read from the resolver's `key<TAB>value` records. */
function resolveProvider(id: string): { isolation: string; drivable: string; reason: string } {
  const result = spawnSync("node", ["blind-tester/resolve-provider.mjs", "--records", id], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60_000,
  });
  expect(result.status, `resolve-provider failed for "${id}": ${result.stderr}`).toBe(0);
  const records = new Map<string, string>();
  for (const line of (result.stdout ?? "").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const key = line.slice(0, tab);
    // Repeated keys (launch_argv) are irrelevant here; first value wins.
    if (!records.has(key)) records.set(key, line.slice(tab + 1));
  }
  return {
    isolation: records.get("isolation") ?? "",
    drivable: records.get("drivable") ?? "",
    reason: records.get("drivable_reason") ?? records.get("isolation_reason") ?? "(no reason)",
  };
}

/**
 * Pull the documented live cohort out of the header. Deliberately anchored to the
 * commented env-knob line rather than to a fixture, so deleting or renaming the
 * knob fails this test instead of silently skipping it.
 */
function documentedCohort(): string {
  const script = readFileSync("playtest-loop.sh", "utf8");
  const match = script.match(/^#\s+PLAYTEST_COHORT="([^"]+)"/m);
  const cohort = match?.[1];
  expect(cohort, "playtest-loop.sh no longer documents a PLAYTEST_COHORT example").toBeTruthy();
  return cohort ?? "";
}

/** The provider ids in a `provider:count,provider:count` cohort, blanks dropped. */
function cohortProviderIds(cohort: string): string[] {
  return cohort
    .split(",")
    .map((group) => (group.split(":")[0] ?? "").trim())
    .filter((id) => id.length > 0);
}

describe("playtest-loop documented cohort example", () => {
  it("names only providers this checkout can actually launch live", () => {
    const cohort = documentedCohort();
    const ids = cohortProviderIds(cohort);

    expect(ids.length, `cohort "${cohort}" parsed to no providers`).toBeGreaterThan(0);

    for (const id of ids) {
      const { isolation, drivable, reason } = resolveProvider(id);
      // Both halves, matching preflight_cohort: provable AND drivable.
      expect(
        `${id}: isolation=${isolation} drivable=${drivable}`,
        `The header advertises PLAYTEST_COHORT="${cohort}", but a live wave would refuse ` +
          `"${id}": ${reason}. Document a live-capable cohort (npm run doctor lists them), ` +
          `or move the example under PLAYTEST_MOCK=1 where any provider is legal.`,
      ).toBe(`${id}: isolation=runner_enforced drivable=1`);
    }
  }, 120_000);

  it("still documents a cohort of more than one DISTINCT provider", () => {
    // The example carries the file's own "large volume cohort + small reference
    // cohort" argument, and that argument is about cross-vendor calibration: the
    // reference cohort is only a reference because it is a different vendor.
    //
    // So the invariant is distinct providers, not a comma. `codex:8,codex:2` has
    // the shape and none of the meaning — it launches one vendor family twice —
    // and would sail through a `toContain(",")` check while silently retiring the
    // calibration the header is there to describe.
    const cohort = documentedCohort();
    const distinct = new Set(cohortProviderIds(cohort));

    expect(
      distinct.size,
      `The header documents PLAYTEST_COHORT="${cohort}", which names ${distinct.size} ` +
        `distinct provider(s): ${[...distinct].sort().join(", ")}. The example is meant to ` +
        `show a large volume cohort alongside a small cross-vendor reference cohort, so it ` +
        `needs at least two different providers.`,
    ).toBeGreaterThan(1);
  });
});
