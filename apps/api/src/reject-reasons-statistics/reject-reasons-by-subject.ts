import type { RejectReasonSubject } from "@post-anki/shared";
import type { RawSubjectDecisionRow } from "./reject-reasons-by-subject.repo.js";

export const MIN_SUBJECT_DECISIONS = 5;
export const MAX_SUBJECTS = 10;

export function buildBySubject(rows: RawSubjectDecisionRow[]): RejectReasonSubject[] {
  return rows
    .filter((row) => row.decided >= MIN_SUBJECT_DECISIONS)
    .map((row) => ({
      subjectName: row.subjectName,
      decided: row.decided,
      rejected: row.rejected,
      rejectRate: row.decided === 0 ? 0 : row.rejected / row.decided,
    }))
    .sort((a, b) => b.rejectRate - a.rejectRate || b.decided - a.decided || a.subjectName.localeCompare(b.subjectName))
    .slice(0, MAX_SUBJECTS);
}
