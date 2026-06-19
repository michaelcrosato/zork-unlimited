import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBlindReportFile } from "../src/blind/report_verifier.js";

export {
  type BlindReportVerification,
  verifyBlindReportFile,
  verifyBlindReportText,
} from "../src/blind/report_verifier.js";

function main(): void {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("Usage: tsx scripts/verify-blind-report.ts <report.md>");
    process.exit(2);
  }
  const result = verifyBlindReportFile(reportPath);
  if (!result.ok) {
    console.error(`✗ blind report rejected: ${result.reason}`);
    process.exit(5);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
