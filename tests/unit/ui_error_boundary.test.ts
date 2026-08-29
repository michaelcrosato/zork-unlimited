/**
 * A throw inside the React tree must not leave the double-click player staring
 * at a black page.
 *
 * `App`'s fail-closed screen covers a save that will not parse or verify. It
 * cannot cover a throw raised while a screen is being drawn, and it cannot
 * cover a module that throws while it is being imported — in both cases React
 * unmounts (or never mounts) and `ui/index.html` is left showing whatever is
 * inside `#root`. The stated audience has no terminal and no devtools, and the
 * failing journey is still in localStorage, so every reload reproduces it.
 *
 * These two proofs cover the two halves: the boundary turns a caught throw into
 * a readable screen with a way out, and the shipped entry points actually wire
 * the boundary and the pre-React fallback in.
 *
 * Note on method: React DOM's server renderer does not implement error
 * boundaries — `renderToStaticMarkup` rethrows instead of calling
 * `getDerivedStateFromError` — so this drives the boundary's own contract (the
 * static state derivation, then `render`) rather than asking SSR to dispatch a
 * lifecycle it does not have.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer } from "vite";

type BoundaryState = { detail: string | null };
type BoundaryModule = {
  AppErrorBoundary: {
    new (props: unknown): { state: BoundaryState; render(): unknown };
    getDerivedStateFromError(error: unknown): BoundaryState;
  };
  crashDetail(error: unknown): string;
};

describe("ui error boundary", () => {
  it("turns a caught render throw into a readable recovery screen", async () => {
    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const module = (await server.ssrLoadModule("/src/ErrorBoundary.tsx")) as BoundaryModule;
      const requireFromUi = createRequire(resolve(uiRoot, "package.json"));
      const reactDomServer = requireFromUi("react-dom/server") as {
        renderToStaticMarkup: (element: unknown) => string;
      };

      expect(module.crashDetail(new Error("journey projection failed"))).toBe(
        "journey projection failed",
      );
      expect(module.crashDetail(new Error("   "))).toBe(
        "The game stopped without reporting a reason.",
      );
      expect(module.crashDetail("thrown string")).toBe("thrown string");

      const boundary = new module.AppErrorBoundary({
        children: null,
        onReload: () => undefined,
        onDiscardSave: () => undefined,
      });
      // While nothing has thrown the boundary is transparent.
      expect(boundary.state).toEqual({ detail: null });
      expect(boundary.render()).toBeNull();

      boundary.state = module.AppErrorBoundary.getDerivedStateFromError(
        new Error("journey projection failed"),
      );
      expect(boundary.state).toEqual({ detail: "journey projection failed" });

      const markup = reactDomServer.renderToStaticMarkup(boundary.render());
      expect(markup).toContain("journey projection failed");
      expect(markup).toContain("Something went wrong");
      // A reload alone replays the same saved journey, so the way out has to be
      // offered too.
      expect(markup).toContain("Reload the game");
      expect(markup).toContain("Discard this save and begin a new journey");
    } finally {
      await server.close();
    }
  }, 120_000);

  it("wires the boundary and a pre-React fallback into the shipped entry points", () => {
    const main = readFileSync("ui/src/main.tsx", "utf8");
    expect(main).toMatch(/<AppErrorBoundary[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/);
    // The crash is reproducible from the save, so the discard path must clear
    // both keys App reads on boot — not just the current one.
    expect(main).toContain("JOURNEY_SAVE_KEY");
    expect(main).toContain("LEGACY_OVERWORLD_SAVE_KEY");

    // A module that throws at import time means main.tsx never runs and the
    // boundary never mounts; only markup already in #root can speak then.
    const html = readFileSync("ui/index.html", "utf8");
    const opening = '<div id="root">';
    const start = html.indexOf(opening);
    const end = html.indexOf('<script type="module"');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const fallback = html.slice(start + opening.length, end);
    expect(fallback).toContain("<noscript");
    expect(fallback).toContain("PLAY.bat");
    expect(fallback).toMatch(/failed to start/i);
  });
});
