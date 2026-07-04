import type { OverworldJournalEntry } from "./session_snapshot.js";
import { OVERWORLD_MAX_SUPPLIES as MAX_SUPPLIES } from "./travel_mechanics.js";

export type OverworldServiceAction = "resupply" | "rest";

export type OverworldServiceResult = {
  action: OverworldServiceAction;
  minutes: number;
  changed: boolean;
  suppliesBefore: number;
  suppliesAfter: number;
  fatigueBefore: number;
  fatigueAfter: number;
  message: string;
  entry: OverworldJournalEntry | null;
};

export type OverworldServicePlan = Omit<OverworldServiceResult, "entry"> & {
  entryDraft: Omit<OverworldJournalEntry, "recordedAt"> | null;
};

export type OverworldServiceState = {
  townName: string;
  services: readonly string[];
  supplies: number;
  fatigue: number;
};

export function canRestAtOverworldTown(services: readonly string[]): boolean {
  return services.includes("inn") || services.includes("healer");
}

export function canResupplyAtOverworldTown(services: readonly string[]): boolean {
  return services.includes("market") || services.includes("inn") || services.includes("stable");
}

export function planOverworldTownRest(state: OverworldServiceState): OverworldServicePlan {
  if (!canRestAtOverworldTown(state.services)) {
    throw new Error("There is no inn or healer here to rest safely.");
  }
  if (state.fatigue === 0) {
    return {
      action: "rest",
      minutes: 0,
      changed: false,
      suppliesBefore: state.supplies,
      suppliesAfter: state.supplies,
      fatigueBefore: state.fatigue,
      fatigueAfter: state.fatigue,
      message: "You are already rested.",
      entryDraft: null,
    };
  }

  const minutes = Math.max(180, Math.ceil(state.fatigue / 20) * 60);
  const text = `You spend ${minutes} minutes recovering at a safe local service. Fatigue falls from ${state.fatigue} to 0.`;
  return {
    action: "rest",
    minutes,
    changed: true,
    suppliesBefore: state.supplies,
    suppliesAfter: state.supplies,
    fatigueBefore: state.fatigue,
    fatigueAfter: 0,
    message: text,
    entryDraft: {
      id: "service:rest",
      kind: "service",
      town: state.townName,
      title: `Rested in ${state.townName}`,
      text,
    },
  };
}

export function planOverworldTownResupply(state: OverworldServiceState): OverworldServicePlan {
  if (!canResupplyAtOverworldTown(state.services)) {
    throw new Error("There is no market, inn, or stable here to resupply.");
  }
  if (state.supplies >= MAX_SUPPLIES) {
    return {
      action: "resupply",
      minutes: 0,
      changed: false,
      suppliesBefore: state.supplies,
      suppliesAfter: state.supplies,
      fatigueBefore: state.fatigue,
      fatigueAfter: state.fatigue,
      message: "Your supplies are already full.",
      entryDraft: null,
    };
  }

  const minutes = 45;
  const text = `You spend ${minutes} minutes buying food, lamp oil, and road gear. Supplies rise from ${state.supplies} to ${MAX_SUPPLIES}.`;
  return {
    action: "resupply",
    minutes,
    changed: true,
    suppliesBefore: state.supplies,
    suppliesAfter: MAX_SUPPLIES,
    fatigueBefore: state.fatigue,
    fatigueAfter: state.fatigue,
    message: text,
    entryDraft: {
      id: "service:resupply",
      kind: "service",
      town: state.townName,
      title: `Resupplied in ${state.townName}`,
      text,
    },
  };
}
