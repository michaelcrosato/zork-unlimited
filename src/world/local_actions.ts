import {
  overworldContactTalkJournalId,
  type OverworldArea,
  type OverworldCharacterView,
  type OverworldExplorationSite,
  type OverworldLocalEvent,
  type OverworldLocalJob,
  type OverworldNode,
  type OverworldPoi,
} from "./overworld.js";
import type { LocalJobSceneOption } from "./local_job_scene.js";

export type OverworldLocalActionKind = "area" | "job" | "poi" | "contact" | "event" | "site";

export type OverworldLocalActionDescriptor<Kind extends OverworldLocalActionKind> = {
  id: string;
  kind: Kind;
  title: string;
  text: string;
  minutes: number;
  regionalRenown?: number;
};

export function describeOverworldAreaAction(
  area: OverworldArea,
): OverworldLocalActionDescriptor<"area"> {
  return {
    id: `area:${area.id}`,
    kind: "area",
    title: `Explored ${area.name}`,
    text: `${area.summary} ${area.discovery}`,
    minutes: area.travel_minutes,
  };
}

export function describeOverworldJobAction(
  job: OverworldLocalJob,
  area: OverworldArea | null,
  sceneOption: LocalJobSceneOption | null = null,
): OverworldLocalActionDescriptor<"job"> {
  if (sceneOption) {
    return {
      id: `job:${job.id}`,
      kind: "job",
      title: `Completed ${job.title}: ${sceneOption.title}`,
      text: `${sceneOption.consequence}${area ? ` Location: ${area.name}.` : ""}`,
      minutes: sceneOption.terms.minutes,
      regionalRenown: sceneOption.terms.renown,
    };
  }
  return {
    id: `job:${job.id}`,
    kind: "job",
    title: `Completed ${job.title}`,
    text: `${job.objective} ${job.reward}${area ? ` Location: ${area.name}.` : ""}`,
    minutes: job.minutes,
    regionalRenown: job.difficulty,
  };
}

/**
 * Only the town's display name reaches the copy, and the scout planner already
 * refuses any point of interest whose `home` is not the current town. Taking the
 * narrow shape lets the snapshot restore rebuild this exact line from the
 * manifest index, which carries town names but not whole nodes.
 */
export function describeOverworldPoiAction(
  poi: OverworldPoi,
  current: Pick<OverworldNode, "name">,
): OverworldLocalActionDescriptor<"poi"> {
  return {
    id: `scout:${poi.id}`,
    kind: "poi",
    title: `Scouted ${poi.title}`,
    text: `${poi.summary} This point of interest is now recorded as a lead in ${current.name}.`,
    minutes: 20,
  };
}

export function describeOverworldContactAction(
  character: OverworldCharacterView,
  presentationId: string | null = null,
): OverworldLocalActionDescriptor<"contact"> {
  return {
    id: overworldContactTalkJournalId(character.id, presentationId),
    kind: "contact",
    title: `Talked to ${character.name}`,
    text: `${character.summary} ${character.agenda}`,
    minutes: 15,
  };
}

export function describeOverworldEventAction(
  event: OverworldLocalEvent,
): OverworldLocalActionDescriptor<"event"> {
  return {
    id: `investigate:${event.id}`,
    kind: "event",
    title: `Investigated ${event.title}`,
    text: `${event.summary} Pressure: ${event.pressure}. Intensity: ${event.intensity}.`,
    minutes: 20 + event.intensity * 5,
  };
}

export function describeOverworldSiteAction(
  site: OverworldExplorationSite,
): OverworldLocalActionDescriptor<"site"> {
  return {
    id: `site:${site.id}`,
    kind: "site",
    title: `Explored ${site.title}`,
    text: `${site.summary} ${site.reward}`,
    minutes: 45 + site.danger * 15,
    regionalRenown: site.danger,
  };
}
