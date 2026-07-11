import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyBlindReportFile,
  type BlindReportVerificationOptions,
  type RequiredBlindPlayMode,
} from "../src/blind/report_verifier.js";
import { parseBlindRunSidecar } from "../src/blind/run_evidence.js";

export {
  type BlindReportVerification,
  verifyBlindReportFile,
  verifyBlindReportText,
} from "../src/blind/report_verifier.js";

function main(): void {
  const argv = process.argv.slice(2);
  const valueOf = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const reportPath = argv[0]?.startsWith("--") === false ? argv[0] : undefined;
  if (!reportPath) {
    console.error(
      "Usage: tsx scripts/verify-blind-report.ts <report.md> [--require-mode pure|structural] [--run-evidence events.jsonl | --run-sidecar report.run.json] [--write-run-sidecar report.run.json] [--json]",
    );
    process.exit(2);
  }

  const requiredMode = valueOf("--require-mode");
  if (requiredMode !== undefined && requiredMode !== "pure" && requiredMode !== "structural") {
    console.error(`Invalid --require-mode ${requiredMode} (expected pure or structural).`);
    process.exit(2);
  }
  const evidencePath = valueOf("--run-evidence");
  const sidecarPath = valueOf("--run-sidecar");
  if (evidencePath !== undefined && sidecarPath !== undefined) {
    console.error("Pass only one of --run-evidence or --run-sidecar.");
    process.exit(2);
  }

  const options: BlindReportVerificationOptions = {};
  if (requiredMode !== undefined) {
    options.requiredPlayMode = requiredMode as RequiredBlindPlayMode;
  }
  if (evidencePath !== undefined) {
    options.runEvidenceText = readFileSync(evidencePath, "utf8");
  }
  if (sidecarPath !== undefined) {
    const parsed = parseBlindRunSidecar(readFileSync(sidecarPath, "utf8"));
    if (!parsed.ok) {
      console.error(`✗ blind report rejected: ${parsed.reason}`);
      process.exit(5);
    }
    options.runSidecar = parsed.sidecar;
  }

  const result = verifyBlindReportFile(reportPath, options);
  if (!result.ok) {
    console.error(`✗ blind report rejected: ${result.reason}`);
    process.exit(5);
  }

  const outputSidecar = valueOf("--write-run-sidecar");
  if (outputSidecar !== undefined) {
    if (result.run === null) {
      console.error(
        "✗ blind report rejected: cannot write a run sidecar without mode verification",
      );
      process.exit(5);
    }
    writeFileSync(outputSidecar, `${JSON.stringify(result.run, null, 2)}\n`, "utf8");
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ ok: true, run: result.run }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
