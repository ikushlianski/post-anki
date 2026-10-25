import type { SubjectCheckConfidence, SubjectCheckResponse } from "@post-anki/shared";

export interface SubjectProposal {
  subjectId: string;
  confidence: SubjectCheckConfidence;
}

export type ClassifierOutcome =
  | { kind: "proposal"; proposal: SubjectProposal }
  | { kind: "unclear" }
  | { kind: "stop" }
  | { kind: "skip" };

export function classifyOutcome(response: SubjectCheckResponse): ClassifierOutcome {
  if (response.status === "unavailable") {
    return response.reason === "failed" || response.reason === "timeout" ? { kind: "skip" } : { kind: "stop" };
  }

  if (response.status === "none") {
    return { kind: "unclear" };
  }

  const top = response.recommendations[0];

  if (!top) {
    return { kind: "unclear" };
  }

  return { kind: "proposal", proposal: { subjectId: top.subjectId, confidence: top.confidence } };
}

export function needsEscalation(outcome: ClassifierOutcome): boolean {
  return outcome.kind === "unclear" || (outcome.kind === "proposal" && outcome.proposal.confidence === "low");
}

export function resolveFinalProposal(
  cheap: SubjectProposal | null,
  escalated: SubjectProposal | null | undefined,
): SubjectProposal | null {
  return escalated ?? cheap;
}
