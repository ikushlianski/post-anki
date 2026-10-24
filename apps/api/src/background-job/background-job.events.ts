import { eventType, staticSchema } from "inngest";
import type { SourceDraft, StudyMaterialKind } from "@post-anki/shared";

export type BackgroundJob =
  | { kind: "lecture-compile"; topicId: string }
  | { kind: "study-material"; materialId: string; topicId: string; materialKind: StudyMaterialKind }
  | { kind: "knowledge-bit-variants"; bitId: string }
  | { kind: "article-summary"; sourceId: string }
  | {
      kind: "probe-replenish";
      sessionId: string;
      progress: { total: number; answered: number; correct: number };
    }
  | { kind: "learning-list-merge"; itemId: string; curriculumId: string; drafts: SourceDraft[] };

export const backgroundJobRequestedEvent = eventType("background-job/requested", {
  schema: staticSchema<BackgroundJob>(),
});
