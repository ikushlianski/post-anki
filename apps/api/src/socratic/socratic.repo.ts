import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Archetype, SocraticAction, SocraticDegree } from "@post-anki/shared";
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

// LRU archetype rotation (issue #36) — same-session continuation. Scoped to
// BOTH sessionId AND gapId: session-only would return the wrong turn's
// archetype whenever a session has probed more than one gap; gap-only would
// leak continuation across different sessions entirely.
export async function getMostRecentTurnArchetype(
  sessionId: string,
  gapId: string,
): Promise<Archetype | null> {
  const rows = await getDb()
    .select({ archetype: socraticTurns.archetype })
    .from(socraticTurns)
    .where(and(eq(socraticTurns.sessionId, sessionId), eq(socraticTurns.gapId, gapId)))
    .orderBy(desc(socraticTurns.order))
    .limit(1);

  return (rows[0]?.archetype as Archetype | null) ?? null;
}

export interface RecentSessionExchange {
  sessionId: string;
  createdAt: Date;
  turns: { prompt: string; answer: string | null }[];
}

// LRU archetype rotation (issue #36) — the last-3-sessions context block.
// Two-step query, not a single `.limit(3)` on turns: a single session can
// contain many turns for the same gap (several retries), so limiting the
// turns query directly can return turns from only 1-2 sessions instead of
// 3 distinct ones. Resolves the distinct session id set FIRST, excluding
// excludeSessionId at the query level (not an afterthought filter), then
// fetches that session set's own turns for this gap, in original turn
// order, grouped under each session.
export async function getRecentSessionExchangesForGap(
  gapId: string,
  excludeSessionId: string | null,
  limit = 3,
): Promise<RecentSessionExchange[]> {
  const db = getDb();

  const sessionIdRows = await db
    .selectDistinct({ sessionId: socraticTurns.sessionId })
    .from(socraticTurns)
    .where(
      excludeSessionId
        ? and(eq(socraticTurns.gapId, gapId), ne(socraticTurns.sessionId, excludeSessionId))
        : eq(socraticTurns.gapId, gapId),
    );

  const candidateSessionIds = sessionIdRows.map((row) => row.sessionId);

  if (candidateSessionIds.length === 0) {
    return [];
  }

  const sessionRows = await db
    .select({ id: socraticSessions.id, createdAt: socraticSessions.createdAt })
    .from(socraticSessions)
    .where(inArray(socraticSessions.id, candidateSessionIds))
    .orderBy(desc(socraticSessions.createdAt))
    .limit(limit);

  if (sessionRows.length === 0) {
    return [];
  }

  const chosenSessionIds = sessionRows.map((row) => row.id);

  const turnRows = await db
    .select({
      sessionId: socraticTurns.sessionId,
      prompt: socraticTurns.prompt,
      answer: socraticTurns.answer,
    })
    .from(socraticTurns)
    .where(and(eq(socraticTurns.gapId, gapId), inArray(socraticTurns.sessionId, chosenSessionIds)))
    .orderBy(socraticTurns.order);

  return sessionRows.map((session) => ({
    sessionId: session.id,
    createdAt: session.createdAt,
    turns: turnRows
      .filter((turn) => turn.sessionId === session.id)
      .map((turn) => ({ prompt: turn.prompt, answer: turn.answer })),
  }));
}
