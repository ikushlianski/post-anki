import type { SubjectAssignmentOutput, EscalationPrompt } from "../mastra/subject-assignment-escalation.agent.js";
import type { SubjectProposal } from "./subject-assignment.select.js";

export function validateEscalation(
  output: SubjectAssignmentOutput,
  prompt: EscalationPrompt,
): Map<string, SubjectProposal | null> {
  const bySource = new Map<string, SubjectProposal | null>();

  for (const entry of output.assignments) {
    const sourceId = prompt.notes.get(entry.note);

    if (sourceId === undefined || bySource.has(sourceId)) {
      continue;
    }

    const subjectId = entry.subject === null ? undefined : prompt.subjects.get(entry.subject);

    bySource.set(sourceId, subjectId === undefined ? null : { subjectId, confidence: entry.confidence });
  }

  return bySource;
}
