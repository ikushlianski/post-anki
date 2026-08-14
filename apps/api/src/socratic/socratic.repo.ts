import { and, desc, eq, isNull } from "drizzle-orm";
import type { SocraticAction, SocraticDegree } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { socraticSessions, socraticTurns } from "../db/schema.js";

export type SocraticSessionRow = typeof socraticSessions.$inferSelect;
export type SocraticTurnRow = typeof socraticTurns.$inferSelect;
export type SocraticTurnInsert = typeof socraticTurns.$inferInsert;

export async function getActiveSocraticSessionRow(
  topicId: string,
): Promise<SocraticSessionRow | null> {
  const rows = await getDb()
    .select()
    .from(socraticSessions)
    .where(
      and(
        eq(socraticSessions.topicId, topicId),
        eq(socraticSessions.status, "active"),
      ),
    )
    .orderBy(desc(socraticSessions.createdAt));

  return rows[0] ?? null;
}

export async function getSocraticSessionRow(
  id: string,
): Promise<SocraticSessionRow | null> {
  const rows = await getDb()
    .select()
    .from(socraticSessions)
    .where(eq(socraticSessions.id, id));

  return rows[0] ?? null;
}

export async function getTurnRow(
  turnId: string,
): Promise<SocraticTurnRow | null> {
  const rows = await getDb()
    .select()
    .from(socraticTurns)
    .where(eq(socraticTurns.id, turnId));

  return rows[0] ?? null;
}

export async function listTurnRows(
  sessionId: string,
): Promise<SocraticTurnRow[]> {
  return getDb()
    .select()
    .from(socraticTurns)
    .where(eq(socraticTurns.sessionId, sessionId))
    .orderBy(socraticTurns.order);
}

export async function pendingTurn(
  sessionId: string,
): Promise<SocraticTurnRow | null> {
  const rows = await getDb()
    .select()
    .from(socraticTurns)
    .where(
      and(
        eq(socraticTurns.sessionId, sessionId),
        isNull(socraticTurns.answer),
      ),
    )
    .orderBy(desc(socraticTurns.order));

  return rows[0] ?? null;
}

export async function createSocraticSession(
  session: typeof socraticSessions.$inferInsert,
): Promise<void> {
  await getDb().insert(socraticSessions).values(session);
}

export async function insertTurn(turn: SocraticTurnInsert): Promise<void> {
  await getDb().insert(socraticTurns).values(turn);
}

export async function recordTurnAnswer(
  turnId: string,
  answer: string,
  degree: SocraticDegree,
  action: SocraticAction,
  now: string,
): Promise<void> {
  await getDb()
    .update(socraticTurns)
    .set({ answer, degree, action, answeredAt: new Date(now) })
    .where(eq(socraticTurns.id, turnId));
}

// Conditional UPDATE … WHERE status='active' RETURNING * — the race guard
// shared by `/done` and the inactivity sweep (issue #27, spec.md Decision
// 6). Mirrors this codebase's existing CAS pattern
// (probe-session.repo.ts's tryClaimReplenish): whichever caller's WHERE
// clause actually matches performs the transition and gets the row back;
// the loser gets null and knows to send nothing.
export async function completeSocraticSession(
  id: string,
  now: string,
): Promise<SocraticSessionRow | null> {
  const rows = await getDb()
    .update(socraticSessions)
    .set({ status: "completed", completedAt: new Date(now) })
    .where(and(eq(socraticSessions.id, id), eq(socraticSessions.status, "active")))
    .returning();

  return rows[0] ?? null;
}

// Soft checkpoint (issue #27) — stamps at most once per session regardless
// of how many times answerSocraticSession crosses the threshold again
// later (it never will, since the guard is read on every call).
export async function markCheckpointShown(id: string, now: string): Promise<void> {
  await getDb()
    .update(socraticSessions)
    .set({ checkpointShownAt: new Date(now) })
    .where(
      and(eq(socraticSessions.id, id), isNull(socraticSessions.checkpointShownAt)),
    );
}
