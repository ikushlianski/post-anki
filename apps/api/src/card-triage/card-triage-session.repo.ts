import { and, eq } from "drizzle-orm";
import type { FinishTriageSessionInput, TriageSessionResponse, TriageSessionStatus } from "@post-anki/shared";
import { finishTriageSessionInput, TRIAGE_SESSION_STATUSES } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { cardTriageSessions } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { countConfirmedDecisions } from "./card-triage-decision-count.repo.js";
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
    notes: await listStyleNotesForSession(row.id),
  };
}

export async function startTriageSession(subjectId: string | null): Promise<TriageSessionRow> {
  const [row] = await getDb()
    .insert(cardTriageSessions)
    .values({ id: newId("cts"), subjectId })
    .returning();

  if (!row) {
    throw new Error("card_triage_session_insert_failed");
  }

  return row;
}

export async function getTriageSessionRow(id: string): Promise<TriageSessionRow | null> {
  const [row] = await getDb().select().from(cardTriageSessions).where(eq(cardTriageSessions.id, id));

  return row ?? null;
}

export type FinishTriageResult =
  | { status: "ok"; session: TriageSessionRow }
  | { status: "not_found" }
  | { status: "already_finished" };

export async function finishTriageSession(
  id: string,
  input: FinishTriageSessionInput,
): Promise<FinishTriageResult> {
  const existing = await getTriageSessionRow(id);

  if (!existing) {
    return { status: "not_found" };
  }

  if (existing.status !== "open") {
    return { status: "already_finished" };
  }

  const parsed = finishTriageSessionInput.parse(input);
  const counts = await countConfirmedDecisions(existing.startedAt, parsed.decisions);

  const [updated] = await getDb()
    .update(cardTriageSessions)
    .set({
      endedAt: new Date(),
      acceptedCount: counts.accepted,
      rejectedCount: counts.rejected,
      feedbackText: parsed.feedbackText === "" ? null : parsed.feedbackText,
      status: parsed.feedbackText === "" ? "distilled" : "saved_text_only",
    })
    .where(and(eq(cardTriageSessions.id, id), eq(cardTriageSessions.status, "open")))
    .returning();

  return updated ? { status: "ok", session: updated } : { status: "already_finished" };
}
