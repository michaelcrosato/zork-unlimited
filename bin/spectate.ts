#!/usr/bin/env -S npx tsx
/**
 * bin/spectate — watch an LLM playthrough live from a second terminal.
 *
 * Usage:
 *   npm run spectate                      # tail ai-runs/spectate.log (the default feed)
 *   npm run spectate -- <path>            # tail a custom feed path
 *
 * The MCP server writes the feed when started in spectate mode:
 *   npm run mcp -- --spectate [path] --spectate-delay-ms 1500
 *   (or env: AF_SPECTATE=1|<path>, AF_SPECTATE_DELAY_MS=1500)
 * The blind harness forwards it: npm run blind -- --spectate [--delay-ms 1500].
 * Cross-platform by construction (pure Node polling; no tail/PowerShell needed).
 */
import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_FEED = "ai-runs/spectate.log";
const POLL_MS = 250;

function positional(): string | undefined {
  for (let i = 2; i < process.argv.length; i += 1) {
    const value = process.argv[i]!;
    if (value === "--" || value.startsWith("--")) continue;
    return value;
  }
  return undefined;
}

async function main(): Promise<void> {
  const feed = resolve(positional() ?? DEFAULT_FEED);
  console.log(
    `Watching ${feed} — start the MCP server with --spectate to fill it. Ctrl+C to stop.`,
  );
  let offset = existsSync(feed) ? statSync(feed).size : 0;
  if (offset > 0) console.log(`(skipping ${offset} bytes of existing feed; new entries follow)`);
  // Poll-based tail: fs.watch is unreliable across platforms/editors; a 250ms
  // poll is imperceptible for a human and works identically everywhere.
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (!existsSync(feed)) continue;
    const size = statSync(feed).size;
    if (size < offset) offset = 0; // feed truncated/rotated — restart from the top
    if (size === offset) continue;
    const fd = openSync(feed, "r");
    try {
      const buf = Buffer.alloc(size - offset);
      const read = readSync(fd, buf, 0, buf.length, offset);
      offset += read;
      process.stdout.write(buf.toString("utf8", 0, read));
    } finally {
      closeSync(fd);
    }
  }
}

// Entry guard so tests can import helpers without starting the watcher loop.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
