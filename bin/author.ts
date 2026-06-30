#!/usr/bin/env -S npx tsx
/**
 * bin/author — author an RPG content pack from a premise (spec §12.1–3).
 *
 * Usage:
 *   npm run author -- "a premise sentence" [--out content/rpg/pack/foo.yaml]
 *
 * Runs the writer → adapter → validator loop with the deterministic
 * MockAuthorProvider (no API keys). The CLI is deliberately RPG-only: no legacy
 * authoring mode is exposed. Prints the per-beat classification and validation
 * report; with --out, writes the green RPG pack as YAML. A real provider slots in
 * behind an env var (§12.7).
 */
import { writeFileSync } from "node:fs";
import { stringify as toYaml } from "yaml";
import { MockAuthorProvider } from "../agents/authoring/mock_author.js";
import { resolveProvider } from "../agents/llm/providers.js";
import { loadEngineContract, runWriter } from "../agents/authoring/writer.js";
import { runRpgAdapter } from "../agents/authoring/adapter.js";
import { formatReport } from "../src/validate/report.js";

async function main(): Promise<void> {
  const premise = process.argv[2];
  if (!premise || premise.startsWith("--")) {
    console.error('Usage: npm run author -- "a premise" [--out path.yaml]');
    process.exit(2);
  }
  let out: string | null = null;
  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === "--out") out = process.argv[++i] ?? null;
    else if (process.argv[i] === "--mode") {
      console.error("author is RPG-only; --mode is no longer supported.");
      process.exit(2);
    } else {
      console.error(`Unknown option: ${process.argv[i]}`);
      process.exit(2);
    }
  }

  // Deterministic mock by default; a real backend is used only when its key is
  // present in the environment (§12.7) — CI and key-less runs stay fully offline.
  const provider = resolveProvider({ mock: new MockAuthorProvider() });
  if (provider.name !== "mock:author") console.log(`Using live provider: ${provider.name}`);
  const contract = loadEngineContract();

  const story = await runWriter(provider, { premise, contract });
  console.log(
    `Writer drafted "${story.title}" — ${story.chapters.length} chapters, ${story.beats.length} beats.`,
  );

  const result = await runRpgAdapter(provider, { story, contract });
  console.log(
    `\nAdapter reached a ${result.ok ? "GREEN" : "RED"} rpg pack in ${result.rounds} round(s).`,
  );
  console.log("\nBeat classifications (§11):");
  for (const c of result.classifications)
    console.log(`  - ${c.beat_id}: ${c.label}${c.note ? ` — ${c.note}` : ""}`);
  console.log("\n" + formatReport(result.report));

  if (!result.ok) {
    console.error("\nAdapter could not produce a playable pack.");
    process.exit(1);
  }
  if (out) {
    writeFileSync(out, toYaml(result.pack));
    console.log(`\nWrote pack to ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
