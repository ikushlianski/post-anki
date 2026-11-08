import type { DetailLevel, KnowledgeHighlight } from "@post-anki/shared";
import type { SubjectKind } from "../subject/subject-kind.js";
import type { LearningIntentLoader } from "./knowledge-bit-learning-intent.js";
import type { LessonDraft } from "./knowledge-bit-source-item-validation.js";
import type { AskAiChatHandle } from "./ask-ai-extraction.js";
import type { InsertSourceItemsInput, SourceInsertState } from "./knowledge-bit-source-items.repo.js";

export interface WriteOptions {
  modelId?: string;
  strictLanguage?: boolean;
  feedbackBlock?: string;
  styleNotesBlock?: string;
  learningIntent?: string;
  detailLevel?: DetailLevel;
  subjectKind?: SubjectKind;
  sourceKind?: string;
  targetPhrases?: string[];
  focus?: KnowledgeHighlight[];
  abortSignal?: AbortSignal;
  onNothingWorthKeeping?: () => void;
  onClarification?: (gapText: string) => void;
  forceAtLeastOne?: boolean;
  fusionModelIds?: string[];
  ankiImport?: boolean;
}

export interface GenerateItemsDeps {
  writeItems: (chunk: string, options: WriteOptions) => Promise<LessonDraft[]>;
  getInsertState: (sourceId: string) => Promise<SourceInsertState>;
  insertItems: (input: InsertSourceItemsInput) => Promise<number>;
  markDetected: (id: string, claimedAt: Date) => Promise<boolean>;
  markItemCapReached?: (id: string, claimedAt: Date) => Promise<boolean>;
  markNothingExtracted?: (id: string, claimedAt: Date) => Promise<boolean>;
  markFailed: (id: string, reason: string, claimedAt: Date) => Promise<boolean>;
  loadFeedbackBlock: (subjectId: string | null) => Promise<string>;
  loadStyleNotesBlock?: (subjectId: string | null) => Promise<string>;
  loadLearningIntent?: LearningIntentLoader;
  loadSubjectKind?: (subjectId: string | null) => Promise<SubjectKind>;
  loadSourceKind?: (sourceId: string) => Promise<string>;
  loadIsAnkiImport?: (sourceId: string) => Promise<boolean>;
  loadTargetPhrases?: (sourceId: string) => Promise<string[]>;
  loadHighlights?: (sourceId: string) => Promise<KnowledgeHighlight[]>;
  loadDetailLevel?: (subjectId: string | null) => Promise<DetailLevel>;
  loadFusionModelIds?: () => Promise<string[]>;
  openAskAiChat?: (sourceId: string, gapText: string) => Promise<AskAiChatHandle | null>;
}

export interface GenerateItemsResult {
  status: "detected" | "failed";
  inserted: number;
  failureReason: string | null;
}

export interface RunState {
  seenStatements: Set<string>;
  accepted: number;
  inserted: number;
  reclaimed: Error | null;
  deliberateEmptyChunks: number;
  capped: boolean;
  gapByChunk: Map<number, string>;
}

