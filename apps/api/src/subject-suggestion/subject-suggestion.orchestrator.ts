import { buildSubjectContentText, hashSubjectContent } from "@post-anki/core";
import type { TriggerSubjectSuggestionScanResult } from "@post-anki/shared";
import { gradeNewSubject, gradeSubSubjects } from "../mastra/subject-suggestion-grader.agent.js";
import { embedSubjectTexts } from "../subject-duplicate/embeddings-client.js";
import { updateSubjectEmbedding } from "../subject/subject.repo.js";
import { runSubjectSuggestionScanWith } from "./subject-suggestion-scan.js";
import type { ScanDeps } from "./subject-suggestion-scan.types.js";
import { subjectSuggestionEvidence } from "./subject-suggestion-evidence.repo.js";
import { subjectSuggestionStore } from "./subject-suggestion.repo.js";

async function embedMissingSubjects(
  missing: Parameters<ScanDeps["embedMissingSubjects"]>[0],
): Promise<Map<string, number[]>> {
  const byId = new Map(missing.map((subject) => [subject.id, subject]));
  const results = await embedSubjectTexts(
    missing.map((subject) => ({
      id: subject.id,
      text: buildSubjectContentText(subject.name, subject.description ?? undefined),
    })),
  );
  const embeddings = new Map<string, number[]>();

  for (const result of results) {
    const subject = byId.get(result.id);

    if (subject) {
      await updateSubjectEmbedding(
        subject.id,
        result.embedding,
        hashSubjectContent(subject.name, subject.description ?? undefined),
      );
      embeddings.set(subject.id, result.embedding);
    }
  }

  return embeddings;
}

export function runSubjectSuggestionScan(options: {
  ignoreDailyCap: boolean;
}): Promise<TriggerSubjectSuggestionScanResult> {
  return runSubjectSuggestionScanWith(
    {
      store: subjectSuggestionStore,
      evidence: subjectSuggestionEvidence,
      grader: { gradeNewSubject, gradeSubSubjects },
      embedMissingSubjects,
      now: () => new Date(),
    },
    options,
  );
}
