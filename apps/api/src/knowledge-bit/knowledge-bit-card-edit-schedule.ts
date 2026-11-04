export interface EditScheduleChangeInput {
  before: string[];
  after: string[];
  suspendedKeys: Set<string>;
}

export interface EditScheduleChange {
  removed: string[];
  addedSuspended: string[];
}

export function deriveEditScheduleChange({
  before,
  after,
  suspendedKeys,
}: EditScheduleChangeInput): EditScheduleChange {
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const kept = before.filter((key) => afterSet.has(key));
  const added = after.filter((key) => !beforeSet.has(key));
  const keptAllSuspended = kept.length > 0 && kept.every((key) => suspendedKeys.has(key));

  return {
    removed: before.filter((key) => !afterSet.has(key)),
    addedSuspended: keptAllSuspended ? added : [],
  };
}
