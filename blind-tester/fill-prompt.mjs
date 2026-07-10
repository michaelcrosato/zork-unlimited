#!/usr/bin/env node
/**
 * blind-tester/fill-prompt.mjs — fills the locked blind-prompt template with
 * the seed, start instruction, and an optional persona overlay.
 *
 * Replaces run.sh's old sed pipeline (which only knew {{START_INSTRUCTION}} and
 * __SEED__) so a third placeholder — the single {{PERSONA}} line each prompt now
 * carries right after its intro paragraph — can be filled the same way. Personas
 * are a play-style overlay only (see blind-tester/personas/*.md); they carry NO
 * design/solution info, so the STRICT RULES and REPORT sections stay untouched.
 *
 * --persona absent/"default" MUST reproduce today's byte-for-byte prompt: the
 * default persona file is comment-only, personaTextFromFile() strips it down to
 * "", and fillPrompt() removes the whole {{PERSONA}} line (its own trailing
 * newline included) rather than leaving a blank line behind.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Fill the locked prompt template. Pure — no I/O — so it's directly testable.
 *
 * - Every `{{START_INSTRUCTION}}` occurrence → startInstruction.
 * - Every `__SEED__` occurrence → String(seed).
 * - The line containing `{{PERSONA}}` (a whole line, alone on its own line in
 *   both prompts): if persona (trimmed) is non-empty, the ENTIRE line is
 *   replaced by the trimmed persona text plus one trailing newline; if empty,
 *   the line — including its own newline — is removed outright, so the
 *   surrounding blank line collapses back to the original layout with zero
 *   residue.
 */
export function fillPrompt(template, { startInstruction, seed, persona }) {
  const personaText = (persona ?? "").trim();
  let out = template.replace(/^.*\{\{PERSONA\}\}.*\r?\n?/m, personaText ? `${personaText}\n` : "");
  out = out.split("{{START_INSTRUCTION}}").join(startInstruction);
  out = out.split("__SEED__").join(String(seed));
  return out;
}

/**
 * Derive the persona overlay text from a persona file. default.md is a single
 * HTML-comment explanatory line (no overlay); stripping comment-only lines and
 * trimming collapses it to "", which fillPrompt treats as "no persona".
 */
function personaTextFromFile(path) {
  if (!path) return "";
  const raw = readFileSync(path, "utf8");
  const withoutComments = raw
    .split("\n")
    .filter((line) => !/^\s*<!--.*-->\s*$/.test(line))
    .join("\n");
  return withoutComments.trim();
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed") args.seed = argv[++i];
    else if (a === "--start-instruction") args.startInstruction = argv[++i];
    else if (a === "--persona-file") args.personaFile = argv[++i];
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const promptFile = args._[0];
  if (!promptFile || args.seed === undefined || args.startInstruction === undefined) {
    console.error(
      'usage: fill-prompt.mjs <promptFile> --seed N --start-instruction "…" [--persona-file path]',
    );
    process.exit(2);
  }
  const template = readFileSync(promptFile, "utf8");
  const persona = personaTextFromFile(args.personaFile);
  process.stdout.write(
    fillPrompt(template, { startInstruction: args.startInstruction, seed: args.seed, persona }),
  );
}

// Entry guard so tests can import fillPrompt without running the CLI.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
