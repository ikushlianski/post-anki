import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { rejectKnowledgeBit } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { deleteKnowledgeBitsBulk } from "../knowledge-bit/knowledge-bit-delete.repo.js";
import { getKnowledgeBitById } from "../knowledge-bit/knowledge-bit-read.repo.js";
import { hasCardWriteScope } from "./card-write-scope.js";

export const deleteCardInputSchema = z.object({
  cardId: z.string().min(1).describe("Knowledge bit id to delete"),
});

export const deleteCardResultSchema = z.object({
  cardId: z.string(),
  outcome: z.enum(["deleted", "discarded"]),
});

export type DeleteCardInput = z.infer<typeof deleteCardInputSchema>;
export type DeleteCardResult = z.infer<typeof deleteCardResultSchema>;

export type DeleteCardOutcome =
  | DeleteCardResult
  | { error: "missing_scope" | "not_found" | "blocked" };

export async function deleteCard(
  input: DeleteCardInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<DeleteCardOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const bit = await getKnowledgeBitById(input.cardId);

  if (!bit) {
    return { error: "not_found" };
  }

  if (bit.approvalState === "approved") {
    const result = await deleteKnowledgeBitsBulk([input.cardId]);

    return result.deleted.includes(input.cardId)
      ? { cardId: input.cardId, outcome: "deleted" }
      : { error: "not_found" };
  }

  const rejected = await rejectKnowledgeBit(input.cardId);

  if (!rejected.ok) {
    return { error: rejected.reason };
  }

  return { cardId: input.cardId, outcome: "discarded" };
}
