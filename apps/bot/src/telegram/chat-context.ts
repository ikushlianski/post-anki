export type ChatMode = "idle" | "quiz" | "socratic";

export interface ChatContextLike {
  mode: ChatMode;
  sessionId: string | null;
  currentItemId: string | null;
  scopeKind: string | null;
  scopeId: string | null;
  navCurriculumId: string | null;
  label: string | null;
  messageId: number | null;
}
