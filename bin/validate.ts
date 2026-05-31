#!/usr/bin/env -S npx tsx
/**
 * bin/validate — run the validator on a CYOA content pack (§10).
 *
 * Usage: npm run validate -- <pack.yaml>
 * Exit code 0 = green (no errors); 1 = errors found; 2 = usage/IO error.
 */
import { loadPackFile } from "../src/cyoa/pack.js";
import { validateCyoa } from "../src/validate/cyoa_validator.js";
import { formatReport, makeReport } from "../src/validate/report.js";

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run validate -- <pack.yaml>");
    process.exit(2);
  }

  const result = loadPackFile(path);
  if (!result.ok) {
    // Schema failure → a single SCHEMA report so the contract is the gate (§7).
    const findings = result.error.issues.map((i) => ({
      severity: "error" as const,
      code: "SCHEMA",
      message: `${i.message} (${i.path.join(".") || "<root>"})`,
      where: [i.path.join(".") || "<root>"],
    }));
    const report = makeReport(path, findings);
    console.log(formatReport(report));
    process.exit(1);
  }

  const report = validateCyoa(result.compiled.pack);
  console.log(formatReport(report));
  console.log(`content_hash: ${result.compiled.contentHash}`);
  process.exit(report.ok ? 0 : 1);
}

main();
