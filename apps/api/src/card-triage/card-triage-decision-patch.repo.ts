import { eq } from "drizzle-orm";
import type { KnowledgeBitRejectReason } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { cardTriageDecisions } from "../db/schema.js";
import { normalizedNote, syncLegacyFeedback, type TriageDecisionRow } from "./card-triage-decision.repo.js";

export async function patchTriageDecisionDetails(
  decisionId: string,
  input: { reasonCode?: KnowledgeBitRejectReason | null | undefined; note?: string | null | undefined },
): Promise<TriageDecisionRow | null> {
  return getDb().transaction(async (tx) => {
    const patch: Partial<typeof cardTriageDecisions.$inferInsert> = {};

    if (input.reasonCode !== undefined) {
      patch.reasonCode = input.reasonCode;
    }

    if (input.note !== undefined) {
      patch.note = normalizedNote(input.note);
    }

    const [updated] = await tx
      .update(cardTriageDecisions)
      .set(patch)
      .where(eq(cardTriageDecisions.id, decisionId))
      .returning();

    if (!updated) {
      return null;
    }

    await syncLegacyFeedback(tx, updated, input);

    return updated;
  });
}
