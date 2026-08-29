/**
 * The browser quest catalog must not parse quest YAML while it is imported.
 *
 * `ui/src/packs.ts` is module-scope: everything it does runs before React
 * mounts and before the single-file build paints anything, and the double-click
 * launcher has no loading state to cover it. It used to `yaml.parse` all twelve
 * shipped packs (~680 KB) during import purely to fill a `name` used for one
 * sort, so the player waited through hundreds of milliseconds of blank page for
 * a value nothing read. This proves the parse is gone rather than merely
 * cheaper: the module is loaded with `yaml` replaced by a tripwire that throws
 * on any call, so a reintroduced import-time parse fails this test loudly.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createServer, type Plugin } from "vite";

const YAML_TRIPWIRE_ID = "\0adventureforge-yaml-tripwire";

/**
 * `enforce: "pre"` is required: without it Vite's own resolver claims the bare
 * `yaml` specifier first and the tripwire never loads.
 */
const yamlTripwire: Plugin = {
  name: "adventureforge:yaml-tripwire",
  enforce: "pre",
  resolveId(source) {
    return source === "yaml" ? YAML_TRIPWIRE_ID : null;
  },
  load(id) {
    if (id !== YAML_TRIPWIRE_ID) return null;
    return [
      'const trip = () => { throw new Error("YAML parsed at import time"); };',
      "export const parse = trip;",
      "export const parseDocument = trip;",
      "export const stringify = trip;",
      "export default { parse: trip, parseDocument: trip, stringify: trip };",
    ].join("\n");
  },
};

describe("ui pack catalog", () => {
  it("builds the catalog without parsing any pack YAML at import time", async () => {
    const uiRoot = resolve(process.cwd(), "ui");
    const server = await createServer({
      root: uiRoot,
      configFile: resolve(uiRoot, "vite.config.ts"),
      appType: "custom",
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
      // Without `noExternal` the SSR loader hands bare `yaml` straight to Node
      // and the tripwire is never consulted.
      ssr: { noExternal: ["yaml"] },
      plugins: [yamlTripwire],
    });
    try {
      const module = (await server.ssrLoadModule("/src/packs.ts")) as {
        PACKS: { path: string; source: string }[];
      };

      const shipped = readdirSync(resolve(process.cwd(), "content/rpg/quests")).filter((entry) =>
        entry.endsWith(".yaml"),
      );
      expect(shipped.length).toBeGreaterThan(0);
      expect(module.PACKS).toHaveLength(shipped.length);
      // The catalog is still keyed the way App.tsx looks packs up, and still
      // carries the source text GameSession compiles on demand.
      for (const entry of module.PACKS) {
        expect(entry.path).toMatch(/content\/rpg\/quests\/[^/]+\.yaml$/);
        expect(entry.source.length).toBeGreaterThan(0);
      }
      expect(module.PACKS.map((entry) => entry.path)).toEqual(
        [...module.PACKS.map((entry) => entry.path)].sort((a, b) => a.localeCompare(b)),
      );
    } finally {
      await server.close();
    }
  }, 120_000);
});
