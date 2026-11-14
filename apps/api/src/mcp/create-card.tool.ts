import { z } from "zod";
import { CLOZE_ERROR_MESSAGES, createKnowledgeItemInput, parseCloze, stripClozeMarkers, type DuplicateCheck } from "@post-anki/shared";
import { findDuplicateCards } from "../knowledge-bit/knowledge-bit-duplicate-finder.js";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { getKnowledgeBitById } from "../knowledge-bit/knowledge-bit-read.repo.js";
import { insertManualKnowledgeItem } from "../knowledge-bit/knowledge-bit-manual-item.repo.js";
import { startKnowledgeBitPipelineKick } from "../knowledge-bit/pipeline-kick.starter.js";
import { log } from "../shared/log.js";
import { hasCardWriteScope } from "./card-write-scope.js";
import { getOrCreateManualCardSource } from "./manual-card-source.repo.js";
import { resolveSubjectForWrite } from "./subject-ref.js";

export const createCardInputSchema = z.object({
  subject: z.string().trim().min(1).max(200).describe("Subject id or path like \"English/Words\" (max 2 levels, created if missing)"),
  front: z.string().optional().describe("Question side of a basic card"),
  back: z.string().optional().describe("Answer side of a basic card"),
  cloze: z.string().optional().describe("Cloze note like \"{{c1::Paris}} is in France\"; use instead of front/back"),
  example: z.string().optional().describe("Optional example shown with the card"),
  allowDuplicate: z
    .boolean()
    .optional()
    .describe("Save even when duplicates or similar-question cards exist; only after showing the user the matches returned by a first attempt"),
});

export const createCardResultSchema = z.object({
  cardId: z.string(),
  subjectId: z.string(),
  subjectPath: z.string(),
  approvalState: z.string(),
  variantCount: z.number().int(),
});

export type CreateCardInput = z.infer<typeof createCardInputSchema>;
export type CreateCardResult = z.infer<typeof createCardResultSchema>;

export type CreateCardOutcome =
  | CreateCardResult
  | { error: "missing_scope" | "invalid_path" | "duplicate_card" }
  | { error: "invalid_input" | "invalid_cloze"; message: string }
  | ({ error: "possible_duplicates"; message: string } & DuplicateCheck);

function duplicateDraft(item: z.infer<typeof createKnowledgeItemInput>) {
  if ("note" in item) {
    const cloze = parseCloze(item.note);

    return cloze.ok ? { front: stripClozeMarkers(cloze.note), back: "" } : null;
  }

  return { front: item.front, back: item.back };
}

function duplicateMessage(check: DuplicateCheck): string {
  const note = check.semanticChecked ? "" : " Only literal matching ran; the similarity check was unavailable.";

  return `Not saved: found ${check.matches.length} existing card(s) (kind "duplicate" = same front and back, "possible_duplicate" = similar front). Show them to the user; retry with allowDuplicate: true to save anyway.${note} ${JSON.stringify(check.matches)}`;
}

export async function createCard(
  input: CreateCardInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<CreateCardOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const candidate = input.cloze !== undefined
    ? { note: input.cloze, example: input.example }
    : { front: input.front, back: input.back, example: input.example };
  const parsed = createKnowledgeItemInput.safeParse(candidate);

  if (!parsed.success) {
    return { error: "invalid_input", message: "Provide non-empty front and back, or a cloze note with at least one {{c1::gap}}." };
  }

  const subject = await resolveSubjectForWrite(input.subject);

  if ("error" in subject) {
    return { error: "invalid_path" };
  }

  if (!input.allowDuplicate) {
    const draft = duplicateDraft(parsed.data);
    const check = draft ? await findDuplicateCards(draft) : null;

    if (check && check.matches.length > 0) {
      return {
        error: "possible_duplicates",
        message: duplicateMessage(check),
        ...check,
      };
    }
  }

  const sourceId = await getOrCreateManualCardSource(subject.subjectId);
  const result = await insertManualKnowledgeItem(sourceId, parsed.data, undefined, input.allowDuplicate ?? false);

  if (!result.ok) {
    if (result.error === "invalid_cloze") {
      return { error: "invalid_cloze", message: CLOZE_ERROR_MESSAGES[result.reason] };
    }

    if (result.error === "duplicate_card") {
      return { error: "duplicate_card" };
    }

    throw new Error(result.error);
  }

  try {
    await startKnowledgeBitPipelineKick();
  } catch (err) {
    log.error({ err }, "knowledge_bit_pipeline_kick_failed");
  }

  const stored = await getKnowledgeBitById(result.item.id);

  return {
    cardId: result.item.id,
    subjectId: subject.subjectId,
    subjectPath: subject.subjectPath,
    approvalState: stored?.approvalState ?? "unknown",
    variantCount: result.item.variants.length,
  };
}
