import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { moveKnowledgeBitsBulk } from "../knowledge-bit/knowledge-bit-move.repo.js";
import { hasCardWriteScope } from "./card-write-scope.js";
import { findExistingSubject } from "./subject-ref.js";

export const moveCardsInputSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(100).describe("Knowledge bit ids to move"),
  subject: z.string().trim().min(1).max(200).describe("Existing target subject, id or path like \"English/Words\""),
});

export const moveCardsResultSchema = z.object({
  subjectId: z.string(),
  subjectPath: z.string(),
  moved: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
});

export type MoveCardsInput = z.infer<typeof moveCardsInputSchema>;
export type MoveCardsResult = z.infer<typeof moveCardsResultSchema>;

export type MoveCardsOutcome = MoveCardsResult | { error: "missing_scope" | "invalid_path" | "subject_not_found" };

export async function moveCards(
  input: MoveCardsInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<MoveCardsOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const subject = await findExistingSubject(input.subject);

  if ("error" in subject) {
    return { error: subject.error === "not_found" ? "subject_not_found" : subject.error };
  }

  const result = await moveKnowledgeBitsBulk(input.cardIds, subject.subjectId);

  if ("error" in result) {
    return { error: result.error };
  }

  return { subjectId: subject.subjectId, subjectPath: subject.subjectPath, ...result };
}
