/**
 * Playtest provider registry — the model-agnostic seam.
 *
 * Before this module the live blind harness was hard-wired to one vendor: the
 * runner rejected anything but `--provider codex`, and the transport profile was a
 * switch on an exact model string. That made "add another vendor" a code change in
 * five files, so in practice the fleet was homogeneous — which is the worst possible
 * shape for the evidence it produces (see `familyDiversity` in ../feedback/rank.ts:
 * forty runs of ONE model agreeing is one instrument sampled forty times, not forty
 * independent witnesses).
 *
 * The registry separates three things that were previously fused:
 *
 *   1. HOW a client is launched          — `kind` + `launch`
 *   2. HOW ITS BLINDNESS IS ESTABLISHED  — `kind` + `capture`, from which `isolation`
 *                                          is DERIVED (see `derivePlaytestIsolation`)
 *   3. WHICH MODELS it may play as       — an operator-owned catalog
 *
 * (3) is deliberately data, not code. Exact model ids churn constantly and differ by
 * subscription tier, so pinning them in TypeScript guarantees the file is stale. The
 * catalogs under `blind-tester/catalogs/` are operator-editable and validated by the
 * same schema the registry uses, so adding a model your subscription just unlocked is
 * a JSON edit, and adding a whole vendor is one registry entry plus one catalog.
 *
 * `isolation` is the field that keeps this honest, and it is NOT a formality. The
 * project's rule has always been that unverifiable evidence must never be laundered
 * into retention metrics (docs/blind_playtest_protocol.md). A headless CLI the runner
 * spawns can have its tool surface PROVEN — the runner owns the argv, the cwd, and the
 * tool allowlist, so `runner_enforced` blindness is a fact about the process. A desktop
 * client a human wired to the MCP server cannot be proven by any code in this repo;
 * only the operator can assert it. Both are useful and BOTH ARE KEPT — nothing a
 * playtester produces is ever discarded — but they are different evidence classes and
 * the QA pipeline must be able to tell them apart. Collapsing them would reintroduce
 * exactly the contamination the `BLIND_AGENT_CMD` ban exists to prevent.
 *
 * Which is why `isolation` is no longer something an author gets to ASSERT. It used to
 * be a hand-written literal whose only protection was the comment below it and a
 * reviewer noticing — and the failure it warns about (a vendor stamped
 * `runner_enforced` that the runner cannot actually witness) is silent, permanent and
 * downstream: the recorder copies the label verbatim into a sealed corpus record and
 * the QA pipeline then lets hand-played sessions move experience metrics. So the label
 * is now COMPUTED from facts a lie cannot survive: the provider's `kind`, whether it
 * declares a complete `capture` block, and whether that block's named reader module is
 * actually present in this checkout. `derivePlaytestIsolation` is the only authority;
 * the stored field is kept as a redundant, human-readable copy that MUST agree with the
 * derivation or the registry refuses to parse. Adding a vendor is therefore a registry
 * entry, a catalog, a capture block and a reader module — and the strongest evidence
 * label in the system arrives only when the last of those exists on disk.
 */
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";

/**
 * Repo root, resolved from this module rather than `process.cwd()`.
 *
 * The derivation below asks the filesystem whether a capture reader exists, and it has
 * to give the same answer from `bin/doctor.ts`, from a test runner, and from a shell
 * that happened to `cd` somewhere else. A cwd-relative check would silently downgrade
 * every provider to `operator_attested` whenever the process started in the wrong
 * directory — a wrong answer that looks exactly like an honest one.
 */
const REPO_ROOT_URL = new URL("../../", import.meta.url);

/** How the harness obtains a playing client. */
export const PlaytestProviderKindSchema = z.enum([
  /** The runner spawns a headless CLI it controls end to end. */
  "headless_cli",
  /**
   * A desktop or web client a human drives, connected to the MCP server by the
   * operator. The runner never sees the process, so it cannot prove the tool
   * boundary — see `isolation`. This is the path for vendors that ship no CLI.
   */
  "desktop_client",
]);
export type PlaytestProviderKind = z.infer<typeof PlaytestProviderKindSchema>;

/**
 * What establishes that the player could only ever see the game.
 *
 * This is an evidence CLASS, not a quality rating. An `operator_attested` session
 * from a strong model is often more informative than a `runner_enforced` one from a
 * weak model; it simply cannot be machine-verified, so it is labelled and separated
 * rather than trusted silently.
 */
export const PlaytestIsolationSchema = z.enum([
  /**
   * The runner owns argv, cwd, and the tool allowlist, and records proof.
   *
   * This is a claim about what `blind-tester/run.sh` can do TODAY, not about what a
   * vendor is capable of in principle. Shipping a headless CLI is not enough: the
   * proof is read back out of the client's own session logs, so the vendor also needs
   * a `capture` block saying where that log is and which module reads it, and that
   * module has to exist. A provider stamped `runner_enforced` that the runner cannot
   * launch is the worst possible error in this file — every session it ever produces
   * is necessarily hand-played, yet the recorder stamps it with the strongest evidence
   * label in the system and the QA pipeline then lets it move experience metrics.
   *
   * That error is no longer reachable by writing the wrong word here: the value is
   * derived (`derivePlaytestIsolation`) and a disagreeing literal fails validation. It
   * flips to `runner_enforced` the moment the reader module lands, and not one commit
   * earlier; sessions keep whatever label was honest when they were recorded.
   */
  "runner_enforced",
  /** The intended boundary is attested, but no client-log reader proves the offered tools. */
  "operator_attested",
]);
export type PlaytestIsolation = z.infer<typeof PlaytestIsolationSchema>;

/**
 * Cost/capability tier, and the reason the fleet is deliberately lopsided.
 *
 * The game does not need frontier reasoning to be played — it needs VOLUME, because
 * experiential findings only become trustworthy through repetition across independent
 * instruments. So the bulk of the fleet is `volume`: cheap, fast, mass-parallel.
 *
 * A small `reference` cohort runs alongside as a calibration instrument. Its job is not
 * to find more bugs; it is to answer "is the volume cohort's silence meaningful?".
 * Three readings follow, and the ranking layer treats them asymmetrically:
 *
 *   - both tiers report it       → real, and confidently so
 *   - only `volume` reports it   → suspect a model capability floor, not a game defect
 *                                  ("I got stuck" from a weak player is not evidence
 *                                  the game is confusing) — needs several distinct
 *                                  FAMILIES before it counts
 *   - only `reference` reports it → the volume cohort is blind to it; this is the most
 *                                  valuable signal in the system, and naive
 *                                  mention-counting would rank it near-last
 */
export const PlaytestTierSchema = z.enum(["volume", "reference"]);
export type PlaytestTier = z.infer<typeof PlaytestTierSchema>;

/** One playable model within a provider's catalog. */
export const PlaytestCatalogModelSchema = z
  .object({
    /** Exact model id as the provider names it. No aliases: they resolve differently over time. */
    id: z.string().min(1),
    tier: PlaytestTierSchema,
    /**
     * Free-form provider settings recorded verbatim on every session record
     * (reasoning effort, verbosity, thinking budget…). Never interpreted here —
     * its purpose is that a session is reproducible and comparable later.
     */
    settings: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
    /**
     * At most one model per catalog may carry `default: true`; it is what a
     * launch with no --model resolves to. Absent any marked default, the first
     * volume-tier model keeps that role (the historical heuristic).
     */
    default: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type PlaytestCatalogModel = z.infer<typeof PlaytestCatalogModelSchema>;

export const PlaytestCatalogSchema = z
  .object({
    provider: z.string().min(1),
    models: z.array(PlaytestCatalogModelSchema).min(1),
  })
  .strict();
export type PlaytestCatalog = z.infer<typeof PlaytestCatalogSchema>;

/** How to spawn a `headless_cli` provider. */
export const PlaytestLaunchSchema = z
  .object({
    /** Executable that must resolve on PATH (or be pinned by the provider's env override). */
    executable: z.string().min(1),
    /**
     * Argument template. Substitutions are applied verbatim and only for these
     * tokens: {MODEL}, {CWD}, {MCP_CONFIG}. The prompt is always delivered on
     * STDIN — every supported CLI accepts that, and it keeps the player prompt out
     * of the process table and shell history.
     */
    argv: z.array(z.string()).min(1),
    /** Env var an operator may set to pin one exact executable path. */
    binaryOverrideEnv: z.string().min(1),
  })
  .strict();
export type PlaytestLaunch = z.infer<typeof PlaytestLaunchSchema>;

/** How the runner learns which session id its launch produced. */
export const PlaytestSessionIdSourceSchema = z.enum([
  /**
   * The runner picks the id and hands it to the client at launch, so the log's path is
   * known BEFORE the process starts. This is the stronger shape: the runner is reading
   * the log of the process it spawned, rather than choosing the newest file in a
   * directory and hoping no other session of that client was running.
   */
  "runner_pinned",
  /**
   * The client picks its own id and announces it in output the runner already captures.
   * Still bindable — the announcement and the private log have to carry the SAME id, so
   * a mismatch is detectable — but the locator cannot be resolved until the run starts,
   * which is why `resolvePlaytestSessionLogLocator` reports whether a path came out
   * exact.
   */
  "discovered",
]);
export type PlaytestSessionIdSource = z.infer<typeof PlaytestSessionIdSourceSchema>;

/**
 * Where a client writes the private per-session log the runner reads its proof from.
 *
 * Deliberately a TEMPLATE rather than a resolved path, and deliberately dumb: tokens are
 * replaced verbatim, nothing here knows what a vendor calls its directories. Anything
 * cleverer than substitution (Claude Code's cwd→slug transform, say) belongs in the
 * vendor's own reader module, because the instant this file learns one vendor's naming
 * rule it stops being a seam and becomes the switch statement the registry replaced.
 */
export const PlaytestSessionLogSchema = z
  .object({
    /**
     * Env var that relocates the client's private state root, when the vendor offers
     * one. Optional on purpose: not every CLI has such a var, and a required field here
     * would be answered with an invented name — a lie in the one file whose whole job is
     * to stop those.
     */
    rootEnv: z.string().min(1).optional(),
    /** Root when that var is unset. `{HOME}` is the only token. */
    rootDefault: z.string().min(1),
    /**
     * Path of the per-session log UNDER that root. Tokens: `{SESSION_ID}`, `{CWD_SLUG}`.
     * A `*` marks a segment the reader has to search rather than compute.
     */
    pathTemplate: z.string().min(1),
  })
  .strict();
export type PlaytestSessionLog = z.infer<typeof PlaytestSessionLogSchema>;

/**
 * What the runner can actually WITNESS for this vendor — the evidence half of the seam.
 *
 * `launch` says the runner can start the client. That is not proof of anything: an agent
 * can obey its tool allowlist or ignore it, and stdout is whatever the client chose to
 * print. `runner_enforced` blindness is established after the fact, by reading the
 * client's own private session log and auditing every tool call in it against the pure
 * MCP surface. So a provider is only as verifiable as this block: an id the runner can
 * bind to, a log it can find, and a module that can read it.
 *
 * The block is DATA. It names a reader; it does not describe one. Whether that reader
 * exists is a question for the filesystem, and it is the question `derivePlaytestIsolation`
 * asks — which is what makes "we support vendor X" impossible to claim in JSON alone.
 */
export const PlaytestCaptureSchema = z
  .object({
    sessionId: z
      .object({
        source: PlaytestSessionIdSourceSchema,
        /**
         * For `runner_pinned`, the exact launch flag carrying the runner's id. For
         * `discovered`, the exact place in the client's own output the id is read back
         * from. Free text, because it is for the human reviewing the entry — the reader
         * module is what actually implements it.
         */
        locator: z.string().min(1),
      })
      .strict(),
    sessionLog: PlaytestSessionLogSchema,
    /**
     * Repo-relative path of the module that reads this vendor's log. Must exist: a
     * capture block naming a module nobody wrote describes an intention, and intentions
     * do not witness sessions.
     */
    readerModule: z.string().min(1),
  })
  .strict()
  .superRefine((capture, ctx) => {
    // A locator that does not mention the session id cannot be bound to THIS run. It
    // would resolve to "some log this client wrote", which is how a reader ends up
    // auditing a different session — including one played by a human minutes earlier.
    if (!capture.sessionLog.pathTemplate.includes("{SESSION_ID}")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessionLog", "pathTemplate"],
        message: "capture sessionLog.pathTemplate must bind the log to {SESSION_ID}",
      });
    }
    // `..` in a locator lets a registry edit walk the reader out of the client's state
    // root and point it at any file on the machine; `readerModule` must likewise stay
    // inside the checkout, since its existence is what mints the strongest label here.
    for (const [path, value] of [
      [["sessionLog", "rootDefault"], capture.sessionLog.rootDefault],
      [["sessionLog", "pathTemplate"], capture.sessionLog.pathTemplate],
      [["readerModule"], capture.readerModule],
    ] as const) {
      if (value.split(/[\\/]/u).includes("..")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path],
          message: `capture ${path.join(".")} must not contain a ".." segment`,
        });
      }
    }
    if (/^(?:[/\\]|[A-Za-z]:)/u.test(capture.readerModule)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["readerModule"],
        message: "capture readerModule must be repo-relative, not an absolute path",
      });
    }
  });
export type PlaytestCapture = z.infer<typeof PlaytestCaptureSchema>;

/** Why a provider landed in the isolation class it did. */
export type PlaytestIsolationReasonCode =
  /** headless CLI + complete capture block + the reader module is on disk. */
  | "runner_captures_this_vendor"
  /** The runner never owns the process, so there is nothing for it to witness. */
  | "kind_is_not_headless_cli"
  /** Launchable, but nothing says where its session log is or who reads it. */
  | "no_capture_block"
  /** The capture block describes a reader this checkout does not contain. */
  | "capture_reader_module_missing";

export interface PlaytestIsolationDerivation {
  isolation: PlaytestIsolation;
  code: PlaytestIsolationReasonCode;
  /** One sentence, written to be printed verbatim by `bin/doctor.ts`. */
  reason: string;
  /** The declared reader path, whether or not it exists. Null when none is declared. */
  readerModule: string | null;
}

/**
 * The minimum a thing needs to have an isolation class.
 *
 * Structural rather than `PlaytestProvider` so the derivation can be asked about a shape
 * the schema would REJECT — a desktop client carrying a capture block, say. The schema's
 * refusal and the derivation's answer are then two independent guards instead of one
 * guard checked twice, and the test can prove the second still holds if the first were
 * ever loosened.
 */
export interface PlaytestIsolationSubject {
  id: string;
  kind: PlaytestProviderKind;
  // Explicitly `| undefined`: the repo runs `exactOptionalPropertyTypes`, and a provider
  // parsed straight out of the registry carries `capture: undefined` as a present key.
  capture?: PlaytestCapture | undefined;
}

/** Does the named reader module exist in THIS checkout, as a file? */
function captureReaderExists(readerModule: string): boolean {
  try {
    return statSync(new URL(readerModule, REPO_ROOT_URL)).isFile();
  } catch {
    // Missing, unreadable, a directory, or a path that will not even resolve — all of
    // which mean the same thing here: no reader, therefore no proof.
    return false;
  }
}

/**
 * Can THIS checkout's runner actually spawn the given provider for a live pure run?
 *
 * Deliberately separate from `derivePlaytestIsolation`, because they answer different
 * questions and both must be true before a live lane exists:
 *
 *   derivePlaytestIsolation -> "is this vendor's blindness PROVABLE here" (a reader exists)
 *   runnerCanDriveProvider  -> "does blind-tester/run.sh know how to LAUNCH it"
 *
 * Landing a reader without a launch path is the dangerous half, and it is not
 * hypothetical: when the claude_code reader landed, the derived gate opened while run.sh
 * still had no branch for it. Three components then disagreed — doctor advertised a live
 * lane, playtest-loop dispatched players into it, and run.sh refused every one. Worse,
 * `bin/record-playtest-session.ts` stamps a sealed record with the registry's isolation
 * label, so a session assembled by any other route would have been sealed
 * `runner_enforced` for a vendor this runner cannot launch at all — the exact
 * contamination the isolation classes exist to prevent.
 *
 * The list of implemented launch paths is a fact about run.sh, not about the registry, so
 * it lives in blind-tester/implemented-launch-paths.json and every component reads that
 * one file.
 */
export function runnerCanDriveProvider(provider: PlaytestIsolationSubject): {
  drivable: boolean;
  reason: string;
} {
  const derived = derivePlaytestIsolation(provider);
  if (derived.isolation !== "runner_enforced" || derived.readerModule === null) {
    return { drivable: false, reason: derived.reason };
  }
  let implemented: string[];
  try {
    const raw = readFileSync(
      new URL("blind-tester/implemented-launch-paths.json", REPO_ROOT_URL),
      "utf8",
    );
    const parsed: unknown = JSON.parse(raw);
    const readers =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { implementedCaptureReaders?: unknown }).implementedCaptureReaders
        : undefined;
    if (!Array.isArray(readers) || readers.some((r) => typeof r !== "string" || r === "")) {
      throw new Error("implementedCaptureReaders must be a non-empty string[]");
    }
    implemented = readers as string[];
  } catch (error) {
    // Fail CLOSED. If we cannot establish which vendors the runner can drive, the honest
    // answer is "none of them", never "all of them".
    return {
      drivable: false,
      reason:
        `blind-tester/implemented-launch-paths.json could not be read ` +
        `(${error instanceof Error ? error.message : String(error)}), so no provider can be ` +
        `treated as launchable here`,
    };
  }
  if (!implemented.includes(derived.readerModule)) {
    return {
      drivable: false,
      reason:
        `provider "${provider.id}" has a capture reader (${derived.readerModule}) but ` +
        `blind-tester/run.sh has no launch path written against it yet, so it cannot be ` +
        `played live here`,
    };
  }
  return { drivable: true, reason: derived.reason };
}

/**
 * Compute a provider's evidence class, and say why.
 *
 * A provider is `runner_enforced` IFF all three hold: the runner spawns it
 * (`kind === "headless_cli"`), it declares a complete `capture` block, and that block's
 * reader module exists on disk. Anything else is `operator_attested` — not as a penalty,
 * but because "a human asserts it" is then the only true description of the evidence.
 *
 * The reason travels with the answer so an operator asking "why is my vendor not
 * enforced?" gets the actual missing piece instead of a boolean.
 */
export function derivePlaytestIsolation(
  provider: PlaytestIsolationSubject,
): PlaytestIsolationDerivation {
  if (provider.kind !== "headless_cli") {
    return {
      isolation: "operator_attested",
      code: "kind_is_not_headless_cli",
      reason:
        `provider "${provider.id}" is ${provider.kind}, which the runner never spawns, ` +
        `so its isolation can only be operator_attested`,
      readerModule: provider.capture?.readerModule ?? null,
    };
  }
  const capture = provider.capture;
  if (capture === undefined) {
    return {
      isolation: "operator_attested",
      code: "no_capture_block",
      reason:
        `provider "${provider.id}" declares no capture block, so nothing here can read ` +
        `its session log: every session it produces is hand-played`,
      readerModule: null,
    };
  }
  if (!captureReaderExists(capture.readerModule)) {
    return {
      isolation: "operator_attested",
      code: "capture_reader_module_missing",
      reason:
        `provider "${provider.id}" names capture reader "${capture.readerModule}", which ` +
        `does not exist in this checkout, so no session of it can be witnessed`,
      readerModule: capture.readerModule,
    };
  }
  return {
    isolation: "runner_enforced",
    code: "runner_captures_this_vendor",
    reason:
      `provider "${provider.id}" is a headless CLI whose session log is read by ` +
      `${capture.readerModule}`,
    readerModule: capture.readerModule,
  };
}

/**
 * Turn a capture locator into a concrete path.
 *
 * Substitution is the same intentionally dumb exact-token replacement `resolvePlaytestArgv`
 * uses. `exact` reports whether the result is a single resolved path: a `runner_pinned`
 * vendor with no wildcard yields one BEFORE launch, which is the ideal — the runner can
 * refuse to start if the file already exists, and read exactly one file afterwards. A
 * `discovered` vendor cannot, so its reader must search, and the caller has to be told
 * which of those two jobs it has rather than guessing from the string.
 */
export function resolvePlaytestSessionLogLocator(
  capture: PlaytestCapture,
  substitutions: {
    home: string;
    env?: Record<string, string | undefined> | undefined;
    sessionId?: string | undefined;
    cwdSlug?: string | undefined;
  },
): { root: string; path: string; exact: boolean } {
  const { rootEnv, rootDefault, pathTemplate } = capture.sessionLog;
  const override = rootEnv === undefined ? undefined : substitutions.env?.[rootEnv];
  const root =
    override !== undefined && override.length > 0
      ? override
      : rootDefault.split("{HOME}").join(substitutions.home);
  let tail = pathTemplate;
  if (substitutions.sessionId !== undefined) {
    tail = tail.split("{SESSION_ID}").join(substitutions.sessionId);
  }
  if (substitutions.cwdSlug !== undefined) {
    tail = tail.split("{CWD_SLUG}").join(substitutions.cwdSlug);
  }
  const path = `${root.replace(/[\\/]+$/u, "")}/${tail}`;
  return { root, path, exact: !path.includes("*") && !path.includes("{") };
}

export const PlaytestProviderSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    vendor: z.string().min(1),
    /**
     * Vendors that share a base model lineage share a family. Ranking counts DISTINCT
     * FAMILIES, not runs, so this is what stops one vendor's blind spot from looking
     * like consensus. Kept separate from `vendor` because a future rebadged or
     * white-labelled client should not be able to double-count as independent.
     */
    family: z.string().min(1),
    kind: PlaytestProviderKindSchema,
    /**
     * DERIVED, not chosen — see `derivePlaytestIsolation`.
     *
     * The field is kept rather than dropped because it is what every consumer already
     * reads (the recorder stamps it onto sealed session records, the store summarises by
     * it, the ranking layer gates metrics on it), and because a registry diff should show
     * an evidence class changing instead of hiding it behind a function call. It earns
     * its place only under the rule below: it is a checksum on the derivation, and a
     * disagreement is a hard parse failure. It is never an override.
     */
    isolation: PlaytestIsolationSchema,
    /** Required for `headless_cli`; absent for `desktop_client`. */
    launch: PlaytestLaunchSchema.optional(),
    /**
     * What the runner can witness for this vendor. Optional: most vendors have no reader
     * yet, and saying so is the honest state, not a gap to be filled with a guess.
     */
    capture: PlaytestCaptureSchema.optional(),
    /** Catalog file, relative to the repo root. */
    catalogPath: z.string().min(1),
    /** Transport contract id recorded on every session for this provider. */
    transportContract: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((provider, ctx) => {
    // A launch template is what makes `runner_enforced` meaningful: without argv the
    // runner does not own the process and cannot prove anything about its tools.
    if (provider.kind === "headless_cli" && provider.launch === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["launch"],
        message: `provider "${provider.id}" is headless_cli and must declare a launch template`,
      });
    }
    if (provider.kind === "desktop_client" && provider.launch !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["launch"],
        message: `provider "${provider.id}" is desktop_client and cannot declare a launch template`,
      });
    }
    // A capture block on a client the runner never spawns is a category error, not a
    // harmless extra: it describes reading the private log of a process this repo has no
    // relationship with, which is a claim about a human's machine rather than about a
    // run. Refuse the shape outright so nobody can half-declare their way toward a label.
    if (provider.kind === "desktop_client" && provider.capture !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capture"],
        message: `provider "${provider.id}" is desktop_client and cannot declare a capture block`,
      });
    }
    // The one rule that makes `isolation` data instead of a claim. The derivation is the
    // authority; the stored literal must agree with it or the registry does not load.
    //
    // It fires in BOTH directions on purpose. Over-claiming is the dangerous half — a
    // desktop client or a reader-less CLI stamped `runner_enforced` launders hand-played
    // sessions into experience metrics. But under-claiming is a real defect too: a vendor
    // whose reader has landed and whose entry still says `operator_attested` quietly
    // discards proof the runner did produce, and silently "fixing" that would be the same
    // kind of unaudited relabelling in the opposite direction. Either way an author is
    // told exactly which fact of the checkout disagrees with them.
    const derived = derivePlaytestIsolation(provider);
    if (provider.isolation !== derived.isolation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isolation"],
        message:
          `provider "${provider.id}" declares isolation "${provider.isolation}" but this ` +
          `checkout derives "${derived.isolation}": ${derived.reason}`,
      });
    }
  });
export type PlaytestProvider = z.infer<typeof PlaytestProviderSchema>;

export const PlaytestProviderRegistrySchema = z
  .array(PlaytestProviderSchema)
  .min(1)
  .superRefine((providers, ctx) => {
    const seen = new Set<string>();
    for (const [index, provider] of providers.entries()) {
      if (seen.has(provider.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `duplicate provider id "${provider.id}"`,
        });
      }
      seen.add(provider.id);
    }
  });

/**
 * Where the registry data lives.
 *
 * The registry is a JSON FILE rather than a TypeScript literal, for a reason that only
 * shows up at the edges: `blind-tester/run.sh` has to resolve a provider before it can
 * launch anything, and it runs in contexts — a bare temp clone, a machine with no dev
 * dependencies — where no TypeScript loader exists. A plain-node resolver reading this
 * file works everywhere; a TS import does not. Keeping ONE source of truth that both the
 * typed module and the shell resolver read is what stops the two from drifting apart.
 */
export const PLAYTEST_REGISTRY_PATH = "blind-tester/providers.json";

const REGISTRY_FILE = new URL(PLAYTEST_REGISTRY_PATH, REPO_ROOT_URL);

export const PlaytestRegistryFileSchema = z
  .object({ providers: PlaytestProviderRegistrySchema })
  .strict();

/**
 * The shipped registry.
 *
 * Adding a vendor is one entry in `blind-tester/providers.json` plus one catalog file.
 * Nothing else in the codebase should learn a vendor's name: the runner, the session
 * record, the store, and the ranking all read this registry.
 */
export const PLAYTEST_PROVIDERS: readonly PlaytestProvider[] = Object.freeze(
  PlaytestRegistryFileSchema.parse(JSON.parse(readFileSync(REGISTRY_FILE, "utf8"))).providers,
);

/** Look one provider up by id. Returns null rather than throwing so callers can report well. */
export function findPlaytestProvider(id: string): PlaytestProvider | null {
  return PLAYTEST_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

/** Every registered provider id, sorted — used in CLI help and error messages. */
export function playtestProviderIds(): string[] {
  return PLAYTEST_PROVIDERS.map((provider) => provider.id).sort();
}

/**
 * Distinct families among a set of provider ids. Unknown ids are ignored rather than
 * counted: an unrecognized provider must never inflate apparent independence.
 */
export function playtestFamilies(providerIds: Iterable<string>): string[] {
  const families = new Set<string>();
  for (const id of providerIds) {
    const provider = findPlaytestProvider(id);
    if (provider) families.add(provider.family);
  }
  return [...families].sort();
}

/** Parse and validate one provider's operator-owned catalog. */
export function parsePlaytestCatalog(provider: PlaytestProvider, raw: unknown): PlaytestCatalog {
  const catalog = PlaytestCatalogSchema.parse(raw);
  if (catalog.provider !== provider.id) {
    throw new Error(
      `catalog ${provider.catalogPath} declares provider "${catalog.provider}" but is registered for "${provider.id}"`,
    );
  }
  const seen = new Set<string>();
  for (const model of catalog.models) {
    if (seen.has(model.id)) {
      throw new Error(`catalog ${provider.catalogPath} lists model "${model.id}" more than once`);
    }
    seen.add(model.id);
  }
  const defaults = catalog.models.filter((model) => model.default === true);
  if (defaults.length > 1) {
    throw new Error(
      `catalog ${provider.catalogPath} marks ${defaults.length} models as default; at most one is allowed`,
    );
  }
  return catalog;
}

/** Resolve one exact model in a catalog. Aliases are refused: they drift silently. */
export function findCatalogModel(catalog: PlaytestCatalog, modelId: string): PlaytestCatalogModel {
  const model = catalog.models.find((candidate) => candidate.id === modelId);
  if (!model) {
    const known = catalog.models.map((candidate) => candidate.id).join(", ");
    throw new Error(
      `model "${modelId}" is not in the ${catalog.provider} catalog; known models: ${known}`,
    );
  }
  return model;
}

/**
 * Build the concrete argv for a headless launch.
 *
 * Substitution is intentionally dumb — exact token replacement, no shell, no globbing —
 * so a model id or path can never expand into extra arguments.
 */
export function resolvePlaytestArgv(
  provider: PlaytestProvider,
  substitutions: { model: string; cwd: string; mcpConfig?: string },
): { executable: string; argv: string[] } {
  if (!provider.launch) {
    throw new Error(
      `provider "${provider.id}" is ${provider.kind} and is not launched by the runner`,
    );
  }
  const table: Record<string, string> = {
    "{MODEL}": substitutions.model,
    "{CWD}": substitutions.cwd,
    "{MCP_CONFIG}": substitutions.mcpConfig ?? "",
  };
  const argv = provider.launch.argv.map((arg) => table[arg] ?? arg);
  return { executable: provider.launch.executable, argv };
}
