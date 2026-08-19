export interface CalibrationCompletionState {
  calibrationCompletedAt: string | null;
}

// The Socratic gate (S4, S6): a course's calibration quiz must be completed
// at least once before any Socratic session for that course can start. Pure
// on the completion timestamp — the caller resolves what "completed" means
// for a given course (a completed curriculum-scope probe session).
export function isCalibrationRequiredForSocratic(state: CalibrationCompletionState): boolean {
  return state.calibrationCompletedAt === null;
}
