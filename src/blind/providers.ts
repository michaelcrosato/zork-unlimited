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
 *   2. HOW ITS BLINDNESS IS ESTABLISHED  — `isolation`
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
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

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
   * proof is read back out of the client's own session logs, and the runner has a
   * launch branch and a log reader for exactly one vendor. A provider stamped
   * `runner_enforced` that the runner cannot launch is the worst possible error in
   * this file — every session it ever produces is necessarily hand-played, yet the
   * recorder stamps it with the strongest evidence label in the system and the QA
   * pipeline then lets it move experience metrics. Set this to `operator_attested`
   * until the runner can actually witness the vendor, then flip it; sessions keep
   * whatever label was honest when they were recorded.
   */
  "runner_enforced",
  /** A human asserts the client had only the AdventureForge MCP tools attached. */
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
    isolation: PlaytestIsolationSchema,
    /** Required for `headless_cli`; absent for `desktop_client`. */
    launch: PlaytestLaunchSchema.optional(),
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
    // The runner can only enforce what it spawns. A desktop client claiming
    // runner-enforced isolation would be a false evidence-class label, which is
    // precisely the contamination this field exists to prevent.
    if (provider.kind === "desktop_client" && provider.isolation === "runner_enforced") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isolation"],
        message: `provider "${provider.id}" is desktop_client, so its isolation can only be operator_attested`,
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

const REGISTRY_FILE = new URL("../../blind-tester/providers.json", import.meta.url);

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
