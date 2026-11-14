import { z } from "zod";
import { CLOZE_ERROR_MESSAGES, isOrderedListKind } from "@post-anki/shared";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { embedApprovedKnowledgeBits } from "../knowledge-bit/knowledge-bit-approval-embedding.orchestrator.js";
import { editKnowledgeBitQuestionVariant } from "../knowledge-bit/knowledge-bit-approval.repo.js";
import { editKnowledgeBitClozeNote } from "../knowledge-bit/knowledge-bit-note-edit.repo.js";
import { listActiveVariantsForBit } from "../knowledge-bit/knowledge-bit-question-variant.repo.js";
import { hasCardWriteScope } from "./card-write-scope.js";

export const updateCardInputSchema = z.object({
  cardId: z.string().min(1).describe("Knowledge bit id, e.g. from search_knowledge_items or create_card"),
  front: z.string().optional().describe("New question side; keeps the current back when omitted"),
  back: z.string().optional().describe("New answer side; keeps the current front when omitted"),
  cloze: z.string().optional().describe("New cloze note for a cloze card, e.g. \"{{c1::Paris}} is in France\""),
});

export const updateCardResultSchema = z.object({
  cardId: z.string(),
  variantId: z.string(),
  kind: z.string(),
});

export type UpdateCardInput = z.infer<typeof updateCardInputSchema>;
export type UpdateCardResult = z.infer<typeof updateCardResultSchema>;

export type UpdateCardOutcome =
  | UpdateCardResult
  | { error: "missing_scope" | "not_found" | "blocked" | "wrong_shape" | "nothing_to_update" }
  | { error: "invalid_cloze"; message: string };

export async function updateCard(
  input: UpdateCardInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<UpdateCardOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const front = input.front?.trim();
  const back = input.back?.trim();
  const cloze = input.cloze?.trim();

  if (!front && !back && !cloze) {
    return { error: "nothing_to_update" };
  }

  const variants = await listActiveVariantsForBit(input.cardId);
  const target = cloze
    ? variants.find((variant) => variant.kind === "cloze")
    : variants.find((variant) => variant.kind !== "cloze" && !isOrderedListKind(variant.kind));

  if (!target) {
    return { error: variants.length === 0 ? "not_found" : "wrong_shape" };
  }

  if (cloze) {
    const edited = await editKnowledgeBitClozeNote(target.id, cloze);

    if ("error" in edited) {
      return edited.error === "invalid_note"
        ? { error: "invalid_cloze", message: CLOZE_ERROR_MESSAGES[edited.reason] }
        : { error: edited.error };
    }

    await embedApprovedKnowledgeBits([edited.knowledgeBitId]);

    return { cardId: edited.knowledgeBitId, variantId: edited.variantId, kind: target.kind };
  }

  const edited = await editKnowledgeBitQuestionVariant(target.id, front || target.prompt, back || target.answer);

  if ("error" in edited) {
    return { error: edited.error };
  }

  await embedApprovedKnowledgeBits([edited.knowledgeBitId]);

  return { cardId: edited.knowledgeBitId, variantId: edited.variantId, kind: target.kind };
}
