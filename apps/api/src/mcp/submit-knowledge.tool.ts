import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { hasScope } from "../api-token/api-token.scopes.js";
import { insertKeyedKnowledgeSources } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { kickSourcesAfterAdd } from "../knowledge-source/knowledge-source-kick.js";
import { MAX_SOURCES_PER_BATCH_ADD } from "../knowledge-source/knowledge-source.repo.js";
import { resolveDeckSubjectId } from "./business-deck-mapping.js";

export const submitKnowledgeInputSchema = z.object({
  deck: z.string().trim().min(1),
  notes: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9:_-]{8,80}$/),
        text: z.string().trim().min(1).max(20000),
      }),
    )
    .min(1)
    .max(MAX_SOURCES_PER_BATCH_ADD),
});

export const submitKnowledgeResultSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  created: z.number().int(),
  alreadyPresent: z.number().int(),
  sourceIds: z.array(z.string()),
});

export type SubmitKnowledgeInput = z.infer<typeof submitKnowledgeInputSchema>;
export type SubmitKnowledgeResult = z.infer<typeof submitKnowledgeResultSchema>;

export type SubmitKnowledgeOutcome =
  | SubmitKnowledgeResult
  | { error: "missing_scope" }
  | { error: "unknown_deck" }
  | { error: "subject_missing"; subjectName: string };

export async function submitKnowledge(
  input: SubmitKnowledgeInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<SubmitKnowledgeOutcome> {
  if (!hasScope(auth.scopes, "knowledge:write")) {
    return { error: "missing_scope" };
  }

  const resolved = await resolveDeckSubjectId(input.deck);

  if ("error" in resolved) {
    return resolved.error === "unknown_deck"
      ? { error: "unknown_deck" }
      : { error: "subject_missing", subjectName: resolved.subjectName ?? "" };
  }

  const byKey = new Map<string, { importKey: string; rawText: string }>();

  for (const note of input.notes) {
    if (!byKey.has(note.key)) {
      byKey.set(note.key, { importKey: note.key, rawText: note.text });
    }
  }

  const inserted = await insertKeyedKnowledgeSources([...byKey.values()], resolved.subjectId);
  const sourceIds = inserted.map((row) => row.id);

  if (sourceIds.length > 0) {
    await kickSourcesAfterAdd(sourceIds);
  }

  return {
    subjectId: resolved.subjectId,
    subjectName: resolved.subjectName,
    created: inserted.length,
    alreadyPresent: input.notes.length - inserted.length,
    sourceIds,
  };
}
