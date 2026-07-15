import { LEVEL_RANK, type Level } from "@post-anki/shared";

export interface ModuleCoverage {
  level: Level | null;
  coveredLabels: string[];
}

export function priorLevelCoverageLabels(
  currentLevel: Level | null,
  moduleCoverages: ModuleCoverage[],
): string[] {
  if (currentLevel === null) {
    return [];
  }

  const currentRank = LEVEL_RANK[currentLevel];
  const labels = new Set<string>();

  for (const module of moduleCoverages) {
    if (module.level === null || LEVEL_RANK[module.level] >= currentRank) {
      continue;
    }

    for (const label of module.coveredLabels) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}
