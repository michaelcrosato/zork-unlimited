import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Write a whole file as one visible step (bug_0609).
 *
 * The queue and ticket stores are read-modify-write JSON files that several lanes and
 * the playtest loop touch. A bare `writeFileSync` truncates the target first, so a crash
 * or a concurrent reader in the middle of a write sees an empty or half-written file,
 * and `readQueue` then refuses the whole directory. Staging the bytes beside the target
 * and renaming into place makes the replacement atomic on POSIX and on NTFS.
 */
export function writeFileAtomic(path: string, text: string): void {
  const staging = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now().toString(36)}.tmp`,
  );
  writeFileSync(staging, text, "utf8");
  try {
    renameInto(staging, path);
  } catch (error) {
    try {
      unlinkSync(staging);
    } catch {
      // The staging file is the only thing left behind, and only when the rename failed.
    }
    throw error;
  }
}

/** Windows refuses to replace a file another process has open without share-delete;
 *  readers hold that handle for a few milliseconds, so retry briefly before giving up. */
function renameInto(staging: string, path: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(staging, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
}
