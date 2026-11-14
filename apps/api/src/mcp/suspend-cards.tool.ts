import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { updateKnowledgeBitScheduleControls } from "../knowledge-bit/knowledge-bit-review-suspension.orchestrator.js";
import { hasCardWriteScope } from "./card-write-scope.js";

export const suspendCardsInputSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(100).describe("Knowledge bit ids"),
});

export const suspendCardsResultSchema = z.object({
  changed: z.array(z.string()),
  skipped: z.array(z.object({ id: z.string(), reason: z.enum(["not_found", "not_approved"]) })),
});

export type SuspendCardsInput = z.infer<typeof suspendCardsInputSchema>;
export type SuspendCardsResult = z.infer<typeof suspendCardsResultSchema>;
export type SuspendCardsOutcome = SuspendCardsResult | { error: "missing_scope" };

// Same schedule-controls service as PATCH /knowledge-bits/:id/schedule; applies to every card of the note.
export async function setCardsSuspended(
  input: SuspendCardsInput,
  suspended: boolean,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<SuspendCardsOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const changed: string[] = [];
  const skipped: SuspendCardsResult["skipped"] = [];

  for (const id of new Set(input.cardIds)) {
    const outcome = await updateKnowledgeBitScheduleControls(id, { suspended, tz: "UTC" });

    if (outcome.ok) {
      changed.push(id);
      continue;
    }

    skipped.push({ id, reason: outcome.error === "not_found" ? "not_found" : "not_approved" });
  }

  return { changed, skipped };
}

export const suspendCards = (input: SuspendCardsInput, auth: Pick<RequestAuthContext, "scopes">) =>
  setCardsSuspended(input, true, auth);

export const unsuspendCards = (input: SuspendCardsInput, auth: Pick<RequestAuthContext, "scopes">) =>
  setCardsSuspended(input, false, auth);
