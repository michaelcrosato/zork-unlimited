// Worker-thread bootstrap for Task 10's fan-out (`run.ts`'s `runWorkerShard`).
// Plain JS so the worker thread can load it natively with no loader hooks of
// its own, then registers tsx's ESM loader INSIDE this thread via tsx's
// documented `tsx/esm/api` `register()` call, and hands off to the real
// (TypeScript) worker entry point.
//
// Why not `execArgv: ["--import", "tsx"]` on the Worker constructor (the
// original approach)? That flag registers tsx's hooks via a `--import`
// preload, and whether those hooks correctly rewrite a `.js` specifier
// (`./run.js`) to the sibling `.ts` file (`./run.ts`) INSIDE a worker_thread
// is Node-version-dependent: it worked on Node 24/Windows locally, but broke
// on CI's ubuntu-latest + Node 22 with `ERR_MODULE_NOT_FOUND` for
// `src/crawl/run.js` imported from `worker_entry.ts` — the propagation of
// `--import`'s effect into the worker thread's module resolution isn't
// guaranteed across Node versions. Registering tsx via its API from code
// that already runs inside the worker thread (this file) sidesteps that
// version-dependence entirely.
import { register } from "tsx/esm/api";

register();
await import(new URL("./worker_entry.ts", import.meta.url).href);
