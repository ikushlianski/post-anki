import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { z } from "zod";
import type {
  KnowledgeBitFeedbackVerdict,
  KnowledgeBitRejectReason,
  TriageDecisionResponse,
} from "@post-anki/shared";
import { KNOWLEDGE_BIT_REJECT_REASONS, type putTriageDecisionInput } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, cardTriageSessions } from "../db/schema.js";
import { updateKnowledgeBitFeedback } from "../knowledge-bit/knowledge-bit-feedback.repo.js";
import { newId } from "../shared/id.js";
import { findLatestFeedbackRef, loadDecisionContext, type DecisionContext } from "./card-triage-decision-context.repo.js";

export type TriageDecisionRow = typeof cardTriageDecisions.$inferSelect;
type SessionRow = typeof cardTriageSessions.$inferSelect;

export interface DecisionDetails {
  note?: string | null | undefined;
  reasonCode?: KnowledgeBitRejectReason | null | undefined;
  dwellMs?: number | undefined;
}

function reasonOf(row: TriageDecisionRow): KnowledgeBitRejectReason | null {
  return KNOWLEDGE_BIT_REJECT_REASONS.find((reason) => reason === row.reasonCode) ?? null;
}

export function toTriageDecisionResponse(row: TriageDecisionRow): TriageDecisionResponse {
  return {
    id: row.id,
    sessionId: row.sessionId,
    bitId: row.knowledgeBitId,
    verdict: row.verdict === "rejected" ? "rejected" : "approved",
    reasonCode: reasonOf(row),
    note: row.note,
    decidedAt: row.decidedAt.toISOString(),
    orderIndex: row.orderIndex,
    dwellMs: row.dwellMs,
    front: row.front,
    back: row.back,
    variants: row.variants ?? [],
    undoneAt: row.undoneAt ? row.undoneAt.toISOString() : null,
    source: row.source === "reconciled" ? "reconciled" : "client",
  };
}

function normalizedNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();

  return trimmed ? trimmed : null;
}

export async function lockOpenSession(
  tx: DbExecutor,
  sessionId: string,
): Promise<{ session: SessionRow | null; open: boolean }> {
  const [session] = await tx
    .select()
    .from(cardTriageSessions)
    .where(eq(cardTriageSessions.id, sessionId))
    .for("update");

  return { session: session ?? null, open: session?.status === "open" };
}

export async function touchSession(tx: DbExecutor, sessionId: string): Promise<void> {
  await tx.update(cardTriageSessions).set({ lastActivityAt: new Date() }).where(eq(cardTriageSessions.id, sessionId));
}

export async function findLiveDecision(
  tx: DbExecutor,
  sessionId: string,
  bitId: string,
): Promise<TriageDecisionRow | null> {
  const [row] = await tx
    .select()
    .from(cardTriageDecisions)
    .where(
      and(
        eq(cardTriageDecisions.sessionId, sessionId),
        eq(cardTriageDecisions.knowledgeBitId, bitId),
        isNull(cardTriageDecisions.undoneAt),
      ),
    );

  return row ?? null;
}

export async function insertDecisionRow(
  tx: DbExecutor,
  input: {
    session: SessionRow;
    bitId: string;
    verdict: KnowledgeBitFeedbackVerdict;
    details: DecisionDetails;
    source: "client" | "reconciled";
    context: DecisionContext | null;
    feedbackId: string | null;
    fallbackModelId: string | null;
  },
): Promise<TriageDecisionRow> {
  const [previous] = await tx
    .select({ orderIndex: cardTriageDecisions.orderIndex, decidedAt: cardTriageDecisions.decidedAt })
    .from(cardTriageDecisions)
    .where(eq(cardTriageDecisions.sessionId, input.session.id))
    .orderBy(desc(cardTriageDecisions.orderIndex))
    .limit(1);

  const now = new Date();
  const since = (previous?.decidedAt ?? input.session.startedAt).getTime();
  const context = input.context;

  const [row] = await tx
    .insert(cardTriageDecisions)
    .values({
      id: newId("ctd"),
      sessionId: input.session.id,
      knowledgeBitId: input.bitId,
      verdict: input.verdict,
      reasonCode: input.verdict === "rejected" ? (input.details.reasonCode ?? null) : null,
      note: normalizedNote(input.details.note),
      decidedAt: now,
      orderIndex: previous ? previous.orderIndex + 1 : 0,
      msSincePrevious: Math.max(0, Math.min(now.getTime() - since, 2_000_000_000)),
      dwellMs: input.details.dwellMs ?? null,
      subjectId: context?.subjectId ?? input.session.subjectId,
      knowledgeSourceId: context?.knowledgeSourceId ?? null,
      extractionModelId: context?.extractionModelId ?? input.fallbackModelId,
      extractionRun: context?.extractionRun ?? null,
      reviewFlag: context?.reviewFlag ?? null,
      variants: context?.variants ?? null,
      front: context?.front ?? null,
      back: context?.back ?? null,
      source: input.source,
      feedbackId: input.feedbackId,
    })
    .returning();

  if (!row) {
    throw new Error("card_triage_decision_insert_failed");
  }

  return row;
}

async function syncLegacyFeedback(tx: DbExecutor, row: TriageDecisionRow, details: DecisionDetails): Promise<void> {
  if (row.verdict !== "rejected" || !row.feedbackId || !details.reasonCode) {
    return;
  }

  const patch: { reasonCode: KnowledgeBitRejectReason; note?: string } = { reasonCode: details.reasonCode };

  if (details.note !== undefined) {
    patch.note = details.note ?? "";
  }

  await updateKnowledgeBitFeedback(row.feedbackId, patch, tx);
}

export type PutDecisionResult =
  | { status: "ok"; decision: TriageDecisionRow }
  | { status: "session_not_found" | "bit_not_found" | "session_finished" | "decision_not_applied" };

export async function putTriageDecision(
  sessionId: string,
  bitId: string,
  input: z.output<typeof putTriageDecisionInput>,
): Promise<PutDecisionResult> {
  return getDb().transaction(async (tx) => {
    const { session, open } = await lockOpenSession(tx, sessionId);

    if (!session) {
      return { status: "session_not_found" };
    }

    if (!open) {
      return { status: "session_finished" };
    }

    const context = await loadDecisionContext(tx, bitId);

    if (!context) {
      return { status: "bit_not_found" };
    }

    if (context.approvalState !== input.verdict) {
      return { status: "decision_not_applied" };
    }

    const live = await findLiveDecision(tx, sessionId, bitId);

    if (live && live.verdict === input.verdict) {
      const patch: Partial<typeof cardTriageDecisions.$inferInsert> = {};

      if (input.note !== undefined) {
        patch.note = normalizedNote(input.note);
      }

      if (input.reasonCode !== undefined && input.verdict === "rejected") {
        patch.reasonCode = input.reasonCode;
      }

      const [updated] =
        Object.keys(patch).length > 0
          ? await tx.update(cardTriageDecisions).set(patch).where(eq(cardTriageDecisions.id, live.id)).returning()
          : [live];

      await syncLegacyFeedback(tx, live, input);
      await touchSession(tx, sessionId);

      return { status: "ok", decision: updated ?? live };
    }

    if (live) {
      await tx.update(cardTriageDecisions).set({ undoneAt: new Date() }).where(eq(cardTriageDecisions.id, live.id));
    }

    const feedback = await findLatestFeedbackRef(tx, bitId, input.verdict);
    const decision = await insertDecisionRow(tx, {
      session,
      bitId,
      verdict: input.verdict,
      details: input,
      source: "client",
      context,
      feedbackId: feedback?.id ?? null,
      fallbackModelId: feedback?.modelId ?? null,
    });

    await syncLegacyFeedback(tx, decision, input);
    await touchSession(tx, sessionId);

    return { status: "ok", decision };
  });
}

export type DeleteDecisionResult =
  | { status: "ok"; decision: TriageDecisionRow }
  | { status: "session_not_found" | "session_finished" | "decision_not_found" };

export async function undoTriageDecision(sessionId: string, bitId: string): Promise<DeleteDecisionResult> {
  return getDb().transaction(async (tx) => {
    const { session, open } = await lockOpenSession(tx, sessionId);

    if (!session) {
      return { status: "session_not_found" };
    }

    if (!open) {
      return { status: "session_finished" };
    }

    const live = await findLiveDecision(tx, sessionId, bitId);

    if (!live) {
      return { status: "decision_not_found" };
    }

    const [updated] = await tx
      .update(cardTriageDecisions)
      .set({ undoneAt: new Date() })
      .where(eq(cardTriageDecisions.id, live.id))
      .returning();

    await touchSession(tx, sessionId);

    return { status: "ok", decision: updated ?? live };
  });
}

export async function getLiveTriageDecision(sessionId: string, bitId: string): Promise<TriageDecisionRow | null> {
  return findLiveDecision(getDb(), sessionId, bitId);
}

export async function listTriageDecisions(
  sessionId: string,
  options: { includeUndone?: boolean } = {},
): Promise<TriageDecisionRow[]> {
  return getDb()
    .select()
    .from(cardTriageDecisions)
    .where(
      and(
        eq(cardTriageDecisions.sessionId, sessionId),
        options.includeUndone ? undefined : isNull(cardTriageDecisions.undoneAt),
      ),
    )
    .orderBy(asc(cardTriageDecisions.orderIndex));
}
