export interface ModuleFillState {
  readonly id: string;
  readonly order: number;
  readonly topicCount: number;
}

export interface ModuleRow {
  readonly id: string;
  readonly order: number;
  readonly title: string;
}

// Turns raw module rows plus the (possibly repeated) moduleId of every
// topic in the curriculum into each module's fill state — one counting
// pass client-side, no SQL group-by needed.
export function deriveModuleFillStates<T extends ModuleRow>(
  moduleRows: readonly T[],
  topicModuleIds: readonly string[],
): (T & { topicCount: number })[] {
  const counts = new Map<string, number>();

  for (const moduleId of topicModuleIds) {
    counts.set(moduleId, (counts.get(moduleId) ?? 0) + 1);
  }

  return moduleRows.map((row) => ({ ...row, topicCount: counts.get(row.id) ?? 0 }));
}

// The fill queue a slice-generation attempt walks, lowest book-order first.
// Only modules with zero topics are candidates — one a slice ever wrote
// into is done, forever, regardless of how few topics it ended up with.
// Returning the whole queue (not just the head) is what lets a caller skip
// a part whose document turns out to be unfetchable and try the next one
// in the same generation attempt, instead of a single dead link stalling
// every future release for this course.
export function unfilledModulesInFillOrder(
  modules: readonly ModuleFillState[],
): ModuleFillState[] {
  return modules
    .filter((m) => m.topicCount === 0)
    .sort((a, b) => a.order - b.order);
}
