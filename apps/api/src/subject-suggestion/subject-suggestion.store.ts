import type { SubjectSuggestionKind } from "@post-anki/shared";

export interface InsertSuggestionParams {
  kind: SubjectSuggestionKind;
  parentSubjectId: string | null;
  proposedName: string;
  reason: string;
  evidenceIds: string[];
  evidenceSamples: string[];
  evidenceCount: number;
}

export interface SubjectSuggestionRun {
  ranAt: Date;
  poolSize: number;
}

export interface RecordRunParams {
  trigger: "manual" | "daily";
  calls: number;
  created: number;
  poolSize: number;
}

export interface SubjectSuggestionStore {
  insertSuggestionIfNew(params: InsertSuggestionParams): Promise<boolean>;
  countPending(kind: SubjectSuggestionKind, parentId?: string | null): Promise<number>;
  getLastRun(): Promise<SubjectSuggestionRun | null>;
  recordRun(params: RecordRunParams): Promise<void>;
}
