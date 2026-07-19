import { describe, expect, it } from "vitest";

import {
  OVERWORLD_COMPACT_LOCAL_REF_LIMIT,
  OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT,
  OVERWORLD_COMPACT_TITLE_CHAR_LIMIT,
  compactOverworldView,
} from "../../src/world/compact_view.js";
import { OverworldSession } from "../../src/world/session.js";
import { loadOverworldManifest } from "../../src/world/source.js";

const world = loadOverworldManifest(process.cwd());

function authoredJob() {
  const job = world.local_jobs.find((candidate) => candidate.authored_scene !== undefined);
  if (!job?.authored_scene) throw new Error("expected an authored local job fixture");
  return job;
}

describe("compact authored local job scenes", () => {
  it("bounds every player-facing scene prose field", () => {
    const source = authoredJob();
    const longTitle = "Option title ".repeat(40);
    const longProse = "Authored consequence detail ".repeat(40);
    const job = {
      ...source,
      authored_scene: {
        ...source.authored_scene!,
        prompt: longProse,
        options: source.authored_scene!.options.map((option) => ({
          ...option,
          title: longTitle,
          preview: longProse,
          consequence: longProse,
        })),
      },
    };

    const compact = compactOverworldView({
      ...new OverworldSession(world).view(),
      jobs: [job],
      jobChoices: job.authored_scene.options.map((option) => [job.id, option.id] as const),
    });
    const scene = compact.job_scenes?.[0];
    const option = scene?.[6][0];
    if (!scene || !option) throw new Error("expected compact authored scene option");

    expect(scene[2]).toHaveLength(OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT);
    expect(scene[2]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    expect(option[1]).toHaveLength(OVERWORLD_COMPACT_TITLE_CHAR_LIMIT);
    expect(option[1]).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    for (const prose of [option[4], option[5]]) {
      expect(prose).toHaveLength(OVERWORLD_COMPACT_SERVICE_SUMMARY_CHAR_LIMIT);
      expect(prose).toMatch(/\.\.\.\(\+\d+ chars\)$/);
    }
  });

  it("keeps jobs, scenes, and choices aligned to one capped visible job set", () => {
    const source = authoredJob();
    const denseCount = OVERWORLD_COMPACT_LOCAL_REF_LIMIT * 2 + 1;
    const jobs = Array.from({ length: denseCount }, (_, index) => ({
      ...source,
      id: `dense_authored_job_${String(index).padStart(2, "0")}`,
      title: `Dense Authored Job ${index}`,
      authored_scene: {
        ...source.authored_scene!,
        id: `dense_authored_scene_${String(index).padStart(2, "0")}`,
      },
    }));
    const jobChoices = jobs.flatMap((job) =>
      job.authored_scene.options.map((option) => [job.id, option.id] as const),
    );

    const compact = compactOverworldView({
      ...new OverworldSession(world).view(),
      jobs,
      jobChoices,
    });
    const visibleJobIds = compact.jobs?.map(([jobId]) => jobId) ?? [];
    const visibleJobIdSet = new Set(visibleJobIds);

    expect(jobs).toHaveLength(25);
    expect(visibleJobIds).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.job_scenes?.map(([jobId]) => jobId)).toEqual(visibleJobIds);
    expect(compact.job_choices).toHaveLength(
      OVERWORLD_COMPACT_LOCAL_REF_LIMIT * source.authored_scene!.options.length,
    );
    expect(compact.job_choices?.every(([jobId]) => visibleJobIdSet.has(jobId))).toBe(true);
    expect(compact.job_scenes?.some(([jobId]) => jobId === jobs.at(-1)!.id)).toBe(false);
    expect(compact.job_choices?.some(([jobId]) => jobId === jobs.at(-1)!.id)).toBe(false);
  });

  it("does not scan past capped legacy jobs to expose a later authored scene", () => {
    const source = authoredJob();
    const legacy = world.local_jobs.find((candidate) => !candidate.authored_scene);
    if (!legacy) throw new Error("expected a legacy local job fixture");
    const jobs = [
      ...Array.from({ length: OVERWORLD_COMPACT_LOCAL_REF_LIMIT }, (_, index) => ({
        ...legacy,
        id: `visible_legacy_job_${index}`,
      })),
      source,
    ];

    const compact = compactOverworldView({
      ...new OverworldSession(world).view(),
      jobs,
      jobChoices: source.authored_scene!.options.map((option) => [source.id, option.id] as const),
    });

    expect(compact.jobs).toHaveLength(OVERWORLD_COMPACT_LOCAL_REF_LIMIT);
    expect(compact.jobs?.some(([jobId]) => jobId === source.id)).toBe(false);
    expect(compact.job_scenes).toBeUndefined();
    expect(compact.job_choices).toBeUndefined();
  });
});
