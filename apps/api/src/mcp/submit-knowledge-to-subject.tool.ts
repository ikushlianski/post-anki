import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { hasScope } from "../api-token/api-token.scopes.js";
import { ensureSubjectPath, parseSubjectPath } from "../subject/subject-path.js";
import { fileKeyedNotes } from "./file-keyed-notes.js";
import { knowledgeNotesSchema } from "./submit-knowledge.tool.js";

export const submitKnowledgeToSubjectInputSchema = z.object({
  subjectPath: z.string().trim().min(1).max(130),
  notes: knowledgeNotesSchema,
});

export const submitKnowledgeToSubjectResultSchema = z.object({
  subjectId: z.string(),
  subjectName: z.string(),
  subjectPath: z.string(),
  createdSubjects: z.array(z.string()),
  created: z.number().int(),
  alreadyPresent: z.number().int(),
  sourceIds: z.array(z.string()),
});

export type SubmitKnowledgeToSubjectInput = z.infer<typeof submitKnowledgeToSubjectInputSchema>;
export type SubmitKnowledgeToSubjectResult = z.infer<typeof submitKnowledgeToSubjectResultSchema>;

export type SubmitKnowledgeToSubjectOutcome =
  | SubmitKnowledgeToSubjectResult
  | { error: "missing_scope" }
  | { error: "invalid_path" };

export async function submitKnowledgeToSubject(
  input: SubmitKnowledgeToSubjectInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<SubmitKnowledgeToSubjectOutcome> {
  if (!hasScope(auth.scopes, "knowledge:write")) {
    return { error: "missing_scope" };
  }

  const parsed = parseSubjectPath(input.subjectPath);

  if ("error" in parsed) {
    return { error: "invalid_path" };
  }

  const subject = await ensureSubjectPath(parsed.segments);
  const filed = await fileKeyedNotes(input.notes, subject.subjectId);

  return { ...subject, ...filed };
}
