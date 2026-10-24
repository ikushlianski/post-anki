import type { EvidenceSubject, SubjectSuggestionEvidence } from "./subject-suggestion-evidence.repo.js";
import type { SubjectSuggestionStore } from "./subject-suggestion.store.js";
import type { gradeNewSubject, gradeSubSubjects } from "../mastra/subject-suggestion-grader.agent.js";

export interface ScanDeps {
  store: SubjectSuggestionStore;
  evidence: SubjectSuggestionEvidence;
  grader: {
    gradeNewSubject: typeof gradeNewSubject;
    gradeSubSubjects: typeof gradeSubSubjects;
  };
  embedMissingSubjects(subjects: EvidenceSubject[]): Promise<Map<string, number[]>>;
  now(): Date;
}

export interface ScanState {
  calls: number;
  created: number;
  skipped: number;
}

export interface ScanContext {
  deps: ScanDeps;
  state: ScanState;
  subjects: EvidenceSubject[];
}
