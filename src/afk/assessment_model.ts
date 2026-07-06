export type Category = "content_fix" | "content_new" | "engine" | "repo";

export type ImprovementCandidate = {
  id: string;
  category: Category;
  target: string; // a world quest id, the world graph, or a repo area; paths are metadata only.
  title: string;
  rationale: string;
  evidence: string[];
  impact: number; // 1-5
  effort: "S" | "M" | "L";
  score: number; // impact-weighted, deterministic
};

const EFFORT_COST: Record<ImprovementCandidate["effort"], number> = { S: 1, M: 2, L: 3 };

// Quality-first weighting: improving what players actually touch beats net-new bulk.
const CATEGORY_WEIGHT: Record<Category, number> = {
  content_fix: 1.0,
  content_new: 0.85,
  engine: 0.8,
  repo: 0.6,
};

export function score(
  impact: number,
  effort: ImprovementCandidate["effort"],
  category: Category,
): number {
  // Deterministic: (impact / effort) * weight, rounded to 3 dp.
  return Math.round((impact / EFFORT_COST[effort]) * CATEGORY_WEIGHT[category] * 1000) / 1000;
}
