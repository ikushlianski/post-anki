import type { Phrase, PhraseBankSummary, PhraseBankUpdate, PracticeAttempt } from "@post-anki/shared";
import { apiFetch } from "../api/client";

export interface SubmitAttemptResult {
  attempts: PracticeAttempt[];
  phraseBankUpdates: PhraseBankUpdate[];
}

export async function generatePhraseBatch(subjectId: string): Promise<Phrase[]> {
  const res = await apiFetch<{ phrases: Phrase[] }>(`/subjects/${subjectId}/phrase-batches`, {
    method: "POST",
  });

  return res.phrases;
}

export async function submitAttempt(
  subjectId: string,
  phraseId: string,
  userAnswer: string,
): Promise<SubmitAttemptResult> {
  return apiFetch<SubmitAttemptResult>(`/subjects/${subjectId}/attempts`, {
    method: "POST",
    body: { answers: [{ phraseId, userAnswer }] },
  });
}

export async function getPhraseBankDueCount(subjectId: string): Promise<number> {
  const summary = await apiFetch<PhraseBankSummary>(`/subjects/${subjectId}/phrase-bank`);

  return summary.active.filter((entry) => entry.status === "struggling" || entry.status === "practicing")
    .length;
}
