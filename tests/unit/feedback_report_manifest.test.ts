import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/core/hash.js";
import {
  ReportManifestSchema,
  loadReportManifest,
  serializeReportManifest,
  sha256Bytes,
  sha256File,
  sha256Text,
  type ReportManifest,
} from "../../src/feedback/report_manifest.js";

const PURE_A = `pure:${"a".repeat(64)}`;
const REPORT_B = `report:${"b".repeat(64)}`;
const REPORT_C = `report:${"c".repeat(64)}`;
const PREVIOUS = "d".repeat(64);

function corpus() {
  return {
    verified_report_ids: [PURE_A, REPORT_B],
    actionable_report_ids: [PURE_A],
    excluded_mock_report_ids: [REPORT_B],
    seen_report_ids: [PURE_A, REPORT_B, REPORT_C],
  };
}

function outputs() {
  return {
    hotspots_sha256: "1".repeat(64),
    retention_sha256: "2".repeat(64),
    markdown_sha256: "3".repeat(64),
  };
}

function deltaManifest(): ReportManifest {
  return {
    schema_version: 1,
    kind: "delta",
    generated_at: "2026-08-08T23:00:00.000Z",
    commit: "468e578f",
    previous_manifest_sha256: PREVIOUS,
    corpus: corpus(),
    cohort: {
      verified_report_ids: [PURE_A],
      actionable_report_ids: [PURE_A],
      excluded_mock_report_ids: [],
    },
    outputs: outputs(),
  };
}

function parse(value: unknown): boolean {
  return ReportManifestSchema.safeParse(value).success;
}

describe("ReportManifestSchema", () => {
  it("accepts each kind only with its required cohort and predecessor semantics", () => {
    const delta = deltaManifest();
    expect(parse(delta)).toBe(true);
    expect(
      parse({
        ...delta,
        kind: "bootstrap",
        previous_manifest_sha256: null,
        cohort: {
          verified_report_ids: [],
          actionable_report_ids: [],
          excluded_mock_report_ids: [],
        },
      }),
    ).toBe(true);
    for (const kind of ["initial", "standalone"] as const) {
      expect(
        parse({
          ...delta,
          kind,
          previous_manifest_sha256: null,
          cohort: {
            verified_report_ids: [...delta.corpus.verified_report_ids],
            actionable_report_ids: [...delta.corpus.actionable_report_ids],
            excluded_mock_report_ids: [...delta.corpus.excluded_mock_report_ids],
          },
        }),
      ).toBe(true);
    }

    expect(parse({ ...delta, previous_manifest_sha256: null })).toBe(false);
    expect(parse({ ...delta, kind: "initial" })).toBe(false);
    expect(parse({ ...delta, kind: "bootstrap", previous_manifest_sha256: null })).toBe(false);
    expect(parse({ ...delta, kind: "standalone", previous_manifest_sha256: null })).toBe(false);
  });

  it("requires sorted unique namespaced report ids and strict scalar fields", () => {
    const manifest = deltaManifest();
    expect(
      parse({
        ...manifest,
        corpus: {
          ...manifest.corpus,
          seen_report_ids: [REPORT_B, PURE_A, REPORT_C],
        },
      }),
    ).toBe(false);
    expect(
      parse({
        ...manifest,
        corpus: {
          ...manifest.corpus,
          seen_report_ids: [PURE_A, REPORT_B, REPORT_B],
        },
      }),
    ).toBe(false);
    expect(
      parse({
        ...manifest,
        corpus: {
          ...manifest.corpus,
          seen_report_ids: [`pure:${"A".repeat(64)}`, REPORT_B, REPORT_C],
        },
      }),
    ).toBe(false);
    expect(parse({ ...manifest, generated_at: "not-an-ISO-datetime" })).toBe(false);
    expect(parse({ ...manifest, commit: "" })).toBe(false);
    expect(parse({ ...manifest, outputs: { ...manifest.outputs, extra: true } })).toBe(false);
  });

  it("enforces corpus/cohort partitions, seen membership, and corresponding subsets", () => {
    const manifest = deltaManifest();
    expect(
      parse({
        ...manifest,
        corpus: { ...manifest.corpus, excluded_mock_report_ids: [] },
      }),
    ).toBe(false);
    expect(
      parse({
        ...manifest,
        corpus: {
          ...manifest.corpus,
          actionable_report_ids: [PURE_A, REPORT_B],
          excluded_mock_report_ids: [REPORT_B],
        },
      }),
    ).toBe(false);
    expect(
      parse({
        ...manifest,
        corpus: { ...manifest.corpus, seen_report_ids: [PURE_A, REPORT_C] },
      }),
    ).toBe(false);
    expect(
      parse({
        ...manifest,
        cohort: {
          verified_report_ids: [REPORT_B],
          actionable_report_ids: [REPORT_B],
          excluded_mock_report_ids: [],
        },
      }),
    ).toBe(false);
    expect(
      parse({
        ...manifest,
        cohort: {
          verified_report_ids: [PURE_A],
          actionable_report_ids: [],
          excluded_mock_report_ids: [],
        },
      }),
    ).toBe(false);
  });
});

describe("report manifest bytes and loading", () => {
  it("serializes canonically and hashes bytes, text, and files identically", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-report-manifest-bytes-"));
    const path = join(root, "report-manifest.json");
    try {
      const manifest = deltaManifest();
      const reordered = {
        outputs: manifest.outputs,
        cohort: manifest.cohort,
        corpus: manifest.corpus,
        previous_manifest_sha256: manifest.previous_manifest_sha256,
        commit: manifest.commit,
        generated_at: manifest.generated_at,
        kind: manifest.kind,
        schema_version: manifest.schema_version,
      } as ReportManifest;
      const serialized = serializeReportManifest(manifest);
      expect(serializeReportManifest(reordered)).toBe(serialized);
      expect(serialized).toBe(`${canonicalize(manifest)}\n`);
      writeFileSync(path, serialized);
      const digest = sha256Text(serialized);
      expect(sha256Bytes(Buffer.from(serialized, "utf8"))).toBe(digest);
      expect(sha256File(path)).toBe(digest);
      expect(loadReportManifest(path, digest)).toEqual({ manifest, digest });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed for digest tampering, malformed or noncanonical bytes, and symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "feedback-report-manifest-load-"));
    const path = join(root, "report-manifest.json");
    try {
      const original = deltaManifest();
      const originalText = serializeReportManifest(original);
      const originalDigest = sha256Text(originalText);
      writeFileSync(path, originalText);

      const tampered = { ...original, commit: "different-commit" };
      writeFileSync(path, serializeReportManifest(tampered));
      expect(loadReportManifest(path, originalDigest)).toBeNull();

      writeFileSync(path, "{not-json}\n");
      expect(loadReportManifest(path)).toBeNull();
      writeFileSync(path, `${canonicalize({ ...original, unexpected: true })}\n`);
      expect(loadReportManifest(path)).toBeNull();
      writeFileSync(path, `${JSON.stringify(original, null, 2)}\n`);
      expect(loadReportManifest(path)).toBeNull();
      writeFileSync(path, originalText);
      expect(loadReportManifest(path, "A".repeat(64))).toBeNull();

      const linked = join(root, "linked-manifest.json");
      try {
        symlinkSync(path, linked, "file");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EACCES" && code !== "ENOSYS") throw error;
        return;
      }
      expect(loadReportManifest(linked)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
