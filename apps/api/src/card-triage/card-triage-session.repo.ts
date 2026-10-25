import { and, eq, isNull, isNotNull, or, sql } from "drizzle-orm";
import type {
  DiscardTriageSessionInput,
  FinishTriageSessionInput,
  StartTriageSessionInput,
  TriageSessionResponse,
  TriageSessionStatus,
} from "@post-anki/shared";
import {
  discardTriageSessionInput,
  finishTriageSessionInput,
  TRIAGE_SESSION_CLIENTS,
  TRIAGE_SESSION_ENDED_BY,
  TRIAGE_SESSION_STATUSES,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, cardTriageSessions } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { reconcileSessionDecisions } from "./card-triage-decision-count.repo.js";
import { lockOpenSession } from "./card-triage-decision.repo.js";
import { listStyleNotesForSession } from "./card-style-note.repo.js";

export type TriageSessionRow = typeof cardTriageSessions.$inferSelect;

function statusOf(row: TriageSessionRow): TriageSessionStatus {
  return TRIAGE_SESSION_STATUSES.find((status) => status === row.status) ?? "open";
}

export async function toTriageSessionResponse(row: TriageSessionRow): Promise<TriageSessionResponse> {
  return {
    id: row.id,
    subjectId: row.subjectId,
    status: statusOf(row),
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    acceptedCount: row.acceptedCount,
    rejectedCount: row.rejectedCount,
    feedbackText: row.feedbackText,
    client: TRIAGE_SESSION_CLIENTS.find((client) => client === row.client) ?? null,
    endedBy: TRIAGE_SESSION_ENDED_BY.find((endedBy) => endedBy === row.endedBy) ?? null,
    undecidedCount: row.undecidedCount,
    lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
    notes: await listStyleNotesForSession(row.id),
  };
}

export async function getTriageSessionRow(id: string): Promise<TriageSessionRow | null> {
  const [row] = await getDb().select().from(cardTriageSessions).where(eq(cardTriageSessions.id, id));

  return row ?? null;
}

async function findSessionByStartKey(startKey: string): Promise<TriageSessionRow | null> {
  const [row] = await getDb().select().from(cardTriageSessions).where(eq(cardTriageSessions.startKey, startKey));

  return row ?? null;
}

export async function startTriageSession(
  input: StartTriageSessionInput = {},
): Promise<{ session: TriageSessionRow; created: boolean }> {
  const startKey = input.startKey ?? null;

  if (startKey) {
    const replay = await findSessionByStartKey(startKey);

    if (replay) {
      return { session: replay, created: false };
    }
  }

  const [row] = await getDb()
    .insert(cardTriageSessions)
    .values({
      id: newId("cts"),
      subjectId: input.subjectId ?? null,
      client: input.client ?? null,
      startKey,
      lastActivityAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (row) {
    return { session: row, created: true };
  }

  const raced = startKey ? await findSessionByStartKey(startKey) : null;

  if (!raced) {
    throw new Error("card_triage_session_insert_failed");
  }

  return { session: raced, created: false };
}

export type FinishTriageResult =
  | { status: "ok"; session: TriageSessionRow }
  | { status: "not_found" }
  | { status: "already_finished"; session: TriageSessionRow };

async function hasCardFeedback(tx: DbExecutor, sessionId: string): Promise<boolean> {
  const [row] = await tx
    .select({ one: sql<number>`1` })
    .from(cardTriageDecisions)
    .where(
      and(
        eq(cardTriageDecisions.sessionId, sessionId),
        isNull(cardTriageDecisions.undoneAt),
        or(
          isNotNull(cardTriageDecisions.note),
          and(isNotNull(cardTriageDecisions.reasonCode), sql`${cardTriageDecisions.reasonCode} <> 'unspecified'`),
        ),
      ),
    )
    .limit(1);

  return row !== undefined;
}

export async function finishTriageSession(
  id: string,
  input: FinishTriageSessionInput,
): Promise<FinishTriageResult> {
  const parsed = finishTriageSessionInput.parse(input);

  return getDb().transaction(async (tx): Promise<FinishTriageResult> => {
    const { session, open } = await lockOpenSession(tx, id);

    if (!session) {
      return { status: "not_found" };
    }

    if (!open) {
      return { status: "already_finished", session };
    }

    const counts = await reconcileSessionDecisions(tx, session, parsed.decisions);
    const needsDistill = parsed.feedbackText !== "" || (await hasCardFeedback(tx, id));

    const [updated] = await tx
      .update(cardTriageSessions)
      .set({
        endedAt: new Date(),
        acceptedCount: counts.accepted,
        rejectedCount: counts.rejected,
        feedbackText: parsed.feedbackText === "" ? null : parsed.feedbackText,
        status: needsDistill ? "saved_text_only" : "distilled",
        endedBy: "user",
        undecidedCount: parsed.undecidedCount ?? null,
        lastActivityAt: new Date(),
      })
      .where(eq(cardTriageSessions.id, id))
      .returning();

    return updated ? { status: "ok", session: updated } : { status: "already_finished", session };
  });
}

export async function discardTriageSession(
  id: string,
  input: DiscardTriageSessionInput = {},
): Promise<FinishTriageResult> {
  const parsed = discardTriageSessionInput.parse(input);

  return getDb().transaction(async (tx): Promise<FinishTriageResult> => {
    const { session, open } = await lockOpenSession(tx, id);

    if (!session) {
      return { status: "not_found" };
    }

    if (!open) {
      return { status: "already_finished", session };
    }

    const [updated] = await tx
      .update(cardTriageSessions)
      .set({
        endedAt: new Date(),
        status: "discarded",
        endedBy: "discarded",
        undecidedCount: parsed.undecidedCount ?? null,
        lastActivityAt: new Date(),
      })
      .where(eq(cardTriageSessions.id, id))
      .returning();

    return updated ? { status: "ok", session: updated } : { status: "already_finished", session };
  });
}
