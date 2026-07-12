/**
 * bin/overworld_play — the terminal overworld player stays at parity with the
 * web UI and MCP server: it drives the same OverworldSession (no reimplemented
 * rules), surfaces the mandatory road-encounter resolution (every travel leg
 * raises one — an interface that hides it wedges the game), speaks world quest
 * ids only (never pack paths), and defines scripted success as "every command
 * accepted" (the overworld has no terminal ending, so rpg_play's reached-an-ending
 * predicate does not apply).
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { render, renderEncounter } from "../../bin/overworld_play.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const ROOT = process.cwd();

function runCli(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(
    process.execPath,
    [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "bin/overworld_play.ts", ...args],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 },
  );
  return {
    status: result.status,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
  };
}

describe("overworld_play render (pure, same session the UI/MCP drive)", () => {
  it("renders the fresh-session status from OverworldSession.view()", () => {
    const manifest = loadOverworldManifest(ROOT);
    const session = new OverworldSession(manifest);
    const view = session.view();
    const text = render(view);
    expect(text).toContain(view.current.name);
    expect(text).toContain(`Supplies ${view.supplies}/${view.maxSupplies}`);
    expect(text).toContain("Roads:");
    expect(text).not.toMatch(/\.ya?ml/i); // public surface: no pack paths
  });

  it("renders the pending road encounter every travel leg raises, with strategy commands", () => {
    const manifest = loadOverworldManifest(ROOT);
    const session = new OverworldSession(manifest);
    const firstRoad = session.view().exits[0]!;
    session.travel(firstRoad.id);
    const pending = session.view().pendingRoadEncounter;
    expect(pending).not.toBeNull(); // every manifest edge carries a road event
    const text = renderEncounter(pending!);
    expect(text).toContain("Road encounter");
    for (const option of pending!.options) expect(text).toContain(option.label);
    const compact = session.compactView().pending_road;
    expect(compact).toMatchObject({
      edge: pending!.edgeId,
      route: pending!.route,
      where: [pending!.from, pending!.to, pending!.arrivedAt],
      event: [pending!.event.id, pending!.event.risk, pending!.event.title, pending!.event.summary],
    });
    expect(compact?.options).toEqual(
      pending!.options.map((option) => [
        option.strategy,
        option.label,
        option.minutes,
        option.suppliesCost,
        option.fatigueGained,
        option.renownGained,
      ]),
    );
    expect(JSON.stringify(compact)).not.toContain(pending!.options[0]!.outcome);
    // The three strategy command words the CLI accepts while wedged.
    expect(text).toMatch(/assist|scout|press/);
  });

  it("is deterministic: the same action order yields the same snapshot hash", () => {
    const manifest = loadOverworldManifest(ROOT);
    const play = (): string => {
      const session = new OverworldSession(manifest);
      session.travel(session.view().exits[0]!.id);
      session.resolveRoadEncounter("press_on");
      return session.snapshotHash();
    };
    expect(play()).toBe(play());
  });
});

describe("overworld_play CLI (scripted mode)", () => {
  it("plays a scripted leg: travel, resolve the encounter, rest — exit 0, no pack paths", () => {
    const run = runCli(["--commands", "look; go 1; press; journal; hash"]);
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("Road encounter");
    expect(run.output).toMatch(/Took .* — \d+ min/);
    expect(run.output).toMatch(/^[0-9a-f]{64}$/m); // snapshot hash line
    expect(run.output).not.toMatch(/content[\\/]rpg|\.ya?ml/i);
  });

  it("exits 1 when a scripted command is rejected", () => {
    const run = runCli(["--commands", "definitely-not-a-command"]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("A scripted command was rejected.");
  });

  it("rejects positional arguments (no pack-path or selector surface)", () => {
    const run = runCli(["breaking_weir"]);
    expect(run.status).toBe(1);
    expect(run.output).toContain("overworld takes no positional arguments");
  });
});
