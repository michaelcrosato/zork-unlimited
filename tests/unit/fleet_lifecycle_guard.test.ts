import { execFileSync, spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertExactBuildAtFleetBoundary,
  createFleetChildTracker,
  createFleetLaunchControl,
  createFleetTerminationController,
  installFleetSignalHandlers,
  launchAfterExactBuildGate,
  settleFleetChildrenBeforeCleanup,
  spawnFleetChild,
  // @ts-expect-error — plain .mjs module without type declarations
} from "../../blind-tester/fleet.mjs";

const BUILD = {
  git_commit: "a".repeat(40),
  tracked_worktree_clean: true,
  world_id: "new_york_overworld",
  world_hash: "b".repeat(64),
};

describe("fleet exact-build launch gate", () => {
  it("checks both slot and attempt boundaries before launch", async () => {
    let captures = 0;
    let launches = 0;
    const control = createFleetLaunchControl({
      captureBuild: async () => {
        captures += 1;
        return BUILD;
      },
    });

    await assertExactBuildAtFleetBoundary(control, BUILD, "pre-slot seed 10");
    const result = await launchAfterExactBuildGate(
      control,
      BUILD,
      "pre-attempt seed 10 attempt 1",
      () => {
        launches += 1;
        return Promise.resolve("launched");
      },
    );

    expect(result).toBe("launched");
    expect(captures).toBe(2);
    expect(launches).toBe(1);
  });

  it("publishes one drift abort before a queued sibling can capture or launch", async () => {
    let captures = 0;
    let launches = 0;
    const drifted = { ...BUILD, world_hash: "c".repeat(64) };
    const control = createFleetLaunchControl({
      captureBuild: async () => {
        captures += 1;
        return captures === 1 ? drifted : BUILD;
      },
    });

    const first = launchAfterExactBuildGate(control, BUILD, "first sibling", () => {
      launches += 1;
      return Promise.resolve("unexpected");
    });
    const second = launchAfterExactBuildGate(control, BUILD, "queued sibling", () => {
      launches += 1;
      return Promise.resolve("unexpected");
    });

    await expect(first).rejects.toThrow(/exact build drift detected at first sibling/i);
    await expect(second).rejects.toBe(control.abortFailure);
    expect(captures).toBe(1);
    expect(launches).toBe(0);
  });

  it("aborts a suspended Windows-style launch before resume when the final build drifts", async () => {
    let captures = 0;
    let resumes = 0;
    let aborts = 0;
    const drifted = { ...BUILD, world_hash: "d".repeat(64) };
    const control = createFleetLaunchControl({
      captureBuild: async () => {
        captures += 1;
        return captures === 1 ? BUILD : drifted;
      },
    });
    let settleLaunch!: (value: string) => void;
    const deferred = new Promise<string>((resolvePromise) => {
      settleLaunch = resolvePromise;
    }) as Promise<string> & {
      hasDeferredStart: boolean;
      launchReady: Promise<void>;
      launchStarted: Promise<void>;
      resumeLaunch: () => boolean;
      abortLaunch: () => boolean;
    };
    deferred.hasDeferredStart = true;
    deferred.launchReady = Promise.resolve();
    deferred.launchStarted = Promise.resolve();
    deferred.resumeLaunch = () => {
      resumes += 1;
      settleLaunch("resumed");
      return true;
    };
    deferred.abortLaunch = () => {
      aborts += 1;
      settleLaunch("aborted");
      return true;
    };

    await expect(
      launchAfterExactBuildGate(control, BUILD, "deferred Windows attempt", () => deferred),
    ).rejects.toThrow(/exact build drift detected.*pre-resume/i);
    expect(captures).toBe(2);
    expect(resumes).toBe(0);
    expect(aborts).toBe(1);
    await expect(deferred).resolves.toBe("aborted");
  });
});

describe("fleet child custody", () => {
  it("waits for a live child before lock cleanup", async () => {
    const tracker = createFleetChildTracker({ terminationGraceMs: 250 });
    const child = spawn(
      process.execPath,
      ["-e", "process.stdout.write('ready\\n'); setInterval(() => {}, 1000)"],
      { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
    );
    tracker.track(child);
    await once(child.stdout!, "data");

    const order: string[] = [];
    child.once("close", () => order.push("child-closed"));
    await settleFleetChildrenBeforeCleanup(
      tracker,
      () => {
        expect(tracker.activeCount()).toBe(0);
        order.push("locks-released");
      },
      { terminate: true },
    );

    expect(order).toEqual(["child-closed", "locks-released"]);
  });

  it("keeps repeated signals handled while sharing one shutdown promise", async () => {
    let terminationCalls = 0;
    let releaseTermination!: () => void;
    const shutdown = new Promise<void>((resolvePromise) => {
      releaseTermination = resolvePromise;
    });
    const childTracker = {
      terminateAndWait: () => {
        terminationCalls += 1;
        return shutdown;
      },
    };
    const fleetControl = { abortFailure: null };
    const controller = createFleetTerminationController({ fleetControl, childTracker });
    const target = new EventEmitter();
    const uninstall = installFleetSignalHandlers(controller.requestTermination, target);

    target.emit("SIGINT");
    target.emit("SIGTERM");
    expect(terminationCalls).toBe(1);
    expect(controller.signalExitCode).toBe(130);
    expect(controller.shutdownPromise).toBe(shutdown);
    expect(fleetControl.abortFailure).toMatchObject({
      message: expect.stringMatching(/SIGINT requested/i),
    });

    releaseTermination();
    await controller.shutdownPromise;
    uninstall();
    uninstall();
    expect(target.listenerCount("SIGINT")).toBe(0);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });

  it.skipIf(process.platform !== "win32")(
    "assigns a suspended launcher to a Job Object before it can create descendants",
    async () => {
      const fixture = mkdtempSync(join(tmpdir(), "af-fleet-windows-job-"));
      const pidPath = join(fixture, "descendant.pid");
      const tracker = createFleetChildTracker();
      const rootScript = `
        const { spawn } = require("node:child_process");
        const { writeFileSync } = require("node:fs");
        const descendant = spawn(
          process.execPath,
          ["-e", "setInterval(() => {}, 1000)"],
          { detached: true, stdio: "ignore", windowsHide: true },
        );
        writeFileSync(${JSON.stringify(pidPath)}, String(descendant.pid));
        descendant.unref();
      `;
      const launch = spawnFleetChild(
        process.execPath,
        ["-e", rootScript],
        { cwd: fixture, env: { ...process.env } },
        { tree: true, deferWindowsStart: true },
      );
      tracker.track(launch.child, launch.trackerOptions);
      let descendantPid: number | null = null;
      try {
        await launch.readiness;
        expect(existsSync(pidPath)).toBe(false);
        expect(launch.resume()).toBe(true);
        await launch.started;
        await tracker.waitForIdle();
        descendantPid = Number(readFileSync(pidPath, "utf8"));
        expect(launch.statusForClose(launch.child.exitCode)).toBe(0);
        expect(() => process.kill(descendantPid!, 0)).toThrow(
          expect.objectContaining({ code: "ESRCH" }),
        );
      } finally {
        if (tracker.activeCount() > 0) {
          try {
            await tracker.terminateAndWait();
          } catch {
            // Preserve the primary assertion failure.
          }
        }
        if (descendantPid !== null) {
          try {
            process.kill(descendantPid, "SIGKILL");
          } catch {
            // The expected path already terminated the Job Object.
          }
        }
        if (launch.child.pid !== undefined) {
          try {
            execFileSync("taskkill.exe", ["/PID", String(launch.child.pid), "/T", "/F"], {
              stdio: "ignore",
              windowsHide: true,
            });
          } catch {
            // The expected path already closed the anchor.
          }
        }
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );
});
