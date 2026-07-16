import { resolve } from "node:path";
import { capturePureFleetBuild } from "../src/starting_slice/fleet_build.js";

const root = resolve(process.argv[2] ?? process.cwd());

try {
  process.stdout.write(`${JSON.stringify(capturePureFleetBuild(root))}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
