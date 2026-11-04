import { invoke } from "@tauri-apps/api/core";

export type AddedKnowledge = { sourceId: string; truncated: boolean };

export type AddKnowledgeRejection = { kind: "duplicate" | "message"; message: string };

export type SubjectConfidence = "high" | "medium" | "low";

export type SubjectRecommendation = {
  subjectId: string;
  subjectLabel: string;
  confidence: SubjectConfidence;
  reason: string;
};

export type SubjectAdvice =
  | { status: "ok"; recommendations: SubjectRecommendation[] }
  | { status: "none" }
  | { status: "unavailable"; reason: string };

export type SourceRegenerationState = "running" | "done" | "nothing_extracted" | "failed";

export type SourceStatus = {
  status: SourceRegenerationState;
  failureReason: string | null;
  cardCount: number | null;
};

export function addKnowledge(input: {
  subjectId: string | null;
  text: string;
  force: boolean;
}): Promise<AddedKnowledge> {
  return invoke<AddedKnowledge>("add_knowledge", input);
}

export function checkKnowledgeSubject(text: string): Promise<SubjectAdvice> {
  return invoke<SubjectAdvice>("check_knowledge_subject", { text });
}

export function getKnowledgeSourceStatus(sourceId: string): Promise<SourceStatus> {
  return invoke<SourceStatus>("get_knowledge_source_status", { sourceId });
}
