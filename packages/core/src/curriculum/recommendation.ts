import type { Module, Topic } from "@post-anki/shared";

const DEFAULT_SELF_GRADE = 3;

export function recommendedTopicId(modules: Module[]): string | null {
  const candidates = modules
    .flatMap((m) => m.topics)
    .filter((t) => t.included && t.progress.status !== "mastered");

  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort(byWeakestFirst);

  return ranked[0]!.id;
}

function byWeakestFirst(a: Topic, b: Topic): number {
  if (a.progress.maturity !== b.progress.maturity) {
    return a.progress.maturity - b.progress.maturity;
  }

  return (a.selfGrade ?? DEFAULT_SELF_GRADE) - (b.selfGrade ?? DEFAULT_SELF_GRADE);
}
