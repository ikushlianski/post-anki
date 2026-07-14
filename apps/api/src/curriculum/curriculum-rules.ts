export interface TopicTouchState {
  title: string;
  progressStatus: string;
  progressAttempts: number;
  learningStatus: string;
  selfGrade: number | null;
  included: boolean;
}

export interface ModuleTouchState {
  moduleId: string;
  title: string;
  learningStatus: string;
  topics: TopicTouchState[];
}

export interface MergePartition {
  lockedModules: ModuleTouchState[];
  freeModuleIds: string[];
}

export function isSourceMandateUnmet(
  requireSources: boolean,
  incomingSourceCount: number,
): boolean {
  return requireSources && incomingSourceCount === 0;
}

export function isTopicTouched(topic: TopicTouchState): boolean {
  return (
    topic.progressStatus !== "not_started" ||
    topic.progressAttempts > 0 ||
    topic.learningStatus !== "not_started" ||
    topic.selfGrade !== null ||
    topic.included === false
  );
}

export function isModuleTouched(module: ModuleTouchState): boolean {
  if (module.learningStatus !== "not_started") {
    return true;
  }

  return module.topics.some(isTopicTouched);
}

export function partitionModulesForMerge(
  modules: ModuleTouchState[],
): MergePartition {
  const lockedModules: ModuleTouchState[] = [];
  const freeModuleIds: string[] = [];

  for (const module of modules) {
    if (isModuleTouched(module)) {
      lockedModules.push(module);
    } else {
      freeModuleIds.push(module.moduleId);
    }
  }

  return { lockedModules, freeModuleIds };
}

export function filterOutLockedModules<T extends { title: string }>(
  planModules: T[],
  lockedTitles: string[],
): T[] {
  const locked = new Set(lockedTitles.map((t) => t.trim().toLowerCase()));

  return planModules.filter((m) => !locked.has(m.title.trim().toLowerCase()));
}
