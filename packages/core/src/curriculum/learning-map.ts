import { LEVEL_RANK, type Level, type LearningMapSnapshot } from "@post-anki/shared";

export const MAX_CURRICULA = 10;
export const MAX_CHARS = 1200;

function isInProgress(learningStatus: LearningMapSnapshot["learningStatus"]): boolean {
  return learningStatus !== "not_started" && learningStatus !== "done";
}

function recencyTimestamp(snapshot: LearningMapSnapshot): number {
  return snapshot.lastInteractedAt ? Date.parse(snapshot.lastInteractedAt) : 0;
}

function highestLevelReached(modules: LearningMapSnapshot["modules"]): Level | null {
  let best: Level | null = null;

  for (const module of modules) {
    if (module.level === null || module.progress.percent <= 0) {
      continue;
    }

    if (best === null || LEVEL_RANK[module.level] > LEVEL_RANK[best]) {
      best = module.level;
    }
  }

  return best;
}

function formatEntry(snapshot: LearningMapSnapshot): string {
  const level = highestLevelReached(snapshot.modules);
  const levelFragment = level ? `, ${level} level` : "";

  return `${snapshot.curriculumName} — ${snapshot.percent}% mastered${levelFragment}`;
}

function rankSnapshots(snapshots: LearningMapSnapshot[]): LearningMapSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const aInProgress = isInProgress(a.learningStatus) ? 1 : 0;
    const bInProgress = isInProgress(b.learningStatus) ? 1 : 0;

    if (aInProgress !== bInProgress) {
      return bInProgress - aInProgress;
    }

    const recencyDiff = recencyTimestamp(b) - recencyTimestamp(a);

    if (recencyDiff !== 0) {
      return recencyDiff;
    }

    return b.percent - a.percent;
  });
}

export function summarizeLearningMap(snapshots: LearningMapSnapshot[]): string {
  if (snapshots.length === 0) {
    return "Nothing else studied yet.";
  }

  const ranked = rankSnapshots(snapshots).slice(0, MAX_CURRICULA);
  const lines: string[] = [];
  let charCount = 0;

  for (const snapshot of ranked) {
    const line = formatEntry(snapshot);
    const addedChars = lines.length === 0 ? line.length : line.length + 1;

    if (charCount + addedChars > MAX_CHARS) {
      break;
    }

    lines.push(line);
    charCount += addedChars;
  }

  return lines.length > 0 ? lines.join("\n") : "Nothing else studied yet.";
}
