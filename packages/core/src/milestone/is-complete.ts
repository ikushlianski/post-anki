const FULL_MASTERY_PERCENT = 100;

// The single completion check for both curricula and Areas (Scenario 9) —
// takes the plain percent already produced by moduleProgress/
// domainNodeProgress, unmodified, and answers nothing else. No DB/HTTP
// dependency, no knowledge of which entity type it was called for.
export function isComplete(percent: number): boolean {
  return percent >= FULL_MASTERY_PERCENT;
}
